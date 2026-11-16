#!/usr/bin/env node
/*
 * Balance check: plays thousands of daily games with players of different skill
 * and prints how their fortunes come out. Run after changing any number in
 * CONFIG, TIERS, the deal rule or a card's auspice:   npm run simulate
 *
 * Targets (see IMPLEMENTATION_GUIDE.md, "Balance"):
 *   - a player who ignores the omens still reaches Full Moon sometimes (about 3-10%)
 *   - a player who reads every hand reaches Full Moon far more often (about 30-45%), never always
 *   - each step up in reading raises the share of Gibbous and Full readings
 *   - no sign is luckier than another
 *
 * Skill is modelled as how often the player reads a hand's omens correctly. When they do,
 * they turn the brightest card first and keep it. When they do not, they turn cards without
 * knowing where anything is:
 *     tapper  keeps anything Gibbous or better, passes anything else while chips last
 *     careful reads the moon board and passes only when the odds favour it
 */
const E = require('../js/engine.js');
const { SIGNS } = require('../js/cards.js');

const DAYS = Number(process.argv[2]) || 400;
const C = E.CONFIG;
const CHIP_WORTH = 0.5;   // what a careful player thinks a saved chip is worth, in moons, before the last hand
const AVG_BONUS = 0.2;    // average pattern bonus an unseen card brings

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const spreadTotal = (kept, sign) => (kept.length ? E.scoreSpread(kept, sign).total : 0);

// Expected brightness of the card a player ends up with if they pass now, playing the odds from the moon board.
function makeContinue(chipWorth) {
  const memo = new Map();
  return function F(R, chips) {
    const key = R.join('') + '|' + chips;
    if (memo.has(key)) return memo.get(key);
    let sum = 0;
    for (let i = 0; i < R.length; i++) {
      const rest = R.slice(0, i).concat(R.slice(i + 1));
      const canPass = rest.length > 0 && chips >= C.PASS_PRICE;
      sum += Math.max(R[i], canPass ? F(rest, chips - C.PASS_PRICE) - chipWorth * C.PASS_PRICE : -Infinity);
    }
    const v = sum / R.length;
    memo.set(key, v);
    return v;
  };
}

function playGame(seedKey, sign, player, rng) {
  const hands = E.dealHands(seedKey);
  let chips = 0;
  const kept = [];
  const rounds = hands.map((hand, street) => {
    chips += C.CHIPS_PER_HAND;
    const top = E.topIndex(hand);
    if (rng() < player.reads) {                       // read the omens: straight to the brightest card
      kept.push(hand[top]);
      return { turned: [top], pick: top, forced: false };
    }
    const chipWorth = street < C.ROUNDS - 1 ? CHIP_WORTH : 0;
    const F = makeContinue(chipWorth);
    let unseen = [0, 1, 2, 3, 4];
    const turned = [];
    let forced = false;
    for (;;) {
      const idx = unseen[Math.floor(rng() * unseen.length)];
      unseen = unseen.filter(i => i !== idx);
      turned.push(idx);
      const card = hand[idx];
      const canPass = chips >= C.PASS_PRICE && unseen.length > 0;
      let keep;
      if (!canPass) { keep = true; forced = true; }
      else if (player.play === 'tapper') keep = E.isBright(card);
      else {
        const gain = spreadTotal(kept.concat([card]), sign) - spreadTotal(kept, sign);
        const R = unseen.map(i => E.auspice(hand[i])).sort();
        keep = gain >= F(R, chips - C.PASS_PRICE) + AVG_BONUS - chipWorth * C.PASS_PRICE;
      }
      if (keep) { kept.push(card); break; }
      chips -= C.PASS_PRICE;
    }
    return { turned, pick: turned[turned.length - 1], forced };
  });
  return E.summarize({ mode: 'practice', date: C.EPOCH, sign, seedKey, rounds }, hands);
}

