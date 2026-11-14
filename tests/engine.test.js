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

test('glimpses: two for a first-try answer, one for a second try, none after', () => {
  assert.equal(E.glimpsesFor(1), 2);
  assert.equal(E.glimpsesFor(2), 1);
  assert.equal(E.glimpsesFor(3), 0);
});

test('how a card was chosen separates sight, gamble and fate', () => {
  assert.equal(E.howChosen({ seen: [1, 3], pick: 3 }), 'sight');
  assert.equal(E.howChosen({ seen: [1, 3], pick: 0 }), 'gamble');
  assert.equal(E.howChosen({ seen: [], pick: 2 }), 'fate');
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
  assert.equal(bonus([up('c07'), up('s07'), up('p02')], 'leo'), 1);                 // a pair of sevens
  assert.equal(bonus([up('c07'), up('s07'), up('p07')], 'leo'), 3);                 // three sevens
  assert.equal(bonus([up('c05'), up('s06'), up('p07')], 'leo'), 2);                 // a run 5-6-7
  assert.equal(bonus([up('sun'), up('star'), up('world')], 'leo'), 2);              // three Major Arcana
  assert.equal(bonus([up('c02'), up('s09'), up('p05')], 'leo'), 0);
});

test('the tell counts bright cards without saying which', () => {
  for (const date of days(20)) {
    const hand = E.dealHands(E.dailySeed(date, 'virgo'))[0];
    const bright = hand.filter(c => E.auspice(c) >= E.CONFIG.BRIGHT_FROM).length;
    const open = E.handTell(hand, []);
    assert.deepEqual(open, { size: 5, bright, unseen: 5, unseenBright: bright });
    assert.ok(open.bright >= 1, 'a fair hand always holds a bright card');
    const seen = [0, 3];
    const t = E.handTell(hand, seen);
    assert.equal(t.unseen, 3);
    assert.equal(t.unseenBright, bright - seen.filter(i => E.isBright(hand[i])).length);
  }
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
    const rounds = [0, 1, 2].map(r => ({ glimpses: 0, seen: [], pick: (p + r) % 5 }));
    const sum = E.summarize(game(date, sign, rounds));
    const lines = [sum.blend, ...sum.score.patterns.map(x => x.text)].filter(Boolean);
    assert.equal(new Set(lines).size, lines.length, lines.join(' | '));
    for (const pat of sum.score.patterns) assert.ok(pat.bonus > 0 || pat.id === 'upright' || pat.id === 'reversed');
  }
});

test('odds are recorded for every card kept unseen, and only those', () => {
  const g = game('2026-11-14', 'leo', [
    { glimpses: 2, seen: [1, 2], pick: 1 }, { glimpses: 1, seen: [1], pick: 4 }, { glimpses: 0, seen: [], pick: 4 }]);
  const sum = E.summarize(g);
  assert.equal(sum.positions[0].odds, null);
  assert.equal(sum.positions[1].odds.of, 4);
  assert.equal(sum.positions[2].odds.of, 5);
  assert.equal(sum.unseenPicks, 2);
  assert.ok(sum.unseenHits <= 2);
  assert.match(sum.arc, /^From .+, through .+, toward .+\.$/);
});

test('tiers follow the thresholds', () => {
  assert.equal(E.tierFor(3), 1);
  assert.equal(E.tierFor(7), 1);
  assert.equal(E.tierFor(8), 2);
  assert.equal(E.tierFor(10), 3);
  assert.equal(E.tierFor(13), 4);
  assert.equal(E.tierFor(15), 5);
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
        const rounds = [0, 1, 2].map(r => ({ glimpses: (p + r) % 3, seen: (p + r) % 3 ? [p] : [], pick: (p + r) % 5 }));
        const sum = E.summarize(game(date, sign, rounds));
        const text = [sum.headline, sum.arc, sum.blend || '', sum.closing, sum.verdict, sum.luckLine, sum.quintessence.text,
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
    const rounds = [0, 1, 2].map(r => ({ glimpses: 0, seen: [], pick: r }));
    const sum = E.summarize(game(date, sign, rounds));
    all.push(sum.verdict, sum.closing, sum.blend || '', sum.luckLine, sum.arc);
  }
  // "The worst is behind you" is reassurance, so that phrase is allowed.
  for (const s of all) assert.ok(!banned.test(s.replace(/the worst (is )?behind you/i, '')), 'put-down wording: ' + s);
});
