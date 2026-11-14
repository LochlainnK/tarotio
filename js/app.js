/*
 * Tarotio UI: draws the table, records what the player does, saves progress.
 * All rules live in engine.js. This file never decides what a card is worth.
 *
 * Game state (saved to localStorage after every action so a refresh cannot re-roll):
 *   game = {
 *     v, mode: 'daily' | 'practice', date, sign, seedKey,
 *     round: 0-2, phase: 'question' | 'answered' | 'glimpse' | 'choose' | 'reveal', done,
 *     rounds: [{ tries: [optionIndex], solved: true|false|null, glimpses: 0-2, seen: [cardIndex], pick: cardIndex|null }]
 *   }
 */
(function () {
  'use strict';

  var E = window.TarotioEngine, D = window.TarotioCards;
  var MOONS = D.MOONS, CFG = E.CONFIG;

  var STORE_KEY = 'tarotio.v1';
  // Set this to the public address after launch so shared results link back to the game.
  var SHARE_URL = '';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------ storage ----------------------------- */

  function loadStore() {
    var blank = { v: 1, sign: null, daily: null, history: [] };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return blank;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return blank;
      if (!Array.isArray(s.history)) s.history = [];
      if (s.sign && !D.SIGN_BY_ID[s.sign]) s.sign = null;
      return s;
    } catch (e) { return blank; }
  }
  function saveStore() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode: play still works */ }
  }

  var store = loadStore();
  var game = null, hands = null, questions = null;
  var ui = { selected: null, toastTimer: null };

  // QA helper: index.html?date=2026-12-25 plays that day's deck.
  var dateOverride = (function () {
    var m = /[?&]date=(\d{4}-\d{2}-\d{2})\b/.exec(window.location.search || '');
    return m ? m[1] : null;
  })();
  var today = dateOverride || E.dateStr();

  /* ----------------------------- small parts -------------------------- */

  function moonSVG(level, label) {
    var f = [0, 0, 0.25, 0.5, 0.75, 1][level], lit = '';
    if (f >= 1) lit = '<circle class="m-lit" cx="12" cy="12" r="9"/>';
    else if (f > 0) {
      var rx = (9 * Math.abs(1 - 2 * f)).toFixed(2);
      lit = '<path class="m-lit" d="M12 3A9 9 0 0 1 12 21A' + rx + ' 9 0 0 ' + (f < 0.5 ? 0 : 1) + ' 12 3Z"/>';
    }
    return '<svg class="moon" viewBox="0 0 24 24" role="img" aria-label="' + esc(label || MOONS[level].name) + '">' +
      '<circle class="m-dark" cx="12" cy="12" r="9"/>' + lit + '<circle class="m-ring" cx="12" cy="12" r="9"/></svg>';
  }
  function suitSVG(suit) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#suit-' + suit + '"/></svg>';
  }
  function eyeSVG() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-eye"/></svg>'; }
  function sym(glyph) { return '<span class="sym" aria-hidden="true">' + glyph + '︎</span>'; }

  // Where the suit marks sit on a numbered card, like the pips on a playing card.
  var PIPS = {
    1: [[50, 70]],
    2: [[50, 32], [50, 108]],
    3: [[50, 26], [50, 70], [50, 114]],
    4: [[28, 32], [72, 32], [28, 108], [72, 108]],
    5: [[28, 32], [72, 32], [28, 108], [72, 108], [50, 70]],
    6: [[28, 26], [72, 26], [28, 70], [72, 70], [28, 114], [72, 114]],
    7: [[28, 26], [72, 26], [28, 70], [72, 70], [28, 114], [72, 114], [50, 48]],
    8: [[28, 26], [72, 26], [28, 70], [72, 70], [28, 114], [72, 114], [50, 48], [50, 92]],
    9: [[28, 20], [72, 20], [28, 53], [72, 53], [28, 87], [72, 87], [28, 120], [72, 120], [50, 70]],
    10: [[28, 20], [72, 20], [28, 53], [72, 53], [28, 87], [72, 87], [28, 120], [72, 120], [50, 37], [50, 103]]
  };
  function pipsSVG(card) {
    var size = card.n === 1 ? 66 : card.n <= 3 ? 38 : card.n <= 6 ? 32 : card.n <= 8 ? 28 : 24;
    var uses = PIPS[card.n].map(function (p) {
      return '<use href="#suit-' + card.suit + '" x="' + (p[0] - size / 2) + '" y="' + (p[1] - size / 2) + '" width="' + size + '" height="' + size + '"/>';
    }).join('');
    return '<svg class="f-pips" viewBox="0 0 100 140" aria-hidden="true">' + uses + '</svg>';
  }

  // The printed face of a card. Majors show their number and ruling glyph on a sun disc;
  // minors are drawn like playing cards, with an index, pips or a court panel, and a title.
  function faceHTML(c) {
    var card = D.CARD_BY_ID[c.id], cls, inner;
    if (card.arcana === 'major') {
      cls = 'face major';
      inner = '<span class="f-idx">' + E.roman(card.n) + '</span>' +
        '<span class="f-art"><span class="f-disc"><span class="f-glyph">' + card.glyph + '︎</span></span></span>';
    } else {
      cls = 'face minor suit-' + card.suit;
      var art = card.n <= 10 ? pipsSVG(card)
        : '<span class="f-court"><span class="f-court-rank">' + card.short + '</span>' + suitSVG(card.suit) + '</span>';
      inner = '<span class="f-idx">' + card.short + suitSVG(card.suit) + '</span><span class="f-art">' + art + '</span>';
    }
    return '<span class="' + cls + (c.rev ? ' is-rev' : '') + '">' + inner + '<span class="f-title">' + esc(card.name) + '</span></span>';
  }
  function staticCard(c) {
    return '<span class="pcard is-static" role="img" aria-label="' + esc(E.cardLabel(c)) + '"><span class="pc-side pc-front">' + faceHTML(c) + '</span></span>';
  }
  function moonLine(c) {
    var a = E.auspice(c);
    return moonSVG(a) + '<span class="kw-name">' + MOONS[a].name + '</span>';
  }
  function attunedTag(c, sign) {
    return E.isAttuned(c, sign) ? '<span class="plus" title="A card in your element shines one step brighter">+1 ' + D.SIGN_BY_ID[sign].element + '</span>' : '';
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    window.clearTimeout(ui.toastTimer);
    ui.toastTimer = window.setTimeout(function () { el.hidden = true; }, 3200);
  }
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  function show(view) {
    ['intro', 'play', 'reading'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
  }
  function toTop() { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } }

  /* ----------------------------- masthead ----------------------------- */

  function renderMasthead() {
    var p = today.split('-').map(Number);
    var nice = new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    $('dayline').textContent = game && game.mode === 'practice' && !game.done ? 'Practice hand · does not count toward today'
      : 'Day ' + E.dayNumber(today) + ' · ' + nice;
    var sign = store.sign && D.SIGN_BY_ID[store.sign];
    $('btn-sign').innerHTML = sign ? sym(sign.glyph) + esc(sign.name) : 'Choose sign';
  }

  /* -------------------------------- signs ----------------------------- */

  function signGridHTML() {
    return D.SIGNS.map(function (s) {
      return '<button type="button" class="sign" role="radio" aria-checked="' + (store.sign === s.id) + '" data-sign="' + s.id + '">' +
        sym(s.glyph) + '<span class="sign-name">' + s.name + '</span><span class="sign-dates">' + s.dates + '</span></button>';
    }).join('');
  }
  function signNoteHTML() {
    var s = store.sign && D.SIGN_BY_ID[store.sign];
    if (!s) return 'Your sign sets your deck, your own Major Arcana card, and the suit that shines brighter for you.';
    return '<b>' + s.name + '</b> is a ' + s.modality.toLowerCase() + ' ' + s.element.toLowerCase() + ' sign. Your card is <b>' +
      D.CARD_BY_ID[s.card].name + '</b>, and every <b>' + D.SUITS[s.suit].name + '</b> card shines one step brighter for you.';
  }
  function renderSigns() {
    $('intro-signs').innerHTML = signGridHTML();
    $('dlg-signs').innerHTML = signGridHTML();
    $('sign-note').innerHTML = signNoteHTML();
    $('dlg-sign-note').innerHTML = signNoteHTML();
    var s = store.sign && D.SIGN_BY_ID[store.sign];
    var deal = $('btn-deal');
    deal.disabled = !s;
    deal.textContent = s ? 'Deal today’s cards for ' + s.name : 'Choose a sign to deal';
    $('btn-practice-intro').disabled = !s;
    renderMasthead();
  }
  function setSign(id) {
    if (!D.SIGN_BY_ID[id]) return;
    var changed = store.sign !== id;
    store.sign = id;
    saveStore();
    renderSigns();
    var daily = store.daily && store.daily.date === today ? store.daily : null;
    if (changed && daily && daily.sign !== id) {
      toast('Today’s cards were dealt for ' + D.SIGN_BY_ID[daily.sign].name + '. ' + D.SIGN_BY_ID[id].name + ' starts with the next deal.');
    }
  }

  /* ------------------------------ game flow --------------------------- */

  function cur() { return game.rounds[game.round]; }
  function position() { return E.POSITIONS[game.round]; }
  function hydrate() {
    hands = E.dealHands(game.seedKey);
    questions = E.questionsFor(game);
  }
  function persist() {
    if (game.mode === 'daily') { store.daily = game; saveStore(); }
  }
  function todaysDaily() { return store.daily && store.daily.date === today ? store.daily : null; }

  function newGame(mode) {
    if (!store.sign) return;
    var seedKey = mode === 'daily' ? E.dailySeed(today, store.sign)
      : 'practice|' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    game = {
      v: 1, mode: mode, date: today, sign: store.sign, seedKey: seedKey,
      round: 0, phase: 'question', done: false,
      rounds: [0, 1, 2].map(function () { return { tries: [], solved: null, glimpses: 0, seen: [], pick: null }; })
    };
    hydrate();
    persist();
    showPlay(true);
    toTop();
  }
  function startDaily() {
    var d = todaysDaily();
    if (d) resume(d); else newGame('daily');
  }
  function resume(saved) {
    game = saved;
    hydrate();
    if (game.done) showReading(); else showPlay(false);
  }
  function showIntro() {
    game = null;
    renderSigns();
    show('intro');
  }

  function answer(i) {
    var r = cur(), q = questions[game.round];
    if (game.phase !== 'question' || r.tries.indexOf(i) !== -1) return;
    r.tries.push(i);
    if (i === q.answer) {
      r.solved = true;
      r.glimpses = E.glimpsesFor(r.tries.length);
      game.phase = 'answered';
    } else if (r.tries.length >= CFG.MAX_TRIES) {
      r.solved = false;
      r.glimpses = 0;
      game.phase = 'answered';
    }
    persist();
    renderPlay(true);
  }
  function afterAnswer() {
    if (game.phase !== 'answered') return;
    game.phase = cur().glimpses > 0 ? 'glimpse' : 'choose';
    persist();
    renderPlay(false);
  }
  function peek(i) {
    var r = cur();
    if (game.phase !== 'glimpse' || r.seen.indexOf(i) !== -1) return;
    r.seen.push(i);
    if (r.seen.length >= r.glimpses) game.phase = 'choose';
    persist();
    renderPlay(false);
  }
  function select(i) {
    if (game.phase !== 'choose') return;
    ui.selected = ui.selected === i ? null : i;
    renderPlay(true);
  }
  function keep() {
    if (game.phase !== 'choose' || ui.selected === null) return;
    cur().pick = ui.selected;
    ui.selected = null;
    game.phase = 'reveal';
    persist();
    renderPlay(true);
  }
  function nextRound() {
    if (game.phase !== 'reveal') return;
    if (game.round < CFG.ROUNDS - 1) {
      game.round++;
      game.phase = 'question';
      persist();
      showPlay(true);
      toTop();
    } else {
      finishGame();
    }
  }
  function finishGame() {
    game.done = true;
    persist();
    if (game.mode === 'daily' && !store.history.some(function (h) { return h.date === game.date; })) {
      var sum = E.summarize(game, hands);
      store.history.push({
        date: game.date, sign: game.sign, insight: sum.insight, tier: sum.score.tier,
        total: sum.score.total, pct: sum.standing.pct, sight: sum.sightCount
      });
      saveStore();
    }
    showReading();
    toTop();
  }

  /* ------------------------------ play view --------------------------- */

  function showPlay(deal) {
    ui.selected = null;
    show('play');
    renderMasthead();
    buildHand(deal);
    renderPlay(false);
  }

  function buildHand(deal) {
    var html = '';
    for (var i = 0; i < CFG.HAND_SIZE; i++) {
      html += '<div class="hand-slot"><button type="button" class="pcard" data-i="' + i + '" style="--i:' + i + '">' +
        '<span class="pc-flip"><span class="pc-side pc-back"></span><span class="pc-side pc-front"></span></span></button>' +
        '<span class="cap" data-cap="' + i + '"></span></div>';
    }
    var el = $('hand');
    el.innerHTML = html;
    el.classList.toggle('is-dealing', !!deal);
  }

  function renderPlay(focusPrimary) {
    renderSpread();
    renderReader();
    syncHand();
    renderSeen();
    if (focusPrimary) {
      var b = $('reader').querySelector('.btn.primary');
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
    }
  }

  function renderSpread() {
    $('spread').innerHTML = E.POSITIONS.map(function (p, i) {
      var r = game.rounds[i];
      var filled = r.pick !== null && (i < game.round || game.phase === 'reveal');
      var cls = 'slot' + (filled ? ' is-filled' : '') + (i === game.round && !filled ? ' is-current' : '');
      var body = filled ? staticCard(hands[i][r.pick]) : '<span class="slot-empty"></span>';
      var moon = filled ? moonSVG(E.auspice(hands[i][r.pick])) : '';
      return '<div class="' + cls + '">' + body + '<span class="slot-label">' + p.name + moon + '</span></div>';
    }).join('');
  }

  function eyebrowHTML() {
    var p = position();
    return '<p class="eyebrow">Hand ' + (game.round + 1) + ' of ' + CFG.ROUNDS + ' · the ' + p.name +
      '<span class="eyebrow-sub">' + p.blurb + '</span></p>';
  }
  function chipsHTML(total, used) {
    var out = '<span class="chips" aria-hidden="true">';
    for (var i = 0; i < total; i++) out += '<span class="chip' + (i < used ? ' is-spent' : '') + '">' + eyeSVG() + '</span>';
    return out + '</span>';
  }
  function questionHTML(locked) {
    var q = questions[game.round], r = cur();
    var opts = q.options.map(function (o, i) {
      var tried = r.tries.indexOf(i) !== -1, cls = 'opt', mark = '';
      if (tried && i === q.answer) { cls += ' is-right'; mark = 'Right'; }
      else if (tried) { cls += ' is-wrong'; mark = 'Not this one'; }
      else if (locked && i === q.answer) { cls += ' is-answer'; mark = 'The answer'; }
      return '<button type="button" class="' + cls + '" data-opt="' + i + '"' + (locked || tried ? ' disabled' : '') + '>' +
        '<span class="opt-key">' + 'ABCD'.charAt(i) + '</span><span class="opt-text">' + esc(o) + '</span>' +
        (mark ? '<span class="opt-mark">' + mark + '</span>' : '') + '</button>';
    }).join('');
    return '<h2 class="question">' + esc(q.q) + '</h2><div class="options">' + opts + '</div>';
  }
  var HOW_LINE = {
    sight: 'Chosen by sight: you knew what you were keeping.',
    gamble: 'A gamble: you passed on what you saw and trusted the deck.',
    fate: 'Left to fate: you chose without a glimpse.'
  };
  var NEXT_LABEL = ['Deal the Present', 'Deal the Future', 'Read my three cards'];

  function renderReader() {
    var r = cur(), q = questions[game.round], hand = hands[game.round], p = position();
    var html = '';
    if (game.phase === 'question') {
      html = eyebrowHTML() + questionHTML(false) +
        '<p class="hint">' + (r.tries.length ? 'Not that one. One more try, for one glimpse.'
          : 'Right first time earns two glimpses of this hand. A second try earns one.') + '</p>';
    } else if (game.phase === 'answered') {
      var head = r.solved ? (r.tries.length === 1 ? 'Right, first time.' : 'Right, on the second try.')
        : 'The answer was “' + esc(q.options[q.answer]) + '”.';
      var earned = r.glimpses === 2 ? 'You earned two glimpses of this hand.'
        : r.glimpses === 1 ? 'You earned one glimpse of this hand.'
        : 'No glimpses this hand, so this card is left to fate. Fate still finds the brightest card about one time in five.';
      html = eyebrowHTML() + questionHTML(true) +
        '<p class="why"><b>' + head + '</b> ' + esc(q.why) + '</p>' +
        '<p class="hint">' + (r.glimpses ? chipsHTML(r.glimpses, 0) : '') + '<span>' + earned + '</span></p>' +
        '<button type="button" class="btn primary" data-act="after-answer">' +
        (r.glimpses === 2 ? 'Use your glimpses' : r.glimpses === 1 ? 'Use your glimpse' : 'Choose a card') + '</button>';
    } else if (game.phase === 'glimpse') {
      var left = r.glimpses - r.seen.length;
      html = eyebrowHTML() + '<h2 class="prompt">Turn a card face up.</h2>' +
        '<p class="hint">' + chipsHTML(r.glimpses, r.seen.length) + '<span>' + (left === 1 ? 'One glimpse left.' : left + ' glimpses left.') +
        ' Tap any face-down card.</span></p>';
    } else if (game.phase === 'choose') {
      if (ui.selected === null) {
        html = eyebrowHTML() + '<h2 class="prompt">Keep one card for your ' + p.name + '.</h2>' +
          '<p class="hint"><span>' + (r.seen.length ? 'Any of the five, seen or unseen. Tap a card to pick it up.'
            : 'All five are face down. Go by feel, and tap a card to pick it up.') + '</span></p>';
      } else {
        var c = hand[ui.selected], seen = r.seen.indexOf(ui.selected) !== -1;
        html = eyebrowHTML() + (seen
          ? '<h2 class="prompt">' + esc(E.cardLabel(c)) + '</h2><p class="kw">' + moonLine(c) + attunedTag(c, game.sign) + '<span>' + esc(E.face(c).k) + '</span></p>'
          : '<h2 class="prompt">Card ' + (ui.selected + 1) + ', unseen</h2><p class="hint"><span>Keeping it leaves your ' + p.name + ' to the deck.</span></p>') +
          '<button type="button" class="btn primary" data-act="keep">Keep this card</button>';
      }
    } else if (game.phase === 'reveal') {
      var pc = hand[r.pick], a = E.auspice(pc);
      var brighter = hand.filter(function (x) { return E.auspice(x) > a; });
      var best = hand.slice().sort(function (x, y) { return E.auspice(y) - E.auspice(x); })[0];
      var rank = brighter.length === 0 ? 'Nothing in this hand was brighter.' : 'The brightest in this hand was ' + E.cardLabel(best) + '.';
      html = '<p class="eyebrow">Your ' + p.name + ' card<span class="eyebrow-sub">' + p.blurb + '</span></p>' +
        '<h2 class="prompt">' + esc(E.cardLabel(pc)) + '</h2>' +
        '<p class="kw">' + moonLine(pc) + attunedTag(pc, game.sign) + '<span>' + esc(E.face(pc).k) + '</span></p>' +
        '<p class="how">' + HOW_LINE[E.howChosen(r)] + ' ' + esc(rank) + '</p>' +
        '<button type="button" class="btn primary" data-act="next">' + NEXT_LABEL[game.round] + '</button>';
    }
    $('reader').innerHTML = html;
  }

  // Bring the five card buttons in line with the state, without rebuilding them (so flips animate).
  function syncHand() {
    var r = cur(), hand = hands[game.round], phase = game.phase;
    var el = $('hand');
    el.classList.toggle('is-reveal', phase === 'reveal');
    Array.prototype.forEach.call(el.querySelectorAll('.pcard'), function (btn, i) {
      var c = hand[i];
      var up = r.seen.indexOf(i) !== -1 || phase === 'reveal';
      var front = btn.querySelector('.pc-front');
      if (up && !front.firstChild) front.innerHTML = faceHTML(c);   // a face is only put in the page once it is revealed
      var live = (phase === 'glimpse' && !up) || phase === 'choose';
      btn.classList.toggle('is-up', up);
      btn.classList.toggle('is-live', live);
      btn.classList.toggle('is-selected', phase === 'choose' && ui.selected === i);
      btn.classList.toggle('is-picked', phase === 'reveal' && r.pick === i);
      btn.classList.toggle('is-dim', phase === 'reveal' && r.pick !== i);
      btn.disabled = !live;
      btn.setAttribute('aria-pressed', String(phase === 'choose' && ui.selected === i));
      btn.setAttribute('aria-label', 'Card ' + (i + 1) + ': ' + (up ? E.cardLabel(c) + ', ' + MOONS[E.auspice(c)].name : 'face down'));
      el.querySelector('[data-cap="' + i + '"]').innerHTML = up ? moonSVG(E.auspice(c)) + attunedTag(c, game.sign) : '';
    });
  }

  function renderSeen() {
    var r = cur(), hand = hands[game.round], reveal = game.phase === 'reveal';
    var idx = reveal ? [0, 1, 2, 3, 4] : r.seen.slice().sort();
    var wrap = $('seen-wrap');
    if (!idx.length) { wrap.hidden = true; $('seen').innerHTML = ''; return; }
    wrap.hidden = false;
    $('seen-h').textContent = reveal ? 'The whole hand' : 'What you have seen';
    $('seen').innerHTML = idx.map(function (i) {
      var c = hand[i], kept = reveal && r.pick === i, wasSeen = r.seen.indexOf(i) !== -1;
      return '<li class="seen-item' + (kept ? ' is-kept' : '') + '"><span class="seen-n">' + (i + 1) + '</span>' +
        '<span class="seen-main"><span class="seen-name">' + esc(E.cardLabel(c)) + '</span><span class="seen-kw">' + esc(E.face(c).k) + '</span></span>' +
        '<span class="seen-side">' + (kept ? '<span class="tag is-kept">Kept</span>' : '') +
        (reveal && wasSeen ? '<span class="tag">' + eyeSVG() + 'Seen</span>' : '') +
        attunedTag(c, game.sign) + moonSVG(E.auspice(c)) + '</span></li>';
    }).join('');
  }

  /* ----------------------------- reading view ------------------------- */

  var HOW_TAG = {
    sight: ['is-sight', 'Chosen by sight'],
    gamble: ['', 'A gamble on an unseen card'],
    fate: ['', 'Left to fate']
  };
  function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }

  function readingHTML(sum) {
    var sign = sum.sign;
    var modeLine = (sum.mode === 'daily' ? 'Day ' + sum.dayNo : 'Practice hand') + ' · ' + sym(sign.glyph) + ' ' + sign.name +
      (sum.mode === 'daily' ? '' : '<span class="eyebrow-sub">not your daily reading</span>');

    var trio = sum.positions.map(function (p) {
      var tag = HOW_TAG[p.how];
      return '<li class="trio-item"><div class="trio-card">' + staticCard(p.card) + '</div><div class="trio-copy">' +
        '<p class="eyebrow">' + p.position + '<span class="eyebrow-sub">' + p.blurb + '</span></p>' +
        '<h3 class="trio-name">' + esc(p.name) + '</h3>' +
        '<p class="trio-meta">' + (p.reversed ? 'Reversed' : 'Upright') + ' · ' + moonSVG(p.auspice) + MOONS[p.auspice].name + attunedTag(p.card, sign.id) + '</p>' +
        '<p class="trio-lead">' + esc(p.lead) + '</p><p>' + esc(p.text) + '</p>' +
        '<p class="trio-tag"><span class="tag ' + tag[0] + '">' + (p.how === 'sight' ? eyeSVG() : '') + tag[1] + '</span></p>' +
        '</div></li>';
    }).join('');

    var patterns = sum.score.patterns.map(function (p) {
      return '<li><p class="pat-head"><span>' + esc(p.title) + '</span>' +
        (p.poker ? '<span class="poker">' + esc(p.poker) + '</span>' : '') +
        (p.bonus ? '<span class="bonus">+' + p.bonus + '</span>' : '') + '</p><p>' + esc(p.text) + '</p></li>';
    }).join('');

    var pips = '';
    for (var i = 0; i < CFG.MAX_INSIGHT; i++) pips += '<span class="pip' + (i < sum.insight ? ' is-on' : '') + '"></span>';
    var scale = '';
    for (var t = 1; t <= 5; t++) scale += '<span class="' + (t === sum.score.tier ? 'is-here' : '') + '">' + moonSVG(t, E.TIERS[t].moon) + '</span>';

    var st = sum.standing;
    var standLine = st.isBest ? 'This was the brightest reading the deck held today.'
      : st.isWorst ? 'Every other path through this deck was at least as bright. That is the shuffle, and tomorrow brings a new one.'
      : 'Brighter than ' + st.pct + '% of the readings this deck could have dealt.';

    var rounds = sum.positions.map(function (p, idx) {
      var r = game.rounds[idx];
      var qLine = r.solved ? (r.tries.length === 1 ? 'Question right first time' : 'Question right on the second try') : 'Question not solved';
      var gLine = r.glimpses === 2 ? 'two glimpses' : r.glimpses === 1 ? 'one glimpse' : 'no glimpses';
      var rankLine = p.wasBrightest ? 'the brightest of its five' : ordinal(p.rankInHand) + ' brightest of its five';
      return '<li><span class="r-pos">' + p.position + '</span><span class="r-body">' +
        '<span class="r-card">' + esc(p.label) + moonSVG(p.auspice) + '</span>' +
        '<span class="r-line">' + qLine + ', ' + gLine + '. ' + HOW_TAG[p.how][1] + ', and ' + rankLine + '.</span></span></li>';
    }).join('');

    var maxCount = Math.max.apply(null, sum.odds.tierCounts);
    var odds = '';
    for (var k = 5; k >= 1; k--) {
      var n = sum.odds.tierCounts[k], yours = k === sum.score.tier;
      odds += '<div class="odds-row' + (yours ? ' is-yours' : '') + '" title="' + n + ' of ' + sum.odds.count + ' possible readings">' +
        '<span class="odds-label">' + moonSVG(k, E.TIERS[k].moon) + '<span class="odds-name">' + E.TIERS[k].moon + '</span></span>' +
        '<span class="odds-track"><span class="odds-bar" style="width:' + ((n / maxCount) * 100).toFixed(1) + '%"></span></span>' +
        '<span class="odds-n">' + n + (yours ? ' · yours' : '') + '</span></div>';
    }
    var sightLine = sum.sightCount === 3 ? 'You chose all three cards by sight.'
      : sum.sightCount === 0 ? 'All three of your cards were left to chance.'
      : sum.sightCount + ' of your three cards ' + (sum.sightCount === 1 ? 'was' : 'were') + ' chosen by sight, and the rest left to chance.';

    var daily = todaysDaily();
    var after = '<button type="button" class="btn primary" data-act="share">Copy result to share</button>';
    if (sum.mode === 'daily') after += '<button type="button" class="btn ghost" data-act="practice">Deal a practice hand</button>';
    else {
      after += '<button type="button" class="btn ghost" data-act="practice">Deal another practice hand</button>' +
        '<button type="button" class="btn ghost" data-act="daily">' + (daily && daily.done ? 'Back to today’s reading' : 'Go to today’s cards') + '</button>';
    }

    return '<header class="fortune"><div class="fortune-moon">' + moonSVG(sum.score.tier, sum.tier.moon) + '</div><div class="fortune-copy">' +
      '<p class="eyebrow">' + modeLine + '</p>' +
      '<h2 class="fortune-title">' + sum.tier.moon + '<span class="fortune-word">' + sum.tier.title + '</span></h2>' +
      '<p class="fortune-line">' + esc(sum.headline) + '</p></div></header>' +

      '<ol class="trio">' + trio + '</ol>' +

      '<section class="together"><h3 class="sec-h">Read together</h3><p>' + esc(sum.blend) + '</p>' +
      (patterns ? '<ul class="patterns">' + patterns + '</ul>' : '') +
      '<p><b>Quintessence.</b> ' + esc(sum.quintessence.text) + '</p>' +
      '<p class="closing">' + esc(sum.closing) + '</p></section>' +

      '<section class="fell"><h3 class="sec-h">How it fell: your part and the deck’s</h3>' +
      '<p class="verdict">' + esc(sum.verdict) + '</p>' +
      '<div class="meters">' +
      '<div class="meter"><p class="meter-k">Insight<span>your part</span></p>' +
      '<p class="meter-v">' + sum.insight + '<span class="of">/' + CFG.MAX_INSIGHT + '</span><span class="meter-title">' + sum.insightTitle + '</span></p>' +
      '<div class="pips" role="img" aria-label="' + sum.insight + ' of ' + CFG.MAX_INSIGHT + ' glimpses earned">' + pips + '</div>' +
      '<p class="meter-note">Glimpses you earned from the three questions. ' + sightLine + '</p></div>' +
      '<div class="meter"><p class="meter-k">Fortune<span>the deck’s part</span></p>' +
      '<p class="meter-v">' + sum.score.total + '<span class="of"> moons</span><span class="meter-title">' + sum.tier.title + '</span></p>' +
      '<div class="moonscale">' + scale + '</div>' +
      '<p class="meter-note">' + sum.score.base + ' from the cards' + (sum.score.bonus ? ', +' + sum.score.bonus + ' from patterns' : '') + '. ' + standLine + '</p></div>' +
      '</div>' +
      '<ul class="rounds">' + rounds + '</ul>' +
      '<div class="odds"><h4 class="mini-h">The ' + sum.odds.count + ' readings this deck could have dealt</h4>' + odds + '</div>' +
      '<p class="odds-note">Chosen blind, this deck gives a ' + sum.tier.moon + ' reading or brighter about ' + st.blindChance +
      '% of the time. Glimpses improve those odds. They never make them certain.</p></section>' +

      '<section class="after"><div class="after-row">' + after + '</div>' +
      '<textarea class="share-text" id="share-text" rows="6" readonly hidden aria-label="Your result, ready to copy"></textarea>' +
      '<p class="next" id="next-deck"></p></section>';
  }

  function showReading() {
    var sum = E.summarize(game, hands);
    $('view-reading').innerHTML = readingHTML(sum);
    show('reading');
    renderMasthead();
    tick();
  }

  function share() {
    var sum = E.summarize(game, hands);
    var inFrame = false;
    try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
    var url = SHARE_URL || (!inFrame && /^https?:$/.test(window.location.protocol) ? window.location.origin + window.location.pathname : '');
    var text = E.shareText(sum, url);
    var ta = $('share-text');
    ta.value = text;
    function fallback() {
      ta.hidden = false;
      ta.focus();
      ta.select();
      toast('Select the text and copy it.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied. Paste it anywhere.'); }, fallback);
    } else fallback();
  }

  /* -------------------------------- stats ----------------------------- */

  function streaks() {
    var days = store.history.map(function (h) { return E.dayNumber(h.date); }).sort(function (a, b) { return a - b; });
    var best = 0, run = 0, prev = null;
    days.forEach(function (d) {
      run = prev !== null && d === prev + 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    var todayNo = E.dayNumber(today), current = 0;
    if (days.length && todayNo - days[days.length - 1] <= 1) {
      current = 1;
      for (var i = days.length - 1; i > 0 && days[i] === days[i - 1] + 1; i--) current++;
    }
    return { current: current, best: best };
  }

  function renderStats() {
    var h = store.history, body = $('stats-body');
    if (!h.length) {
      body.innerHTML = '<p>No readings yet. Your first one is waiting on the table.</p>' +
        '<p class="meter-note">Once you have played, this page shows your streak, your average insight, and how your fortunes have fallen.</p>';
      return;
    }
    var s = streaks();
    var avg = h.reduce(function (a, x) { return a + x.insight; }, 0) / h.length;
    var counts = [0, 0, 0, 0, 0, 0];
    h.forEach(function (x) { counts[x.tier]++; });
    var max = Math.max.apply(null, counts);
    var lucky = h.filter(function (x) { return x.insight <= 2 && x.tier >= 4; }).length;
    var earned = h.filter(function (x) { return x.insight >= 4 && x.tier >= 4; }).length;
    var bars = '';
    for (var k = 5; k >= 1; k--) {
      bars += '<div class="odds-row" title="' + counts[k] + ' of ' + h.length + ' readings">' +
        '<span class="odds-label">' + moonSVG(k, E.TIERS[k].moon) + '<span class="odds-name">' + E.TIERS[k].moon + '</span></span>' +
        '<span class="odds-track"><span class="odds-bar" style="width:' + (max ? (counts[k] / max) * 100 : 0).toFixed(1) + '%"></span></span>' +
        '<span class="odds-n">' + counts[k] + '</span></div>';
    }
    body.innerHTML =
      '<div class="tiles">' +
      '<div class="tile"><span class="tile-v">' + h.length + '</span><span class="tile-k">readings</span></div>' +
      '<div class="tile"><span class="tile-v">' + s.current + '</span><span class="tile-k">day streak</span></div>' +
      '<div class="tile"><span class="tile-v">' + s.best + '</span><span class="tile-k">best streak</span></div>' +
      '<div class="tile"><span class="tile-v">' + avg.toFixed(1) + '</span><span class="tile-k">average insight, of ' + CFG.MAX_INSIGHT + '</span></div>' +
      '</div>' +
      '<h3 class="mini-h">How your fortunes have fallen</h3><div class="odds">' + bars + '</div>' +
      '<p class="meter-note"><b>' + lucky + '</b> lucky ' + (lucky === 1 ? 'break' : 'breaks') + ': bright readings on two glimpses or fewer. ' +
      '<b>' + earned + '</b> earned: bright readings on four glimpses or more.</p>';
  }

  /* -------------------------------- clock ----------------------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var el = $('next-deck');
    var now = new Date();
    var rolled = !dateOverride && E.dateStr(now) !== today;
    if (rolled && !$('view-intro').hidden) { startDay(); return; }
    if (!el) return;
    if (rolled) {
      if (!el.querySelector('button')) el.innerHTML = '<button type="button" class="btn primary" data-act="new-day">A new deck is ready. Go to today</button>';
      return;
    }
    var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var s = Math.max(0, Math.floor((next - now) / 1000));
    el.innerHTML = 'The next deck is dealt in <b>' + pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60) + '</b>. One reading a day: the cards have spoken.';
  }

  function startDay() {
    if (!dateOverride) today = E.dateStr();
    var d = todaysDaily();
    if (d) resume(d); else showIntro();
    renderMasthead();
  }

  /* -------------------------------- wiring ---------------------------- */

  function onSignClick(e) {
    var b = e.target.closest('[data-sign]');
    if (!b) return;
    setSign(b.getAttribute('data-sign'));
    if ($('dlg-sign').open) closeDialog($('dlg-sign'));
  }

  function wire() {
    $('intro-signs').addEventListener('click', onSignClick);
    $('dlg-signs').addEventListener('click', onSignClick);
    $('btn-deal').addEventListener('click', startDaily);
    $('btn-practice-intro').addEventListener('click', function () { newGame('practice'); });

    $('btn-sign').addEventListener('click', function () { renderSigns(); openDialog($('dlg-sign')); });
    $('btn-help').addEventListener('click', function () { openDialog($('dlg-help')); });
    $('btn-stats').addEventListener('click', function () { renderStats(); openDialog($('dlg-stats')); });
    Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
      });
    });

    $('reader').addEventListener('click', function (e) {
      var opt = e.target.closest('[data-opt]');
      if (opt && !opt.disabled) { answer(Number(opt.getAttribute('data-opt'))); return; }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'after-answer') afterAnswer();
      else if (a === 'keep') keep();
      else if (a === 'next') nextRound();
    });
    $('hand').addEventListener('click', function (e) {
      var btn = e.target.closest('.pcard');
      if (!btn || btn.disabled) return;
      var i = Number(btn.getAttribute('data-i'));
      if (game.phase === 'glimpse') peek(i);
      else if (game.phase === 'choose') select(i);
    });
    $('view-reading').addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'share') share();
      else if (a === 'practice') newGame('practice');
      else if (a === 'daily') { var d = todaysDaily(); if (d) { resume(d); toTop(); } else { showIntro(); toTop(); } }
      else if (a === 'new-day') { startDay(); toTop(); }
    });
  }

  function renderLegend() {
    var html = '';
    for (var k = 5; k >= 1; k--) html += '<div class="legend-row">' + moonSVG(k) + '<b>' + MOONS[k].name + '</b><span>' + MOONS[k].word + '</span></div>';
    $('moon-legend').innerHTML = html;
  }

  function boot() {
    wire();
    renderLegend();
    renderSigns();
    var d = todaysDaily();
    if (d) resume(d); else showIntro();
    window.setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
