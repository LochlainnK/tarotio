/*
 * Tarotio engine: every rule of the game, with no DOM and no storage.
 *
 * Everything here is deterministic. Given the same seed key, the same deal,
 * omens and reading text come out, on any device. The UI (app.js) only
 * records what the player did and asks this file what it means.
 *
 * Works as a browser global (window.TarotioEngine) and as a Node module.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'));
  } else {
    root.TarotioEngine = factory(root.TarotioCards);
  }
})(typeof self !== 'undefined' ? self : this, function (Data) {
  'use strict';

  var CARDS = Data.CARDS, CARD_BY_ID = Data.CARD_BY_ID;
  var SIGNS = Data.SIGNS, SIGN_BY_ID = Data.SIGN_BY_ID;
  var SUITS = Data.SUITS, SUIT_ORDER = Data.SUIT_ORDER, MOONS = Data.MOONS;

  /* ------------------------------------------------------------------ *
   * Tunable numbers. Change one, then run `npm run simulate` and check
   * the balance targets in IMPLEMENTATION_GUIDE.md still hold.
   * ------------------------------------------------------------------ */
  var CONFIG = {
    EPOCH: '2026-11-14',        // the date of Day 1
    ROUNDS: 3,
    HAND_SIZE: 5,
    REVERSED_CHANCE: 0.3,       // chance each dealt card lands reversed
    CHIPS_PER_READ: 1,          // reading a hand true (its brightest card turned first) wins a chip for the hands ahead
    PASS_PRICE: 1,              // chips paid to pass on a turned card
    MAX_DEAL_ATTEMPTS: 5000,    // reshuffles allowed while looking for a fair deck
    INSIGHT_FIRST_TURN: 2,      // the first card turned in a hand is its brightest: the omens were read true
    INSIGHT_FOUND_LATER: 1,     // the brightest card was found after passing
    BRIGHT_FROM: 4,             // a card is "bright" at Gibbous Moon or better
    BONUS: { attuned: 1, signCard: 2, trine: 2, majors: 2, pair: 1, triple: 3, run: 2 },
    // What a card in the player's own element adds, per suit. All equal: the deal rule makes a
    // perfect reading a Full Moon for every sign, and npm run simulate confirms no element is
    // luckier for anyone else. Change one only if the simulator shows an element falling behind.
    ATTUNED_BY_SUIT: { wands: 1, cups: 1, swords: 1, pentacles: 1 }
  };
  CONFIG.MAX_INSIGHT = CONFIG.ROUNDS * CONFIG.INSIGHT_FIRST_TURN;

  // Reading tiers. `min` is the lowest total brightness that reaches the tier.
  var TIERS = [
    null,
    { level: 1, moon: 'New Moon', title: 'Deep', min: -Infinity,
      lines: [
        'A new-moon day. The cards ask more of you because you can carry it.',
        'The sky is dark, which is when seeds go in.',
        'A deep day. Whatever you get through today, you keep the strength from.',
        'The deck runs deep today. Be patient with it, and with yourself.',
        'A quiet sky. Rest counts as progress today.',
        'The moon is new, and new moons are for beginnings no one else can see yet.',
        'Go gently. The cards are asking for patience, and you have it.'
      ],
      close: [
        'The cards ask a lot today because you have a lot to give. Lean on {gift}, go easy on {ease}, and stay on your own side.',
        'Today is for looking after yourself first. Lean on {gift} and let the small things count.',
        'Give yourself room today. {Gift} is still yours on a dark-moon day, and tomorrow the deck is shuffled fresh.'
      ] },
    { level: 2, moon: 'Crescent Moon', title: 'Gentle', min: 9,
      lines: [
        'A quiet day that rewards a slower pace.',
        'The light is thin, so go by feel and go kindly.',
        'A day for tending what you have, more than for big bets.',
        'Low tide. Good for noticing what the water usually hides.',
        'A soft-spoken day. Listen more than you push.',
        'Small steps and early nights. The moon is only resting.',
        'Keep your plans light today, and your kindness close.'
      ],
      close: [
        'It is a day for a slower pace. Lean on {gift}, go easy on {ease}, and let small wins count.',
        'Keep today simple. {Gift} will carry you further than hurry will.',
        'Take the gentle road today. {Gift} is enough, and so are you.'
      ] },
    { level: 3, moon: 'Half Moon', title: 'Steady', min: 11,
      lines: [
        'A balanced day. What you put in is what comes back.',
        'Half light, half shadow, all of it workable. Steady hands do well today.',
        'An even keel. Small good choices add up by evening.',
        'Nothing forced and nothing blocked. The day goes where you steer it.',
        'A fair day. Give it your attention and it gives back.',
        'The scales sit level today. Your choices tip them.',
        'Ordinary light, and plenty to see by.'
      ],
      close: [
        'The day gives back what you put in. Bring {gift}, and go easy on {ease}.',
        'Today is yours to steer. {Gift} is the right tool for it.',
        'Nothing is in your way today and nothing is pushing you. Let {gift} set the pace.'
      ] },
    { level: 4, moon: 'Gibbous Moon', title: 'Favoured', min: 14,
      lines: [
        'The wind is behind you. Most of what you try today goes your way.',
        'A bright hand. Lean in, and the day leans with you.',
        'The odds tilt your way today, by a wide margin.',
        'Good fortune is in the room. Give it something to do.',
        'Doors open easily today. Walk through a few.',
        'The cards smile on effort today, so make some.',
        'A good day to ask, to start, or to say it out loud.'
      ],
      close: [
        'The day leans your way. Bring {gift} and meet it halfway.',
        'Luck is close by today. Point {gift} at the thing you care about most.',
        'Ask for the thing today. With {gift} behind it, the answer leans yes.'
      ] },
    { level: 5, moon: 'Full Moon', title: 'Blessed', min: 16,
      lines: [
        'A full-moon day. The cards could hardly be kinder.',
        'Everything lines up. Ask for what you want today.',
        'Rare light on the table. Use it boldly.',
        'The deck has dealt you its best. Walk like you know it.',
        'Fortune is wide awake today, and looking your way.',
        'Today the answer is mostly yes.',
        'A day to remember you were lucky, and to pass some of it on.'
      ],
      close: [
        'The cards are firmly with you today. Spend the luck on something that matters, and bring {gift}.',
        'This is the day to try the thing you have been saving. {Gift} and a full moon are a strong pair.',
        'Say yes more than usual today. {Gift} will know what to do with the luck.'
      ] }
  ];

  var POSITIONS = [
    { id: 'past', name: 'Past', blurb: 'what you carry into today',
      leads: ['You came into today carrying {k}.', 'Behind today: {k}.', 'What shaped this morning: {k}.'] },
    { id: 'present', name: 'Present', blurb: 'the heart of today',
      leads: ['At the heart of today: {k}.', 'Right now the day turns on {k}.', 'In front of you: {k}.'] },
    { id: 'future', name: 'Future', blurb: 'where today is heading',
      leads: ['The day is heading toward {k}.', 'By evening, look for {k}.', 'Coming into view: {k}.'] }
  ];

  var INSIGHT_TITLES = ['Wanderer', 'Seeker', 'Apprentice', 'Reader', 'Keen Eye', 'Seer', 'Oracle'];

  // What repeated numbers mean, the way readers use numerology across a spread.
  var NUMBER_MEANING = {
    1: 'Ones are beginnings: something is starting.',
    2: 'Twos are about pairing and choice.',
    3: 'Threes are growth: what was planted is showing.',
    4: 'Fours are stability: a day for foundations.',
    5: 'Fives are change and friction, the kind that moves things forward.',
    6: 'Sixes are harmony and give-and-take.',
    7: 'Sevens are reflection: a pause to check your course.',
    8: 'Eights are movement and mastery: effort turning into skill.',
    9: 'Nines are the last stretch before completion.',
    10: 'Tens are completion: one cycle closing so another can open.',
    11: 'Eleven is the Pages\' number: messages and learning.',
    12: 'Twelve is the Knights\' number: pursuit and motion.',
    13: 'Thirteen is the Queens\' number: inner mastery and care.',
    14: 'Fourteen is the Kings\' number: responsibility and command.'
  };

  /* ------------------------------ random ------------------------------ */

  // String -> 32-bit seed (xmur3), seed -> float generator (mulberry32).
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFrom(key) { return mulberry32(xmur3(String(key))()); }
  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function pick(list, rng) { return list[Math.floor(rng() * list.length)]; }

  /* ------------------------------- dates ------------------------------ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // The player's local calendar date as YYYY-MM-DD. The daily deck rolls over at local midnight.
  function dateStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function utcDay(str) {
    var p = str.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
  }
  // Day 1 is CONFIG.EPOCH.
  function dayNumber(str) { return Math.round(utcDay(str) - utcDay(CONFIG.EPOCH)) + 1; }
  function dailySeed(str, signId) { return str + '|' + signId; }

  /* ------------------------------- cards ------------------------------ */

  // A dealt card is { id, rev }. These helpers read its current face.
  function face(c) { var card = CARD_BY_ID[c.id]; return c.rev ? card.rev : card.up; }
  function auspice(c) { return face(c).a; }
  function cardLabel(c) { return CARD_BY_ID[c.id].name + (c.rev ? ', reversed' : ''); }
  function attunedBonus(suit) { return CONFIG.ATTUNED_BY_SUIT[suit] || CONFIG.BONUS.attuned; }
  function isAttuned(c, signId) {
    var card = CARD_BY_ID[c.id];
    return !!card.suit && card.suit === SIGN_BY_ID[signId].suit;
  }
  function roman(n) {
    if (n === 0) return '0';
    var map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], out = '';
    map.forEach(function (m) { while (n >= m[0]) { out += m[1]; n -= m[0]; } });
    return out;
  }
  // "a, b, c" -> "a, b and c"
  function kwPhrase(k) {
    var parts = k.split(', ');
    if (parts.length < 2) return k;
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function inSentence(card) {
    if (card.arcana === 'minor' || card.id === 'wheel') return 'the ' + card.name;
    return card.name;
  }

  function isBright(c) { return auspice(c) >= CONFIG.BRIGHT_FROM; }

  /* ------------------------------ the table --------------------------- */

  // What a face-down card shows on its back: its suit, or 'major'. Never its brightness.
  // Suits are how a player builds a hand: chase their own element, or three of a kind.
  function aura(c) { return CARD_BY_ID[c.id].suit || 'major'; }

  // The moon board: the five moons a hand holds, brightest first, WITHOUT saying which card is which.
  // It is public from the deal, so every pass is a gamble the player can see the size of.
  // state: 'down' (still face down), 'up' (turned, waiting for keep or pass), 'passed', 'kept'.
  var BOARD_RANK = { kept: 0, up: 1, passed: 2, down: 3 };
  function handBoard(hand, turned, pick, upIndex) {
    turned = turned || [];
    return hand.map(function (c, i) {
      var state = i === pick ? 'kept' : i === upIndex ? 'up' : turned.indexOf(i) !== -1 ? 'passed' : 'down';
      return { a: auspice(c), state: state };
    }).sort(function (x, y) {
      // equal moons are ordered by state only, never by position, so the board cannot leak where a card sits
      return y.a - x.a || BOARD_RANK[x.state] - BOARD_RANK[y.state];
    });
  }

  // What keeping this card would do to the spread built so far.
  // `kept` is the cards already kept, `handsLeft` how many hands are still to come.
  function keepPreview(kept, card, signId, handsLeft) {
    var B = CONFIG.BONUS;
    var before = kept.length ? scoreSpread(kept, signId) : { total: 0, patterns: [] };
    var after = scoreSpread(kept.concat([card]), signId);
    var notes = [];
    after.patterns.forEach(function (p) {
      if (!p.bonus) return;
      var was = before.patterns.filter(function (q) { return q.id === p.id; })[0];
      var gained = p.bonus - (was ? was.bonus : 0);
      if (gained > 0) notes.push({ title: p.title, poker: p.poker, bonus: gained });
    });
    // What a later card could still complete: the reason to keep a quieter card.
    var hopes = [];
    var cards = kept.concat([card]).map(function (c) { return CARD_BY_ID[c.id]; });
    if (handsLeft > 0 && cards.length === 2) {
      var gap = Math.abs(cards[0].n - cards[1].n);
      if (cards[0].suit && cards[0].suit === cards[1].suit) hopes.push('Two ' + SUITS[cards[0].suit].name + ': a third makes a Trine, worth +' + B.trine + '.');
      if (!cards[0].suit && !cards[1].suit) hopes.push('Two Major Arcana: a third makes Fate\u2019s Hand, worth +' + B.majors + '.');
      if (gap === 1 || gap === 2) hopes.push('Close numbers: the right third card makes The Stair, worth +' + B.run + '.');
    }
    return {
      gain: after.total - before.total, total: after.total, tier: tierFor(after.total),
      notes: notes, hopes: hopes, last: handsLeft === 0
    };
  }

  /* -------------------------------- deal ------------------------------ */

  // A hand is fair when it holds something bright to find, something deep to avoid, and
  // exactly ONE brightest card. The omens are about "the brightest card", so it must be unique.
  function handIsFair(hand) {
    var a = hand.map(auspice);
    var max = Math.max.apply(null, a), min = Math.min.apply(null, a);
    return max >= CONFIG.BRIGHT_FROM && min <= 2 && a.filter(function (x) { return x === max; }).length === 1;
  }
  function topIndex(hand) {
    var a = hand.map(auspice);
    return a.indexOf(Math.max.apply(null, a));
  }

  // Shuffle the 78-card deck from the seed and deal three hands of five. No card repeats.
  //
  // A deck is only used if:
  //   1. every hand is fair: one brightest card, Gibbous or better, and a dim card to avoid;
  //   2. the three brightest cards together make this deck's best reading for this sign;
  //   3. that reading is a Full Moon;
  //   4. every hand carries a real puzzle.
  // Rules 2 and 3 are what make Tarotio a game of skill: read all three hands true and you
  // always draw the best reading the deck holds, and it is always a Full Moon. Luck only
  // decides the hands the omens do not solve.
  //
  // The sign is part of the rule because bonuses depend on it. Unfair deals are reshuffled
  // with the next attempt number, so the result is still the same on every device.
  function dealHands(seedKey, signId) {
    if (!SIGN_BY_ID[signId]) throw new Error('dealHands needs a sign: ' + signId);
    var ids = CARDS.map(function (c) { return c.id; });
    var full = TIERS[5].min, fallback = null;
    for (var attempt = 0; attempt < CONFIG.MAX_DEAL_ATTEMPTS; attempt++) {
      var rng = rngFrom('deal|' + seedKey + '|' + attempt);
      var drawn = shuffle(ids, rng).slice(0, CONFIG.ROUNDS * CONFIG.HAND_SIZE).map(function (id) {
        return { id: id, rev: rng() < CONFIG.REVERSED_CHANCE };
      });
      var hands = [];
      for (var r = 0; r < CONFIG.ROUNDS; r++) hands.push(drawn.slice(r * CONFIG.HAND_SIZE, (r + 1) * CONFIG.HAND_SIZE));
      // cheapest checks first
      if (!hands.every(handIsFair)) continue;
      if (!fallback) fallback = hands;
      var perfect = scoreSpread(hands.map(function (h) { return h[topIndex(h)]; }), signId).total;
      if (perfect < full) continue;
      if (deckOdds(hands, signId).best > perfect) continue;
      if (!hands.every(hasPuzzle)) continue;
      return hands;
    }
    // Not reached in practice (fair decks come up about one shuffle in thirty). Kept so a
    // deal can never hang: the last fair deck seen is used instead.
    return fallback || hands;
  }

  // The reading a perfect reader draws: the brightest card of each hand. The deal makes sure
  // this is also the deck's best reading, and a Full Moon.
  function perfectReading(hands, signId) {
    return scoreSpread(hands.map(function (h) { return h[topIndex(h)]; }), signId);
  }

  /* ------------------------------ patterns ---------------------------- */

  // Patterns are how the three kept cards read together: shared suits, repeated
  // numbers, a run, many Major Arcana, and the player's own sign. Each returns
  // { id, title, poker, text, bonus }. `poker` is the card-table nickname.
  function detectPatterns(picks, signId) {
    var sign = SIGN_BY_ID[signId];
    var cards = picks.map(function (p) { return CARD_BY_ID[p.id]; });
    var out = [];
    var B = CONFIG.BONUS;

    // The sign's own Major Arcana card.
    cards.forEach(function (c) {
      if (c.id === sign.card) {
        out.push({ id: 'signCard', title: 'Your card found you', poker: 'the wild card', bonus: B.signCard,
          text: c.name + ' is the card of ' + sign.name + '. When your own card turns up, the day is addressed to you personally.' });
      }
    });

    // Cards in the suit of the sign's element.
    var attuned = cards.filter(function (c) { return c.suit && c.suit === sign.suit; });
    if (attuned.length) {
      var names = attuned.map(function (c) { return c.name; });
      var suitName = SUITS[sign.suit].name;
      var step = attunedBonus(sign.suit);
      var steps = step === 1 ? 'one step' : 'two steps';
      out.push({ id: 'attuned', title: 'Attuned to ' + sign.element, poker: null, bonus: step * attuned.length,
        text: (attuned.length === 1
          ? names[0] + ' is a ' + suitName + ' card, and ' + suitName + ' is the suit of ' + sign.element + ', your element. It shines ' + steps + ' brighter for you.'
          : listAnd(names) + ' are ' + suitName + ' cards, the suit of ' + sign.element + ', your element. Each shines ' + steps + ' brighter for you.') });
    }

    // Major Arcana count.
    var majors = cards.filter(function (c) { return c.arcana === 'major'; }).length;
    if (majors === 3) {
      out.push({ id: 'majors', title: 'Fate’s Hand', poker: 'three of a kind', bonus: B.majors,
        text: 'All three cards are Major Arcana. Readers take that as a day shaped by large forces. Pay attention; today matters.' });
    }

    // Suits.
    var suitCount = {};
    cards.forEach(function (c) { if (c.suit) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; });
    Object.keys(suitCount).forEach(function (s) {
      if (suitCount[s] === 3) {
        out.push({ id: 'trine', title: 'Trine of ' + SUITS[s].name, poker: 'a flush', bonus: B.trine, text: SUITS[s].trine });
      }
    });

    // Repeated numbers.
    var numCount = {};
    cards.forEach(function (c) { numCount[c.n] = (numCount[c.n] || 0) + 1; });
    Object.keys(numCount).forEach(function (n) {
      var meaning = NUMBER_MEANING[n] || 'The same number twice means the message repeats so that you hear it.';
      if (numCount[n] === 3) {
        out.push({ id: 'triple', title: 'Triple ' + n, poker: 'three of a kind', bonus: B.triple,
          text: 'The same number three times is the loudest signal a spread can send. ' + meaning });
      } else if (numCount[n] === 2) {
        out.push({ id: 'pair', title: 'Echo of ' + n + 's', poker: 'a pair', bonus: B.pair,
          text: 'Two cards share the number ' + n + '. ' + meaning });
      }
    });

    // A run of three consecutive numbers.
    var nums = cards.map(function (c) { return c.n; }).sort(function (a, b) { return a - b; });
    if (nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1) {
      out.push({ id: 'run', title: 'The Stair', poker: 'a straight', bonus: B.run,
        text: nums.join(', ') + ': the numbers climb in order. Readers see a run as a story moving forward one step at a time.' });
    }

    // Orientation.
    var reversed = picks.filter(function (p) { return p.rev; }).length;
    if (reversed === 0) {
      out.push({ id: 'upright', title: 'All upright', poker: null, bonus: 0,
        text: 'Every card landed upright, so the day’s energy runs outward and clear.' });
    } else if (reversed === 3) {
      out.push({ id: 'reversed', title: 'All reversed', poker: null, bonus: 0,
        text: 'Every card landed reversed. Today’s work happens on the inside, and it counts just as much.' });
    }
    return out;
  }
  function listAnd(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ------------------------------- scoring ---------------------------- */

  function tierFor(total) {
    for (var t = 5; t >= 1; t--) if (total >= TIERS[t].min) return t;
    return 1;
  }

  // The brightness of a three-card spread: the cards' moons plus pattern bonuses.
  function scoreSpread(picks, signId) {
    var base = 0;
    picks.forEach(function (p) { base += auspice(p); });
    var patterns = detectPatterns(picks, signId);
    var bonus = 0;
    patterns.forEach(function (p) { bonus += p.bonus; });
    var total = base + bonus;
    return { base: base, bonus: bonus, total: total, tier: tierFor(total), patterns: patterns };
  }

  // Every reading today's deck could have produced: one card from each hand, 5 x 5 x 5 = 125.
  // This is what lets the game say, in numbers, how much of a result was the deck.
  function deckOdds(hands, signId) {
    var totals = [], tierCounts = [0, 0, 0, 0, 0, 0];
    hands[0].forEach(function (a) {
      hands[1].forEach(function (b) {
        hands[2].forEach(function (c) {
          var s = scoreSpread([a, b, c], signId);
          totals.push(s.total);
          tierCounts[s.tier]++;
        });
      });
    });
    return {
      count: totals.length, totals: totals, tierCounts: tierCounts,
      best: Math.max.apply(null, totals), worst: Math.min.apply(null, totals)
    };
  }

  // Where one reading stands among all the readings the deck held.
  function standing(odds, total) {
    var below = 0, same = 0;
    odds.totals.forEach(function (t) { if (t < total) below++; else if (t === total) same++; });
    var tier = tierFor(total), atLeast = 0;
    for (var t = tier; t <= 5; t++) atLeast += odds.tierCounts[t];
    return {
      below: below, same: same, count: odds.count,
      pct: Math.round((below / odds.count) * 100),          // "brighter than pct% of possible readings"
      isBest: total >= odds.best, isWorst: total <= odds.worst,
      blindChance: Math.round((atLeast / odds.count) * 100) // chance a blind draw reaches this tier or higher
    };
  }

  /* -------------------------------- omens ----------------------------- */

  // The puzzle. Each hand comes with a few omens: true statements that, taken together,
  // leave exactly one place the brightest card can be. The player can see the position of
  // each card, the suit mark on its back, and the hand's five moons (the board), and has
  // to work out the rest.
  //
  // Omens are built by generate-and-test:
  //   1. list every arrangement of the hand's moons over the five positions,
  //   2. list every true statement from a fixed vocabulary,
  //   3. pick the smallest set of statements that rules out every arrangement whose
  //      brightest card is somewhere else, with no statement to spare.
  // So an omen set is always true, always sufficient and never redundant. There are tests for all three.

  var MOON_NAME = [null, 'New Moon', 'Crescent Moon', 'Half Moon', 'Gibbous Moon', 'Full Moon'];
  var PLACE_NAME = ['the card at the left end', 'the second card', 'the middle card', 'the fourth card', 'the card at the right end'];
  function markName(k) { return k === 'major' ? 'Major Arcana' : SUITS[k].name; }
  function maxAt(a) { return a.indexOf(Math.max.apply(null, a)); }

  // Every distinct way the moons could be laid out.
  function arrangements(moons) {
    var seen = {}, out = [], a = moons.slice();
    (function walk(k) {
      if (k === a.length) {
        var key = a.join('');
        if (!seen[key]) { seen[key] = true; out.push(a.slice()); }
        return;
      }
      for (var i = k; i < a.length; i++) {
        var t = a[k]; a[k] = a[i]; a[i] = t;
        walk(k + 1);
        t = a[k]; a[k] = a[i]; a[i] = t;
      }
    })(0);
    return out;
  }

  // Every true statement about this hand, from the omen vocabulary.
  //   kind 'direct'   = about the brightest card itself: what it is, where it sits, what it sits beside
  //   kind 'indirect' = about other cards; these need to be chained to rule a place out
  // Each omen has: text, focus (card positions it speaks of), moons (board moons it names), test(arrangement).
  function omenPool(marks, moons) {
    var n = moons.length, top = maxAt(moons), out = [];
    var all = [], count = {};
    for (var i = 0; i < n; i++) { all.push(i); count[marks[i]] = (count[marks[i]] || 0) + 1; }
    var kinds = Object.keys(count);
    function where(k) { return all.filter(function (p) { return marks[p] === k; }); }
    function beside(p) { return [p - 1, p + 1].filter(function (q) { return q >= 0 && q < n; }); }
    function direct(text, allowed, focus) {
      if (allowed.indexOf(top) === -1) return;
      out.push({ kind: 'direct', text: text, focus: focus, moons: [], test: function (a) { return allowed.indexOf(maxAt(a)) !== -1; } });
    }
    function indirect(text, focus, named, test) {
      if (test(moons)) out.push({ kind: 'indirect', text: text, focus: focus, moons: named, test: test });
    }

    // what the brightest card is
    kinds.forEach(function (k) {
      if (count[k] >= 2) direct('The brightest card is a ' + markName(k) + ' card.', where(k), where(k));
      direct('The brightest card is not a ' + markName(k) + ' card.', all.filter(function (p) { return marks[p] !== k; }), where(k));
    });
    var alone = all.filter(function (p) { return count[marks[p]] === 1; });
    var paired = all.filter(function (p) { return count[marks[p]] > 1; });
    if (alone.length && paired.length) {
      direct('The brightest card is the only one of its suit in this hand.', alone, alone);
      direct('The brightest card shares its suit with another card here.', paired, paired);
    }
    // where it sits
    direct('The brightest card sits at one end of the row.', [0, n - 1], [0, n - 1]);
    direct('The brightest card is not at either end.', all.slice(1, n - 1), [0, n - 1]);
    direct('The brightest card lies left of the middle.', [0, 1], [0, 1]);
    direct('The brightest card lies right of the middle.', [3, 4], [3, 4]);
    direct('The brightest card is not the middle card.', [0, 1, 3, 4], [2]);
    // what it sits beside
    kinds.forEach(function (k) {
      var near = all.filter(function (p) { return beside(p).some(function (q) { return marks[q] === k; }); });
      direct('The brightest card sits beside a ' + markName(k) + ' card.', near, where(k));
      direct('The brightest card does not sit beside a ' + markName(k) + ' card.', all.filter(function (p) { return near.indexOf(p) === -1; }), where(k));
    });
    direct('The brightest card sits between two cards of the same suit.',
      all.slice(1, n - 1).filter(function (p) { return marks[p - 1] === marks[p + 1]; }), all);
    kinds.forEach(function (k) {
      if (count[k] !== 1) return;
      var q = where(k)[0];
      direct('The brightest card lies somewhere left of the ' + markName(k) + ' card.', all.filter(function (p) { return p < q; }), [q]);
      direct('The brightest card lies somewhere right of the ' + markName(k) + ' card.', all.filter(function (p) { return p > q; }), [q]);
    });

    // statements about the other cards
    function ref(p) {
      var k = marks[p];
      if (count[k] === 1) return 'the ' + markName(k) + ' card';
      if (count[k] === 2) return 'the ' + (where(k)[0] === p ? 'left-hand' : 'right-hand') + ' ' + markName(k) + ' card';
      return PLACE_NAME[p];
    }
    all.forEach(function (p) {
      if (p === top) return;
      all.forEach(function (q) {
        if (p !== q && moons[p] > moons[q]) {
          indirect(cap(ref(p)) + ' outshines ' + ref(q) + '.', [p, q], [], function (a) { return a[p] > a[q]; });
        }
      });
      if (p > 0 && p < n - 1) {
        indirect(cap(ref(p)) + ' is dimmer than both its neighbours.', [p - 1, p, p + 1], [], function (a) { return a[p] < a[p - 1] && a[p] < a[p + 1]; });
      }
    });
    // named moons that appear exactly once on the board
    [1, 2, 3, 4, 5].forEach(function (v) {
      if (v === moons[top] || moons.filter(function (x) { return x === v; }).length !== 1) return;
      var q = moons.indexOf(v), k = marks[q], name = 'The ' + MOON_NAME[v];
      function at(a) { return a.indexOf(v); }
      if (count[k] >= 2) indirect(name + ' is a ' + markName(k) + ' card.', where(k), [v], function (a) { return marks[at(a)] === k; });
      else indirect(name + ' is the ' + markName(k) + ' card.', [q], [v], function (a) { return at(a) === q; });
      indirect(name + ' sits at one end of the row.', [0, n - 1], [v], function (a) { return at(a) === 0 || at(a) === n - 1; });
      indirect(name + ' is not at either end.', [0, n - 1], [v], function (a) { return at(a) > 0 && at(a) < n - 1; });
      indirect(name + ' sits beside the brightest card.', [], [v], function (a) { return Math.abs(at(a) - maxAt(a)) === 1; });
      indirect(name + ' does not sit beside the brightest card.', [], [v], function (a) { return Math.abs(at(a) - maxAt(a)) !== 1; });
      indirect('The brightest card lies somewhere left of the ' + MOON_NAME[v] + '.', [], [v], function (a) { return maxAt(a) < at(a); });
      indirect('The brightest card lies somewhere right of the ' + MOON_NAME[v] + '.', [], [v], function (a) { return maxAt(a) > at(a); });
    });
    return out;
  }

  // How many direct and indirect omens each hand gets, easiest plan first.
  // Tier 1 (Past) is two plain statements. Tier 3 (Future) needs chained reasoning.
  var OMEN_PLANS = {
    1: [[2, 0]],
    2: [[2, 1], [1, 2], [3, 0]],
    3: [[1, 2], [2, 2], [1, 3], [2, 1]]
  };

  // Shapes to try when none of a tier's own plans fits the hand.
  var OMEN_ANY = [[1, 1], [0, 2], [2, 1], [1, 2], [3, 0], [0, 3], [2, 2]];

  // Where the brightest card could be, given a list of omens: the positions not yet ruled out.
  function omenCandidates(hand, omens) {
    var moons = hand.map(auspice), set = {};
    arrangements(moons).forEach(function (a) {
      if (omens.every(function (o) { return o.test(a); })) set[maxAt(a)] = true;
    });
    return Object.keys(set).map(Number).sort();
  }

  // Build the omens for one hand. tier is 1, 2 or 3.
  // Returns { top, omens: [{ text, kind, focus, moons }], steps: [positions left after each omen] }.
  function makeOmens(hand, tier, rng) {
    var marks = hand.map(aura), moons = hand.map(auspice), top = maxAt(moons);
    var list = arrangements(moons), tops = list.map(maxAt);
    var pool = omenPool(marks, moons);
    pool.forEach(function (o) { o.mask = list.map(function (a) { return o.test(a); }); });
    function left(set) {
      var seen = {}, count = 0;
      for (var x = 0; x < list.length; x++) {
        var ok = true;
        for (var c = 0; c < set.length; c++) { if (!set[c].mask[x]) { ok = false; break; } }
        if (ok && !seen[tops[x]]) { seen[tops[x]] = true; count++; }
      }
      return count;
    }
    // sufficient (one place left) and lean (every omen is needed)
    function fits(set) {
      if (left(set) !== 1) return false;
      for (var i = 0; i < set.length; i++) {
        if (left(set.filter(function (o, j) { return j !== i; })) === 1) return false;
      }
      return true;
    }
    // no single omen may give the answer away
    pool = shuffle(pool.filter(function (o) { return left([o]) > 1; }), rng);
    var dir = pool.filter(function (o) { return o.kind === 'direct'; });
    var ind = pool.filter(function (o) { return o.kind === 'indirect'; });

    function choose(items, k, start, acc, visit) {
      if (acc.length === k) return visit(acc);
      for (var i = start; i < items.length; i++) {
        if (choose(items, k, i + 1, acc.concat([items[i]]), visit)) return true;
      }
      return false;
    }
    var found = null, plans = [];
    for (var t = tier; t >= 1; t--) plans = plans.concat(OMEN_PLANS[t]);   // fall back to an easier plan if the hand allows nothing harder
    plans = plans.concat(OMEN_ANY);
    for (var p = 0; p < plans.length && !found; p++) {
      (function (nd, ni) {
        choose(dir, nd, 0, [], function (ds) {
          return choose(ind, ni, 0, [], function (is) {
            var set = ds.concat(is);
            if (fits(set)) { found = set; return true; }
            return false;
          });
        });
      })(plans[p][0], plans[p][1]);
    }
    if (!found) {
      // Last resort, for a hand whose marks give nothing to reason from: say it plainly.
      found = [{ kind: 'direct', text: 'The brightest card is ' + PLACE_NAME[top] + '.', focus: [top], moons: [],
        test: function (a) { return maxAt(a) === top; } }];
    }
    var steps = found.map(function (o, i) { return omenCandidates(hand, found.slice(0, i + 1)); });
    return {
      top: top, steps: steps,
      omens: found.map(function (o) { return { text: o.text, kind: o.kind, focus: o.focus, moons: o.moons, test: o.test }; })
    };
  }

  // A hand is only dealt if it can carry a real puzzle: two omens or more, none of them a giveaway.
  function hasPuzzle(hand) { return makeOmens(hand, 1, rngFrom('probe')).omens.length > 1; }

  // The omens for all three hands of a game: plain for the Past, knotty for the Future.
  // Everyone with the same sign on the same day gets the same omens.
  function omensFor(game, hands) {
    hands = hands || dealHands(game.seedKey, game.sign);
    return hands.map(function (hand, i) {
      return makeOmens(hand, Math.min(3, i + 1), rngFrom('omens|' + game.seedKey + '|' + i));
    });
  }

  // Insight for one hand: did the player find the brightest card, and how soon?
  function handInsight(round, hand) {
    var at = round.turned.indexOf(topIndex(hand));
    return at === 0 ? CONFIG.INSIGHT_FIRST_TURN : at > 0 ? CONFIG.INSIGHT_FOUND_LATER : 0;
  }

  // Chips won by reading hands true: one for each hand whose brightest card was turned first,
  // except the last hand, where there is nothing left to spend it on. Counts finished hands only.
  function chipsWon(rounds, hands) {
    var won = 0;
    for (var i = 0; i < CONFIG.ROUNDS - 1; i++) {
      var r = rounds[i];
      if (r && r.pick !== null && r.pick !== undefined && r.turned[0] === topIndex(hands[i])) won += CONFIG.CHIPS_PER_READ;
    }
    return won;
  }

  // Chance that a player turning cards blind finds the brightest card first in at least k of the hands.
  function blindFirstTurnChance(k) {
    var p = 1 / CONFIG.HAND_SIZE, n = CONFIG.ROUNDS, total = 0;
    function comb(a, b) { var r = 1; for (var i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; }
    for (var i = k; i <= n; i++) total += comb(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
    return total;
  }

  /* ------------------------------- reading ---------------------------- */

  // How a card came to be kept. This is the heart of telling luck from skill.
  //   first = kept on the first turn, by choice (a chip was in hand to pass with)
  //   fate  = kept on the first turn because there was no chip to pass with
  //   dug   = found after passing at least once, and kept by choice
  //   last  = kept after passing at least once, when the chips or the cards ran out
  function howKept(round) {
    var passes = round.turned.length - 1;
    if (passes <= 0) return round.forced ? 'fate' : 'first';
    return round.forced ? 'last' : 'dug';
  }

  // Sum the three card numbers and reduce to 1-22; 22 is The Fool.
  function quintessence(picks) {
    var nums = picks.map(function (p) { return CARD_BY_ID[p.id].n; });
    var sum = nums[0] + nums[1] + nums[2];
    var reduced = sum;
    while (reduced > 22) {
      reduced = String(reduced).split('').reduce(function (s, d) { return s + Number(d); }, 0);
    }
    var majors = CARDS.filter(function (c) { return c.arcana === 'major'; });
    var card = reduced === 22 || reduced === 0 ? majors[0] : majors[reduced];
    return {
      nums: nums, sum: sum, reduced: reduced, card: card,
      text: nums.join(' + ') + ' = ' + sum + (reduced !== sum ? ', which reduces to ' + reduced : '') +
        '. That points to ' + card.name + ', the quintessence of this reading. Under everything else, today is about ' + kwPhrase(card.up.k) + '.'
    };
  }

  // Plain statement of how much was the player and how much was the deck.
  // First key: insight band (how well the omens were read). Second key: fortune band.
  // A perfect reading always gives a Full Moon, so the text can say plainly what decided the rest.
  var VERDICTS = {
    high: {
      high: ['You read the omens true and the cards answered. This fortune is earned.',
        'Clear sight, and the light was where you looked. The Full Moon is yours by reading, not by chance.'],
      mid: ['You read most of the omens true. One hand kept its secret, and that is the distance between this and a Full Moon.',
        'Sharp reading, with one hand left to chance. Chance was fair to you today.'],
      low: ['You read most of it true, and the one hand that got away held the light. It is yours to find tomorrow.',
        'Your reading was sharp where it landed. The hand that stayed tangled was the one that mattered most today.']
    },
    mid: {
      high: ['Part reading, part fortune. You found some of the light and the deck handed you the rest.',
        'You untangled part of it, and luck filled in the rest. That is allowed.'],
      mid: ['Some omens read, some chance. An honest day at the table.',
        'You and the deck met in the middle today.'],
      low: ['You read part of the omens. The rest stayed tangled, and the cards were quiet with them.',
        'Part reading, part chance, and chance was quiet. Each omen you untangle is light you keep.']
    },
    low: {
      high: ['Today was luck, plain and simple. The omens kept their secrets and the deck lit up anyway. Fortune like this is given, never earned, so enjoy it.',
        'The omens got the better of you and the cards did not mind at all. This one is pure fortune, and it is yours.'],
      mid: ['Mostly by feel, and the deck met you halfway. Each omen you read true brings the Full Moon closer.',
        'The omens stayed tangled and chance was kind enough. Tomorrow\u2019s deck has a Full Moon in it too.'],
      low: ['Knotty omens on a quiet day. Every deck holds a Full Moon for the one who reads it, and tomorrow\u2019s is waiting.',
        'The omens kept their meaning today. That is one day. The shuffle is new tomorrow, and you know more than you did this morning.']
    }
  };
  function band3(value, lowMax, highMin) { return value <= lowMax ? 'low' : value >= highMin ? 'high' : 'mid'; }

  // Build everything the result screen shows. `game` is the saved state from app.js:
  // { mode, date, sign, seedKey, rounds: [{ turned: [cardIndex, in the order turned], pick, forced }] }
  function summarize(game, hands) {
    hands = hands || dealHands(game.seedKey, game.sign);
    var sign = SIGN_BY_ID[game.sign];
    var picks = game.rounds.map(function (r, i) { return hands[i][r.pick]; });
    var firsts = game.rounds.map(function (r, i) { return hands[i][r.turned[0]]; });
    var how = game.rounds.map(howKept);
    var points = game.rounds.map(function (r, i) { return handInsight(r, hands[i]); });
    var insight = points.reduce(function (s, x) { return s + x; }, 0);
    var passes = game.rounds.reduce(function (s, r) { return s + r.turned.length - 1; }, 0);
    var puzzles = omensFor(game, hands);
    var chipsIn = chipsWon(game.rounds, hands);
    var score = scoreSpread(picks, game.sign);
    // What the reading would have been with no passes at all: the first card turned in each hand.
    // The gap between this and the real score is what the player's chips did.
    var firstScore = scoreSpread(firsts, game.sign);
    var odds = deckOdds(hands, game.sign);
    var stand = standing(odds, score.total);
    var tier = TIERS[score.tier];
    var rng = rngFrom('read|' + game.seedKey + '|' + picks.map(function (p) { return p.id + (p.rev ? 'r' : 'u'); }).join(','));

    var positions = picks.map(function (p, i) {
      var f = face(p), hand = hands[i], r = game.rounds[i];
      var brighter = hand.filter(function (c) { return auspice(c) > f.a; }).length;
      var best = hand.slice().sort(function (a, b) { return auspice(b) - auspice(a); })[0];
      return {
        position: POSITIONS[i].name, blurb: POSITIONS[i].blurb,
        card: p, name: CARD_BY_ID[p.id].name, reversed: p.rev, label: cardLabel(p),
        auspice: f.a, keywords: f.k, attuned: isAttuned(p, game.sign),
        lead: pick(POSITIONS[i].leads, rng).replace('{k}', kwPhrase(f.k)),
        text: f.t, how: how[i], passes: r.turned.length - 1, forced: !!r.forced,
        // every card turned in this hand, in order; the last one is the card kept
        path: r.turned.map(function (j) { return { card: hand[j], auspice: auspice(hand[j]), kept: j === r.pick }; }),
        bright: isBright(p),
        rankInHand: brighter + 1, bestInHand: best, wasBrightest: brighter === 0,
        // the puzzle: where the brightest card was, whether it was found, and how the omens narrowed it down
        top: puzzles[i].top, insight: points[i],
        foundFirst: r.turned[0] === puzzles[i].top, found: r.turned.indexOf(puzzles[i].top) !== -1,
        omens: puzzles[i].omens.map(function (o, k) { return { text: o.text, left: puzzles[i].steps[k] }; })
      };
    });

    // Which element leads the spread. Left empty when a pattern already says it (a trine, or three Majors).
    var suitCount = {}, majors = 0, lead = null, trine = false;
    picks.forEach(function (p) {
      var c = CARD_BY_ID[p.id];
      if (c.suit) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; else majors++;
    });
    Object.keys(suitCount).forEach(function (su) {
      if (suitCount[su] === 3) trine = true;
      else if (suitCount[su] === 2) lead = su;
    });
    var blend = trine || majors === 3 ? null
      : lead ? SUITS[lead].lead
      : majors === 2 ? 'Two Major Arcana lead the spread, so today is about the big themes more than the to-do list.'
      : 'The spread is mixed: some heart, some head, some will, some ground. Today asks for all of you.';

    // The day in one line, from the first keyword of each card. Unique to this spread.
    var first = function (p) { return p.keywords.split(', ')[0]; };
    var arc = 'From ' + first(positions[0]) + ', through ' + first(positions[1]) + ', toward ' + first(positions[2]) + '.';

    var closeLine = pick(tier.close, rng).replace('{gift}', sign.gift).replace('{Gift}', cap(sign.gift)).replace('{ease}', sign.ease);
    var verdict = pick(VERDICTS[band3(insight, 2, 4)][band3(score.tier, 2, 4)], rng);

    // The plainest measure of what the player did: first turns alone versus the reading they ended with.
    var lift = score.total - firstScore.total;
    var liftLine = passes === 0
      ? 'You never passed, so this reading is exactly what the deck turned up first. All of it was the deal.'
      : lift > 0 ? 'Your first turns alone made ' + firstScore.total + ' moons, a ' + TIERS[firstScore.tier].moon + '. Your passes lifted that to ' + score.total + '.'
      : lift === 0 ? 'Your passes changed the cards and the total came out the same as your first turns: ' + score.total + ' moons.'
      : 'Your first turns alone would have made ' + firstScore.total + ' moons. The chase cost ' + (-lift) + ' this time. That is the price of nerve, and on other days it pays.';
    // How often would blind turning have done as well? This is the honest line between reading and luck.
    var firstFinds = positions.filter(function (p) { return p.foundFirst; }).length;
    var chance = blindFirstTurnChance(firstFinds);
    var oneIn = Math.round(1 / chance);
    var readLine = firstFinds === 3 ? 'You turned the brightest card first in all three hands. Turning blind does that about once in ' + oneIn + ' games, so this was reading.'
      : firstFinds === 2 ? 'You turned the brightest card first in two hands of three. Turning blind manages that about one game in ' + oneIn + '.'
      : firstFinds === 1 ? 'You turned the brightest card first in one hand. Turning blind does at least that about every other game, so the omens and fate may share the credit.'
      : 'None of your first turns was the brightest card today. The omens were knotty, and each one you untangle makes the next easier.';
    // What the deck could have given at best: the luck of the deal, which no reading can change.
    var ceiling = { total: odds.best, tier: tierFor(odds.best) };
    var perfectRead = firstFinds === CONFIG.ROUNDS;
    var ceilingLine = perfectRead
      ? 'You read all three hands true, so you drew the best reading this deck held: ' + odds.best + ' moons. That is skill, and it will work on any day\u2019s deck.'
      : score.total >= odds.best
      ? 'You reached this deck\u2019s best reading, ' + odds.best + ' moons, even with a hand left to chance. Fortune helped.'
      : 'This deck\u2019s best reading was ' + odds.best + ' moons: its three brightest cards, the ones the omens point to. Every deck is dealt so that reading all three hands true gives a Full Moon.';

    return {
      mode: game.mode, date: game.date, dayNo: dayNumber(game.date), sign: sign,
      picks: picks, positions: positions, how: how,
      insight: insight, insightTitle: INSIGHT_TITLES[insight],
      chipsIn: chipsIn, passes: passes, chipsLeft: chipsIn - passes * CONFIG.PASS_PRICE,
      score: score, firstScore: firstScore, lift: lift, tier: tier, odds: odds, standing: stand,
      headline: pick(tier.lines, rng),
      arc: arc,
      blend: blend,
      quintessence: quintessence(picks),
      closing: pick(sign.opens, rng) + ' ' + closeLine,
      verdict: verdict, liftLine: liftLine, readLine: readLine, firstFinds: firstFinds, blindChance: chance,
      ceiling: ceiling, ceilingLine: ceilingLine
    };
  }

  // Spoiler-free result for sharing: moons only, never card names
  // (everyone with the same sign is dealt the same deck).
  // One row per hand: every card turned, in order. The last moon in a row is the card kept.
  function shareText(sum, url) {
    var lines = [];
    lines.push((sum.mode === 'daily' ? 'Tarotio #' + sum.dayNo : 'Tarotio practice') + ' · ' + sum.sign.glyph + '︎ ' + sum.sign.name);
    lines.push(MOONS[sum.score.tier].emoji + ' ' + sum.tier.moon + ', ' + sum.tier.title);
    sum.positions.forEach(function (p) {
      lines.push(p.path.map(function (t) { return MOONS[t.auspice].emoji; }).join(''));
    });
    var stars = '';
    for (var i = 0; i < CONFIG.MAX_INSIGHT; i++) stars += i < sum.insight ? '✦' : '✧';
    lines.push('Insight ' + stars + ' ' + sum.insight + '/' + CONFIG.MAX_INSIGHT);
    lines.push(sum.standing.isBest ? 'The brightest reading in the deck' : 'Brighter than ' + sum.standing.pct + '% of the deck');
    lines.push('Each row is a hand. Last moon = the card kept.');
    if (url) lines.push(url);
    return lines.join('\n');
  }

  return {
    CONFIG: CONFIG, TIERS: TIERS, POSITIONS: POSITIONS, INSIGHT_TITLES: INSIGHT_TITLES,
    rngFrom: rngFrom, shuffle: shuffle, pick: pick,
    dateStr: dateStr, dayNumber: dayNumber, dailySeed: dailySeed,
    face: face, auspice: auspice, cardLabel: cardLabel, isAttuned: isAttuned, isBright: isBright,
    aura: aura, handBoard: handBoard, keepPreview: keepPreview, attunedBonus: attunedBonus,
    roman: roman, kwPhrase: kwPhrase, cap: cap,
    dealHands: dealHands, handIsFair: handIsFair, topIndex: topIndex, perfectReading: perfectReading, chipsWon: chipsWon,
    detectPatterns: detectPatterns, scoreSpread: scoreSpread, tierFor: tierFor,
    deckOdds: deckOdds, standing: standing,
    omensFor: omensFor, makeOmens: makeOmens, omenPool: omenPool, omenCandidates: omenCandidates, arrangements: arrangements,
    handInsight: handInsight, blindFirstTurnChance: blindFirstTurnChance,
    howKept: howKept, quintessence: quintessence, summarize: summarize, shareText: shareText
  };
});
