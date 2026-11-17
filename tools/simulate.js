#!/usr/bin/env node
/*
 * Balance check: plays thousands of daily games with players of different skill
 * and prints how their fortunes come out. Run after changing any number in
 * CONFIG, TIERS, the deal rule, the omen generator or a card's auspice:
 *     npm run simulate            (or: node tools/simulate.js <days>)
 *
 * Each day's puzzle is dealt once and played by every kind of player, each with their
 * own randomly cast cards and a sign that changes day to day (neither changes the fortune).
 *
 * Players are modelled on the real omens. Each omen is applied correctly with
 * probability p, in order, stopping at the first one the player cannot use. The player
 * then turns cards among the places still possible. Turning the Full Moon keeps it at
 * once; any other card is passed if a chip is in hand.
 *
 * Targets (see IMPLEMENTATION_GUIDE.md, "Balance"):
 *   - perfect readers (p = 1) get a Full Moon every day
 *   - Full Moon rises steeply with skill: blind 0.5-4%, p .5 about 6-15%, p .85 about 45-70%, p .95 at least 75%
 *   - blind players still reach Gibbous or Full sometimes (3-12%): luck is real, but small
 */
const E = require('../js/engine.js');
const { SIGNS } = require('../js/cards.js');

const DAYS = Number(process.argv[2]) || 1000;
const C = E.CONFIG;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const ALL_PLACES = Array.from({ length: C.HAND_SIZE }, (_, i) => i);

function playGame(day, puzzle, p, rng) {
  const seedKey = day.seedKey, sign = SIGNS[Math.floor(rng() * SIGNS.length)].id;
  const cardSeed = 'sim|' + Math.floor(rng() * 1e9);
  const hands = E.castCards(puzzle, cardSeed);
  const puzzles = E.omensFor({ seedKey }, puzzle);
  let chips = 0;
  const rounds = hands.map((hand, i) => {
    const pz = puzzles[i], top = pz.top;
    let m = 0;
    while (m < pz.omens.length && rng() < p) m++;
    const possible = m ? pz.steps[m - 1] : ALL_PLACES;
    const turned = [];
    let forced = false;
    for (;;) {
      const left = possible.filter(x => !turned.includes(x));
      const from = left.length ? left : ALL_PLACES.filter(x => !turned.includes(x));
      const idx = from[Math.floor(rng() * from.length)];
      turned.push(idx);
      if (idx === top) break;                                        // found: kept at once
      if (chips < C.PASS_PRICE || turned.length === C.HAND_SIZE) { forced = true; break; }
      chips -= C.PASS_PRICE;                                         // pass and try again
    }
    if (turned[0] === top && i < C.ROUNDS - 1) chips += C.CHIPS_PER_READ;
    return { turned, pick: turned[turned.length - 1], forced };
  });
  return E.summarize({ mode: 'practice', date: C.EPOCH, sign, seedKey, cardSeed, rounds }, hands);
}

const PLAYERS = [
  ['Blind: ignores the omens', 0],
  ['Uses half the omens (p .5)', 0.5],
  ['Learner (p .7)', 0.7],
  ['Regular (p .85)', 0.85],
  ['Sharp (p .95)', 0.95],
  ['Perfect reader (p 1)', 1],
];

// Deal every day's puzzle once.
const t0 = Date.now();
const days = [];
for (let d = 0; d < DAYS; d++) {
  const seedKey = 'sim-' + d;
  days.push({ seedKey, puzzle: E.dealHands(seedKey) });
}
console.log(`Dealt ${DAYS} daily puzzles in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`Tiers: ${[2, 3, 4, 5].map(t => E.TIERS[t].moon + ' ' + E.TIERS[t].min + '+').join(', ')}\n`);
console.log('Player'.padEnd(30), 'insight', ' moons', '  New  Cres  Half  Gibb  Full', '  passes');

for (const [name, p] of PLAYERS) {
  const rng = E.rngFrom('sim|' + name);
  const tiers = [0, 0, 0, 0, 0, 0], totals = [], insights = [], passes = [];
  for (const day of days) {
    const sum = playGame(day, day.puzzle, p, rng);
    tiers[sum.score.tier]++; totals.push(sum.score.total); insights.push(sum.insight); passes.push(sum.passes);
  }
  const n = totals.length;
  const pct = t => ((tiers[t] / n) * 100).toFixed(1).padStart(5) + '%';
  console.log(name.padEnd(30), mean(insights).toFixed(2).padStart(7), mean(totals).toFixed(2).padStart(6),
    [1, 2, 3, 4, 5].map(pct).join(''), mean(passes).toFixed(2).padStart(8));
}

// The puzzles themselves.
const spread = [], omenCount = [0, 0, 0], castable = [];
for (const day of days) {
  const o = E.deckOdds(day.puzzle);
  spread.push(o.tierCounts.map(c => c / o.count));
  E.omensFor({ seedKey: day.seedKey }, day.puzzle).forEach((pz, i) => { omenCount[i] += pz.omens.length; });
  // how varied are the cards behind the Full Moons? count distinct cards over ten castings
  const tops = day.puzzle.map(E.topIndex), seen = new Set();
  for (let k = 0; k < 10; k++) E.castCards(day.puzzle, day.seedKey + '|' + k).forEach((h, i) => seen.add(i + ':' + h[tops[i]].id));
  castable.push(seen.size / 3);
}
console.log('\nShare of the ' + (C.HAND_SIZE ** 3).toLocaleString('en') + ' blind readings in each tier, averaged over all puzzles:');
console.log([1, 2, 3, 4, 5].map(t => `${E.TIERS[t].moon} ${(mean(spread.map(x => x[t])) * 100).toFixed(1)}%`).join(' | '));
console.log('Average omens per hand: Past ' + (omenCount[0] / DAYS).toFixed(2) + ', Present ' + (omenCount[1] / DAYS).toFixed(2) + ', Future ' + (omenCount[2] / DAYS).toFixed(2));
console.log('Different cards behind a Full Moon across ten players: ' + mean(castable).toFixed(1) + ' on average');
