#!/usr/bin/env node
/*
 * Balance check: plays thousands of daily games with players of different skill
 * and prints how their fortunes come out. Run after changing any number in
 * CONFIG, TIERS or a card's auspice:   npm run simulate
 *
 * Targets (see IMPLEMENTATION_GUIDE.md, "Balance"):
 *   - a player who wins no chips from the questions still reaches Full Moon sometimes (about 5-12%)
 *   - a strong player reaches Full Moon far more often (about 30-45%) but never always
 *   - each step up in skill raises the share of Gibbous and Full readings
 *
 * Two kinds of skill are modelled:
 *   answers = how often the player gets the question right (this wins chips)
 *   play    = how well they use the table:
 *     tapper  turns cards at random and keeps anything Gibbous or better
 *     careful reads the moon board and passes only when the odds favour it
 *     shark   does that, and also reads the suit marks: own element first, chase a trine, avoid Swords
 */
const E = require('../js/engine.js');
const { SIGNS, CARD_BY_ID, SIGN_BY_ID } = require('../js/cards.js');

const DAYS = Number(process.argv[2]) || 400;
const C = E.CONFIG;
const CHIP_WORTH = 0.5;   // what a careful player thinks a saved chip is worth, in moons, before the last hand
const AVG_BONUS = 0.2;    // average pattern bonus an unseen card brings

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const spreadTotal = (kept, sign) => (kept.length ? E.scoreSpread(kept, sign).total : 0);

// Expected brightness of the card a player ends up with if they pass now, playing the odds from the moon board.
// R = moons still face down (the board is public), chips = chips left after paying for this pass.
function makeContinue(chipWorth) {
  const memo = new Map();
  return function F(R, chips) {
    const key = R.join('') + '|' + chips;
    if (memo.has(key)) return memo.get(key);
    let sum = 0;
    for (let i = 0; i < R.length; i++) {
      const rest = R.slice(0, i).concat(R.slice(i + 1));
      const canPass = rest.length > 0 && chips >= C.PASS_PRICE;
      const onward = canPass ? F(rest, chips - C.PASS_PRICE) - chipWorth * C.PASS_PRICE : -Infinity;
      sum += Math.max(R[i], onward);
    }
    const v = sum / R.length;
    memo.set(key, v);
    return v;
  };
}

