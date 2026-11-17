/* Run with: npm test   (Node 18+; no dependencies) */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/cards.js');

const SIGN_IDS = D.SIGNS.map(s => s.id);
const days = n => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 14 + i));
  return d.toISOString().slice(0, 10);
});
const game = (date, sign, rounds) => ({ mode: 'daily', date, sign, seedKey: E.dailySeed(date), cardSeed: 'test-' + sign, rounds });
// Dealing is the slow part (each deck is checked for a fair, chained puzzle), so tests share deals.
const dealCache = new Map();
const dealFor = date => {   // the puzzle is the same for every sign, so it is cached by date
  if (!dealCache.has(date)) dealCache.set(date, E.dealHands(E.dailySeed(date)));
  return dealCache.get(date);
};
// three hands where the first card turned is kept
const blind = p => [0, 1, 2].map(r => ({ turned: [(p + r) % 5], pick: (p + r) % 5, forced: false }));
// three hands where the brightest card is turned first: a perfect read
const perfect = hands => hands.map(h => ({ turned: [E.topIndex(h)], pick: E.topIndex(h), forced: false }));

/* ------------------------------- the deck ------------------------------ */

test('the deck is a full 78-card tarot deck with complete text', () => {
  assert.equal(D.CARDS.length, 78);
  assert.equal(D.CARDS.filter(c => c.arcana === 'major').length, 22);
  for (const suit of D.SUIT_ORDER) assert.equal(D.CARDS.filter(c => c.suit === suit).length, 14);
  assert.equal(new Set(D.CARDS.map(c => c.id)).size, 78);
  const texts = new Set();
  for (const c of D.CARDS) {
    for (const f of [c.up, c.rev]) {
      assert.ok(Number.isInteger(f.a) && f.a >= 1 && f.a <= 5, c.name + ' auspice');
      assert.equal(f.k.split(', ').length, 3, c.name + ' needs exactly three keywords');
      assert.ok(f.t.length > 40, c.name + ' fortune text');
      assert.ok(!texts.has(f.t), c.name + ' fortune text is unique');
      texts.add(f.t);
    }
  }
  assert.equal(texts.size, 156);
});

test('every sign has a card, a suit and closing lines', () => {
  assert.equal(D.SIGNS.length, 12);
  for (const s of D.SIGNS) {
    assert.equal(D.CARD_BY_ID[s.card].arcana, 'major');
    assert.equal(D.SUITS[s.suit].element, s.element);
    assert.equal(s.opens.length, 3);
    assert.equal(new Set(s.opens).size, 3);
    assert.ok(s.gift && s.ease);
  }
});

/* -------------------------------- the deal ----------------------------- */

test('the daily puzzle is deterministic, fair, and never repeats a card', () => {
  for (const date of days(20)) {
    const a = dealFor(date);
    const b = E.dealHands(E.dailySeed(date));
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
    const ids = a.flat().map(c => c.id);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    for (const hand of a) {
      assert.equal(hand.length, 10);
      assert.ok(E.handIsFair(hand), 'unfair hand on ' + date);
    }
  }
});

test('finding all three Full Moons is always a Full Moon fortune, for any cards and any sign', () => {
  for (const date of days(10)) {
    const puzzle = dealFor(date);
    for (const seed of ['a', 'b', 'c']) {
      const hands = E.castCards(puzzle, date + seed);
      for (const sign of SIGN_IDS) {
        const perfect = E.perfectReading(hands, sign);
        assert.equal(perfect.total, 15);
        assert.equal(perfect.tier, 5);
      }
      assert.equal(E.deckOdds(hands).best, 15);
    }
  }
});

test('the puzzle is the same for every sign', () => {
  assert.equal(E.dailySeed('2026-11-18'), E.dailySeed('2026-11-18'));
  const a = E.dealHands(E.dailySeed('2026-11-18'));
  const b = E.dealHands(E.dailySeed('2026-11-18'), 'pisces');   // a sign, if passed, changes nothing
  assert.deepEqual(a, b);
});

