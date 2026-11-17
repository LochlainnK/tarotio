/*
 * Tarotio UI: draws the table, records what the player does, saves progress, and animates it.
 * All rules live in engine.js. This file never decides what a card is worth or where it is.
 *
 * Game state (saved to localStorage after every action so a refresh cannot undo anything):
 *   game = {
 *     v: 4, mode: 'daily' | 'practice', date, sign, seedKey,
 *     round: 0-2, phase: 'turn' | 'decide' | 'reveal', done,
 *     chips: chips in hand right now (won by reading hands true, less passes),
 *     rounds: [{ turned: [cardIndex, in the order turned], pick: cardIndex|null, forced: bool,
 *                marks: [cardIndex the player has ruled out] }]
 *   }
 * A turned card that is not the pick has been passed (burned). Marks are the player's own
 * pencil marks and never affect the rules.
 */
(function () {
  'use strict';

  var E = window.TarotioEngine, D = window.TarotioCards;
  var MOONS = D.MOONS, CFG = E.CONFIG;

  var STORE_KEY = 'tarotio.v1';
  var GAME_VERSION = 4;
  // Set this to the public address after launch so shared results link back to the game.
  var SHARE_URL = '';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // Every animation is skipped when the player asks for reduced motion.
  var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var raf = window.requestAnimationFrame || function (f) { return window.setTimeout(f, 16); };

  /* ------------------------------ storage ----------------------------- */

  var PHASES = ['turn', 'decide', 'reveal'];
  var MAX_CHIPS = (CFG.ROUNDS - 1) * CFG.CHIPS_PER_READ;

  // A saved game is only resumed if every field is in range. Anything else is dropped and the day starts clean.
  function validGame(g) {
    try {
      if (!g || g.v !== GAME_VERSION || (g.mode !== 'daily' && g.mode !== 'practice')) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date) || !D.SIGN_BY_ID[g.sign] || typeof g.seedKey !== 'string') return false;
      if (!(g.round >= 0 && g.round < CFG.ROUNDS) || PHASES.indexOf(g.phase) === -1) return false;
      if (!Number.isInteger(g.chips) || g.chips < 0 || g.chips > MAX_CHIPS) return false;
      if (!Array.isArray(g.rounds) || g.rounds.length !== CFG.ROUNDS) return false;
      var inHand = function (x) { return Number.isInteger(x) && x >= 0 && x < CFG.HAND_SIZE; };
      var distinct = function (a) { return a.every(function (x, k) { return a.indexOf(x) === k; }); };
      return g.rounds.every(function (r, i) {
        if (!r || !Array.isArray(r.turned) || !Array.isArray(r.marks)) return false;
        if (!r.turned.every(inHand) || !distinct(r.turned) || !r.marks.every(inHand) || !distinct(r.marks)) return false;
        var finished = i < g.round || g.done || (i === g.round && g.phase === 'reveal');
        if (finished) return r.turned.length > 0 && r.pick === r.turned[r.turned.length - 1];
        if (r.pick !== null) return false;
        if (i > g.round) return r.turned.length === 0;
        return g.phase === 'decide' ? r.turned.length > 0 : true;
      });
    } catch (e) { return false; }
  }

  function loadStore() {
    var blank = { v: 1, sign: null, daily: null, history: [] };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return blank;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return blank;
      if (s.sign && !D.SIGN_BY_ID[s.sign]) s.sign = null;
      s.history = (Array.isArray(s.history) ? s.history : []).filter(function (h) {
        return h && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.tier >= 1 && h.tier <= 5 && h.insight >= 0 && h.insight <= CFG.MAX_INSIGHT;
      });
      if (s.daily && !validGame(s.daily)) s.daily = null;
      return s;
    } catch (e) { return blank; }
  }
  function saveStore() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode: play still works */ }
  }

  var store = loadStore();
  var game = null, hands = null, puzzles = null;
  // Things that live only on screen: the card picked up, the omen lit, the numbers last shown (so changes can animate).
  var ui = { selected: null, omen: null, tally: 0, chips: null, toastTimer: null };

  // QA helper: index.html?date=2026-12-25 plays that day's deck.
  var dateOverride = (function () {
    var m = /[?&]date=(\d{4}-\d{2}-\d{2})\b/.exec(window.location.search || '');
    return m ? m[1] : null;
  })();
  var today = dateOverride || E.dateStr();

  /* ----------------------------- small parts -------------------------- */

  // A moon lit by fraction f (0 new, 1 full). Used both for the five phases and for the waxing animation.
  function moonPath(f) {
    if (f <= 0) return '';
    if (f >= 1) return 'M12 3A9 9 0 0 1 12 21A9 9 0 0 1 12 3Z';
    var rx = (9 * Math.abs(1 - 2 * f)).toFixed(2);
    return 'M12 3A9 9 0 0 1 12 21A' + rx + ' 9 0 0 ' + (f < 0.5 ? 0 : 1) + ' 12 3Z';
  }
  var PHASE = [0, 0, 0.25, 0.5, 0.75, 1];
  function moonSVG(level, label) {
    return '<svg class="moon" viewBox="0 0 24 24" role="img" aria-label="' + esc(label || MOONS[level].name) + '">' +
      '<circle class="m-dark" cx="12" cy="12" r="9"/><path class="m-lit" d="' + moonPath(PHASE[level]) + '"/><circle class="m-ring" cx="12" cy="12" r="9"/></svg>';
  }
  function icon(id) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function suitSVG(suit) { return icon('suit-' + suit); }
  function auraSVG(aura) { return aura === 'major' ? icon('i-star') : suitSVG(aura); }
  function auraName(aura) { return aura === 'major' ? 'Major' : D.SUITS[aura].name; }
  function sym(glyph) { return '<span class="sym" aria-hidden="true">' + glyph + '︎</span>'; }
  function chipsHTML(n) {
    var out = '<span class="chips" aria-hidden="true">';
    for (var i = 0; i < n; i++) out += '<span class="chip"></span>';
    return out + '</span>';
  }

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
  // The back of a card: its suit mark shows, its face never does.
  function backHTML(c) {
    var a = E.aura(c);
    return '<span class="aura aura-' + a + '">' + auraSVG(a) + '</span>';
  }
  function staticCard(c) {
    return '<span class="pcard is-static" role="img" aria-label="' + esc(E.cardLabel(c)) + '"><span class="pc-side pc-front">' + faceHTML(c) + '</span></span>';
  }
  // A card that starts face down and turns over when it gets the class is-up (used on the result screen).
  function turningCard(c, i) {
    return '<span class="pcard is-show" style="--i:' + i + '" role="img" aria-label="' + esc(E.cardLabel(c)) + '"><span class="pc-flip">' +
      '<span class="pc-side pc-back">' + backHTML(c) + '</span><span class="pc-side pc-front">' + faceHTML(c) + '</span></span></span>';
  }
  function moonLine(c) {
    var a = E.auspice(c);
    return moonSVG(a) + '<span class="kw-name">' + MOONS[a].name + '</span><span class="scale">' + a + '/5</span>';
  }
  function attunedTag(c, sign) {
    return E.isAttuned(c, sign) ? '<span class="plus">+' + E.attunedBonus(D.SIGN_BY_ID[sign].suit) + ' ' + D.SIGN_BY_ID[sign].element + '</span>' : '';
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
    $('table').classList.toggle('is-wide', view === 'play');   // the table gets a second column on wide screens
  }
  function toTop() { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } }
  function focusOn(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
  function reveal(el) {
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ } }
  }
  // Put the top of the table at the top of a short screen, so the hand and the omens are visible together.
  function frameTable() {
    var el = $('view-play');
    if (!el.scrollIntoView) return;
    try { el.scrollIntoView({ block: window.innerHeight < 900 ? 'start' : 'nearest', behavior: calm ? 'auto' : 'smooth' }); } catch (e) { /* older browsers */ }
  }
  // Restart a CSS animation on an element by toggling its class.
  function replay(el, cls) {
    if (!el || calm) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

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
      D.CARD_BY_ID[s.card].name + '</b>, and every <b>' + D.SUITS[s.suit].name + '</b> card shines ' +
      (E.attunedBonus(s.suit) === 1 ? 'one step' : 'two steps') + ' brighter for you.';
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
    var daily = todaysDaily();
    if (changed && daily && daily.sign !== id) {
      toast('Today’s cards were dealt for ' + D.SIGN_BY_ID[daily.sign].name + '. ' + D.SIGN_BY_ID[id].name + ' starts with the next deal.');
    }
  }

  /* ------------------------------ game flow --------------------------- */

  function cur() { return game.rounds[game.round]; }
  function position() { return E.POSITIONS[game.round]; }
  function hand() { return hands[game.round]; }
  function puzzle() { return puzzles[game.round]; }
  function upIndex() { var r = cur(); return game.phase === 'decide' ? r.turned[r.turned.length - 1] : null; }
  function keptSoFar() {
    var out = [];
    for (var i = 0; i < game.round; i++) out.push(hands[i][game.rounds[i].pick]);
    return out;
  }
  function spreadTotal() {
    var kept = keptSoFar();
    if (game.phase === 'reveal') kept = kept.concat([hand()[cur().pick]]);
    return kept.length ? E.scoreSpread(kept, game.sign).total : 0;
  }
  function canPass() { var r = cur(); return game.chips >= CFG.PASS_PRICE && r.turned.length < CFG.HAND_SIZE; }

  function hydrate() {
    hands = E.dealHands(game.seedKey, game.sign);
    puzzles = E.omensFor(game, hands);
  }
  // Chips in hand follow from what has been played: won by reading hands true, spent on passes.
  function chipsNow() {
    var passes = 0;
    game.rounds.forEach(function (r, i) {
      if (i > game.round) return;
      // every turned card was passed, except the one kept and the one face up awaiting a decision
      var waiting = r.pick !== null || (i === game.round && game.phase === 'decide') ? 1 : 0;
      passes += Math.max(0, r.turned.length - waiting);
    });
    return E.chipsWon(game.rounds, hands) - passes * CFG.PASS_PRICE;
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
      v: GAME_VERSION, mode: mode, date: today, sign: store.sign, seedKey: seedKey,
      round: 0, phase: 'turn', done: false, chips: 0,
      rounds: [0, 1, 2].map(function () { return { turned: [], pick: null, forced: false, marks: [] }; })
    };
    hydrate();
    persist();
    ui.tally = 0;
    ui.chips = 0;
    showPlay(true);
    frameTable();
  }
  function startDaily() {
    var d = todaysDaily();
    if (d) resume(d); else newGame('daily');
  }
  function resume(saved) {
    game = saved;
    hydrate();
    game.chips = Math.max(0, chipsNow());
    if (game.done) { showReading(false); return; }
    ui.tally = spreadTotal();
    ui.chips = game.chips;
    showPlay(false);
  }
  function showIntro() {
    game = null;
    renderSigns();
    show('intro');
  }

  // Pick a card up. Picking up the card already in hand turns it over.
  function select(i) {
    var r = cur();
    if (game.phase !== 'turn' || r.turned.indexOf(i) !== -1) return;
    if (ui.selected === i) { turn(i); return; }
    ui.selected = i;
    renderPlay(true);
  }
  // Turn a card over.
  //   The brightest card: found, and kept at once. Found on the first turn, it wins a chip.
  //   Any other card, with a chip in hand: the player decides to keep it or pass.
  //   Any other card, with no chip: it is theirs.
  function turn(i) {
    var r = cur();
    if (game.phase !== 'turn' || r.turned.indexOf(i) !== -1) return;
    r.turned.push(i);
    ui.selected = null;
    if (i === puzzle().top) endHand(false);
    else if (canPass()) {
      game.phase = 'decide';
      persist();
      renderPlay(true);
    } else endHand(true);
  }
  function keep() {
    if (game.phase !== 'decide') return;
    endHand(false);
  }
  // The last card turned is kept, and the hand is over.
  function endHand(forced) {
    var r = cur();
    r.pick = r.turned[r.turned.length - 1];
    r.forced = forced;
    game.phase = 'reveal';
    game.chips = chipsNow();
    persist();
    renderPlay(true);
    flyKept();
  }
  // Pay a chip, burn the card, turn another.
  function pass() {
    if (game.phase !== 'decide' || !canPass()) return;
    game.chips -= CFG.PASS_PRICE;
    game.phase = 'turn';
    persist();
    renderPlay(false);
    focusOn($('hand').querySelector('.pcard:not(:disabled)'));
  }
  // The player's own pencil mark: rule a card out, or bring it back.
  function toggleMark(i) {
    var r = cur();
    if (game.phase === 'reveal' || r.turned.indexOf(i) !== -1) return;
    var at = r.marks.indexOf(i);
    if (at === -1) r.marks.push(i); else r.marks.splice(at, 1);
    persist();
    syncHand();
  }
  // Light up the cards an omen speaks of.
  function lightOmen(k) {
    ui.omen = ui.omen === k ? null : k;
    renderOmens();
    renderHud();
    syncHand();
  }
  function nextRound() {
    if (game.phase !== 'reveal') return;
    if (game.round < CFG.ROUNDS - 1) {
      game.round++;
      game.phase = 'turn';
      persist();
      showPlay(true);
      frameTable();
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
        total: sum.score.total, pct: sum.standing.pct, passes: sum.passes, finds: sum.firstFinds
      });
      saveStore();
    }
    showReading(true);
    toTop();
  }

  /* ------------------------------ play view --------------------------- */

  function showPlay(deal) {
    ui.selected = null;
    ui.omen = null;
    show('play');
    renderMasthead();
    buildHand(deal);
    renderPlay(false);
  }

  function buildHand(deal) {
    var h = hand(), html = '';
    for (var i = 0; i < CFG.HAND_SIZE; i++) {
      html += '<div class="hand-slot"><button type="button" class="pcard' + (E.isAttuned(h[i], game.sign) ? ' is-yours' : '') + '" data-i="' + i + '" style="--i:' + i + '">' +
        '<span class="pc-flip"><span class="pc-side pc-back">' + backHTML(h[i]) + '</span><span class="pc-side pc-front"></span></span></button>' +
        '<span class="cap" data-cap="' + i + '"></span></div>';
    }
    var el = $('hand');
    el.innerHTML = html;
    el.classList.toggle('is-dealing', !!deal && !calm);
    // When a saved hand is put back on the table, cards already turned must simply be there, not flip again.
    el.classList.toggle('is-instant', !deal);
    if (!deal) raf(function () { raf(function () { el.classList.remove('is-instant'); }); });
  }

  // If the control the player was on has gone (the panel was redrawn), put focus on the next thing to do.
  function restoreFocus() {
    var a = document.activeElement;
    if (a && a !== document.body && document.body.contains(a) && !a.disabled) return;
    focusOn($('reader').querySelector('.btn.primary') || $('hand').querySelector('.pcard:not(:disabled)'));
  }

  function renderPlay(focusPrimary) {
    renderSpread();
    renderHud();
    renderOmens();
    renderReader();
    syncHand();
    renderSeen();
    var primary = $('reader').querySelector('.btn.primary');
    if (focusPrimary && primary) { focusOn(primary); reveal(primary); }
    else restoreFocus();
  }

  // The spread so far: three places, and the running count of moons against the tiers.
  function renderSpread() {
    $('spread').innerHTML = E.POSITIONS.map(function (p, i) {
      var r = game.rounds[i];
      var filled = r.pick !== null && (i < game.round || game.phase === 'reveal');
      var cls = 'slot' + (filled ? ' is-filled' : '') + (i === game.round && !filled ? ' is-current' : '');
      var body = filled ? staticCard(hands[i][r.pick]) : '<span class="slot-empty"></span>';
      var moon = filled ? moonSVG(E.auspice(hands[i][r.pick])) : '';
      return '<div class="' + cls + '">' + body + '<span class="slot-label">' + p.name + moon + '</span></div>';
    }).join('');

    var total = spreadTotal(), from = ui.tally;
    var marks = [3, 4, 5].map(function (t) {
      return '<span class="tally-mark' + (total >= E.TIERS[t].min ? ' is-reached' : '') + '">' + moonSVG(t, E.TIERS[t].moon) + E.TIERS[t].min + '</span>';
    }).join('');
    $('tally').innerHTML = '<span class="tally-now"><b class="tally-n">' + (calm ? total : from) + '</b> moons so far</span>' +
      '<span class="tally-goals" title="Moons needed for a Half, Gibbous and Full Moon reading">' + marks + '</span>';
    ui.tally = total;
    if (!calm && from !== total) countUp($('tally').querySelector('.tally-n'), from, total, 900);
  }
  // Count a number up once the kept card has landed in its place.
  function countUp(el, from, to, delay) {
    window.setTimeout(function () {
      var start = null;
      el.classList.add('is-counting');
      (function step(ts) {
        if (!document.body.contains(el)) return;
        if (start === null) start = ts || 0;
        var t = Math.min(1, ((ts || 0) - start) / 500);
        el.textContent = Math.round(from + (to - from) * t);
        if (t < 1) raf(step); else el.classList.remove('is-counting');
      })(window.performance && window.performance.now ? window.performance.now() : 0);
    }, delay);
  }

  // Above the hand: the moons this hand holds (not which card is which), and the chips in hand.
  function boardHTML() {
    var lit = ui.omen !== null ? puzzle().omens[ui.omen].moons.slice() : [];
    return E.handBoard(hand(), cur().turned, cur().pick, upIndex()).map(function (e) {
      var at = lit.indexOf(e.a), on = at !== -1;
      if (on) lit.splice(at, 1);
      return '<span class="bm is-' + e.state + (on ? ' is-focus' : '') + '">' +
        moonSVG(e.a, MOONS[e.a].name + (e.state === 'down' ? ', still face down' : ', ' + e.state)) + '</span>';
    }).join('');
  }
  function renderHud() {
    var was = ui.chips === null ? game.chips : ui.chips;
    $('hud').innerHTML =
      '<div class="hud-part"><span class="hud-k"><span class="hud-wide">This hand </span>holds</span><span class="board">' + boardHTML() + '</span></div>' +
      '<div class="hud-part hud-chips"><span class="hud-k">Chips</span>' + chipsHTML(game.chips ? 1 : 0) +
      '<b class="hud-n" aria-label="' + plural(game.chips, 'chip', 'chips') + ' in hand">' + game.chips + '</b>' +
      (was !== game.chips && !calm ? '<span class="float ' + (game.chips > was ? 'is-gain' : 'is-spend') + '" aria-hidden="true">' +
        (game.chips > was ? '+' : '−') + Math.abs(game.chips - was) + '</span>' : '') + '</div>';
    if (was !== game.chips) replay($('hud').querySelector('.hud-n'), 'is-bump');
    ui.chips = game.chips;
  }

  function eyebrowHTML() {
    var p = position();
    return '<p class="eyebrow">Hand ' + (game.round + 1) + ' of ' + CFG.ROUNDS + ' · the ' + p.name +
      '<span class="eyebrow-sub">' + p.blurb + '</span></p>';
  }

  // The puzzle: the reader's omens for this hand. Once the hand is over, each shows what it narrowed things to.
  function renderOmens() {
    var pz = puzzle(), r = cur(), over = game.phase === 'reveal';
    var items = pz.omens.map(function (o, k) {
      var left = over ? '<span class="omen-left">' + (pz.steps[k].length === 1 ? 'leaves only card ' : 'leaves cards ') +
        pz.steps[k].map(function (x) { return x + 1; }).join(', ') + '</span>' : '';
      return '<li><button type="button" class="omen' + (ui.omen === k ? ' is-on' : '') + '" data-omen="' + k + '" aria-pressed="' + (ui.omen === k) + '">' +
        '<span class="omen-n">' + (k + 1) + '</span><span class="omen-t">' + esc(o.text) + left + '</span></button></li>';
    }).join('');
    var foot = over ? ''
      : game.round === 0 && !r.turned.length
        ? '<p class="hint"><span>Every omen is true, and together they leave one card. Read all three hands true and the Full Moon is yours. Tap an omen to light the cards it speaks of; tap a label under a card to rule it out.</span></p>'
        : '';
    $('omens').innerHTML = eyebrowHTML() + '<h2 class="omens-h">Find the brightest card</h2><ol class="omen-list">' + items + '</ol>' + foot;
  }

  function howLine(r) {
    var how = E.howKept(r), n = r.turned.length - 1;
    if (how === 'first') return 'Kept on the first turn, with a chip still in hand.';
    if (how === 'fate') return 'With no chip to pass, the first card turned was yours.';
    if (how === 'dug') return 'Found after ' + plural(n, 'pass', 'passes') + ', and kept by choice.';
    return r.turned.length === CFG.HAND_SIZE ? 'The last card in the hand, after ' + plural(n, 'pass', 'passes') + '.'
      : 'After ' + plural(n, 'pass', 'passes') + ' the chips ran out, so this card stayed.';
  }
  var NEXT_LABEL = ['Deal the Present', 'Deal the Future', 'Read my three cards'];

  function renderReader() {
    var r = cur(), h = hand(), p = position(), sign = D.SIGN_BY_ID[game.sign];
    var html = '';
    if (game.phase === 'turn') {
      var passed = r.turned.length;
      if (ui.selected === null) {
        var line;
        if (passed) {
          line = game.chips > 0 ? 'You hold ' + plural(game.chips, 'chip', 'chips') + '. The brightest card is still face down.'
            : 'That was your last chip, so the next card you turn is the one you keep.';
        } else if (game.chips > 0) {
          line = 'Tap a card to pick it up. You hold ' + plural(game.chips, 'chip', 'chips') + ': if your first turn is not the brightest card, you can spend one to try again.';
        } else {
          line = 'Tap a card to pick it up. With no chips, the card you turn is the card you keep.' +
            (game.round < CFG.ROUNDS - 1 ? ' Read this hand true and you win a chip for the hands ahead.' : '') +
            (game.round === 0 ? ' ' + D.SUITS[sign.suit].name + ' are your suit, worth +' + E.attunedBonus(sign.suit) + ' each.' : '');
        }
        html = '<h2 class="prompt">' + (passed ? 'Turn another card.' : 'Which card will you turn?') + '</h2>' +
          '<p class="hint"><span>' + line + '</span></p>';
      } else {
        var sc = h[ui.selected], a = E.aura(sc);
        html = '<h2 class="prompt">Card ' + (ui.selected + 1) + ', ' + (a === 'major' ? 'Major Arcana' : D.SUITS[a].name) + '</h2>' +
          '<p class="hint"><span>' + (game.chips > 0 ? 'Turn it. If it is not the brightest card, you can keep it or spend a chip to try again.'
            : 'You have no chips, so if you turn it, it is yours.') +
          (r.marks.indexOf(ui.selected) !== -1 ? ' You had ruled this one out.' : '') + '</span></p>' +
          '<div class="choice"><button type="button" class="btn primary" data-act="turn">Turn it over</button></div>';
      }
    } else if (game.phase === 'decide') {
      var c = h[upIndex()];
      var pre = E.keepPreview(keptSoFar(), c, game.sign, CFG.ROUNDS - 1 - game.round);
      var notes = pre.notes.map(function (n) {
        return '<li><span class="bonus">+' + n.bonus + '</span>' + esc(n.title) + (n.poker ? ' <span class="poker">' + esc(n.poker) + '</span>' : '') + '</li>';
      }).join('') + pre.hopes.map(function (t) { return '<li class="hope">' + esc(t) + '</li>'; }).join('');
      var left = h.length - r.turned.length, mine = E.auspice(c), brighter = 0, dimmer = 0;
      h.forEach(function (x, i) {
        if (r.turned.indexOf(i) !== -1) return;
        if (E.auspice(x) > mine) brighter++; else if (E.auspice(x) < mine) dimmer++;
      });
      var same = left - brighter - dimmer;
      var risk = 'Of the ' + left + ' still face down, ' +
        (brighter ? plural(brighter, 'is', 'are') + ' brighter' : 'none is brighter') + ', ' +
        (dimmer ? plural(dimmer, 'is', 'are') + ' dimmer' : 'none is dimmer') +
        (same ? ' and ' + plural(same, 'is', 'are') + ' the same' : '') + '.';
      html = '<p class="eyebrow">Not the brightest card<span class="eyebrow-sub">the brightest is still face down</span></p>' +
        '<h2 class="prompt">' + esc(E.cardLabel(c)) + '</h2>' +
        '<p class="kw">' + moonLine(c) + '<span>' + esc(E.face(c).k) + '</span></p>' +
        (notes ? '<ul class="notes">' + notes + '</ul>' : '') +
        '<p class="outcome">Keep it and your spread comes to <b>' + plural(pre.total, 'moon', 'moons') + '</b>' +
        (pre.last ? ': a <b>' + E.TIERS[pre.tier].moon + '</b> reading.' : '.') + '</p>' +
        '<div class="choice">' +
        '<button type="button" class="btn primary" data-act="keep">Keep this card</button>' +
        '<button type="button" class="btn ghost" data-act="pass">Pass ' + chipsHTML(CFG.PASS_PRICE) + '<span class="pass-cost">1 chip</span></button>' +
        '</div>' +
        '<p class="hint"><span>A pass burns this card for good. ' + risk +
        (game.round < CFG.ROUNDS - 1 && game.chips === 1 ? ' It is your only chip, and ' + plural(CFG.ROUNDS - 1 - game.round, 'hand is', 'hands are') + ' still to come.' : '') + '</span></p>';
    } else if (game.phase === 'reveal') {
      var pc = h[r.pick], top = puzzle().top, points = E.handInsight(r, h);
      var more = game.round < CFG.ROUNDS - 1;
      var read = r.turned[0] === top ? 'You read the omens true: your first turn was the brightest card in the hand.' +
          (more ? ' The reader gives you a chip for the hands ahead.' : '')
        : r.pick === top ? 'You found the brightest card in the hand, ' + plural(r.turned.length - 1, 'pass', 'passes') + ' in.'
        : 'The omens pointed to card ' + (top + 1) + ', ' + E.cardLabel(h[top]) + '. ' + howLine(r);
      html = '<p class="eyebrow">Your ' + p.name + ' card<span class="eyebrow-sub">' + p.blurb + '</span></p>' +
        '<h2 class="prompt">' + esc(E.cardLabel(pc)) + '</h2>' +
        '<p class="kw">' + moonLine(pc) + attunedTag(pc, game.sign) + '<span>' + esc(E.face(pc).k) + '</span></p>' +
        '<p class="how">' + esc(read) + '</p>' +
        '<p class="insight-won"><span class="pips" aria-hidden="true">' + pipsHTML(points, CFG.INSIGHT_FIRST_TURN) + '</span>' +
        '<span>' + (points ? '+' + points + ' insight' : 'No insight from this hand') + '</span></p>' +
        '<div class="choice"><button type="button" class="btn primary" data-act="next">' + NEXT_LABEL[game.round] + '</button></div>';
    }
    var el = $('reader');
    el.innerHTML = html;
    if (el.getAttribute('data-phase') !== game.phase + ':' + r.turned.length) {
      el.setAttribute('data-phase', game.phase + ':' + r.turned.length);
      replay(el, 'is-fresh');
    }
  }
  function pipsHTML(on, of) {
    var out = '';
    for (var i = 0; i < of; i++) out += '<span class="pip' + (i < on ? ' is-on' : '') + '"></span>';
    return out;
  }

  // Bring the five card buttons in line with the state, without rebuilding them (so flips animate).
  function syncHand() {
    var r = cur(), h = hand(), phase = game.phase, up = upIndex();
    var lit = ui.omen !== null ? puzzle().omens[ui.omen].focus : [];
    var el = $('hand');
    el.classList.toggle('is-reveal', phase === 'reveal');
    Array.prototype.forEach.call(el.querySelectorAll('.pcard'), function (btn, i) {
      var c = h[i], aura = E.aura(c);
      var turned = r.turned.indexOf(i) !== -1;
      var faceUp = turned || phase === 'reveal';
      var front = btn.querySelector('.pc-front');
      if (faceUp && !front.firstChild) front.innerHTML = faceHTML(c);   // a face is only put in the page once it is turned
      var burned = turned && i !== r.pick && i !== up;
      var live = phase === 'turn' && !turned;
      var ruled = !faceUp && r.marks.indexOf(i) !== -1;
      btn.classList.toggle('is-up', faceUp);
      btn.classList.toggle('is-live', live);
      btn.classList.toggle('is-selected', i === up || (live && ui.selected === i));
      btn.classList.toggle('is-picked', phase === 'reveal' && r.pick === i);
      btn.classList.toggle('is-burned', burned);
      btn.classList.toggle('is-dim', phase === 'reveal' && !turned);
      btn.classList.toggle('is-full', turned && !burned && E.auspice(c) === 5);
      btn.classList.toggle('is-ruled', ruled);
      btn.classList.toggle('is-focus', lit.indexOf(i) !== -1 && phase !== 'reveal');
      btn.disabled = !live;
      btn.setAttribute('aria-pressed', String(live && ui.selected === i));
      var yours = E.isAttuned(c, game.sign);
      btn.setAttribute('aria-label', 'Card ' + (i + 1) + ': ' + (faceUp
        ? E.cardLabel(c) + ', ' + MOONS[E.auspice(c)].name + (burned ? ', passed' : '')
        : 'face down, ' + auraName(aura) + (yours ? ', your element' : '') + (ruled ? ', ruled out' : '')));
      // Under a face-down card: its suit, as a button that rules the card out. Under a face-up card: its moon.
      el.querySelector('[data-cap="' + i + '"]').innerHTML = faceUp
        ? moonSVG(E.auspice(c)) + (burned ? '<span class="cap-note">passed</span>' : attunedTag(c, game.sign))
        : '<button type="button" class="cap-btn" data-mark="' + i + '" aria-pressed="' + ruled + '" aria-label="' +
          (ruled ? 'Bring back card ' : 'Rule out card ') + (i + 1) + '"><span class="cap-suit">' + auraName(aura) + '</span>' +
          (yours ? '<span class="plus">+' + E.attunedBonus(aura) + '</span>' : '') + '</button>';
    });
  }

  function renderSeen() {
    var r = cur(), h = hand(), wrap = $('seen-wrap');
    if (game.phase !== 'reveal') { wrap.hidden = true; $('seen').innerHTML = ''; return; }
    wrap.hidden = false;
    var top = puzzle().top;
    $('seen').innerHTML = h.map(function (c, i) {
      var kept = r.pick === i, turned = r.turned.indexOf(i) !== -1;
      var tag = (kept ? '<span class="tag is-kept">Kept</span>' : turned ? '<span class="tag">Passed</span>' : '') +
        (i === top ? '<span class="tag is-top">Brightest</span>' : '');
      return '<li class="seen-item' + (kept ? ' is-kept' : '') + '"><span class="seen-n">' + (i + 1) + '</span>' +
        '<span class="seen-main"><span class="seen-name">' + esc(E.cardLabel(c)) + '</span><span class="seen-kw">' + esc(E.face(c).k) + '</span></span>' +
        '<span class="seen-side">' + tag + attunedTag(c, game.sign) + moonSVG(E.auspice(c)) + '</span></li>';
    }).join('');
  }

  // The kept card leaves the hand and lands in its place in the spread.
  function flyKept() {
    if (calm) return;
    var r = cur();
    var from = $('hand').querySelector('.pcard[data-i="' + r.pick + '"]');
    var slot = $('spread').children[game.round];
    var target = slot && slot.querySelector('.pcard');
    if (!from || !target || !target.animate) return;
    var a = from.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    var sx = window.pageXOffset || 0, sy = window.pageYOffset || 0;
    var ghost = target.cloneNode(true);
    ghost.className = 'pcard is-static ghost';
    ghost.style.cssText = 'left:' + (a.left + sx) + 'px;top:' + (a.top + sy) + 'px;width:' + a.width + 'px;height:' + a.height + 'px;';
    document.body.appendChild(ghost);
    target.style.visibility = 'hidden';
    var dx = b.left - a.left, dy = b.top - a.top, k = b.width / a.width;
    var ended = false;
    function land() {
      if (ended) return;
      ended = true;
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      target.style.visibility = '';
      replay(slot, 'is-landed');
    }
    var anim = ghost.animate([
      { transform: 'translate(0, 0) scale(1)', offset: 0 },
      { transform: 'translate(' + (dx * 0.45) + 'px,' + (dy * 0.45 - 26) + 'px) scale(' + ((1 + k) / 2 + 0.08) + ')', offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')', offset: 1 }
    ], { duration: 620, delay: 380, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)', fill: 'backwards' });
    anim.onfinish = land;
    anim.oncancel = land;
    window.setTimeout(land, 1500);   // in case the animation is interrupted
  }

  /* ----------------------------- reading view ------------------------- */

  function barWidth(n, max) { return n && max ? Math.max(1.5, (n / max) * 100).toFixed(1) : '0'; }
  function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }
  function howTag(p) {
    if (p.how === 'first') return 'Kept on the first turn';
    if (p.how === 'fate') return 'Left to fate';
    if (p.how === 'dug') return 'Found after ' + plural(p.passes, 'pass', 'passes');
    return 'Last turn after ' + plural(p.passes, 'pass', 'passes');
  }
  // Every card turned in a hand, as moons. Passed cards are struck through; the kept one is ringed.
  function pathHTML(p) {
    return '<span class="path" role="img" aria-label="Cards turned: ' + p.path.map(function (t) {
      return MOONS[t.auspice].name + (t.kept ? ' kept' : ' passed');
    }).join(', ') + '">' + p.path.map(function (t) {
      return '<span class="bm ' + (t.kept ? 'is-kept' : 'is-passed') + '">' + moonSVG(t.auspice) + '</span>';
    }).join('') + '</span>';
  }

  function readingHTML(sum, lively) {
    var sign = sum.sign, st = sum.standing;
    var modeLine = (sum.mode === 'daily' ? 'Day ' + sum.dayNo : 'Practice hand') + ' · ' + sym(sign.glyph) + ' ' + sign.name +
      (sum.mode === 'daily' ? '' : '<span class="eyebrow-sub">not your daily reading</span>');

    var facts = '<li><b>' + sum.insight + '/' + CFG.MAX_INSIGHT + '</b> insight</li>' +
      '<li>' + (st.isBest ? '<b>Brightest</b> reading in the deck' : 'Brighter than <b>' + st.pct + '%</b> of the deck') + '</li>' +
      (sum.firstFinds === CFG.ROUNDS ? '<li class="is-perfect"><b>Perfect reading</b>: all three hands read true</li>'
        : '<li><b>' + sum.firstFinds + ' of 3</b> hands read true</li>');
    if (sum.mode === 'daily') {
      var streak = streaks().current;
      if (streak > 1) facts += '<li><b>' + streak + '</b> day streak</li>';
    }

    var trio = sum.positions.map(function (p, i) {
      return '<li class="trio-item" style="--i:' + i + '"><div class="trio-card">' + (lively ? turningCard(p.card, i) : staticCard(p.card)) + '</div><div class="trio-copy">' +
        '<p class="eyebrow">' + p.position + '<span class="eyebrow-sub">' + p.blurb + '</span></p>' +
        '<h3 class="trio-name">' + esc(p.name) + '</h3>' +
        '<p class="trio-meta">' + (p.reversed ? 'Reversed' : 'Upright') + ' · ' + moonSVG(p.auspice) + MOONS[p.auspice].name + ' ' + p.auspice + '/5' + attunedTag(p.card, sign.id) + '</p>' +
        '<p class="trio-lead">' + esc(p.lead) + '</p><p>' + esc(p.text) + '</p>' +
        '<p class="trio-tag">' + pathHTML(p) + '<span class="tag' + (p.foundFirst ? ' is-sight' : '') + '">' + (p.foundFirst ? 'Omens read true' : howTag(p)) + '</span></p>' +
        '</div></li>';
    }).join('');

    var patterns = sum.score.patterns.map(function (p) {
      return '<li><p class="pat-head"><span>' + esc(p.title) + '</span>' +
        (p.poker ? '<span class="poker">' + esc(p.poker) + '</span>' : '') +
        (p.bonus ? '<span class="bonus">+' + p.bonus + '</span>' : '') + '</p><p>' + esc(p.text) + '</p></li>';
    }).join('');
    var quint = sum.quintessence;

    var scale = '';
    for (var t = 1; t <= 5; t++) scale += '<span class="' + (t === sum.score.tier ? 'is-here' : '') + '">' + moonSVG(t, E.TIERS[t].moon) + '</span>';

    var standLine = st.isBest ? 'This was the brightest reading the deck held today.'
      : st.isWorst ? 'Every other path through this deck was at least as bright. That is the shuffle, and tomorrow brings a new one.'
      : 'Brighter than ' + st.pct + '% of the readings this deck could have dealt.';

    // Hand by hand: what the player did, and how the omens fitted together.
    var rounds = sum.positions.map(function (p) {
      var rankLine = p.wasBrightest ? 'the brightest of its five' : ordinal(p.rankInHand) + ' brightest of its five';
      var read = p.foundFirst ? 'Omens read true on the first turn'
        : p.found ? 'Brightest card found after passing'
        : 'The omens pointed to card ' + (p.top + 1);
      var steps = p.omens.map(function (o) {
        return '<li>' + esc(o.text) + ' <span class="omen-left">' + (o.left.length === 1 ? 'leaves only card ' : 'leaves cards ') +
          o.left.map(function (x) { return x + 1; }).join(', ') + '</span></li>';
      }).join('');
      return '<li><span class="r-pos">' + p.position + '</span><span class="r-body">' +
        '<span class="r-card">' + esc(p.label) + pathHTML(p) + '<span class="pips" aria-hidden="true">' + pipsHTML(p.insight, CFG.INSIGHT_FIRST_TURN) + '</span></span>' +
        '<span class="r-line">' + read + ' (+' + p.insight + ' insight). ' + howTag(p) + ', and ' + rankLine + '.</span>' +
        '<details class="recap"><summary>How the omens fitted</summary><ol>' + steps + '</ol></details></span></li>';
    }).join('');

    var maxCount = Math.max.apply(null, sum.odds.tierCounts);
    var odds = '';
    for (var k = 5; k >= 1; k--) {
      var n = sum.odds.tierCounts[k], yours = k === sum.score.tier;
      odds += '<div class="odds-row' + (yours ? ' is-yours' : '') + '" title="' + n + ' of ' + sum.odds.count + ' possible readings">' +
        '<span class="odds-label">' + moonSVG(k, E.TIERS[k].moon) + '<span class="odds-name">' + E.TIERS[k].moon + '</span></span>' +
        '<span class="odds-track"><span class="odds-bar" style="width:' + barWidth(n, maxCount) + '%"></span></span>' +
        '<span class="odds-n">' + n + (yours ? ' · yours' : '') + '</span></div>';
    }

    var lift = sum.passes ? '<div class="lift"><div class="lift-side"><span class="mini-h">First turns alone</span>' +
      '<span class="lift-v">' + moonSVG(sum.firstScore.tier, E.TIERS[sum.firstScore.tier].moon) + '<b>' + sum.firstScore.total + '</b> moons</span></div>' +
      '<span class="lift-arrow" aria-hidden="true">→</span>' +
      '<div class="lift-side"><span class="mini-h">After your passes</span>' +
      '<span class="lift-v">' + moonSVG(sum.score.tier, sum.tier.moon) + '<b>' + sum.score.total + '</b> moons</span></div>' +
      '<span class="lift-arrow" aria-hidden="true">·</span>' +
      '<div class="lift-side"><span class="mini-h">The deck’s best</span>' +
      '<span class="lift-v">' + moonSVG(sum.ceiling.tier, E.TIERS[sum.ceiling.tier].moon) + '<b>' + sum.ceiling.total + '</b> moons</span></div></div>'
      : '<div class="lift"><div class="lift-side"><span class="mini-h">Your reading</span>' +
      '<span class="lift-v">' + moonSVG(sum.score.tier, sum.tier.moon) + '<b>' + sum.score.total + '</b> moons</span></div>' +
      '<span class="lift-arrow" aria-hidden="true">·</span>' +
      '<div class="lift-side"><span class="mini-h">The deck’s best</span>' +
      '<span class="lift-v">' + moonSVG(sum.ceiling.tier, E.TIERS[sum.ceiling.tier].moon) + '<b>' + sum.ceiling.total + '</b> moons</span></div></div>';

    var daily = todaysDaily();
    var after = '<button type="button" class="btn primary" data-act="share">Copy result to share</button>';
    if (sum.mode === 'daily') after += '<button type="button" class="btn ghost" data-act="practice">Deal a practice hand</button>';
    else {
      after += '<button type="button" class="btn ghost" data-act="practice">Deal another practice hand</button>' +
        '<button type="button" class="btn ghost" data-act="daily">' + (daily && daily.done ? 'Back to today’s reading' : 'Go to today’s cards') + '</button>';
    }

    return '<header class="fortune"><div class="fortune-moon" id="fortune-moon">' + moonSVG(lively ? 1 : sum.score.tier, sum.tier.moon) + '</div><div class="fortune-copy">' +
      '<p class="eyebrow">' + modeLine + '</p>' +
      '<h2 class="fortune-title">' + sum.tier.moon + '<span class="fortune-word">' + sum.tier.title + '</span></h2>' +
      '<p class="fortune-line">' + esc(sum.headline) + '</p>' +
      '<p class="fortune-arc">' + esc(sum.arc) + '</p></div></header>' +
      '<ul class="facts">' + facts + '</ul>' +

      '<ol class="trio">' + trio + '</ol>' +

      '<section class="together"><h3 class="sec-h">Read together</h3>' + (sum.blend ? '<p>' + esc(sum.blend) + '</p>' : '') +
      (patterns ? '<ul class="patterns">' + patterns + '</ul>' : '') +
      '<div class="quint"><div class="quint-card">' + staticCard({ id: quint.card.id, rev: false }) + '</div>' +
      '<p><b>Quintessence: ' + esc(quint.card.name) + '.</b> ' + esc(quint.text) + '</p></div>' +
      '<p class="closing">' + esc(sum.closing) + '</p></section>' +

      '<section class="fell"><h3 class="sec-h">How it fell: your part and the deck’s</h3>' +
      '<p class="verdict">' + esc(sum.verdict) + '</p>' +
      '<p>' + esc(sum.readLine) + '</p>' +
      lift +
      '<p>' + esc(sum.ceilingLine) + (sum.passes ? ' ' + esc(sum.liftLine) : '') + '</p>' +
      '<div class="meters">' +
      '<div class="meter"><p class="meter-k">Insight<span>your part</span></p>' +
      '<p class="meter-v">' + sum.insight + '<span class="of">/' + CFG.MAX_INSIGHT + '</span><span class="meter-title">' + sum.insightTitle + '</span></p>' +
      '<div class="pips" role="img" aria-label="' + sum.insight + ' of ' + CFG.MAX_INSIGHT + ' insight">' + pipsHTML(sum.insight, CFG.MAX_INSIGHT) + '</div>' +
      '<p class="meter-note">How well you read the omens: two for each hand where your first turn was the brightest card, one where you found it after passing.</p></div>' +
      '<div class="meter"><p class="meter-k">Fortune<span>the deck’s part</span></p>' +
      '<p class="meter-v">' + sum.score.total + '<span class="of"> moons</span><span class="meter-title">' + sum.tier.title + '</span></p>' +
      '<div class="moonscale">' + scale + '</div>' +
      '<p class="meter-note">' + sum.score.base + ' from the cards' + (sum.score.bonus ? ', +' + sum.score.bonus + ' from patterns' : '') + '. ' + standLine + '</p></div>' +
      '</div>' +
      '<ul class="rounds">' + rounds + '</ul>' +
      '<div class="odds"><h4 class="mini-h">The ' + sum.odds.count + ' readings this deck could have dealt</h4>' + odds + '</div>' +
      '<p class="odds-note">Picking one card blind from each hand, this deck gives a ' + sum.tier.moon + ' reading or brighter about ' + st.blindChance +
      '% of the time. Reading the omens changes those odds. It cannot change what was dealt.</p></section>' +

      '<section class="after"><div class="after-row">' + after + '</div>' +
      '<textarea class="share-text" id="share-text" rows="8" readonly hidden aria-label="Your result, ready to copy"></textarea>' +
      '<p class="next" id="next-deck"></p></section>';
  }

  // lively = the player has just finished: the moon waxes to its phase and the three cards turn over in order.
  function showReading(lively) {
    lively = !!lively && !calm;
    var sum = E.summarize(game, hands);
    var view = $('view-reading');
    view.innerHTML = readingHTML(sum, lively);
    view.classList.toggle('is-lively', lively);
    show('reading');
    renderMasthead();
    tick();
    if (lively) playReading(view, sum);
  }
  function playReading(view, sum) {
    // 1. the moon waxes from new to the phase of the reading
    var lit = view.querySelector('#fortune-moon .m-lit'), target = PHASE[sum.score.tier], start = null;
    if (lit && target > 0) {
      (function step(ts) {
        if (!document.body.contains(lit)) return;
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / 1300), eased = 1 - Math.pow(1 - t, 3);
        lit.setAttribute('d', moonPath(target * eased));
        if (t < 1) raf(step);
      })(window.performance.now());
    }
    // 2. the three cards turn over, one after another
    Array.prototype.forEach.call(view.querySelectorAll('.trio .pcard.is-show'), function (card, i) {
      window.setTimeout(function () { card.classList.add('is-up'); }, 700 + i * 420);
    });
    // 3. a Full Moon reading scatters a few stars
    if (sum.score.tier === 5) {
      var holder = view.querySelector('#fortune-moon'), stars = '';
      for (var i = 0; i < 12; i++) {
        var angle = (i / 12) * Math.PI * 2 + 0.3, dist = 46 + (i % 3) * 16;
        stars += '<span class="spark" style="--x:' + Math.round(Math.cos(angle) * dist) + 'px;--y:' + Math.round(Math.sin(angle) * dist) + 'px;--d:' + (1250 + (i % 4) * 90) + 'ms">' + icon('i-star') + '</span>';
      }
      holder.insertAdjacentHTML('beforeend', stars);
    }
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
        '<span class="odds-track"><span class="odds-bar" style="width:' + barWidth(counts[k], max) + '%"></span></span>' +
        '<span class="odds-n">' + counts[k] + '</span></div>';
    }
    var recent = h.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-14);
    var recentHTML = recent.map(function (x) {
      var d = x.date.split('-').map(Number);
      var label = new Date(d[0], d[1] - 1, d[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      return '<li title="' + label + ': ' + E.TIERS[x.tier].moon + ', insight ' + x.insight + ' of ' + CFG.MAX_INSIGHT + '">' +
        moonSVG(x.tier, label + ', ' + E.TIERS[x.tier].moon) + '<span>' + x.insight + '</span></li>';
    }).join('');
    body.innerHTML =
      '<div class="tiles">' +
      '<div class="tile"><span class="tile-v">' + h.length + '</span><span class="tile-k">readings</span></div>' +
      '<div class="tile"><span class="tile-v">' + s.current + '</span><span class="tile-k">day streak</span></div>' +
      '<div class="tile"><span class="tile-v">' + s.best + '</span><span class="tile-k">best streak</span></div>' +
      '<div class="tile"><span class="tile-v">' + avg.toFixed(1) + '</span><span class="tile-k">average insight, of ' + CFG.MAX_INSIGHT + '</span></div>' +
      '</div>' +
      '<h3 class="mini-h">Your last ' + (recent.length === 1 ? 'reading' : recent.length + ' readings') + '</h3><ol class="recent">' + recentHTML + '</ol>' +
      '<h3 class="mini-h">How your fortunes have fallen</h3><div class="odds">' + bars + '</div>' +
      '<p class="meter-note"><b>' + lucky + '</b> lucky ' + (lucky === 1 ? 'break' : 'breaks') + ': bright readings on two insight or less. ' +
      '<b>' + earned + '</b> earned: bright readings on four insight or more. The number under each moon is that day’s insight.</p>';
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
    replay(b, 'is-chosen');
    if ($('dlg-sign').open) closeDialog($('dlg-sign'));
  }

  // 1-5 pick up a card (the same key again turns it). Shift+1-5 rules a card out. K keeps, P passes.
  function onKey(e) {
    if (!game || game.done || e.ctrlKey || e.metaKey || e.altKey || $('view-play').hidden) return;
    if (document.querySelector('dialog[open]')) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code || '');
    var key = String(e.key || '').toLowerCase();
    if (game.phase === 'turn' && digit) {
      e.preventDefault();
      if (e.shiftKey) toggleMark(Number(digit[1]) - 1); else select(Number(digit[1]) - 1);
    } else if (game.phase === 'decide' && (key === 'k' || key === 'p')) {
      e.preventDefault();
      if (key === 'k') keep(); else pass();
    }
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
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'turn' && ui.selected !== null) turn(ui.selected);
      else if (a === 'keep') keep();
      else if (a === 'pass') pass();
      else if (a === 'next') nextRound();
    });
    $('omens').addEventListener('click', function (e) {
      var o = e.target.closest('[data-omen]');
      if (o) lightOmen(Number(o.getAttribute('data-omen')));
    });
    $('hand').addEventListener('click', function (e) {
      var mark = e.target.closest('[data-mark]');
      if (mark) { toggleMark(Number(mark.getAttribute('data-mark'))); return; }
      var btn = e.target.closest('.pcard');
      if (!btn || btn.disabled) return;
      select(Number(btn.getAttribute('data-i')));
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
    document.addEventListener('keydown', onKey);
  }

  function renderLegend() {
    var html = '';
    for (var k = 5; k >= 1; k--) html += '<div class="legend-row">' + moonSVG(k) + '<b>' + MOONS[k].name + '</b><span>' + MOONS[k].word + '</span></div>';
    $('moon-legend').innerHTML = html;
    $('suit-legend').innerHTML = D.SUIT_ORDER.map(function (s) {
      return '<div class="legend-row"><span class="aura aura-' + s + ' is-inline">' + suitSVG(s) + '</span><b>' + D.SUITS[s].name + '</b><span>' +
        D.SUITS[s].element + ': ' + D.SUITS[s].domain + '</span></div>';
    }).join('') + '<div class="legend-row"><span class="aura aura-major is-inline">' + icon('i-star') + '</span><b>Major Arcana</b><span>the 22 named cards: big themes, wide swings</span></div>';
  }

  function boot() {
    wire();
    renderLegend();
    renderSigns();
    var d = todaysDaily();
    try {
      if (d) resume(d); else showIntro();
    } catch (err) {
      // A save this version cannot read: drop today's game and start clean. Sign and history are kept.
      store.daily = null;
      saveStore();
      showIntro();
    }
    window.setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
