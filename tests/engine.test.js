/* Run with: npm test   (Node 18+; no dependencies) */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/cards.js');
const T = require('../js/trivia.js');

const SIGN_IDS = D.SIGNS.map(s => s.id);
const days = n => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 10, 14 + i));
  return d.toISOString().slice(0, 10);
});
const game = (date, sign, rounds) => ({ mode: 'daily', date, sign, seedKey: E.dailySeed(date, sign), rounds });
// three hands where the first card turned is kept, with no chips won
const blind = p => [0, 1, 2].map(r => ({ earned: 0, turned: [(p + r) % 5], pick: (p + r) % 5, forced: false }));

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

test('the daily deal is deterministic, fair, and never repeats a card', () => {
  for (const date of days(40)) {
    for (const sign of SIGN_IDS) {
      const a = E.dealHands(E.dailySeed(date, sign));
      const b = E.dealHands(E.dailySeed(date, sign));
      assert.deepEqual(a, b);
      assert.equal(a.length, 3);
      const ids = a.flat().map(c => c.id);
      assert.equal(ids.length, 15);
      assert.equal(new Set(ids).size, 15);
      for (const hand of a) assert.ok(E.handIsFair(hand), 'unfair hand on ' + date + ' ' + sign);
    }
  }
});

test('different signs and different days get different decks', () => {
  const key = h => h.flat().map(c => c.id + c.rev).join();
  const seen = new Set();
  for (const date of days(10)) for (const sign of SIGN_IDS) seen.add(key(E.dealHands(E.dailySeed(date, sign))));
  assert.equal(seen.size, 120);
});

test('day numbers count from the epoch', () => {
  assert.equal(E.dayNumber(E.CONFIG.EPOCH), 1);
  assert.equal(E.dayNumber('2026-11-15'), 2);
  assert.equal(E.dayNumber('2027-11-14'), 366);
});

test('every question has four distinct options and one right answer', () => {
  const rng = E.rngFrom('question-test');
  for (const tier of [1, 2, 3]) {
    assert.ok(E.POOLS[tier].length >= 40, 'tier ' + tier + ' pool is large enough');
    for (const spec of E.POOLS[tier]) {
      for (let k = 0; k < 3; k++) {
        const q = E.materialize(spec, rng);
        assert.equal(q.options.length, 4, JSON.stringify(spec));
        assert.equal(new Set(q.options).size, 4, 'duplicate option: ' + JSON.stringify(q));
        assert.ok(q.answer >= 0 && q.answer < 4);
        assert.ok(q.q && q.why);
        assert.ok(!/undefined|null|NaN/.test(q.q + q.options.join() + q.why), JSON.stringify(q));
      }
    }
  }
});

test('lore rows are well formed', () => {
  for (const row of T.LORE) {
    assert.ok([1, 2, 3].includes(row.t));
    assert.equal(row.a.length, 4);
    assert.equal(new Set(row.a).size, 4);
    assert.ok(row.x.length > 10);
  }
});

test('daily questions are the same for every sign and do not repeat within a pool cycle', () => {
  const a = E.questionsFor(game('2026-11-14', 'leo', []));
  const b = E.questionsFor(game('2026-11-14', 'pisces', []));
  assert.deepEqual(a, b);
  const first = new Set();
  for (const date of days(E.POOLS[1].length)) first.add(E.questionsFor(game(date, 'leo', []))[0].q);
  assert.equal(first.size, E.POOLS[1].length);
});

test('chips: two for a first-try answer, one for a second try, none after', () => {
  assert.equal(E.chipsFor(1), 2);
  assert.equal(E.chipsFor(2), 1);
  assert.equal(E.chipsFor(3), 0);
  assert.equal(E.CONFIG.MAX_INSIGHT, 6);
});

test('how a card was kept separates choice from fate', () => {
  assert.equal(E.howKept({ turned: [2], forced: false }), 'first');
  assert.equal(E.howKept({ turned: [2], forced: true }), 'fate');
  assert.equal(E.howKept({ turned: [2, 0, 4], forced: false }), 'dug');
  assert.equal(E.howKept({ turned: [2, 0, 4], forced: true }), 'last');
});

test('patterns add the documented bonuses', () => {
  const up = id => ({ id, rev: false });
  const bonus = (picks, sign) => E.scoreSpread(picks, sign).bonus;
  const ids = (picks, sign) => E.detectPatterns(picks, sign).map(p => p.id);
  // Leo: Fire, suit of Wands, card Strength.
  assert.ok(ids([up('strength'), up('c02'), up('s09')], 'leo').includes('signCard'));
  assert.equal(bonus([up('strength'), up('c02'), up('s09')], 'leo'), 2);
  assert.equal(bonus([up('w03'), up('c09'), up('s06')], 'leo'), 1);                 // one attuned card
  assert.equal(bonus([up('c03'), up('c09'), up('c06')], 'leo'), 2);                 // trine of Cups
  assert.equal(bonus([up('w03'), up('w09'), up('w06')], 'leo'), 2 + 3);             // trine + three attuned
  assert.equal(bonus([up('s04'), up('c09'), up('p06')], 'libra'), 2);               // Swords give Air signs two steps
  assert.equal(E.attunedBonus('swords'), 2);
  assert.equal(E.attunedBonus('cups'), 1);
  assert.equal(bonus([up('c07'), up('s07'), up('p02')], 'leo'), 1);                 // a pair of sevens
  assert.equal(bonus([up('c07'), up('s07'), up('p07')], 'leo'), 3);                 // three sevens
  assert.equal(bonus([up('c05'), up('s06'), up('p07')], 'leo'), 2);                 // a run 5-6-7
  assert.equal(bonus([up('sun'), up('star'), up('world')], 'leo'), 2);              // three Major Arcana
  assert.equal(bonus([up('c02'), up('s09'), up('p05')], 'leo'), 0);
});