test('every player draws their own cards into the same puzzle', () => {
  const puzzle = dealFor('2026-11-18');
  const show = hands => hands.map(h => h.map(c => E.aura(c) + E.auspice(c)).join(' ')).join(' / ');
  const casts = ['ada', 'bea', 'cy', 'dee'].map(seed => E.castCards(puzzle, seed));
  for (const hands of casts) {
    assert.equal(show(hands), show(puzzle), 'every place keeps its suit mark and moon');
    assert.equal(new Set(hands.flat().map(c => c.id)).size, 30, 'no card twice');
  }
  assert.deepEqual(E.castCards(puzzle, 'ada'), casts[0], 'the same card seed gives the same cards');
  // different players see different cards in most places
  const differ = casts[0].flat().filter((c, i) => c.id !== casts[1].flat()[i].id || c.rev !== casts[1].flat()[i].rev).length;
  assert.ok(differ > 15, 'only ' + differ + ' of 30 places differ');
  // and the omens are identical whichever cards were cast
  const g = { seedKey: E.dailySeed('2026-11-18') };
  const texts = E.omensFor(g, puzzle).map(p => p.omens.map(o => o.text));
  casts.forEach((hands, k) => {
    const fresh = hands.map((h, i) => E.makeOmens(h, i + 1, E.rngFrom('omens|' + g.seedKey + '|' + i)).omens.map(o => o.text));
    assert.deepEqual(fresh, texts, 'omens changed for casting ' + k);
  });
});

test('every hand has exactly one Full Moon, and it is the brightest card', () => {
  for (const date of days(40)) {
    for (const hand of dealFor(date)) {
      const moons = hand.map(E.auspice);
      assert.equal(moons.filter(x => x === 5).length, 1);
      assert.equal(E.auspice(hand[E.topIndex(hand)]), 5);
      assert.ok(Math.min(...moons) <= 2);
    }
  }
});

test('different days get different puzzles', () => {
  const key = h => h.flat().map(c => E.aura(c) + E.auspice(c)).join();
  const seen = new Set();
  for (const date of days(20)) seen.add(key(dealFor(date)));
  assert.equal(seen.size, 20);
});

test('day numbers count from the epoch', () => {
  assert.equal(E.dayNumber(E.CONFIG.EPOCH), 1);
  assert.equal(E.dayNumber('2026-11-15'), 2);
  assert.equal(E.dayNumber('2027-11-14'), 366);
});

/* -------------------------------- the omens ---------------------------- */

test('omens are true, sufficient, lean, and never a giveaway', () => {
  let hands = 0;
  for (const date of days(30)) for (const sign of SIGN_IDS) {
    const g = game(date, sign, []);
    const dealt = E.dealHands(g.seedKey);
    const puzzles = E.omensFor(g, dealt);
    assert.equal(puzzles.length, 3);
    puzzles.forEach((p, i) => {
      const hand = dealt[i], moons = hand.map(E.auspice);
      hands++;
      assert.equal(p.top, E.topIndex(hand));
      assert.ok(p.omens.length >= 2 && p.omens.length <= 5, 'between two and five omens');
      // true: every omen holds for the real layout
      for (const o of p.omens) assert.ok(o.test(moons), 'false omen: ' + o.text);
      // sufficient: together they leave only the brightest card's place
      assert.deepEqual(E.omenCandidates(hand, p.omens), [p.top], 'omens do not pin the card on ' + date + ' ' + sign);
      // lean: take any one away and more than one place is left
      p.omens.forEach((_, k) => {
        assert.ok(E.omenCandidates(hand, p.omens.filter((x, j) => j !== k)).length > 1, 'spare omen: ' + p.omens[k].text);
      });
      // no single omen gives the answer away
      for (const o of p.omens) assert.ok(E.omenCandidates(hand, [o]).length > 1, 'giveaway: ' + o.text);
      // the narrowing shown after the hand ends at the answer and never widens
      assert.deepEqual(p.steps[p.steps.length - 1], [p.top]);
      for (let k = 1; k < p.steps.length; k++) assert.ok(p.steps[k].length <= p.steps[k - 1].length);
      for (const o of p.omens) {
        assert.ok(o.focus.every(x => x >= 0 && x < 10));
        assert.ok(/^[A-Z].*\.$/.test(o.text), 'omen is a sentence: ' + o.text);
      }
    });
  }
  assert.equal(hands, 30 * 12 * 3);
});