function playGame(seedKey, sign, player, rng) {
  const hands = E.dealHands(seedKey);
  const mySuit = SIGN_BY_ID[sign].suit;
  let chips = 0;
  const kept = [];
  const rounds = hands.map((hand, street) => {
    const earned = rng() < player.pFirst ? E.chipsFor(1) : rng() < player.pSecond ? E.chipsFor(2) : 0;
    chips += C.CHIPS_PER_HAND + earned;
    const chipWorth = street < C.ROUNDS - 1 ? CHIP_WORTH : 0;
    const F = makeContinue(chipWorth);
    let unseen = [0, 1, 2, 3, 4];
    const turned = [];
    let forced = false;
    for (;;) {
      // which face-down card to turn
      let idx;
      if (player.play === 'shark') {
        const keptSuits = kept.map(c => E.aura(c));
        const appeal = i => {
          const a = E.aura(hand[i]);
          let v = rng() * 0.01;
          if (a === mySuit) v += 1;                                                    // +1 for my element
          if (kept.length && keptSuits.every(x => x === a)) v += street === C.ROUNDS - 1 ? 2 : 0.5;   // chase a trine or Fate's Hand
          if (a === 'swords') v -= 0.4;                                                // the darkest suit
          return v;
        };
        idx = unseen.slice().sort((a, b) => appeal(b) - appeal(a))[0];
      } else {
        idx = unseen[Math.floor(rng() * unseen.length)];
      }
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
    return { earned, turned, pick: turned[turned.length - 1], forced };
  });
  return E.summarize({ mode: 'practice', date: C.EPOCH, sign, seedKey, rounds }, hands);
}

const PLAYERS = [
  { name: 'No answers right, random taps', pFirst: 0, pSecond: 0, play: 'tapper' },
  { name: 'No answers right, careful', pFirst: 0, pSecond: 0, play: 'careful' },
  { name: 'Pure guesser, careful', pFirst: 0.25, pSecond: 1 / 3, play: 'careful' },
  { name: 'Learner, careful', pFirst: 0.5, pSecond: 0.5, play: 'careful' },
  { name: 'Regular, careful', pFirst: 0.75, pSecond: 0.7, play: 'careful' },
  { name: 'Regular, shark', pFirst: 0.75, pSecond: 0.7, play: 'shark' },
  { name: 'All answers right, careful', pFirst: 1, pSecond: 1, play: 'careful' },
  { name: 'All answers right, shark', pFirst: 1, pSecond: 1, play: 'shark' },
];

console.log(`Simulating ${DAYS} days x ${SIGNS.length} signs per player`);
console.log(`Tiers: ${[2, 3, 4, 5].map(t => E.TIERS[t].moon + ' ' + E.TIERS[t].min + '+').join(', ')}\n`);
console.log('Player'.padEnd(32), 'insight', ' total', '  New  Cres  Half  Gibb  Full', ' passes', ' chips left', ' lift');

for (const player of PLAYERS) {
  const rng = E.rngFrom('sim|' + player.name);
  const tiers = [0, 0, 0, 0, 0, 0], totals = [], insights = [], passes = [], left = [], lift = [];
  for (let d = 0; d < DAYS; d++) {
    for (const s of SIGNS) {
      const sum = playGame(`sim-${d}|${s.id}`, s.id, player, rng);
      tiers[sum.score.tier]++; totals.push(sum.score.total); insights.push(sum.insight);
      passes.push(sum.passes); left.push(sum.chipsLeft); lift.push(sum.lift);
    }
  }
  const n = totals.length;
  const pct = t => ((tiers[t] / n) * 100).toFixed(1).padStart(5) + '%';
  console.log(player.name.padEnd(32), mean(insights).toFixed(2).padStart(7), mean(totals).toFixed(2).padStart(6),
    [1, 2, 3, 4, 5].map(pct).join(''), mean(passes).toFixed(2).padStart(7), mean(left).toFixed(2).padStart(11), ('+' + mean(lift).toFixed(2)).padStart(6));
}

// Is any sign luckier than another? Average total for the strongest player, per sign.
const bySign = {};
{
  const player = PLAYERS[PLAYERS.length - 1], rng = E.rngFrom('sim|signs');
  for (let d = 0; d < DAYS; d++) for (const s of SIGNS) {
    (bySign[s.id] = bySign[s.id] || []).push(playGame(`sim-${d}|${s.id}`, s.id, player, rng).score.total);
  }
}
const signMeans = SIGNS.map(s => mean(bySign[s.id]));
console.log('\nAverage total by sign (strongest player): ' + SIGNS.map((s, i) => s.id.slice(0, 3) + ' ' + signMeans[i].toFixed(1)).join('  '));
console.log('Spread between the luckiest and unluckiest sign: ' + (Math.max(...signMeans) - Math.min(...signMeans)).toFixed(2) + ' moons');

// How wide is the deck itself on a typical day, picking one card blind from each hand?
const spread = [];
for (let d = 0; d < DAYS; d++) for (const s of SIGNS) {
  const o = E.deckOdds(E.dealHands(`sim-${d}|${s.id}`), s.id);
  spread.push(o.tierCounts.map(c => c / o.count));
}
console.log('\nShare of the 125 blind readings in each tier, averaged over all decks:');
console.log([1, 2, 3, 4, 5].map(t => `${E.TIERS[t].moon} ${(mean(spread.map(x => x[t])) * 100).toFixed(1)}%`).join(' | '));
