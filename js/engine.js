/*
 * Tarotio engine: every rule of the game, with no DOM and no storage.
 *
 * Everything here is deterministic. Given the same seed key, the same deal,
 * questions and reading text come out, on any device. The UI (app.js) only
 * records what the player did and asks this file what it means.
 *
 * Works as a browser global (window.TarotioEngine) and as a Node module.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'), require('./trivia.js'));
  } else {
    root.TarotioEngine = factory(root.TarotioCards, root.TarotioTrivia);
  }
})(typeof self !== 'undefined' ? self : this, function (Data, Trivia) {
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
    GLIMPSES_FIRST_TRY: 2,      // answer right first time
    GLIMPSES_SECOND_TRY: 1,     // answer right on the second try
    MAX_TRIES: 2,
    BRIGHT_FROM: 4,             // a card is "bright" at Gibbous Moon or better; the tell counts these
    BONUS: { attuned: 1, signCard: 2, trine: 2, majors: 2, pair: 1, triple: 3, run: 2 }
  };
  CONFIG.MAX_INSIGHT = CONFIG.ROUNDS * CONFIG.GLIMPSES_FIRST_TRY;

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
    { level: 2, moon: 'Crescent Moon', title: 'Gentle', min: 8,
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
    { level: 3, moon: 'Half Moon', title: 'Steady', min: 10,
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
    { level: 4, moon: 'Gibbous Moon', title: 'Favoured', min: 13,
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
    { level: 5, moon: 'Full Moon', title: 'Blessed', min: 15,
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
  function isAttuned(c, signId) {
    var card = CARD_BY_ID[c.id];
    return !!card.suit && card.suit === SIGN_BY_ID[signId].suit;
  }
  // A card's worth to this player when choosing: its moons plus the attunement step.
  function worth(c, signId) {
    var sign = SIGN_BY_ID[signId];
    return auspice(c) + (isAttuned(c, signId) ? CONFIG.BONUS.attuned : 0) + (c.id === sign.card ? CONFIG.BONUS.signCard : 0);
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

  // The tell: how many bright cards a hand holds, and how many of those are still face down.
  // It is public from the moment the hand is dealt. It never says which cards they are,
  // so it gives every player their odds and gives a player with glimpses something to reason from.
  function handTell(hand, seen) {
    seen = seen || [];
    var bright = hand.filter(isBright).length;
    var seenBright = seen.filter(function (i) { return isBright(hand[i]); }).length;
    return { size: hand.length, bright: bright, unseen: hand.length - seen.length, unseenBright: bright - seenBright };
  }

  /* -------------------------------- deal ------------------------------ */

  // A hand is fair when it holds something bright to find and something deep to avoid,
  // so every choice matters.
  function handIsFair(hand) {
    var a = hand.map(auspice);
    return Math.max.apply(null, a) >= 4 && Math.min.apply(null, a) <= 2;
  }

  // Shuffle the 78-card deck from the seed and deal three hands of five.
  // No card repeats across the three hands. Unfair deals are re-shuffled, still deterministically.
  function dealHands(seedKey) {
    var ids = CARDS.map(function (c) { return c.id; });
    var hands = null;
    for (var attempt = 0; attempt < 60; attempt++) {
      var rng = rngFrom('deal|' + seedKey + '|' + attempt);
      var drawn = shuffle(ids, rng).slice(0, CONFIG.ROUNDS * CONFIG.HAND_SIZE).map(function (id) {
        return { id: id, rev: rng() < CONFIG.REVERSED_CHANCE };
      });
      hands = [];
      for (var r = 0; r < CONFIG.ROUNDS; r++) hands.push(drawn.slice(r * CONFIG.HAND_SIZE, (r + 1) * CONFIG.HAND_SIZE));
      if (hands.every(handIsFair)) break;
    }
    return hands;
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
      out.push({ id: 'attuned', title: 'Attuned to ' + sign.element, poker: null, bonus: B.attuned * attuned.length,
        text: (attuned.length === 1
          ? names[0] + ' is a ' + suitName + ' card, and ' + suitName + ' is the suit of ' + sign.element + ', your element. It shines one step brighter for you.'
          : listAnd(names) + ' are ' + suitName + ' cards, the suit of ' + sign.element + ', your element. Each shines one step brighter for you.') });
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

  /* ------------------------------ questions --------------------------- */

  var STOP = { that: 1, with: 1, than: 1, from: 1, your: 1, still: 1, more: 1, much: 1, left: 1, held: 1, into: 1, what: 1, look: 1 };
  function kwWords(k) {
    return k.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3 && !STOP[w]; });
  }
  function overlaps(k1, k2) {
    var a = kwWords(k1), b = kwWords(k2);
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) return true;
    return false;
  }

  // Question specs, grouped by difficulty tier (1 easy, 2 medium, 3 hard).
  // Lore comes from trivia.js; the rest are generated from the card and sign data,
  // so the questions teach the same meanings the readings use.
  var POOLS = (function () {
    var pools = { 1: [], 2: [], 3: [] };
    Trivia.LORE.forEach(function (row, i) { pools[row.t].push({ kind: 'lore', i: i }); });
    SIGNS.forEach(function (s) {
      pools[1].push({ kind: 'signElement', sign: s.id });
      pools[2].push({ kind: 'signCard', sign: s.id });
    });
    CARDS.forEach(function (c) {
      if (c.arcana === 'major') {
        pools[1].push({ kind: 'whichCard', card: c.id });
        pools[2].push({ kind: 'upright', card: c.id });
        pools[3].push({ kind: 'number', card: c.id });
      } else {
        pools[2].push({ kind: 'whichCard', card: c.id });
        pools[3].push({ kind: 'upright', card: c.id });
      }
      pools[3].push({ kind: 'reversed', card: c.id });
    });
    return pools;
  })();

  // Wrong options. For a Minor Arcana card they come from the other suits, so a player
  // who knows what the four suits stand for can reason the answer out without memorising cards.
  function distractorCards(target, rng) {
    if (target.arcana === 'minor') {
      return SUIT_ORDER.filter(function (su) { return su !== target.suit; }).map(function (su) {
        return pick(CARDS.filter(function (c) {
          return c.suit === su && c.n !== target.n && !overlaps(c.up.k, target.up.k);
        }), rng);
      });
    }
    var pool = CARDS.filter(function (c) {
      return c.id !== target.id && c.arcana === 'major' && !overlaps(c.up.k, target.up.k);
    });
    return shuffle(pool, rng).slice(0, 3);
  }
  // `own` is the same card's other orientation: the deliberate near miss.
  function distractorKeywords(target, correct, own, rng) {
    var out = [own], usedSuit = {};
    var pool = shuffle(CARDS.filter(function (c) {
      if (c.id === target.id) return false;
      return target.arcana === 'minor' ? (c.suit && c.suit !== target.suit) : c.arcana === 'major';
    }), rng);
    for (var i = 0; i < pool.length && out.length < 3; i++) {
      var c = pool[i];
      if (c.suit && usedSuit[c.suit]) continue;
      var k = rng() < 0.5 ? c.up.k : c.rev.k;
      var clash = overlaps(k, correct) || out.some(function (o) { return o === k || overlaps(o, k); });
      if (clash) continue;
      out.push(k);
      if (c.suit) usedSuit[c.suit] = true;
    }
    return out;
  }
  function finish(q, correct, wrong, why, rng) {
    var options = shuffle([correct].concat(wrong), rng);
    return { q: q, options: options, answer: options.indexOf(correct), why: why };
  }

  // Turn a spec into a real question: { q, options[4], answer (index), why }.
  function materialize(spec, rng) {
    var card, sign, row;
    switch (spec.kind) {
      case 'lore':
        row = Trivia.LORE[spec.i];
        return finish(row.q, row.a[0], row.a.slice(1), row.x, rng);
      case 'signElement':
        sign = SIGN_BY_ID[spec.sign];
        return finish(sign.name + ' belongs to which element?', sign.element,
          ['Fire', 'Earth', 'Air', 'Water'].filter(function (e) { return e !== sign.element; }),
          sign.name + ' is a ' + sign.modality.toLowerCase() + ' ' + sign.element.toLowerCase() + ' sign, so its suit is ' + SUITS[sign.suit].name + '.', rng);
      case 'signCard':
        sign = SIGN_BY_ID[spec.sign];
        card = CARD_BY_ID[sign.card];
        return finish('Which Major Arcana card belongs to ' + sign.name + '?', card.name,
          shuffle(SIGNS.filter(function (s) { return s.id !== sign.id; }), rng).slice(0, 3).map(function (s) { return CARD_BY_ID[s.card].name; }),
          card.name + ' is the card of ' + sign.name + '. It speaks of ' + kwPhrase(card.up.k) + '.', rng);
      case 'whichCard':
        card = CARD_BY_ID[spec.card];
        return finish('Which card, upright, speaks of ' + kwPhrase(card.up.k) + '?', card.name,
          distractorCards(card, rng).map(function (c) { return c.name; }),
          cap(inSentence(card)) + ', upright: ' + card.up.k + '.', rng);
      case 'upright':
        card = CARD_BY_ID[spec.card];
        return finish('Upright, ' + inSentence(card) + ' most often speaks of…', cap(card.up.k),
          distractorKeywords(card, card.up.k, card.rev.k, rng).map(cap),
          cap(inSentence(card)) + ' upright: ' + card.up.k + '. Reversed, it turns to ' + card.rev.k + '.', rng);
      case 'reversed':
        card = CARD_BY_ID[spec.card];
        return finish('Reversed, ' + inSentence(card) + ' most often speaks of…', cap(card.rev.k),
          distractorKeywords(card, card.rev.k, card.up.k, rng).map(cap),
          cap(inSentence(card)) + ' reversed: ' + card.rev.k + '. Upright, it reads ' + card.up.k + '.', rng);
      case 'number':
        card = CARD_BY_ID[spec.card];
        var near = [];
        for (var d = -3; d <= 3; d++) if (d !== 0 && card.n + d >= 0 && card.n + d <= 21) near.push(String(card.n + d));
        return finish('What number does ' + inSentence(card) + ' carry in the Major Arcana?', String(card.n),
          shuffle(near, rng).slice(0, 3),
          cap(inSentence(card)) + ' is card ' + card.n + (card.n ? ' (' + roman(card.n) + ')' : '') + '.', rng);
    }
    throw new Error('Unknown question kind: ' + spec.kind);
  }

  // The three questions for a game, one per tier: easy for the Past, hard for the Future.
  // Daily games walk through each pool in a shuffled order, so a question cannot repeat
  // until its whole pool has been asked. Everyone gets the same questions on the same day.
  function questionsFor(game) {
    var out = [];
    for (var tier = 1; tier <= CONFIG.ROUNDS; tier++) {
      var pool = POOLS[tier], spec;
      if (game.mode === 'daily') {
        var d = dayNumber(game.date) - 1;
        var cycle = Math.floor(d / pool.length);
        var pos = ((d % pool.length) + pool.length) % pool.length;
        spec = shuffle(pool, rngFrom('pool|' + tier + '|' + cycle))[pos];
        out.push(materialize(spec, rngFrom('q|' + game.date + '|' + tier)));
      } else {
        var rng = rngFrom('pq|' + game.seedKey + '|' + tier);
        spec = pick(pool, rng);
        out.push(materialize(spec, rng));
      }
    }
    return out;
  }

  function glimpsesFor(tryNumber) {
    if (tryNumber === 1) return CONFIG.GLIMPSES_FIRST_TRY;
    if (tryNumber === 2) return CONFIG.GLIMPSES_SECOND_TRY;
    return 0;
  }

  /* ------------------------------- reading ---------------------------- */

  // How a card was chosen. This is the heart of telling luck from skill.
  //   sight  = the player had turned it face up before keeping it
  //   gamble = the player had seen other cards and kept an unseen one anyway
  //   fate   = the player had no glimpses and chose blind
  function howChosen(round) {
    if (round.seen.indexOf(round.pick) !== -1) return 'sight';
    return round.seen.length ? 'gamble' : 'fate';
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
  var VERDICTS = {
    high: {
      high: ['You read the table well and the deck was generous. Skill opened the door, and luck walked through it with you.',
        'Sharp eyes, kind cards. You earned your glimpses and the deck paid them back with interest.'],
      mid: ['You played it well. The deck dealt an even hand, and your eye made the most of it.',
        'Good reading, fair cards. Your insight is why this landed steady.'],
      low: ['You did your part beautifully and the deck simply ran deep today. That is the shuffle, and no reflection on you.',
        'Your insight was sharp. The bright cards were where nobody could reach them. Some days the deck keeps its own counsel.']
    },
    mid: {
      high: ['A fair share of insight and a generous deck. Luck did some of the lifting today, and that is allowed.',
        'You saw some of it coming, and fortune filled in the rest.'],
      mid: ['Some sight, some chance, a steady result. An honest day at the table.',
        'You and the deck met in the middle today.'],
      low: ['You gave yourself a fair look at the cards and the deck stayed quiet. Quiet decks happen to every reader.',
        'The glimpses you earned showed a deep deck. Seeing it clearly is a skill too.']
    },
    low: {
      high: ['Today was luck, plain and simple. You chose mostly blind and the deck handed you its best anyway. Fortune like this is given, never earned, so enjoy it.',
        'The questions got the better of you and the cards did not mind at all. This one is pure fortune, and it is yours.'],
      mid: ['You went mostly by feel and the deck met you kindly. Every answer you learned today buys a clearer look tomorrow.',
        'Mostly blind, and still a steady hand. The deck was on your side more than the questions were.'],
      low: ['Tricky questions and a deep deck is the hard combination, and you finished the reading anyway. Every answer you saw today is a glimpse you will earn next time.',
        'The deck kept its bright cards hidden and the questions kept their answers. That is one day. The shuffle is new tomorrow, and you know more than you did this morning.']
    }
  };
  function band3(value, lowMax, highMin) { return value <= lowMax ? 'low' : value >= highMin ? 'high' : 'mid'; }

  // Build everything the result screen shows. `game` is the saved state from app.js:
  // { mode, date, sign, seedKey, rounds: [{ glimpses, seen: [i], pick: i }] }
  function summarize(game, hands) {
    hands = hands || dealHands(game.seedKey);
    var sign = SIGN_BY_ID[game.sign];
    var picks = game.rounds.map(function (r, i) { return hands[i][r.pick]; });
    var how = game.rounds.map(howChosen);
    var insight = game.rounds.reduce(function (s, r) { return s + r.glimpses; }, 0);
    var score = scoreSpread(picks, game.sign);
    var odds = deckOdds(hands, game.sign);
    var stand = standing(odds, score.total);
    var tier = TIERS[score.tier];
    var rng = rngFrom('read|' + game.seedKey + '|' + picks.map(function (p) { return p.id + (p.rev ? 'r' : 'u'); }).join(','));

    var positions = picks.map(function (p, i) {
      var f = face(p), hand = hands[i];
      var brighter = hand.filter(function (c) { return auspice(c) > f.a; }).length;
      var best = hand.slice().sort(function (a, b) { return auspice(b) - auspice(a); })[0];
      return {
        position: POSITIONS[i].name, blurb: POSITIONS[i].blurb,
        card: p, name: CARD_BY_ID[p.id].name, reversed: p.rev, label: cardLabel(p),
        auspice: f.a, keywords: f.k, attuned: isAttuned(p, game.sign),
        lead: pick(POSITIONS[i].leads, rng).replace('{k}', kwPhrase(f.k)),
        text: f.t, how: how[i],
        // for a card kept unseen: how many of the face-down cards were bright when it was chosen
        odds: how[i] === 'sight' ? null : (function (t) { return { bright: t.unseenBright, of: t.unseen }; })(handTell(hand, game.rounds[i].seen)),
        bright: isBright(p),
        rankInHand: brighter + 1, bestInHand: best, wasBrightest: brighter === 0
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
    var sightCount = how.filter(function (h) { return h === 'sight'; }).length;
    var gambles = how.filter(function (h) { return h === 'gamble'; }).length;

    // Skill band for the verdict. Earning glimpses and then passing on them twice is trusting the deck, so it reads as luck.
    var skillBand = band3(insight, 2, 4);
    if (skillBand === 'high' && gambles >= 2) skillBand = 'mid';
    var verdict = pick(VERDICTS[skillBand][band3(score.tier, 2, 4)], rng);

    // What fate did with the cards the player could not see.
    var unseen = positions.filter(function (p) { return p.how !== 'sight'; });
    var hits = unseen.filter(function (p) { return p.bright; }).length;
    var luckLine = !unseen.length ? 'You chose all three cards by sight. The luck today was in what the deal put within reach.'
      : hits === unseen.length ? (unseen.length === 1 ? 'Your one unseen pick came up bright: fate was kind.' : 'All ' + unseen.length + ' of your unseen picks came up bright: fate was very kind.')
      : hits === 0 ? (unseen.length === 1 ? 'Your one unseen pick came up quiet this time.' : 'Your ' + unseen.length + ' unseen picks came up quiet this time. That is the shuffle.')
      : hits + ' of your ' + unseen.length + ' unseen picks came up bright.';

    return {
      mode: game.mode, date: game.date, dayNo: dayNumber(game.date), sign: sign,
      picks: picks, positions: positions, how: how,
      insight: insight, insightTitle: INSIGHT_TITLES[insight], sightCount: sightCount,
      score: score, tier: tier, odds: odds, standing: stand,
      headline: pick(tier.lines, rng),
      arc: arc,
      blend: blend,
      quintessence: quintessence(picks),
      closing: pick(sign.opens, rng) + ' ' + closeLine,
      verdict: verdict, luckLine: luckLine, unseenPicks: unseen.length, unseenHits: hits
    };
  }

  // Spoiler-free result for sharing: emoji only, never card names
  // (everyone with the same sign is dealt the same deck).
  function shareText(sum, url) {
    var eye = { sight: '👁️', gamble: '🎲', fate: '🎲' };
    var lines = [];
    lines.push((sum.mode === 'daily' ? 'Tarotio #' + sum.dayNo : 'Tarotio practice') + ' · ' + sum.sign.glyph + '︎ ' + sum.sign.name);
    lines.push(MOONS[sum.score.tier].emoji + ' ' + sum.tier.moon + ', ' + sum.tier.title);
    lines.push(sum.positions.map(function (p) { return eye[p.how] + MOONS[p.auspice].emoji; }).join('  '));
    var stars = '';
    for (var i = 0; i < CONFIG.MAX_INSIGHT; i++) stars += i < sum.insight ? '✦' : '✧';
    lines.push('Insight ' + stars + ' ' + sum.insight + '/' + CONFIG.MAX_INSIGHT);
    lines.push(sum.standing.isBest ? 'The brightest reading in the deck' : 'Brighter than ' + sum.standing.pct + '% of the deck');
    lines.push('👁️ by sight · 🎲 by fate');
    if (url) lines.push(url);
    return lines.join('\n');
  }

  return {
    CONFIG: CONFIG, TIERS: TIERS, POSITIONS: POSITIONS, INSIGHT_TITLES: INSIGHT_TITLES, POOLS: POOLS,
    rngFrom: rngFrom, shuffle: shuffle, pick: pick,
    dateStr: dateStr, dayNumber: dayNumber, dailySeed: dailySeed,
    face: face, auspice: auspice, worth: worth, cardLabel: cardLabel, isAttuned: isAttuned, isBright: isBright, handTell: handTell,
    roman: roman, kwPhrase: kwPhrase, cap: cap,
    dealHands: dealHands, handIsFair: handIsFair,
    detectPatterns: detectPatterns, scoreSpread: scoreSpread, tierFor: tierFor,
    deckOdds: deckOdds, standing: standing,
    materialize: materialize, questionsFor: questionsFor, glimpsesFor: glimpsesFor,
    howChosen: howChosen, quintessence: quintessence, summarize: summarize, shareText: shareText
  };
});