test('the fast fairness check agrees with checking every layout of the moons', () => {
  // omenCandidates() searches only the cards an omen names. Here it is checked against the slow,
  // obvious method: try every distinct layout of the hand's moons and see where the brightest card can sit.
  const maxAt = a => a.indexOf(Math.max(...a));
  let sets = 0;
  for (const date of days(2)) for (const sign of ['leo', 'gemini']) {
    const g = game(date, sign, []);
    const dealt = E.dealHands(g.seedKey);
    E.omensFor(g, dealt).forEach((p, i) => {
      const hand = dealt[i];
      const layouts = E.arrangements(hand.map(E.auspice));
      const brute = omens => [...new Set(layouts.filter(a => omens.every(o => o.test(a))).map(maxAt))].sort((x, y) => x - y);
      const check = [p.omens, ...p.omens.map(o => [o]), ...p.omens.map((_, k) => p.omens.filter((x, j) => j !== k))];
      for (const omens of check) { assert.deepEqual(E.omenCandidates(hand, omens), brute(omens), omens.map(o => o.text).join(' | ')); sets++; }
    });
  }
  assert.ok(sets > 50);
});

test('the Future hand needs omens chained together', () => {
  // in every deck the Future's indirect omens rule out a place that none of them rules out alone
  let chained = 0, n = 0;
  for (const date of days(20)) for (const sign of SIGN_IDS) {
    const g = game(date, sign, []);
    const dealt = E.dealHands(g.seedKey);
    const future = E.omensFor(g, dealt)[2], hand = dealt[2];
    const ind = future.omens.filter(o => o.kind === 'indirect');
    n++;
    if (ind.length < 2) continue;
    const together = E.omenCandidates(hand, ind).length;
    const apart = ind.map(o => E.omenCandidates(hand, [o])).reduce((acc, l) => acc.filter(x => l.includes(x)));
    if (together < apart.length) chained++;
  }
  assert.equal(chained, n, 'chained in ' + chained + ' of ' + n);
});

test('omens are the same for everyone on a day, and differ between days', () => {
  const texts = date => E.omensFor({ seedKey: E.dailySeed(date) }).map(p => p.omens.map(o => o.text).join(' | ')).join(' || ');
  assert.equal(texts('2026-11-16'), texts('2026-11-16'));
  assert.notEqual(texts('2026-11-16'), texts('2026-11-17'));
});

test('the Past is the plainest hand and the Future the knottiest', () => {
  const count = [0, 0, 0], indirect = [0, 0, 0];
  let n = 0;
  for (const date of days(40)) for (const sign of SIGN_IDS) {
    n++;
    E.omensFor(game(date, sign, [])).forEach((p, i) => {
      count[i] += p.omens.length;
      indirect[i] += p.omens.filter(o => o.kind === 'indirect').length;
    });
  }
  assert.ok(count[0] / n < 2.2, 'the Past has about two omens');
  assert.ok(indirect[0] < indirect[1] && indirect[1] < indirect[2], 'chained omens grow from Past to Future');
});

test('omens only speak of what the player can see or work out', () => {
  // an omen must not depend on a card's name, number or orientation: swapping in a different
  // card with the same suit mark and the same moon must leave every omen identical
  const g = game('2026-11-16', 'leo', []);
  const dealt = E.dealHands(g.seedKey);
  const before = E.omensFor(g, dealt).map(p => p.omens.map(o => o.text));
  const twin = c => D.CARDS.map(x => [{ id: x.id, rev: false }, { id: x.id, rev: true }]).flat()
    .find(x => x.id !== c.id && E.aura(x) === E.aura(c) && E.auspice(x) === E.auspice(c)) || c;
  const after = E.omensFor(g, dealt.map(h => h.map(twin))).map(p => p.omens.map(o => o.text));
  assert.deepEqual(after, before);
});

