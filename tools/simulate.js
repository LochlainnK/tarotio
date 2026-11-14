#!/usr/bin/env node
/*
 * Balance check: plays thousands of daily games with players of different skill
 * and prints how their fortunes come out. Run after changing any number in
 * CONFIG, TIERS or a card's auspice:   npm run simulate
 *
 * Targets (see IMPLEMENTATION_GUIDE.md, "Balance"):
 *   - a player who earns no glimpses still reaches Full Moon sometimes (about 2-6%)
 *   - a player who always earns two glimpses reaches Gibbous or Full far more often
 *   - nobody is guaranteed anything: the best player still lands on every tier
 */
const E = require('../js/engine.js');
const { SIGNS, CARDS } = require('../js/cards.js');

const DAYS = Number(process.argv[2]) || 400;

// pFirst = chance of answering right first time; pSecond = chance of getting it on the second try.
const PLAYERS = [
  { name: 'No glimpses (never right)', pFirst: 0, pSecond: 0 },
  { name: 'Pure guesser', pFirst: 0.25, pSecond: 1 / 3 },
  { name: 'Learner', pFirst: 0.5, pSecond: 0.5 },
  { name: 'Regular', pFirst: 0.75, pSecond: 0.7 },
  { name: 'Always two glimpses', pFirst: 1, pSecond: 1 },
];

function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }

// What an unseen card is worth on average, split by what the tell reveals:
// a bright card (Gibbous or Full) versus any other, weighted by how often cards land reversed.
function faceAverages() {
  const bright = [], other = [];
  for (const c of CARDS) {
    for (const [f, w] of [[c.up, 1 - E.CONFIG.REVERSED_CHANCE], [c.rev, E.CONFIG.REVERSED_CHANCE]]) {
      (f.a >= E.CONFIG.BRIGHT_FROM ? bright : other).push([f.a, w]);
    }
  }
  const avg = xs => xs.reduce((s, x) => s + x[0] * x[1], 0) / xs.reduce((s, x) => s + x[1], 0);
  return { bright: avg(bright), other: avg(other) };
}
const FACE = faceAverages();
const SIGN_EXTRA = 0.2;   // average lift from attunement and the sign's own card

function playGame(seedKey, signId, player, rng) {
  const hands = E.dealHands(seedKey);
  const rounds = hands.map((hand) => {
    let glimpses = 0;
    if (rng() < player.pFirst) glimpses = E.glimpsesFor(1);
    else if (rng() < player.pSecond) glimpses = E.glimpsesFor(2);
    const order = E.shuffle([0, 1, 2, 3, 4], rng);
    const seen = order.slice(0, glimpses);
    let pick;
    const best = seen.slice().sort((a, b) => E.worth(hand[b], signId) - E.worth(hand[a], signId))[0];
    // The tell says how many face-down cards are bright, so an informed player can price the gamble.
    const tell = E.handTell(hand, seen);
    const chance = tell.unseenBright / tell.unseen;
    const unseenWorth = chance * FACE.bright + (1 - chance) * FACE.other + SIGN_EXTRA;
    if (best !== undefined && E.worth(hand[best], signId) >= unseenWorth) pick = best;   // keep what you saw
    else pick = order[glimpses];                                                         // gamble on an unseen card
    return { glimpses, seen, pick };
  });
  return E.summarize({ mode: 'practice', date: '2026-11-14', sign: signId, seedKey, rounds }, hands);
}

console.log(`Average bright card: ${FACE.bright.toFixed(2)} moons. Average other card: ${FACE.other.toFixed(2)} moons.`);
console.log(`Simulating ${DAYS} days x ${SIGNS.length} signs per player\n`);
console.log('Player'.padEnd(28), 'insight', ' total', '  New  Cres  Half  Gibb  Full', '  by sight');

for (const player of PLAYERS) {
  const rng = E.rngFrom('sim|' + player.name);
  const tiers = [0, 0, 0, 0, 0, 0], totals = [], insights = [], sights = [];
  for (let d = 0; d < DAYS; d++) {
    for (const s of SIGNS) {
      const sum = playGame(`sim-${d}|${s.id}`, s.id, player, rng);
      tiers[sum.score.tier]++; totals.push(sum.score.total); insights.push(sum.insight); sights.push(sum.sightCount);
    }
  }
  const n = totals.length;
  const pct = t => ((tiers[t] / n) * 100).toFixed(1).padStart(5) + '%';
  console.log(player.name.padEnd(28), mean(insights).toFixed(2).padStart(7), mean(totals).toFixed(2).padStart(6),
    [1, 2, 3, 4, 5].map(pct).join(''), '  ' + mean(sights).toFixed(2));
}

// How wide is the deck itself on a typical day?
const spread = [];
for (let d = 0; d < DAYS; d++) for (const s of SIGNS) {
  const o = E.deckOdds(E.dealHands(`sim-${d}|${s.id}`), s.id);
  spread.push(o.tierCounts.map(c => c / o.count));
}
console.log('\nShare of the 125 possible readings in each tier, averaged over all decks:');
console.log([1, 2, 3, 4, 5].map(t => `${E.TIERS[t].moon} ${(mean(spread.map(x => x[t])) * 100).toFixed(1)}%`).join(' | '));
