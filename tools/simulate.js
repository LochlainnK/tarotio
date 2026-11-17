#!/usr/bin/env node
/*
 * Balance check: plays thousands of daily games with players of different skill
 * and prints how their fortunes come out. Run after changing any number in
 * CONFIG, TIERS, the deal rule, the omen generator or a card's auspice:
 *     npm run simulate            (or: node tools/simulate.js <days>)
 *
 * Players are modelled on the real omens. Each omen is applied correctly with
 * probability p, in order, stopping at the first one the player cannot use. The player
 * then turns cards among the places still possible. Turning the brightest card keeps it
 * at once; any other card is passed if a chip is in hand.
 *
 * Targets (see IMPLEMENTATION_GUIDE.md, "Balance"):
 *   - perfect readers (p = 1) get a Full Moon every day
 *   - Full Moon rises steeply with skill: blind about 5%, p .5 about 20%, p .85 about 65%, p .95 about 85%
 *   - blind players still reach Gibbous or Full sometimes (10-20%): luck is real, but small
 *   - no element is luckier than another (spread under 5 points)
 */
const E = require('../js/engine.js');
const { SIGNS } = require('../js/cards.js');

const DAYS = Number(process.argv[2]) || 300;
const C = E.CONFIG;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

function playGame(seedKey, sign, p, rng) {
  const hands = E.dealHands(seedKey, sign);
  const puzzles = E.omensFor({ seedKey, sign }, hands);
  let chips = 0;
  const rounds = hands.map((hand, i) => {
    const pz = puzzles[i], top = pz.top;
    let m = 0;
    while (m < pz.omens.length && rng() < p) m++;
    const possible = m ? pz.steps[m - 1] : [0, 1, 2, 3, 4];
    const turned = [];
    let forced = false;
    for (;;) {
      const left = possible.filter(x => !turned.includes(x));
      const from = left.length ? left : [0, 1, 2, 3, 4].filter(x => !turned.includes(x));
      const idx = from[Math.floor(rng() * from.length)];
      turned.push(idx);
      if (idx === top) break;                                        // found: kept at once
      if (chips < C.PASS_PRICE || turned.length === C.HAND_SIZE) { forced = true; break; }
      chips -= C.PASS_PRICE;                                         // pass and try again
    }
    if (turned[0] === top && i < C.ROUNDS - 1) chips += C.CHIPS_PER_READ;
    return { turned, pick: turned[turned.length - 1], forced };
  });
  return E.summarize({ mode: 'practice', date: C.EPOCH, sign, seedKey, rounds }, hands);
}

const PLAYERS = [
  ['Blind: ignores the omens', 0],
  ['Uses half the omens (p .5)', 0.5],
  ['Learner (p .7)', 0.7],
  ['Regular (p .85)', 0.85],
  ['Sharp (p .95)', 0.95],
  ['Perfect reader (p 1)', 1],
];

console.log(`Simulating ${DAYS} days x ${SIGNS.length} signs per player`);
console.log(`Tiers: ${[2, 3, 4, 5].map(t => E.TIERS[t].moon + ' ' + E.TIERS[t].min + '+').join(', ')}\n`);
console.log('Player'.padEnd(30), 'insight', ' total', '  New  Cres  Half  Gibb  Full', '  passes');

const bySign = {};
for (const [name, p] of PLAYERS) {
  const rng = E.rngFrom('sim|' + name);
  const tiers = [0, 0, 0, 0, 0, 0], totals = [], insights = [], passes = [];
  for (let d = 0; d < DAYS; d++) {
    for (const s of SIGNS) {
      const sum = playGame(`sim-${d}|${s.id}`, s.id, p, rng);
      tiers[sum.score.tier]++; totals.push(sum.score.total); insights.push(sum.insight); passes.push(sum.passes);
      if (p === 0.7) (bySign[s.element] = bySign[s.element] || []).push(sum.score.tier === 5 ? 1 : 0);
    }
  }
  const n = totals.length;
  const pct = t => ((tiers[t] / n) * 100).toFixed(1).padStart(5) + '%';
  console.log(name.padEnd(30), mean(insights).toFixed(2).padStart(7), mean(totals).toFixed(2).padStart(6),
    [1, 2, 3, 4, 5].map(pct).join(''), mean(passes).toFixed(2).padStart(8));
}

// Is any sign luckier than another? Full Moon rate for a learner, grouped by element
// (three signs each, so each figure rests on enough games to mean something).
const els = Object.keys(bySign), rates = els.map(e => mean(bySign[e]) * 100);
console.log('\nFull Moon rate by element (learner): ' + els.map((e, i) => e + ' ' + rates[i].toFixed(1) + '%').join('  '));
console.log('Spread between the luckiest and unluckiest element: ' + (Math.max(...rates) - Math.min(...rates)).toFixed(1) + ' points');

// The deck itself.
const spread = [], perfect = [];
const omenCount = [0, 0, 0];
let decks = 0;
for (let d = 0; d < DAYS; d++) for (const s of SIGNS) {
  const g = { seedKey: `sim-${d}|${s.id}`, sign: s.id };
  const hands = E.dealHands(g.seedKey, g.sign);
  const o = E.deckOdds(hands, s.id);
  spread.push(o.tierCounts.map(c => c / o.count));
  perfect.push(E.perfectReading(hands, s.id).total);
  E.omensFor(g, hands).forEach((pz, i) => { omenCount[i] += pz.omens.length; });
  decks++;
}
console.log('\nPerfect reading: always a Full Moon, ' + Math.min(...perfect) + ' to ' + Math.max(...perfect) + ' moons, average ' + mean(perfect).toFixed(1));
console.log('Share of the 125 blind readings in each tier, averaged over all decks:');
console.log([1, 2, 3, 4, 5].map(t => `${E.TIERS[t].moon} ${(mean(spread.map(x => x[t])) * 100).toFixed(1)}%`).join(' | '));
console.log('Average omens per hand: Past ' + (omenCount[0] / decks).toFixed(2) + ', Present ' + (omenCount[1] / decks).toFixed(2) + ', Future ' + (omenCount[2] / decks).toFixed(2));