test('insight rewards finding the Full Moon, most of all on the first turn', () => {
  const hand = E.dealHands(E.dailySeed('2026-11-16'))[0], top = E.topIndex(hand), other = (top + 1) % 5;
  assert.equal(E.handInsight({ turned: [top] }, hand), 2);
  assert.equal(E.handInsight({ turned: [other, top] }, hand), 1);
  assert.equal(E.handInsight({ turned: [other] }, hand), 0);
  assert.equal(E.CONFIG.MAX_INSIGHT, 6);
});

test('the odds of finding the Full Moon blind are stated correctly', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);
  // ten cards a hand: a blind first turn finds the brightest one time in ten
  close(E.blindFirstTurnChance(0), 1);
  close(E.blindFirstTurnChance(1), 1 - Math.pow(0.9, 3));          // 27.1%
  close(E.blindFirstTurnChance(2), 3 * 0.01 * 0.9 + 0.001);        // 2.8%
  close(E.blindFirstTurnChance(3), 0.001);                         // 1 in 1,000
});

/* -------------------------------- the table ---------------------------- */

test('how a card was kept separates choice from fate', () => {
  assert.equal(E.howKept({ turned: [2], forced: false }), 'first');
  assert.equal(E.howKept({ turned: [2], forced: true }), 'fate');
  assert.equal(E.howKept({ turned: [2, 0, 4], forced: false }), 'dug');
  assert.equal(E.howKept({ turned: [2, 0, 4], forced: true }), 'last');
});

test('the moon board shows what a hand holds without leaking where', () => {
  for (const date of days(25)) {
    const hand = dealFor(date)[0];
    const moons = hand.map(E.auspice).sort((a, b) => b - a);
    const open = E.handBoard(hand, [], null, null);
    assert.deepEqual(open.map(e => e.a), moons);
    assert.ok(open.every(e => e.state === 'down'));
    // after turning cards 0 and 3 (0 passed, 3 awaiting a decision) the same moons are there, with states
    const mid = E.handBoard(hand, [0, 3], null, 3);
    assert.deepEqual(mid.map(e => e.a), moons);
    assert.equal(mid.filter(e => e.state === 'passed').length, 1);
    assert.equal(mid.filter(e => e.state === 'up').length, 1);
    assert.equal(mid.filter(e => e.state === 'down').length, hand.length - 2);
    // the board must be identical whichever positions the face-down cards sit in
    const swapped = hand.slice(); const tmp = swapped[1]; swapped[1] = swapped[4]; swapped[4] = tmp;
    assert.deepEqual(E.handBoard(swapped, [0, 3], null, 3), mid);
    const done = E.handBoard(hand, [0, 3], 3, null);
    assert.equal(done.filter(e => e.state === 'kept').length, 1);
  }
});

test('auras show the suit and nothing else', () => {
  assert.equal(E.aura({ id: 'c07', rev: true }), 'cups');
  assert.equal(E.aura({ id: 'sun', rev: false }), 'major');
  assert.equal(E.aura({ id: 'w01', rev: false }), E.aura({ id: 'w01', rev: true }));
});

test('keeping a card previews its moons and the patterns it makes', () => {
  const up = id => ({ id, rev: false });
  // first card for Leo: a Wands card is of your element, but moons are moons
  const a = E.keepPreview([], up('w06'), 'leo', 2);
  assert.equal(a.total, 5);
  assert.equal(a.gain, 5);
  assert.deepEqual(a.notes.map(n => n.title), ['Attuned to Fire']);
  // a second Cups card after a Cups card: a trine is in reach
  const b = E.keepPreview([up('c02')], up('c09'), 'leo', 1);
  assert.equal(b.gain, 5);
  assert.ok(b.hopes.some(x => /Trine/.test(x)));
  assert.equal(b.last, false);
  // the third Cups card completes it; the moons are still only moons
  const c = E.keepPreview([up('c02'), up('c09')], up('c04'), 'leo', 0);
  assert.equal(c.gain, E.auspice(up('c04')));
  assert.equal(c.total, 5 + 5 + E.auspice(up('c04')));
  assert.ok(c.notes.some(n => /Trine/.test(n.title)));
  assert.equal(c.last, true);
  assert.equal(c.tier, E.tierFor(c.total));
});

