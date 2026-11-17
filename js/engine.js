/*
 * Tarotio engine: every rule of the game, with no DOM and no storage.
 *
 * Two layers:
 *   the puzzle  where each moon and suit mark sits, and the omens. Seeded by the date
 *               alone, so it is the same for every player and every sign.
 *   the cards   which tarot card fills each place. Cast at random for each game
 *               (castCards), always matching the place's suit mark and moon, so every
 *               player draws their own reading from the same puzzle.
 * Given the same seed key and card seed, the same deal, omens and reading come out on any device. The UI (app.js) only
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
    ROWS: 2,                    // each hand is a grid of cards: two rows
    COLS: 5,                    // of five
    HAND_SIZE: 10,
    REVERSED_CHANCE: 0.3,       // chance each dealt card lands reversed
    CHIPS_PER_READ: 1,          // reading a hand true (its Full Moon turned first) wins a chip for the hands ahead
    PASS_PRICE: 1,              // chips paid to pass on a turned card
    MAX_DEAL_ATTEMPTS: 40000,   // reshuffles allowed while looking for a fair puzzle (about one in 300 passes)
    INSIGHT_FIRST_TURN: 2,      // the first card turned in a hand is its Full Moon: the omens were read true
    INSIGHT_FOUND_LATER: 1,     // the Full Moon was found after passing
    FULL: 5,                    // every hand holds exactly one card of this brightness: the Full Moon to find
    BRIGHT_FROM: 4              // a card is "bright" at Gibbous Moon or better
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
  // The day's puzzle is the same for everyone, so its seed is the date alone.
  function dailySeed(str) { return str; }

  /* ------------------------------- cards ------------------------------ */

  // A dealt card is { id, rev }. These helpers read its current face.
  function face(c) { var card = CARD_BY_ID[c.id]; return c.rev ? card.rev : card.up; }
  function auspice(c) { return face(c).a; }
  function cardLabel(c) { return CARD_BY_ID[c.id].name + (c.rev ? ', reversed' : ''); }
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

  // The moon board: the moons a hand holds, brightest first, WITHOUT saying which card is which.
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
    var before = kept.length ? scoreSpread(kept, signId) : { total: 0, patterns: [] };
    var after = scoreSpread(kept.concat([card]), signId);
    // patterns this card completes: they colour the reading, they do not change the moons
    var notes = after.patterns.filter(function (p) {
      return NOTABLE[p.id] && !before.patterns.some(function (q) { return q.id === p.id; });
    }).map(function (p) { return { title: p.title, poker: p.poker }; });
    var hopes = [];
    var cards = kept.concat([card]).map(function (c) { return CARD_BY_ID[c.id]; });
    if (handsLeft > 0 && cards.length === 2) {
      var gap = Math.abs(cards[0].n - cards[1].n);
      if (cards[0].suit && cards[0].suit === cards[1].suit) hopes.push('Two ' + SUITS[cards[0].suit].name + ': a third would make a Trine in your reading.');
      if (!cards[0].suit && !cards[1].suit) hopes.push('Two Major Arcana: a third would make Fate\u2019s Hand.');
      if (gap === 1 || gap === 2) hopes.push('Close numbers: the right third card would make The Stair.');
    }
    return {
      gain: after.total - before.total, total: after.total, tier: tierFor(after.total),
      notes: notes, hopes: hopes, last: handsLeft === 0
    };
  }
  // Patterns worth naming while choosing (orientation notes are left to the reading).
  var NOTABLE = { signCard: true, attuned: true, majors: true, trine: true, triple: true, pair: true, run: true };

  /* -------------------------------- deal ------------------------------ */

  // A hand is fair when it holds exactly ONE Full Moon to find and something deep to avoid.
  // The omens are about "the Full Moon", so it must be the only one.
  function handIsFair(hand) {
    var a = hand.map(auspice);
    return Math.min.apply(null, a) <= 2 && a.filter(function (x) { return x === CONFIG.FULL; }).length === 1;
  }
  function topIndex(hand) {
    var a = hand.map(auspice);
    return a.indexOf(Math.max.apply(null, a));
  }

  // The day's puzzle. Shuffle the 78-card deck from the seed and deal three hands of ten.
  // These cards fix where each moon and suit mark sits; castCards() then chooses, for each
  // player, which tarot card fills each place.
  //
  // A puzzle is only used if:
  //   1. every hand holds exactly one Full Moon, and a dim card to avoid;
  //   2. every hand carries a real puzzle, and the Future's needs omens chained together.
  // Rule 1 is what makes Tarotio a game of skill: read all three hands true and you hold
  // three Full Moons, 15 moons, the best reading there is, every day, for every player.
  //
  // Unfair deals are reshuffled with the next attempt number, so the result is still the
  // same on every device. The puzzle does not depend on the sign.
  function dealHands(seedKey) {
    var ids = CARDS.map(function (c) { return c.id; });
    var fallback = null, hands = null;
    for (var attempt = 0; attempt < CONFIG.MAX_DEAL_ATTEMPTS; attempt++) {
      var rng = rngFrom('deal|' + seedKey + '|' + attempt);
      var drawn = shuffle(ids, rng).slice(0, CONFIG.ROUNDS * CONFIG.HAND_SIZE).map(function (id) {
        return { id: id, rev: rng() < CONFIG.REVERSED_CHANCE };
      });
      hands = [];
      for (var r = 0; r < CONFIG.ROUNDS; r++) hands.push(drawn.slice(r * CONFIG.HAND_SIZE, (r + 1) * CONFIG.HAND_SIZE));
      if (!hands.every(handIsFair)) continue;
      if (!fallback) fallback = hands;
      if (!hands.every(hasPuzzle)) continue;
      // the Future must need chained reasoning: build its real omens and check
      if (!makeOmens(hands[CONFIG.ROUNDS - 1], 3, rngFrom('omens|' + seedKey + '|' + (CONFIG.ROUNDS - 1))).chained) continue;
      return hands;
    }
    // Not reached in practice. Kept so a deal can never hang.
    return fallback || hands;
  }

  // Every card face, grouped by what the puzzle shows: its suit mark and its moon.
  var FACES = {};
  CARDS.forEach(function (c) {
    [false, true].forEach(function (rev) {
      var f = { id: c.id, rev: rev }, key = aura(f) + '|' + auspice(f);
      (FACES[key] = FACES[key] || []).push(f);
    });
  });
  function faceKey(c) { return aura(c) + '|' + auspice(c); }

  // Cast the cards for one player. Every place keeps its suit mark and its moon, so the puzzle
  // and the omens are unchanged, but the tarot card there is drawn at random from all the faces
  // that fit, with no card used twice. The places with fewest fitting faces are filled first.
  // A casting always exists: the cards dealHands() drew are one.
  function castCards(hands, cardSeed) {
    var rng = rngFrom('cast|' + cardSeed);
    var places = [];
    hands.forEach(function (h, i) { h.forEach(function (c, j) { places.push({ i: i, j: j, key: faceKey(c) }); }); });
    places = shuffle(places, rng).sort(function (a, b) { return FACES[a.key].length - FACES[b.key].length; });
    var used = {}, chosen = [], steps = 0;
    function fill(k) {
      if (k === places.length) return true;
      if (++steps > 20000) return false;
      var options = shuffle(FACES[places[k].key], rng);
      for (var o = 0; o < options.length; o++) {
        if (used[options[o].id]) continue;
        used[options[o].id] = true;
        chosen[k] = options[o];
        if (fill(k + 1)) return true;
        used[options[o].id] = false;
      }
      return false;
    }
    if (!fill(0)) return hands;   // not reached in practice; the dealt cards are a valid casting
    var out = hands.map(function (h) { return h.slice(); });
    places.forEach(function (pl, k) { out[pl.i][pl.j] = chosen[k]; });
    return out;
  }

  // The reading a perfect reader draws: the Full Moon of each hand. Always 15 moons.
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

    // The sign's own Major Arcana card.
    cards.forEach(function (c) {
      if (c.id === sign.card) {
        out.push({ id: 'signCard', title: 'Your card found you', poker: 'the wild card',
          text: c.name + ' is the card of ' + sign.name + '. When your own card turns up, the day is addressed to you personally.' });
      }
    });

    // Cards in the suit of the sign's element.
    var attuned = cards.filter(function (c) { return c.suit && c.suit === sign.suit; });
    if (attuned.length) {
      var names = attuned.map(function (c) { return c.name; });
      var suitName = SUITS[sign.suit].name;
      out.push({ id: 'attuned', title: 'Attuned to ' + sign.element, poker: null,
        text: (attuned.length === 1
          ? names[0] + ' is a ' + suitName + ' card, and ' + suitName + ' is the suit of ' + sign.element + ', your element. It speaks to you most directly today.'
          : listAnd(names) + ' are ' + suitName + ' cards, the suit of ' + sign.element + ', your element. They speak to you most directly today.') });
    }

    // Major Arcana count.
    var majors = cards.filter(function (c) { return c.arcana === 'major'; }).length;
    if (majors === 3) {
      out.push({ id: 'majors', title: 'Fate’s Hand', poker: 'three of a kind',
        text: 'All three cards are Major Arcana. Readers take that as a day shaped by large forces. Pay attention; today matters.' });
    }

    // Suits.
    var suitCount = {};
    cards.forEach(function (c) { if (c.suit) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1; });
    Object.keys(suitCount).forEach(function (s) {
      if (suitCount[s] === 3) {
        out.push({ id: 'trine', title: 'Trine of ' + SUITS[s].name, poker: 'a flush', text: SUITS[s].trine });
      }
    });

    // Repeated numbers.
    var numCount = {};
    cards.forEach(function (c) { numCount[c.n] = (numCount[c.n] || 0) + 1; });
    Object.keys(numCount).forEach(function (n) {
      var meaning = NUMBER_MEANING[n] || 'The same number twice means the message repeats so that you hear it.';
      if (numCount[n] === 3) {
        out.push({ id: 'triple', title: 'Triple ' + n, poker: 'three of a kind',
          text: 'The same number three times is the loudest signal a spread can send. ' + meaning });
      } else if (numCount[n] === 2) {
        out.push({ id: 'pair', title: 'Echo of ' + n + 's', poker: 'a pair',
          text: 'Two cards share the number ' + n + '. ' + meaning });
      }
    });

    // A run of three consecutive numbers.
    var nums = cards.map(function (c) { return c.n; }).sort(function (a, b) { return a - b; });
    if (nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1) {
      out.push({ id: 'run', title: 'The Stair', poker: 'a straight',
        text: nums.join(', ') + ': the numbers climb in order. Readers see a run as a story moving forward one step at a time.' });
    }

    // Orientation.
    var reversed = picks.filter(function (p) { return p.rev; }).length;
    if (reversed === 0) {
      out.push({ id: 'upright', title: 'All upright', poker: null,
        text: 'Every card landed upright, so the day’s energy runs outward and clear.' });
    } else if (reversed === 3) {
      out.push({ id: 'reversed', title: 'All reversed', poker: null,
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
  // The fortune is the moons of the cards kept: 3 to 15 for three cards. Patterns (a Trine, your
  // own card, a run) are found for the reading text but do not change the moons, so two players
  // who play the same puzzle the same way always draw the same fortune.
  function scoreSpread(picks, signId) {
    var total = 0;
    picks.forEach(function (p) { total += auspice(p); });
    return { base: total, total: total, tier: tierFor(total), patterns: detectPatterns(picks, signId) };
  }

  // Every reading today's deck could have produced: one card from each hand, 10 x 10 x 10 = 1,000.
  // This is what lets the game say, in numbers, how much of a result was the deck.
  function deckOdds(hands) {
    var totals = [], tierCounts = [0, 0, 0, 0, 0, 0];
    var m = hands.map(function (h) { return h.map(auspice); });
    m[0].forEach(function (a) {
      m[1].forEach(function (b) {
        m[2].forEach(function (c) {
          var t = a + b + c;
          totals.push(t);
          tierCounts[tierFor(t)]++;
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
      blindChance: Math.round((atLeast / odds.count) * 1000) / 10 // % chance a blind draw reaches this tier or higher, one decimal
    };
  }

  /* -------------------------------- omens ----------------------------- */

  // The puzzle. Each hand is a grid of cards, two rows of five, face down. It comes with a few
  // omens: true statements that, taken together, leave exactly one place the Full Moon
  // can be. The player can see where each card sits, the suit mark on its back, and the
  // hand's moons (the board), and has to work out the rest.
  //
  // Two kinds of omen:
  //   direct   about the Full Moon itself: its row, column, corner, suit, and what it
  //            touches. Each is simply a set of places.
  //   indirect about other cards: "X outshines Y", "the Half Moon is in the top row",
  //            "the Half Moon touches the Full Moon". These must be chained.
  //
  // Fairness is proved, not hoped for. For a set of omens, a place is still possible for the
  // brightest card if SOME layout of the hand's moons makes every omen true with the brightest
  // card there (feasible(), an exact search over only the cards the omens name). An omen set
  // is used only if it is true, leaves exactly one place, has no omen to spare, and no single
  // omen gives the answer away. tests/engine.test.js checks this, and checks feasible()
  // against a brute-force count of every layout.

  var ROWS = CONFIG.ROWS, COLS = CONFIG.COLS, N = ROWS * COLS, ALL = (1 << N) - 1;
  var MOON_NAME = [null, 'New Moon', 'Crescent Moon', 'Half Moon', 'Gibbous Moon', 'Full Moon'];
  var ROW_NAME = ['top row', 'bottom row'];
  var ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];
  function markName(k) { return k === 'major' ? 'Major Arcana' : SUITS[k].name; }
  function maxAt(a) { return a.indexOf(Math.max.apply(null, a)); }

  // Grid geometry. Places are numbered row by row: 0-4 the top row, 5-9 the bottom row.
  function rowOf(p) { return Math.floor(p / COLS); }
  function colOf(p) { return p % COLS; }
  function bit(p) { return 1 << p; }
  function setOf(list) { return list.reduce(function (m, p) { return m | (1 << p); }, 0); }
  function listOf(m) { var o = []; for (var p = 0; p < N; p++) if ((m >> p) & 1) o.push(p); return o; }
  function popcount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }
  function places() { var o = []; for (var p = 0; p < N; p++) o.push(p); return o; }
  // touching = beside it in its row, or directly above or below it
  function touching(p) {
    var r = rowOf(p), c = colOf(p), o = [];
    if (c > 0) o.push(p - 1);
    if (c < COLS - 1) o.push(p + 1);
    if (r > 0) o.push(p - COLS);
    if (r < ROWS - 1) o.push(p + COLS);
    return o;
  }
  function besideInRow(p) { return touching(p).filter(function (q) { return rowOf(q) === rowOf(p); }); }
  function columnMates(p) { return touching(p).filter(function (q) { return colOf(q) === colOf(p); }); }
  function diagonal(p) {
    var o = [];
    [-1, 1].forEach(function (dr) {
      [-1, 1].forEach(function (dc) {
        var r = rowOf(p) + dr, c = colOf(p) + dc;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) o.push(r * COLS + c);
      });
    });
    return o;
  }
  var TOUCH = places().map(function (p) { return setOf(touching(p)); });
  var ROW_SET = [0, 1].map(function (r) { return setOf(places().filter(function (p) { return rowOf(p) === r; })); });
  var COL_SET = [0, 1, 2, 3, 4].map(function (c) { return setOf(places().filter(function (p) { return colOf(p) === c; })); });
  var CORNERS = setOf([0, COLS - 1, N - COLS, N - 1]);
  var OUTER = COL_SET[0] | COL_SET[COLS - 1];
  function colsWhere(test) { return setOf(places().filter(function (p) { return test(colOf(p)); })); }

  // Where a named moon may sit, relative to the Full Moon at c.
  function relSet(rel, c) {
    switch (rel) {
      case 'touch': return TOUCH[c];
      case 'notTouch': return ALL & ~TOUCH[c] & ~bit(c);
      case 'sameCol': return COL_SET[colOf(c)] & ~bit(c);
      case 'sameRow': return ROW_SET[rowOf(c)] & ~bit(c);
      case 'otherRow': return ALL & ~ROW_SET[rowOf(c)];
      case 'topLeft': return colsWhere(function (x) { return x > colOf(c); });    // the Full Moon lies left of it
      case 'topRight': return colsWhere(function (x) { return x < colOf(c); });   // the Full Moon lies right of it
    }
    throw new Error('unknown relation ' + rel);
  }
  // Indirect omens as constraints:
  //   { type: 'cmp', p, q }      the card at p outshines the card at q
  //   { type: 'dim', p }         the card at p is dimmer than every card it touches
  //   { type: 'peak', p }        the card at p outshines every card it touches
  //   { type: 'place', v, set }  the only card with moon v sits in set
  //   { type: 'rel', v, rel }    the only card with moon v sits in relation rel to the Full Moon
  function conPlaces(k) { return k.type === 'cmp' ? [k.p, k.q] : [k.p].concat(touching(k.p)); }
  function conHolds(k, moonAt) {
    if (k.type === 'cmp') return moonAt(k.p) > moonAt(k.q);
    var me = moonAt(k.p), ns = touching(k.p).map(moonAt);
    return k.type === 'dim' ? ns.every(function (x) { return x > me; }) : ns.every(function (x) { return x < me; });
  }
  // Truth of a constraint on a complete layout of moons, a[place] = moon.
  function conTest(k, a) {
    if (k.type === 'place') return ((k.set >> a.indexOf(k.v)) & 1) === 1;
    if (k.type === 'rel') return ((relSet(k.rel, maxAt(a)) >> a.indexOf(k.v)) & 1) === 1;
    return conHolds(k, function (p) { return a[p]; });
  }

  // Can the Full Moon (moon T) sit at c with every constraint true, given the hand's moon counts?
  // An exact search over only the places and moons the constraints name. Every other place
  // takes whatever moons are left, which always fits, because places and moons number the same.
  function feasible(c, cons, counts0, T) {
    var counts = counts0.slice(), held = [];
    for (var i = 0; i < N; i++) held.push(0);
    held[c] = T; counts[T]--;
    var named = {}, order = [], posCons = [];
    cons.forEach(function (k) {
      if (k.type === 'place' || k.type === 'rel') {
        var m = k.type === 'place' ? k.set : relSet(k.rel, c);
        if (!(k.v in named)) { named[k.v] = ALL; order.push(k.v); }
        named[k.v] &= m;
      } else posCons.push(k);
    });
    var R = [];
    posCons.forEach(function (k) { conPlaces(k).forEach(function (p) { if (R.indexOf(p) === -1) R.push(p); }); });
    function consistent() {
      for (var j = 0; j < posCons.length; j++) {
        var k = posCons[j], ps = conPlaces(k), ready = true;
        for (var x = 0; x < ps.length; x++) if (!held[ps[x]]) { ready = false; break; }
        if (ready && !conHolds(k, function (p) { return held[p]; })) return false;
      }
      return true;
    }
    function placeMoons(i) {
      if (i === order.length) return fillPlaces(0);
      var v = order[i], m = named[v] & ~bit(c);
      if (counts[v] <= 0) return false;
      for (var w = 0; w < N; w++) {
        if (!((m >> w) & 1) || held[w]) continue;
        held[w] = v; counts[v]--;
        if (consistent() && placeMoons(i + 1)) return true;
        held[w] = 0; counts[v]++;
      }
      return false;
    }
    function fillPlaces(j) {
      if (j === R.length) return true;
      var p = R[j];
      if (held[p]) return fillPlaces(j + 1);
      for (var u = 1; u <= 5; u++) {
        if (counts[u] <= 0) continue;
        held[p] = u; counts[u]--;
        if (consistent() && fillPlaces(j + 1)) return true;
        held[p] = 0; counts[u]++;
      }
      return false;
    }
    return placeMoons(0);
  }

  function handFacts(hand) {
    var moons = hand.map(auspice), top = maxAt(moons), counts = [0, 0, 0, 0, 0, 0];
    moons.forEach(function (v) { counts[v]++; });
    return { marks: hand.map(aura), moons: moons, top: top, T: moons[top], counts: counts };
  }
  // The places the Full Moon could still be in, as a bit mask, given a list of omens.
  function candidateMask(facts, omens) {
    var m = ALL, cons = [];
    omens.forEach(function (o) { if (o.kind === 'direct') m &= o.set; else cons.push(o.con); });
    if (!cons.length) return m;
    var out = 0;
    listOf(m).forEach(function (c) { if (feasible(c, cons, facts.counts, facts.T)) out |= bit(c); });
    return out;
  }
  // The same, as a sorted list of places. Exported: the tests and the result screen use it.
  function omenCandidates(hand, omens) { return listOf(candidateMask(handFacts(hand), omens)); }

  // Every true statement about this hand, from the omen vocabulary.
  // Each omen has: text, kind, focus (places it speaks of, lit when tapped), moons (board moons it
  // names), set (direct) or con (indirect), and test(layout) for its truth on any layout.
  function omenPool(facts) {
    var marks = facts.marks, moons = facts.moons, top = facts.top, direct = [], indirect = [];
    var count = {};
    marks.forEach(function (k) { count[k] = (count[k] || 0) + 1; });
    var kinds = Object.keys(count);
    function where(k) { return setOf(places().filter(function (p) { return marks[p] === k; })); }
    function inRow(k, r) { return places().filter(function (p) { return rowOf(p) === r && marks[p] === k; }); }
    // a name for the card at p that a player can find on the table without counting
    function ref(p) {
      var k = marks[p], r = rowOf(p), row = inRow(k, r);
      if (count[k] === 1) return 'the ' + markName(k) + ' card';
      if (row.length === 1) return 'the ' + markName(k) + ' card in the ' + ROW_NAME[r];
      if (row.length === 2) return 'the ' + (row[0] === p ? 'left-hand' : 'right-hand') + ' ' + markName(k) + ' card in the ' + ROW_NAME[r];
      return 'the ' + ORDINAL[colOf(p)] + ' card of the ' + ROW_NAME[r];
    }
    function D(text, set, focus) {
      if (!((set >> top) & 1) || popcount(set) < 2 || set === ALL) return;   // true, not a giveaway, not empty of meaning
      direct.push({ kind: 'direct', text: text, set: set, focus: listOf(focus), moons: [],
        test: function (a) { return ((set >> maxAt(a)) & 1) === 1; } });
    }
    function I(text, con, focus, named) {
      if (!conTest(con, moons)) return;
      indirect.push({ kind: 'indirect', text: text, con: con, focus: focus, moons: named,
        test: function (a) { return conTest(con, a); } });
    }
    function any(test) { return setOf(places().filter(test)); }

    // ---- the Full Moon itself
    [0, 1].forEach(function (r) { D('The Full Moon is in the ' + ROW_NAME[r] + '.', ROW_SET[r], ROW_SET[r]); });
    D('The Full Moon is in one of the two outer columns.', OUTER, OUTER);
    D('The Full Moon is not in an outer column.', ALL & ~OUTER, OUTER);
    D('The Full Moon is in the middle column.', COL_SET[2], COL_SET[2]);
    D('The Full Moon is not in the middle column.', ALL & ~COL_SET[2], COL_SET[2]);
    D('The Full Moon lies left of the middle column.', COL_SET[0] | COL_SET[1], COL_SET[0] | COL_SET[1]);
    D('The Full Moon lies right of the middle column.', COL_SET[3] | COL_SET[4], COL_SET[3] | COL_SET[4]);
    D('The Full Moon sits in a corner.', CORNERS, CORNERS);
    D('The Full Moon is not in a corner.', ALL & ~CORNERS, CORNERS);
    kinds.forEach(function (k) {
      var w = where(k), name = markName(k);
      if (count[k] >= 2) D('The Full Moon is a ' + name + ' card.', w, w);
      D('The Full Moon is not a ' + name + ' card.', ALL & ~w, w);
      var near = any(function (p) { return touching(p).some(function (q) { return marks[q] === k; }); });
      D('The Full Moon touches a ' + name + ' card.', near, w);
      D('The Full Moon does not touch a ' + name + ' card.', ALL & ~near, w);
      D('The Full Moon is directly above or below a ' + name + ' card.', any(function (p) { return columnMates(p).some(function (q) { return marks[q] === k; }); }), w);
      D('The Full Moon sits beside a ' + name + ' card in its row.', any(function (p) { return besideInRow(p).some(function (q) { return marks[q] === k; }); }), w);
      if (count[k] === 1) {
        var q = listOf(w)[0];
        D('The Full Moon lies in a column left of the ' + name + ' card.', colsWhere(function (x) { return x < colOf(q); }), w);
        D('The Full Moon lies in a column right of the ' + name + ' card.', colsWhere(function (x) { return x > colOf(q); }), w);
        D('The Full Moon is in the same row as the ' + name + ' card.', ROW_SET[rowOf(q)] & ~w, w);
        D('The Full Moon is not in the same row as the ' + name + ' card.', ALL & ~ROW_SET[rowOf(q)], w);
        D('The Full Moon sits diagonally next to the ' + name + ' card.', setOf(diagonal(q)), w);
      }
    });
    var alone = any(function (p) { return count[marks[p]] === 1; });
    D('The Full Moon is the only one of its suit in this hand.', alone, alone);
    D('The Full Moon shares its suit with another card here.', ALL & ~alone, ALL & ~alone);
    D('The Full Moon shares its column with a card of its own suit.',
      any(function (p) { return columnMates(p).some(function (q) { return marks[q] === marks[p]; }); }), ALL);
    D('The Full Moon sits between two cards of the same suit in its row.',
      any(function (p) { return colOf(p) > 0 && colOf(p) < COLS - 1 && marks[p - 1] === marks[p + 1]; }), ALL);

    // ---- other cards
    places().forEach(function (p) {
      if (p === top) return;
      places().forEach(function (q) {
        if (q !== p && moons[p] > moons[q]) I(cap(ref(p)) + ' outshines ' + ref(q) + '.', { type: 'cmp', p: p, q: q }, [p, q], []);
      });
      I(cap(ref(p)) + ' is dimmer than every card it touches.', { type: 'dim', p: p }, [p].concat(touching(p)), []);
      I(cap(ref(p)) + ' outshines every card it touches.', { type: 'peak', p: p }, [p].concat(touching(p)), []);
    });
    [1, 2, 3, 4, 5].forEach(function (v) {
      if (v === facts.T || facts.counts[v] !== 1) return;
      var q = moons.indexOf(v), k = marks[q], name = 'The ' + MOON_NAME[v];
      I(name + ' is in the ' + ROW_NAME[rowOf(q)] + '.', { type: 'place', v: v, set: ROW_SET[rowOf(q)] }, listOf(ROW_SET[rowOf(q)]), [v]);
      if (count[k] >= 2) I(name + ' is a ' + markName(k) + ' card.', { type: 'place', v: v, set: where(k) }, listOf(where(k)), [v]);
      else I(name + ' is the ' + markName(k) + ' card.', { type: 'place', v: v, set: bit(q) }, [q], [v]);
      I(name + ' sits in a corner.', { type: 'place', v: v, set: CORNERS }, listOf(CORNERS), [v]);
      I(name + ' is not in a corner.', { type: 'place', v: v, set: ALL & ~CORNERS }, listOf(CORNERS), [v]);
      I(name + ' touches the Full Moon.', { type: 'rel', v: v, rel: 'touch' }, [], [v]);
      I(name + ' does not touch the Full Moon.', { type: 'rel', v: v, rel: 'notTouch' }, [], [v]);
      I(name + ' shares a column with the Full Moon.', { type: 'rel', v: v, rel: 'sameCol' }, [], [v]);
      I(name + ' is in the same row as the Full Moon.', { type: 'rel', v: v, rel: 'sameRow' }, [], [v]);
      I(name + ' is not in the same row as the Full Moon.', { type: 'rel', v: v, rel: 'otherRow' }, [], [v]);
      I('The Full Moon lies in a column left of the ' + MOON_NAME[v] + '.', { type: 'rel', v: v, rel: 'topLeft' }, [], [v]);
      I('The Full Moon lies in a column right of the ' + MOON_NAME[v] + '.', { type: 'rel', v: v, rel: 'topRight' }, [], [v]);
    });
    return { direct: direct, indirect: indirect };
  }

  // What an indirect omen is about. Omens can only chain if they share a subject.
  function subjects(con) {
    if (con.type === 'cmp') return ['p' + con.p, 'p' + con.q];
    if (con.type === 'dim' || con.type === 'peak') return ['p' + con.p].concat(touching(con.p).map(function (q) { return 'p' + q; }));
    var out = ['v' + con.v];
    if (con.type === 'rel') out.push('top');
    if (con.type === 'place' && popcount(con.set) <= 2) listOf(con.set).forEach(function (q) { out.push('p' + q); });
    return out;
  }
  // Are these omens linked into one chain (each shares a subject with the rest)?
  function linked(list) {
    if (list.length < 2) return true;
    var reached = [list[0]], subs = subjects(list[0].con), grew = true;
    while (grew) {
      grew = false;
      for (var i = 0; i < list.length; i++) {
        if (reached.indexOf(list[i]) !== -1) continue;
        var own = subjects(list[i].con);
        if (own.some(function (x) { return subs.indexOf(x) !== -1; })) { reached.push(list[i]); subs = subs.concat(own); grew = true; }
      }
    }
    return reached.length === list.length;
  }

  // How many direct and indirect omens each hand gets, and whether the indirect ones must
  // chain (together rule out a place none of them rules out alone). Easiest plan first.
  // The Past is two plain omens. The Future needs chained reasoning.
  var OMEN_PLANS = {
    1: [[2, 0, false], [3, 0, false]],
    2: [[2, 1, false], [1, 2, false], [3, 1, false]],
    3: [[1, 2, true], [2, 2, true], [1, 3, true], [0, 2, true], [0, 3, true], [2, 3, true], [3, 2, true], [2, 2, false], [1, 2, false]]
  };
  // Shapes to try when none of a tier's own plans fits the hand.
  var OMEN_ANY = [[2, 1, false], [1, 2, false], [3, 0, false], [2, 2, false], [3, 1, false], [4, 0, false]];
  var OMEN_TRIES = 300;   // indirect combinations tried per plan before moving on

  // Build the omens for one hand. tier is 1, 2 or 3.
  // Returns { top, omens: [{ text, kind, focus, moons, test }], steps: [places left after each omen] }.
  function makeOmens(hand, tier, rng) {
    var facts = handFacts(hand), top = facts.top, pool = omenPool(facts), memo = {};
    pool.indirect.forEach(function (o, i) { o.idx = i; });
    function F(list) {
      var key = list.map(function (o) { return o.idx; }).sort(function (a, b) { return a - b; }).join(',');
      if (!(key in memo)) memo[key] = candidateMask(facts, list);
      return memo[key];
    }
    function and(list, skip) { return list.reduce(function (m, d, j) { return j === skip ? m : m & d.set; }, ALL); }
    function choose(items, k, start, acc, visit) {
      if (acc.length === k) return visit(acc);
      for (var i = start; i < items.length; i++) if (choose(items, k, i + 1, acc.concat([items[i]]), visit)) return true;
      return false;
    }
    // no single omen may give the answer away
    var ind = shuffle(pool.indirect.filter(function (o) { return popcount(F([o])) >= 2; }), rng);
    var dir = shuffle(pool.direct, rng);
    var plans = [];
    for (var t = tier; t >= 1; t--) plans = plans.concat(OMEN_PLANS[t]);
    plans = plans.concat(OMEN_ANY);
    var found = null, chained = false;
    for (var pi = 0; pi < plans.length && !found; pi++) {
      var nd = plans[pi][0], ni = plans[pi][1], chain = plans[pi][2], tries = 0;
      choose(ind, ni, 0, [], function (Is) {
        if (chain && ni >= 2 && !linked(Is)) return false;   // cheap: only linked omens can chain
        if (++tries > OMEN_TRIES) return true;
        var FI = ni ? F(Is) : ALL;
        if (nd > 0 && popcount(FI) < 2) return false;
        if (chain && ni >= 2 && FI === Is.reduce(function (m, o) { return m & F([o]); }, ALL)) return false;
        var without = Is.map(function (o, j) { return F(Is.filter(function (x, k) { return k !== j; })); });
        return choose(dir, nd, 0, [], function (Ds) {
          var all = and(Ds, -1);
          if ((all & FI) !== bit(top)) return false;                                              // sufficient
          for (var j = 0; j < Ds.length; j++) if (popcount(and(Ds, j) & FI) < 2) return false;   // every direct omen needed
          for (var j2 = 0; j2 < Is.length; j2++) if (popcount(all & without[j2]) < 2) return false; // every indirect omen needed
          found = Ds.concat(Is);
          chained = chain && ni >= 2;
          return true;
        });
      });
    }
    if (!found) {
      // Not reached in practice: dealHands only deals hands that carry a real puzzle.
      found = [{ kind: 'direct', text: 'The Full Moon is the ' + ORDINAL[colOf(top)] + ' card of the ' + ROW_NAME[rowOf(top)] + '.',
        set: bit(top), focus: [top], moons: [], test: function (a) { return maxAt(a) === top; } }];
    }
    return {
      top: top,
      chained: chained,   // the indirect omens rule out a place together that none rules out alone
      steps: found.map(function (o, i) { return listOf(candidateMask(facts, found.slice(0, i + 1))); }),
      omens: found.map(function (o) {
        return { text: o.text, kind: o.kind, focus: o.focus, moons: o.moons, set: o.set, con: o.con, test: o.test };
      })
    };
  }

  // Every distinct layout of a hand's moons. Only the tests use this, to check feasible()
  // against brute force; the game never needs it.
  function arrangements(moons) {
    var seen = {}, out = [], a = moons.slice();
    (function walk(k) {
      if (k === a.length) {
        var key = a.join('');
        if (!seen[key]) { seen[key] = true; out.push(a.slice()); }
        return;
      }
      var tried = {};
      for (var i = k; i < a.length; i++) {
        if (tried[a[i]]) continue;
        tried[a[i]] = true;
        var t = a[k]; a[k] = a[i]; a[i] = t;
        walk(k + 1);
        t = a[k]; a[k] = a[i]; a[i] = t;
      }
    })(0);
    return out;
  }

  // A hand is only dealt if it can carry a real puzzle: two omens or more, none of them a giveaway.
  function hasPuzzle(hand) { return makeOmens(hand, 1, rngFrom('probe')).omens.length > 1; }

  // The omens for all three hands of a game: plain for the Past, knotty for the Future.
  // Everyone with the same sign on the same day gets the same omens.
  // Worked out once per deck and kept for the session (the Future hand can take a few tens of ms).
  var omenCache = {}, omenCacheKeys = [];
  function omensFor(game, hands) {
    var key = game.seedKey;   // omens depend only on the puzzle, never on which cards were cast
    if (omenCache[key]) return omenCache[key];
    hands = hands || dealHands(game.seedKey);
    var out = hands.map(function (hand, i) {
      return makeOmens(hand, Math.min(3, i + 1), rngFrom('omens|' + game.seedKey + '|' + i));
    });
    omenCache[key] = out;
    omenCacheKeys.push(key);
    if (omenCacheKeys.length > 12) delete omenCache[omenCacheKeys.shift()];
    return out;
  }

  // Insight for one hand: did the player find the Full Moon, and how soon?
  function handInsight(round, hand) {
    var at = round.turned.indexOf(topIndex(hand));
    return at === 0 ? CONFIG.INSIGHT_FIRST_TURN : at > 0 ? CONFIG.INSIGHT_FOUND_LATER : 0;
  }

  // Chips won by reading hands true: one for each hand whose Full Moon was turned first,
  // except the last hand, where there is nothing left to spend it on. Counts finished hands only.
  function chipsWon(rounds, hands) {
    var won = 0;
    for (var i = 0; i < CONFIG.ROUNDS - 1; i++) {
      var r = rounds[i];
      if (r && r.pick !== null && r.pick !== undefined && r.turned[0] === topIndex(hands[i])) won += CONFIG.CHIPS_PER_READ;
    }
    return won;
  }

  // Chance that a player turning cards blind finds the Full Moon first in at least k of the hands.
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
    hands = hands || castCards(dealHands(game.seedKey), game.cardSeed);
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
    var odds = deckOdds(hands);
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
        // the puzzle: where the Full Moon was, whether it was found, and how the omens narrowed it down
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
    var readLine = firstFinds === 3 ? 'You turned the Full Moon first in all three hands. Turning blind does that about once in ' + oneIn + ' games, so this was reading.'
      : firstFinds === 2 ? 'You turned the Full Moon first in two hands of three. Turning blind manages that about one game in ' + oneIn + '.'
      : firstFinds === 1 ? 'You turned the Full Moon first in one hand. Turning blind does at least that about every other game, so the omens and fate may share the credit.'
      : 'None of your first turns was a Full Moon today. The omens were knotty, and each one you untangle makes the next easier.';
    // What the deck could have given at best: the luck of the deal, which no reading can change.
    var ceiling = { total: odds.best, tier: tierFor(odds.best) };
    var perfectRead = firstFinds === CONFIG.ROUNDS;
    var ceilingLine = perfectRead
      ? 'You read all three hands true and drew three Full Moons, ' + odds.best + ' moons, the best reading anyone can draw today. That is skill, and it works on any day\u2019s puzzle.'
      : score.total >= odds.best
      ? 'You found all three Full Moons, ' + odds.best + ' moons, even with a hand left to chance. Fortune helped.'
      : 'Every hand holds one Full Moon, and the omens point to each of them. All three make ' + odds.best + ' moons, a Full Moon reading, for anyone who reads them true.';

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
    lines.push(sum.standing.isBest ? 'Three Full Moons' : 'Brighter than ' + sum.standing.pct + '% of the readings in the deck');
    lines.push('Each row is a hand. Last moon = the card kept.');
    if (url) lines.push(url);
    return lines.join('\n');
  }

  return {
    CONFIG: CONFIG, TIERS: TIERS, POSITIONS: POSITIONS, INSIGHT_TITLES: INSIGHT_TITLES,
    rngFrom: rngFrom, shuffle: shuffle, pick: pick,
    dateStr: dateStr, dayNumber: dayNumber, dailySeed: dailySeed,
    face: face, auspice: auspice, cardLabel: cardLabel, isAttuned: isAttuned, isBright: isBright,
    aura: aura, handBoard: handBoard, keepPreview: keepPreview, castCards: castCards,
    roman: roman, kwPhrase: kwPhrase, cap: cap,
    dealHands: dealHands, handIsFair: handIsFair, topIndex: topIndex, perfectReading: perfectReading, chipsWon: chipsWon,
    detectPatterns: detectPatterns, scoreSpread: scoreSpread, tierFor: tierFor,
    deckOdds: deckOdds, standing: standing,
    omensFor: omensFor, makeOmens: makeOmens, omenCandidates: omenCandidates, arrangements: arrangements,
    rowOf: rowOf, colOf: colOf, touching: touching,
    handInsight: handInsight, blindFirstTurnChance: blindFirstTurnChance,
    howKept: howKept, quintessence: quintessence, summarize: summarize, shareText: shareText
  };
});