test('the moon board shows what a hand holds without leaking where', () => {
  for (const date of days(25)) {
    const hand = E.dealHands(E.dailySeed(date, 'virgo'))[0];
    const moons = hand.map(E.auspice).sort((a, b) => b - a);
    const open = E.handBoard(hand, [], null, null);
    assert.deepEqual(open.map(e => e.a), moons);
    assert.ok(open.every(e => e.state === 'down'));
    // after turning cards 0 and 3 (0 passed, 3 awaiting a decision) the same moons are there, with states
    const mid = E.handBoard(hand, [0, 3], null, 3);
    assert.deepEqual(mid.map(e => e.a), moons);
    assert.equal(mid.filter(e => e.state === 'passed').length, 1);
    assert.equal(mid.filter(e => e.state === 'up').length, 1);
    assert.equal(mid.filter(e => e.state === 'down').length, 3);
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

test('keeping a card previews its worth to the spread', () => {
  const up = id => ({ id, rev: false });
  // first card for Leo: a Wands card carries its attunement
  const a = E.keepPreview([], up('w06'), 'leo', 2);
  assert.equal(a.total, 5 + 1);
  assert.equal(a.gain, 6);
  assert.deepEqual(a.notes.map(n => n.bonus), [1]);
  // a second Cups card after a Cups card: no bonus yet, but a trine is in reach
  const b = E.keepPreview([up('c02')], up('c09'), 'leo', 1);
  assert.equal(b.gain, 5);
  assert.ok(b.hopes.some(x => /Trine/.test(x)));
  assert.equal(b.last, false);
  // the third Cups card completes it
  const c = E.keepPreview([up('c02'), up('c09')], up('c04'), 'leo', 0);
  assert.equal(c.gain, 2 + 2);
  assert.ok(c.notes.some(n => n.bonus === 2));
  assert.equal(c.last, true);
  assert.equal(c.tier, E.tierFor(c.total));
});

test('questions about a Minor card can be reasoned out from the suits', () => {
  const rng = E.rngFrom('suit-logic');
  for (const card of D.CARDS.filter(c => c.arcana === 'minor')) {
    const q = E.materialize({ kind: 'whichCard', card: card.id }, rng);
    const suits = q.options.map(name => D.CARDS.find(c => c.name === name).suit);
    assert.equal(new Set(suits).size, 4, 'one option per suit for ' + card.name);
  }
});

test('the reading never says the same thing twice', () => {
  for (const date of days(30)) for (const sign of SIGN_IDS) for (let p = 0; p < 5; p++) {
    const sum = E.summarize(game(date, sign, blind(p)));
    const lines = [sum.blend, ...sum.score.patterns.map(x => x.text)].filter(Boolean);
    assert.equal(new Set(lines).size, lines.length, lines.join(' | '));
    for (const pat of sum.score.patterns) assert.ok(pat.bonus > 0 || pat.id === 'upright' || pat.id === 'reversed');
  }
});

test('the summary separates what the deck dealt from what the passes changed', () => {
  // hand 1: pass twice, keep the third by choice. hand 2: keep the first. hand 3: pass once, then out of chips.
  const g = game('2026-11-14', 'leo', [
    { earned: 2, turned: [1, 3, 0], pick: 0, forced: false },
    { earned: 1, turned: [2], pick: 2, forced: false },
    { earned: 0, turned: [4, 1], pick: 1, forced: true }]);
  const hands = E.dealHands(g.seedKey);
  const sum = E.summarize(g, hands);
  assert.deepEqual(sum.how, ['dug', 'first', 'last']);
  assert.equal(sum.insight, 3);
  assert.equal(sum.chipsIn, 3 + 3);
  assert.equal(sum.passes, 3);
  assert.equal(sum.chipsLeft, 3);
  assert.deepEqual(sum.positions.map(p => p.path.length), [3, 1, 2]);
  assert.ok(sum.positions.every(p => p.path[p.path.length - 1].kept));
  // first turns alone: cards 1, 2 and 4
  assert.equal(sum.firstScore.total, E.scoreSpread([hands[0][1], hands[1][2], hands[2][4]], 'leo').total);
  assert.equal(sum.lift, sum.score.total - sum.firstScore.total);
  assert.match(sum.arc, /^From .+, through .+, toward .+\.$/);
  // no passes at all: the reading IS the first turns
  const still = E.summarize(game('2026-11-14', 'leo', blind(2)));
  assert.equal(still.lift, 0);
  assert.equal(still.passes, 0);
  assert.match(still.liftLine, /never passed/);
});

test('the share text shows the path of each hand and no card names', () => {
  const g = game('2026-11-14', 'leo', [
    { earned: 2, turned: [1, 3, 0], pick: 0, forced: false },
    { earned: 1, turned: [2], pick: 2, forced: false },
    { earned: 0, turned: [4, 1], pick: 1, forced: true }]);
  const sum = E.summarize(g);
  const lines = E.shareText(sum, 'https://example.com').split('\n');
  const moons = l => Array.from(l).filter(ch => /[\u{1F311}-\u{1F315}]/u.test(ch)).length;
  assert.deepEqual(lines.slice(2, 5).map(moons), [3, 1, 2]);
  for (const p of sum.positions) assert.ok(!lines.join(' ').includes(p.name));
});

test('tiers follow the thresholds', () => {
  assert.equal(E.tierFor(3), 1);
  assert.equal(E.tierFor(8), 1);
  assert.equal(E.tierFor(9), 2);
  assert.equal(E.tierFor(11), 3);
  assert.equal(E.tierFor(14), 4);
  assert.equal(E.tierFor(16), 5);
  assert.equal(E.tierFor(22), 5);
});

test('quintessence reduces to a Major Arcana card', () => {
  const q = E.quintessence([{ id: 'world', rev: false }, { id: 'c10', rev: false }, { id: 'p14', rev: true }]);
  assert.equal(q.sum, 45);
  assert.equal(q.reduced, 9);
  assert.equal(q.card.id, 'hermit');
  assert.equal(E.quintessence([{ id: 'sun', rev: false }, { id: 'w02', rev: false }, { id: 'c01', rev: false }]).card.id, 'fool');
});

test('deck odds cover all 125 possible readings', () => {
  const hands = E.dealHands(E.dailySeed('2026-11-14', 'leo'));
  const odds = E.deckOdds(hands, 'leo');
  assert.equal(odds.count, 125);
  assert.equal(odds.tierCounts.reduce((a, b) => a + b, 0), 125);
  const st = E.standing(odds, odds.best);
  assert.ok(st.isBest);
  assert.ok(st.blindChance >= 1);
});

test('a finished game summarises into a complete, clean reading', () => {
  const bad = /undefined|null|NaN|\{k\}|\{gift\}|\{Gift\}|\{ease\}/;
  for (const date of days(12)) {
    for (const sign of SIGN_IDS) {
      for (let p = 0; p < 5; p++) {
        // a mix of first-turn keeps and passes
        const rounds = [0, 1, 2].map(r => {
          const passes = (p + r) % 3, turned = [];
          for (let k = 0; k <= passes; k++) turned.push((p + r + k) % 5);
          return { earned: (p + r) % 3, turned, pick: turned[turned.length - 1], forced: (p + r) % 2 === 0 };
        });
        const sum = E.summarize(game(date, sign, rounds));
        const text = [sum.headline, sum.arc, sum.blend || '', sum.closing, sum.verdict, sum.liftLine, sum.openLine, sum.quintessence.text,
          ...sum.positions.map(x => x.lead + x.text), ...sum.score.patterns.map(x => x.title + x.text)].join(' ');
        assert.ok(!bad.test(text), text);
        assert.equal(sum.positions.length, 3);
        assert.ok(sum.score.tier >= 1 && sum.score.tier <= 5);
        assert.ok(sum.insight >= 0 && sum.insight <= E.CONFIG.MAX_INSIGHT);
        const share = E.shareText(sum, 'https://example.com');
        for (const pos of sum.positions) assert.ok(!share.includes(pos.name), 'share text must not name cards');
      }
    }
  }
});

test('reading text never puts the player down', () => {
  const banned = /\b(stupid|dumb|fail(ed|ure)?|loser|lost|bad luck|unlucky|terrible|awful|worst|wrong|pathetic|cursed|doomed)\b/i;
  const all = [];
  for (const c of D.CARDS) all.push(c.up.t, c.rev.t, c.up.k, c.rev.k);
  for (const t of E.TIERS.filter(Boolean)) all.push(...t.lines, ...t.close, t.title);
  for (const date of days(6)) for (const sign of SIGN_IDS) {
    for (const rounds of [blind(0), [0, 1, 2].map(r => ({ earned: 0, turned: [r, r + 1, r + 2], pick: r + 2, forced: true }))]) {
      const sum = E.summarize(game(date, sign, rounds));
      all.push(sum.verdict, sum.closing, sum.blend || '', sum.liftLine, sum.openLine, sum.arc);
    }
  }
  // "The worst is behind you" is reassurance, so that phrase is allowed.
  for (const s of all) assert.ok(!banned.test(s.replace(/the worst (is )?behind you/i, '')), 'put-down wording: ' + s);
});