test('patterns are found for the reading but never change the moons', () => {
  const up = id => ({ id, rev: false });
  const ids = (picks, sign) => E.detectPatterns(picks, sign).map(p => p.id);
  // Leo: Fire, suit of Wands, card Strength.
  assert.ok(ids([up('strength'), up('c02'), up('s09')], 'leo').includes('signCard'));
  assert.ok(ids([up('w03'), up('c09'), up('s06')], 'leo').includes('attuned'));
  assert.ok(ids([up('c03'), up('c09'), up('c06')], 'leo').includes('trine'));
  assert.ok(ids([up('c07'), up('s07'), up('p02')], 'leo').includes('pair'));
  assert.ok(ids([up('c07'), up('s07'), up('p07')], 'leo').includes('triple'));
  assert.ok(ids([up('c05'), up('s06'), up('p07')], 'leo').includes('run'));
  assert.ok(ids([up('sun'), up('star'), up('world')], 'leo').includes('majors'));
  // the fortune is the moons alone: the same cards score the same for every sign
  const picks = [up('w03'), up('w09'), up('w06')];
  const moons = picks.reduce((s, c) => s + E.auspice(c), 0);
  for (const sign of SIGN_IDS) assert.equal(E.scoreSpread(picks, sign).total, moons);
});

test('tiers follow the thresholds', () => {
  assert.equal(E.tierFor(3), 1);
  assert.equal(E.tierFor(8), 1);
  assert.equal(E.tierFor(9), 2);
  assert.equal(E.tierFor(11), 3);
  assert.equal(E.tierFor(13), 4);
  assert.equal(E.tierFor(14), 4);
  assert.equal(E.tierFor(15), 5);
});

test('quintessence reduces to a Major Arcana card', () => {
  const q = E.quintessence([{ id: 'world', rev: false }, { id: 'c10', rev: false }, { id: 'p14', rev: true }]);
  assert.equal(q.sum, 45);
  assert.equal(q.reduced, 9);
  assert.equal(q.card.id, 'hermit');
  assert.equal(E.quintessence([{ id: 'sun', rev: false }, { id: 'w02', rev: false }, { id: 'c01', rev: false }]).card.id, 'fool');
});

test('deck odds cover all 1,000 possible readings', () => {
  const hands = E.dealHands(E.dailySeed('2026-11-14'));
  const odds = E.deckOdds(hands);
  assert.equal(odds.count, 1000);
  assert.equal(odds.tierCounts.reduce((a, b) => a + b, 0), 1000);
  const st = E.standing(odds, odds.best);
  assert.ok(st.isBest);
  assert.ok(st.blindChance > 0 && st.blindChance <= 100);
});

/* -------------------------------- the reading -------------------------- */

test('a finished game summarises into a complete, clean reading', () => {
  const bad = /undefined|null|NaN|\{k\}|\{gift\}|\{Gift\}|\{ease\}/;
  for (const date of days(12)) {
    for (const sign of SIGN_IDS) {
      for (let p = 0; p < 5; p++) {
        // a mix of first-turn keeps and passes
        const rounds = [0, 1, 2].map(r => {
          const passes = (p + r) % 3, turned = [];
          for (let k = 0; k <= passes; k++) turned.push((p + r + k) % 5);
          return { turned, pick: turned[turned.length - 1], forced: (p + r) % 2 === 0 };
        });
        const sum = E.summarize(game(date, sign, rounds), dealFor(date));
        const text = [sum.headline, sum.arc, sum.blend || '', sum.closing, sum.verdict, sum.liftLine, sum.readLine, sum.ceilingLine,
          sum.quintessence.text, ...sum.positions.map(x => x.lead + x.text + x.omens.map(o => o.text).join(' ')),
          ...sum.score.patterns.map(x => x.title + x.text)].join(' ');
        assert.ok(!bad.test(text), text);
        assert.equal(sum.positions.length, 3);
        assert.ok(sum.score.tier >= 1 && sum.score.tier <= 5);
        assert.ok(sum.insight >= 0 && sum.insight <= E.CONFIG.MAX_INSIGHT);
        assert.ok(sum.ceiling.total >= sum.score.total, 'no reading beats the deck ceiling');
      }
    }
  }
});