const PLAYERS = [
  { name: 'Ignores the omens, random taps', reads: 0, play: 'tapper' },
  { name: 'Ignores the omens, plays the odds', reads: 0, play: 'careful' },
  { name: 'Reads 1 hand in 3', reads: 1 / 3, play: 'careful' },
  { name: 'Reads 2 hands in 3', reads: 2 / 3, play: 'careful' },
  { name: 'Reads every hand', reads: 1, play: 'careful' },
];

console.log(`Simulating ${DAYS} days x ${SIGNS.length} signs per player`);
console.log(`Tiers: ${[2, 3, 4, 5].map(t => E.TIERS[t].moon + ' ' + E.TIERS[t].min + '+').join(', ')}\n`);
console.log('Player'.padEnd(36), 'insight', ' total', '  New  Cres  Half  Gibb  Full', ' passes', ' at ceiling');

const bySign = {};
for (const player of PLAYERS) {
  const rng = E.rngFrom('sim|' + player.name);
  const tiers = [0, 0, 0, 0, 0, 0], totals = [], insights = [], passes = [], atCeiling = [];
  for (let d = 0; d < DAYS; d++) {
    for (const s of SIGNS) {
      const sum = playGame(`sim-${d}|${s.id}`, s.id, player, rng);
      tiers[sum.score.tier]++; totals.push(sum.score.total); insights.push(sum.insight);
      passes.push(sum.passes); atCeiling.push(sum.score.total >= sum.ceiling.total ? 1 : 0);
      if (player.reads === 1) (bySign[s.id] = bySign[s.id] || []).push(sum.score.total);
    }
  }
  const n = totals.length;
  const pct = t => ((tiers[t] / n) * 100).toFixed(1).padStart(5) + '%';
  console.log(player.name.padEnd(36), mean(insights).toFixed(2).padStart(7), mean(totals).toFixed(2).padStart(6),
    [1, 2, 3, 4, 5].map(pct).join(''), mean(passes).toFixed(2).padStart(7), ((mean(atCeiling) * 100).toFixed(0) + '%').padStart(11));
}

// Is any sign luckier than another? Average total for a perfect reader, per sign.
const signMeans = SIGNS.map(s => mean(bySign[s.id]));
console.log('\nAverage total by sign (reads every hand): ' + SIGNS.map((s, i) => s.id.slice(0, 3) + ' ' + signMeans[i].toFixed(1)).join('  '));
console.log('Spread between the luckiest and unluckiest sign: ' + (Math.max(...signMeans) - Math.min(...signMeans)).toFixed(2) + ' moons');

// The luck of the deal: what the deck can give at best, and what blind picking gives.
const ceilings = [0, 0, 0, 0, 0, 0], spread = [];
let decks = 0, omenCount = [0, 0, 0];
for (let d = 0; d < DAYS; d++) for (const s of SIGNS) {
  const g = { seedKey: `sim-${d}|${s.id}` };
  const hands = E.dealHands(g.seedKey);
  const o = E.deckOdds(hands, s.id);
  ceilings[E.tierFor(o.best)]++; decks++;
  spread.push(o.tierCounts.map(c => c / o.count));
  E.omensFor(g, hands).forEach((p, i) => { omenCount[i] += p.omens.length; });
}
console.log('\nThe deck ceiling (best reading a deck can give), by tier:');
console.log([3, 4, 5].map(t => `${E.TIERS[t].moon} ${((ceilings[t] / decks) * 100).toFixed(1)}%`).join(' | '));
console.log('Share of the 125 blind readings in each tier, averaged over all decks:');
console.log([1, 2, 3, 4, 5].map(t => `${E.TIERS[t].moon} ${(mean(spread.map(x => x[t])) * 100).toFixed(1)}%`).join(' | '));
console.log('Average omens per hand: Past ' + (omenCount[0] / decks).toFixed(2) + ', Present ' + (omenCount[1] / decks).toFixed(2) + ', Future ' + (omenCount[2] / decks).toFixed(2));