test('the reading never says the same thing twice', () => {
  for (const date of days(12)) for (const sign of SIGN_IDS) for (let p = 0; p < 5; p++) {
    const sum = E.summarize(game(date, sign, blind(p)), dealFor(date));
    const lines = [sum.blend, ...sum.score.patterns.map(x => x.text)].filter(Boolean);
    assert.equal(new Set(lines).size, lines.length, lines.join(' | '));
    const known = ['signCard', 'attuned', 'majors', 'trine', 'triple', 'pair', 'run', 'upright', 'reversed'];
    for (const pat of sum.score.patterns) assert.ok(known.includes(pat.id), pat.id);
  }
});

test('chips are won by reading a hand true, for the hands ahead', () => {
  const hands = E.dealHands(E.dailySeed('2026-11-17')), tops = hands.map(E.topIndex);
  const read = i => ({ turned: [tops[i]], pick: tops[i], forced: false });
  const miss = i => ({ turned: [(tops[i] + 1) % 5], pick: (tops[i] + 1) % 5, forced: true });
  assert.equal(E.chipsWon([read(0), read(1), read(2)], hands), 2, 'the last hand wins nothing to spend');
  assert.equal(E.chipsWon([miss(0), read(1), miss(2)], hands), 1);
  assert.equal(E.chipsWon([miss(0), miss(1), read(2)], hands), 0);
  // a hand still in play has won nothing yet
  assert.equal(E.chipsWon([{ turned: [tops[0]], pick: null, forced: false }, read(1), read(2)], hands), 1);
});

test('a perfect reading is always a Full Moon, and the summary says it was skill', () => {
  for (const date of days(10)) for (const sign of SIGN_IDS) {
    const g = game(date, sign, []);
    const hands = E.dealHands(g.seedKey);
    g.rounds = perfect(hands);
    const sum = E.summarize(g, hands);
    assert.equal(sum.score.tier, 5);
    assert.equal(sum.insight, 6);
    assert.equal(sum.firstFinds, 3);
    assert.equal(sum.score.total, sum.ceiling.total);
    assert.equal(sum.chipsIn, 2);
    assert.match(sum.ceilingLine, /read all three hands true/);
  }
});

test('the summary separates reading the omens from luck', () => {
  const g = game('2026-11-16', 'leo', []);
  const hands = E.dealHands(g.seedKey);
  const tops = hands.map(E.topIndex);
  // hand 1: read true (wins a chip). hand 2: a wrong turn, the chip spent, then the brightest. hand 3: a wrong turn, no chip left.
  g.rounds = [
    { turned: [tops[0]], pick: tops[0], forced: false },
    { turned: [(tops[1] + 1) % 5, tops[1]], pick: tops[1], forced: false },
    { turned: [(tops[2] + 2) % 5], pick: (tops[2] + 2) % 5, forced: true }];
  const sum = E.summarize(g, hands);
  assert.deepEqual(sum.how, ['first', 'dug', 'fate']);
  assert.deepEqual(sum.positions.map(p => p.insight), [2, 1, 0]);
  assert.equal(sum.insight, 3);
  assert.equal(sum.firstFinds, 1);
  assert.deepEqual(sum.positions.map(p => p.foundFirst), [true, false, false]);
  assert.deepEqual(sum.positions.map(p => p.found), [true, true, false]);
  assert.equal(sum.chipsIn, 1);
  assert.equal(sum.passes, 1);
  assert.equal(sum.chipsLeft, 0);
  assert.deepEqual(sum.positions.map(p => p.path.length), [1, 2, 1]);
  assert.ok(sum.positions.every(p => p.path[p.path.length - 1].kept));
  assert.equal(sum.lift, sum.score.total - sum.firstScore.total);
  assert.ok(sum.score.total <= sum.ceiling.total);
  assert.match(sum.ceilingLine, /Every hand holds one Full Moon/);
  assert.match(sum.arc, /^From .+, through .+, toward .+\.$/);
  for (const p of sum.positions) {
    assert.ok(p.omens.length >= 2);
    assert.deepEqual(p.omens[p.omens.length - 1].left, [p.top]);
  }
  // nothing read: insight 0, stated kindly
  const none = E.summarize(game('2026-11-16', 'leo', hands.map(h => ({ turned: [(E.topIndex(h) + 1) % 5], pick: (E.topIndex(h) + 1) % 5, forced: true }))), hands);
  assert.equal(none.insight, 0);
  assert.equal(none.firstFinds, 0);
  assert.equal(none.chipsIn, 0);
});

test('the same play earns the same fortune for every sign and every set of cards', () => {
  const puzzle = dealFor('2026-11-19'), tops = puzzle.map(E.topIndex);
  const rounds = [
    { turned: [tops[0]], pick: tops[0], forced: false },
    { turned: [(tops[1] + 4) % 10], pick: (tops[1] + 4) % 10, forced: true },
    { turned: [tops[2]], pick: tops[2], forced: false }];
  const results = new Set();
  for (const sign of ['leo', 'pisces', 'gemini']) for (const seed of ['x', 'y']) {
    const g = { mode: 'daily', date: '2026-11-19', sign, seedKey: E.dailySeed('2026-11-19'), cardSeed: seed, rounds };
    const sum = E.summarize(g, E.castCards(puzzle, seed));
    results.add(sum.score.total + '|' + sum.score.tier + '|' + sum.insight);
  }
  assert.equal(results.size, 1);
});

test('the share text shows the path of each hand and no card names', () => {
  const g = game('2026-11-14', 'leo', [
    { turned: [1, 3, 0], pick: 0, forced: false },
    { turned: [2], pick: 2, forced: false },
    { turned: [4, 1], pick: 1, forced: true }]);
  const sum = E.summarize(g);
  const lines = E.shareText(sum, 'https://example.com').split('\n');
  const moons = l => Array.from(l).filter(ch => /[\u{1F311}-\u{1F315}]/u.test(ch)).length;
  assert.deepEqual(lines.slice(2, 5).map(moons), [3, 1, 2]);
  for (const p of sum.positions) assert.ok(!lines.join(' ').includes(p.name));
});

test('nothing the player reads puts them down', () => {
  const banned = /\b(stupid|dumb|fail(ed|ure)?|loser|lost|bad luck|unlucky|terrible|awful|worst|wrong|pathetic|cursed|doomed|mistake)\b/i;
  const all = [];
  for (const c of D.CARDS) all.push(c.up.t, c.rev.t, c.up.k, c.rev.k);
  for (const t of E.TIERS.filter(Boolean)) all.push(...t.lines, ...t.close, t.title);
  for (const date of days(6)) for (const sign of SIGN_IDS) {
    const hands = dealFor(date);
    for (const rounds of [blind(0), perfect(hands), [0, 1, 2].map(r => ({ turned: [r, r + 1, r + 2], pick: r + 2, forced: true }))]) {
      const sum = E.summarize(game(date, sign, rounds), hands);
      all.push(sum.verdict, sum.closing, sum.blend || '', sum.liftLine, sum.readLine, sum.ceilingLine, sum.arc);
      for (const p of sum.positions) all.push(...p.omens.map(o => o.text));
    }
  }
  // "The worst is behind you" is reassurance, so that phrase is allowed.
  for (const s of all) assert.ok(!banned.test(s.replace(/the worst (is )?behind you/i, '')), 'put-down wording: ' + s);
});
