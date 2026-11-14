# Tarotio implementation guide

This file is written for an AI coding agent (or a developer) who will take the working
prototype in this repository and ship it as a real, public daily game. Read all of it
before changing anything. Follow the tasks in section 9 in order.

If an instruction here conflicts with something you would normally do, follow this file.
If something is not covered, ask the project owner instead of guessing.

---

## 1. What Tarotio is

Tarotio is a daily web game, in the family of Wordle: one puzzle per day, about two
minutes to play, a spoiler-free result to share, a streak to keep.

The player picks their star sign. Each day a 78-card tarot deck is shuffled for that sign
and deals **three hands of five cards, face down**. The player keeps **one card from each
hand**. Those three cards are their **Past, Present and Future**, and the game reads them
together as the player's fortune for the day.

Before each hand the player answers a tarot or astrology question. A right answer earns
**glimpses**: each glimpse turns one face-down card face up before the player chooses.
So knowledge improves the odds, but most of every hand stays face down, and the deck was
shuffled before the player sat down.

The result screen always shows two separate things:

- **Insight** (0 to 6): what the player earned. This is skill.
- **Fortune** (New Moon to Full Moon): how bright the three kept cards are. This is mostly the deck.

It also shows all 125 readings that day's deck could have dealt, and where the player's
reading stands among them. A player who answered nothing and still drew a Full Moon can
see plainly that it was luck. A player who answered everything and drew a New Moon can
see plainly that it was the shuffle and not them.

**Current state:** everything above works today, fully in the browser, with no server and
no build step. Open `index.html` and play. Your job is to launch it, not to redesign it.

---

## 2. Rules you must not break

These are the product. Every change you make is checked against them.

1. **Never put the player down.** There is no losing, no "wrong", no "bad luck", no
   "unlucky", no "fail". A low result is a "deep" or "gentle" day that asks something of
   the player. Hard cards (The Tower, Ten of Swords) are written as honest and survivable.
   `tests/engine.test.js` has a banned-word test. Keep it passing and extend it when you add text.
2. **Keep skill and luck visibly separate.** Insight and Fortune are never merged into one
   score. The result screen must always show: the Insight meter, the Fortune meter, how
   each card was chosen (by sight, a gamble, or left to fate), and the chart of the 125
   possible readings.
3. **Luck must stay real in both directions.** A player with zero glimpses must sometimes
   reach Full Moon. A perfect player must sometimes land low. Section 7 has the target numbers.
4. **Stay rooted in real tarot.** Card meanings follow the Rider-Waite-Smith tradition.
   Sign-to-card links are the Golden Dawn attributions. Do not invent meanings, and do not
   add cards, suits or signs. Reversals, suit emphasis, repeated numbers and the
   quintessence card are all techniques real readers use; keep them accurate.
5. **Same day and same sign means the same deck, for everyone, on every device.** All
   randomness comes from the seeded generator in `js/engine.js`. Never call `Math.random()`
   for anything that affects a daily game.
6. **One daily reading per day.** Progress is saved after every action so a refresh cannot
   re-roll a question or a pick. Practice hands are separate and never touch stats or streaks.
7. **Sharing is spoiler-free.** The share text uses emoji only and never names a card,
   because everyone with the same sign has the same deck.
8. **The game works with no network after load, no account, and no tracking by default.**

---

## 3. Files

| File | What it holds | Change it when |
|---|---|---|
| `index.html` | Page structure, the three views (intro, play, reading), dialogs, the SVG icon sprite | Adding meta tags, a favicon, new static copy |
| `styles.css` | All styling. Colours are tokens on `:root`, with a night theme (default) and a day theme | Visual changes only |
| `js/cards.js` | The 78 cards (keywords, fortune text, brightness for upright and reversed), the 4 suits, the 12 signs | Editing card or sign text |
| `js/trivia.js` | Hand-written lore questions | Adding questions |
| `js/engine.js` | Every rule: seeding, the deal, questions, scoring, patterns, odds, reading text, share text. No DOM | Changing rules or reading templates |
| `js/app.js` | The UI: renders views, records actions, saves to `localStorage` | Changing interaction or layout logic |
| `tests/engine.test.js` | Rule and content tests | Whenever you change the three data or engine files |
| `tools/simulate.js` | Balance simulation | Run after any change to numbers |
| `tools/bundle.js` | Builds `dist/tarotio.html`, the whole game in one file | Run when a host needs a single file |

Scripts load in this order and each depends on the one before: `cards.js`, `trivia.js`,
`engine.js`, `app.js`. They are plain scripts, not ES modules, so the page also works when
opened straight from disk. `cards.js`, `trivia.js` and `engine.js` also load in Node for tests.

Commands (Node 18 or newer, no packages to install):

```bash
npm test
```

```bash
npm run simulate
```

```bash
npm run bundle
```

```bash
npm start
```

`npm start` serves the folder at `http://localhost:8080`.

---

## 4. The game rules, exactly

### 4.1 Setup

- The player's sign is stored in `localStorage`. It decides three things: the deck
  (the seed), the sign's own Major Arcana card, and the suit that matches the sign's element.
- Day 1 is `CONFIG.EPOCH` in `js/engine.js`. The day rolls over at the player's local midnight.
- Daily seed key: `"<YYYY-MM-DD>|<signId>"`, for example `"2026-11-14|leo"`.
- Practice seed key: `"practice|<random>"`.

### 4.2 The deal (`dealHands`)

1. Shuffle all 78 card ids with the seeded generator.
2. Take the first 15. Each lands reversed with probability `REVERSED_CHANCE` (0.3).
3. Split into three hands of five: Past, Present, Future.
4. A hand is "fair" if it has at least one card of brightness 4 or 5 and at least one of
   brightness 1 or 2. If any hand is unfair, reshuffle with the next attempt number
   (still deterministic) and try again.

### 4.3 One round (repeated three times)

| Phase | What happens |
|---|---|
| `question` | Four-option question. Easy for the Past, medium for the Present, hard for the Future. |
| `answered` | Right on the first try: **2 glimpses**. Wrong first, right second: **1 glimpse**. Wrong twice: **0 glimpses**. The explanation is shown either way. |
| `glimpse` | Each glimpse turns one face-down card face up, showing its name, keywords and brightness. |
| `choose` | The player picks any of the five cards, seen or unseen, then confirms with "Keep this card". |
| `reveal` | All five cards turn face up so the player sees what else was there. |

How a card was chosen (`howChosen`) is recorded as one of:

- `sight`: the kept card had been glimpsed first.
- `gamble`: the player had glimpsed other cards and kept an unseen one.
- `fate`: the player had no glimpses.

### 4.4 Brightness

Every card face has a brightness (`a`, "auspice") from 1 to 5, shown as a moon phase:

| Value | Moon | Typical cards |
|---|---|---|
| 5 | Full Moon | The Sun, The Star, Ten of Cups, Ace of anything, upright |
| 4 | Gibbous Moon | The Chariot upright, The Devil reversed, Ten of Swords reversed |
| 3 | Half Moon | The Hermit upright, The Tower reversed |
| 2 | Crescent Moon | Most reversed cards, Death, The Moon upright |
| 1 | New Moon | The Tower, The Devil, Three, Nine and Ten of Swords, Five of Cups, Five of Pentacles, upright |

The hardest cards get brighter when reversed. That is traditional, and it is what makes
knowing the cards a real skill.

### 4.5 Scoring a reading (`scoreSpread`)

`total = brightness of the three kept cards + pattern bonuses`

| Pattern | Card-table nickname | Bonus |
|---|---|---|
| A kept card is in the suit of your sign's element ("attuned") | | +1 per card |
| Your sign's own Major Arcana card is kept | the wild card | +2 |
| All three cards share a suit ("Trine") | a flush | +2 |
| All three are Major Arcana ("Fate's Hand") | three of a kind | +2 |
| Two cards share a number ("Echo") | a pair | +1 |
| Three cards share a number | three of a kind | +3 |
| Three consecutive numbers ("The Stair") | a straight | +2 |

Card numbers: Major Arcana use their own number (0 to 21). Ace is 1, Page 11, Knight 12,
Queen 13, King 14.

| Total | Tier | Name shown |
|---|---|---|
| 15 or more | 5 | Full Moon, Blessed |
| 13 to 14 | 4 | Gibbous Moon, Favoured |
| 10 to 12 | 3 | Half Moon, Steady |
| 8 to 9 | 2 | Crescent Moon, Gentle |
| 7 or less | 1 | New Moon, Deep |

### 4.6 Insight

Insight is the number of glimpses earned across the three rounds, 0 to 6. Titles:
Wanderer, Seeker, Apprentice, Reader, Keen Eye, Seer, Oracle. Every title is respectful.

### 4.7 The odds (`deckOdds`, `standing`)

One card from each of three hands of five gives 5 x 5 x 5 = 125 possible readings. The
engine scores all 125 and reports how many fall in each tier, what share of them the
player's reading beats, and the chance that a blind draw reaches the player's tier or
higher. This is the honest measure of luck. Do not replace it with an estimate.

### 4.8 Questions (`questionsFor`)

Three pools, one per difficulty tier. Lore questions come from `js/trivia.js`; the rest
are generated from the card and sign data, so they teach the same meanings the readings use.

| Tier | Asked for | Pool today | Made of |
|---|---|---|---|
| 1 | Past | 52 | lore, "which element is this sign", "which Major Arcana card means these keywords" |
| 2 | Present | 110 | lore, "which card belongs to this sign", keywords to a Minor card, upright meaning of a Major |
| 3 | Future | 172 | lore, reversed meanings, Major Arcana numbers, upright meaning of a Minor |

For day number `d`, each pool is shuffled by a seed for its cycle and the game walks
through it one question a day. A question cannot repeat until its whole pool has been
used. Questions depend on the date only, so every sign gets the same three questions.

### 4.9 The reading text (`summarize`)

Each reading is assembled from:

- a headline for the tier (4 variants per tier),
- for each position, a lead sentence built from the card's keywords (3 variants per
  position) plus that card face's own fortune text (156 unique texts: 78 cards x 2 orientations),
- a line about which element leads the spread,
- every pattern found,
- the quintessence card: add the three card numbers, reduce the digits until the total
  is 22 or less, and read the Major Arcana card with that number (22 is The Fool),
- a closing line for the sign and tier,
- a verdict on skill and luck (3 insight bands x 3 fortune bands x 2 variants).

Variants are picked with a generator seeded by the seed key and the picks, so the same
reading always shows the same words.

There are 78 x 77 x 76 x 8 = 3,651,648 different three-card spreads once position and
orientation are counted, and each reads differently for each of the 12 signs.

---

## 5. Data formats

### Card (`js/cards.js`)

```js
{ id: 'sun', name: 'The Sun', arcana: 'major', suit: null, n: 19, glyph: '☉', link: 'the Sun',
  up:  { a: 5, k: 'joy, vitality, success', t: 'Whatever you touch warms up today. ...' },
  rev: { a: 3, k: 'muted joy, a late sunrise, optimism finding its feet', t: '...' } }
```

- `k` is **exactly three** keywords, comma-separated, written as noun phrases. They are
  dropped into sentences such as "You came into today carrying {k}", so "a heavy load"
  works and "feeling tired" does not.
- `t` is one or two sentences, second person, about today, ending in something the player can do.
- `a` is the brightness, 1 to 5. Changing one changes the balance: rerun the simulation.

### Sign (`js/cards.js`)

```js
{ id: 'leo', name: 'Leo', glyph: '♌', dates: 'Jul 23 – Aug 22', element: 'Fire', suit: 'wands',
  modality: 'Fixed', ruler: 'the Sun', card: 'strength',
  open: 'Leo, the day goes better when you are in it.',
  gift: 'your warmth and sense of occasion',
  ease: 'waiting for applause before you believe it went well' }
```

`gift` and `ease` are noun phrases that complete "Lean on {gift}" and "go easy on {ease}".

### Lore question (`js/trivia.js`)

```js
{ t: 2, q: 'Which card is traditionally called the wish card?',
  a: ['Nine of Cups', 'Ace of Cups', 'The Star', 'Ten of Pentacles'],
  x: 'The Nine of Cups shows a contented figure in front of nine cups: a wish fulfilled.' }
```

`a[0]` is always the correct answer. The engine shuffles the order.

### Saved state (`localStorage` key `tarotio.v1`)

```js
{ v: 1,
  sign: 'leo',
  daily: { v: 1, mode: 'daily', date: '2026-11-14', sign: 'leo', seedKey: '2026-11-14|leo',
           round: 2, phase: 'choose', done: false,
           rounds: [{ tries: [1], solved: true, glimpses: 2, seen: [0, 3], pick: 3 }, ...] },
  history: [{ date: '2026-11-14', sign: 'leo', insight: 3, tier: 3, total: 10, pct: 46, sight: 1 }] }
```

If you change this shape, bump `v`, change the key to `tarotio.v2`, and write a migration
that keeps `sign` and `history`. Never wipe a player's streak.

---

## 6. Tone guide for any text you write

- Second person, present tense, plain words. Short sentences.
- Say what the card asks and one thing the player can do today.
- Hard cards: name the difficulty honestly, then the way through. Example, Ten of Swords:
  "Something is finished, completely. That is the hard part and the good part: the sky
  behind it is already getting light."
- When the player misses a question, state the answer and teach it. Never comment on the miss.
- When the result is low, credit the shuffle. When it is high on low insight, call it
  luck warmly ("Fortune like this is given, never earned, so enjoy it").
- Never promise outcomes about health, money, law or relationships. Fortunes are prompts
  for reflection.
- Banned words in player-facing text: stupid, dumb, fail, failed, failure, loser, lost,
  bad luck, unlucky, terrible, awful, wrong, pathetic, cursed, doomed.

---

## 7. Balance

Run `npm run simulate` after changing any of: a card's `a`, `REVERSED_CHANCE`, glimpse
counts, any `BONUS` value, a tier `min`, or the `handIsFair` rule.

Current output (400 days x 12 signs per player type):

| Player | Avg insight | New | Crescent | Half | Gibbous | Full |
|---|---|---|---|---|---|---|
| No glimpses at all | 0.0 | 10.5% | 23.2% | 45.8% | 15.6% | 4.9% |
| Pure guesser | 2.3 | 4.2% | 13.9% | 43.3% | 26.4% | 12.2% |
| Learner (half right) | 3.8 | 1.6% | 7.8% | 37.5% | 33.8% | 19.4% |
| Regular (three quarters right) | 5.0 | 0.4% | 3.8% | 29.7% | 39.1% | 27.1% |
| Always two glimpses | 6.0 | 0.2% | 1.9% | 22.0% | 42.6% | 33.3% |

Targets to keep after any change:

- "No glimpses" reaches Full Moon between 2% and 8% of the time.
- "Always two glimpses" reaches Gibbous or Full between 65% and 85% of the time, and Full
  no more than 45%.
- Each step up in skill raises the Gibbous-plus-Full share.
- Every player type lands on every tier at least occasionally.

If a change breaks a target, undo it or adjust tier thresholds until the targets hold.
Then update the table above.

---

## 8. What is already done (do not rebuild)

- Sign picker, remembered between visits.
- Three rounds with question, second try, glimpses, choose, confirm, full-hand reveal.
- Mid-game save and resume. A finished daily reopens on its reading.
- Result screen: tier, three-card reading, patterns, quintessence, closing, verdict,
  Insight and Fortune meters, per-card breakdown, chart of the 125 readings.
- Share to clipboard with a text fallback, spoiler-free.
- Stats: readings, current streak, best streak, average insight, fortune history,
  "lucky breaks" and "earned" counts.
- Countdown to the next deck and a prompt when a new day starts.
- Practice hands that do not affect stats.
- Day and night themes, phone layout, keyboard focus states, reduced-motion support.
- QA shortcut: add `?date=YYYY-MM-DD` to the address to play another day's deck.

---

## 9. Launch tasks, in order

Do one task at a time. After each, run `npm test`, play one full game by hand, and commit.

### Task 1. Set the launch date

1. In `js/engine.js`, set `CONFIG.EPOCH` to the real launch date (`YYYY-MM-DD`). That date is Day 1.
2. Update the `days` helper and the three dates in the "day numbers" test in
   `tests/engine.test.js` to match.

Done when: `npm test` passes and the masthead reads "Day 1" on launch day.

### Task 2. Host it

The site is static. Any static host works. With GitHub Pages:

1. Merge to the default branch.
2. Repository Settings, Pages, "Deploy from a branch", default branch, folder `/ (root)`.
3. Wait for the Pages URL and open it.

Other hosts (Netlify, Cloudflare Pages, Vercel): no build command, publish directory is
the repository root.

Done when: the public URL loads, a full game can be played, and a refresh mid-game resumes it.

### Task 3. Point shares at the live site

1. In `js/app.js`, set `SHARE_URL` to the public URL.
2. In `index.html` `<head>`, add Open Graph and Twitter tags: `og:title` "Tarotio",
   `og:description` (reuse the meta description), `og:url`, `og:image`, `twitter:card`
   "summary_large_image".
3. Make the share image: 1200 x 630 PNG, five red-backed cards on the green table with
   the wordmark. Save as `og.png` in the root. It must not show any card face.
4. Add a favicon (`favicon.svg`, a single red card back) and link it.

Done when: pasting the URL into a chat app shows the title, description and image, and
"Copy result to share" ends with the URL.

### Task 4. Legal and trust copy

1. Keep the footer line that says the game is for reflection and fun.
2. Add a short "About and privacy" dialog: no account, progress is stored only in this
   browser, clearing site data resets it, fortunes are entertainment and not advice.
3. If analytics are added in Task 6, say so here.

Done when: the dialog opens from the footer and the wording has been approved by the owner.

### Task 5. Card artwork (optional, ask the owner first)

The cards are currently drawn in code: Major Arcana show their number and astrological
glyph, Minor Arcana are drawn like playing cards with pips. This is complete and needs no
licence. Only do this task if the owner wants illustrated cards.

1. Use only the original 1909 Pamela Colman Smith illustrations from a source that states
   they are public domain. Do not use later recoloured editions and do not use the
   "Rider-Waite" name as branding. Have the owner confirm the licence for their countries
   before shipping; this guide is not legal advice.
2. Save as `img/cards/<id>.webp`, where `<id>` is the card id from `js/cards.js`
   (`sun`, `w01` to `w14`, `c01`, `s01`, `p01` and so on). Target 400 px wide, under 40 KB each.
3. In `faceHTML` in `js/app.js`, render an `<img>` with `loading="lazy"` and the card
   name as `alt`, and keep the current drawn face as the fallback if the image fails.
4. A face-down card must never request its image. Only set `src` when the card is revealed,
   exactly as the current code only inserts the face markup on reveal.

Done when: every one of the 78 ids has an image, reversed cards show rotated 180 degrees,
and the network tab shows no card image loading before its reveal.

### Task 6. Analytics (optional, ask the owner first)

Use a cookieless, privacy-first tool. Send only these events, with no personal data:

| Event | Properties |
|---|---|
| `game_start` | `mode`, `sign` |
| `question_answered` | `round`, `tries`, `solved` |
| `game_finish` | `mode`, `insight`, `tier`, `sight_count` |
| `share` | `mode`, `tier` |

Put the calls in `js/app.js` next to `newGame`, `answer`, `finishGame` and `share`. Wrap
each in `try/catch` so a blocked script can never break play.

Done when: events arrive for a test game, and the game still works with the analytics
host blocked.

### Task 7. Install and offline support (optional)

1. Add `manifest.webmanifest` (name "Tarotio", `display: standalone`, theme colour
   `#163b34`, icons at 192 and 512).
2. Add a service worker that caches `index.html`, `styles.css` and the four scripts.
   Give the cache a version name and change it on every release.
3. Do not cache across days in a way that hides a new deck: the deck is computed in the
   browser from the date, so cached files are fine as long as releases update the cache.

Done when: the site installs to a phone home screen and a game can be played in airplane mode.

### Task 8. Server-dealt decks (optional hardening)

Today the deck is computed in the browser, so a determined player could read the code and
work out tomorrow's cards. For a casual game that is acceptable. If the owner wants to
prevent it:

1. Add one endpoint, `GET /api/daily?date=YYYY-MM-DD&sign=leo`, that returns the three
   hands and three questions as JSON. Compute them with the same `js/engine.js`, but use
   the seed key `"<date>|<sign>|<SECRET>"` where `SECRET` is an environment variable that
   is never sent to the browser.
2. Refuse dates later than today (allow 14 hours of slack for time zones).
3. In `js/app.js`, make `hydrate()` fetch from the endpoint for daily games and fall back
   to the local deal if the request fails. Practice hands stay local.
4. Do not send unrevealed card faces to the page if you go further than this; that needs
   per-action endpoints and accounts and is out of scope unless the owner asks.

Done when: two devices get the same deck from the endpoint, a request for tomorrow is
refused, and the game still plays with the endpoint unreachable.

### Task 9. Final checks before announcing

Run through this list on a phone and a desktop, in day and night themes:

- [ ] `npm test` passes and `npm run simulate` meets the targets in section 7.
- [ ] A full daily game works with keyboard only (Tab, Enter, Space).
- [ ] Refreshing in every phase resumes in the same phase with the same cards and question.
- [ ] After finishing, the page shows the reading and offers no second daily game.
- [ ] Changing the device date forward one day offers a new deck and keeps the streak.
- [ ] The share text contains no card names.
- [ ] No horizontal scrolling at 360 px wide.
- [ ] With "reduce motion" on, cards change without flipping or flying.
- [ ] With `localStorage` blocked (private window), a game can still be played to the end.
- [ ] The words in section 6's banned list appear nowhere in the interface.

---

## 10. Adding content after launch

**More lore questions.** Add rows to `LORE` in `js/trivia.js`. Verify each fact against
two independent sources. Keep the right answer in `a[0]`, keep all four options the same
kind of thing and similar in length, and write an `x` that teaches. Tier 1 should be
answerable by a curious beginner. Appending rows changes which question falls on which
future day; that is fine, but never edit or reorder rows on the same day people are playing.

**More reading variety.** Add strings to `TIERS[n].lines`, `TIERS[n].close`,
`POSITIONS[n].leads` or `VERDICTS` in `js/engine.js`. Lead templates must contain `{k}`.
Closing templates may use `{gift}`, `{Gift}` and `{ease}`.

**Another language.** Copy `js/cards.js` and `js/trivia.js` into per-language files with
the same ids and numbers, and move the strings in `js/engine.js` and `js/app.js` into a
strings table. Keywords must still be exactly three noun phrases. Do not change any `a`
value, id or number per language: the deck must be the same in every language.

---

## 11. Mistakes to avoid

- Do not merge Insight and Fortune into one number or one leaderboard.
- Do not add a timer to questions. Time pressure is not part of this game.
- Do not let a player replay the daily to get a better fortune. Practice hands exist for that.
- Do not show the brightness of a face-down card anywhere, including in hidden markup,
  `title` attributes or `aria-label`s.
- Do not use `Math.random()` in `js/engine.js`.
- Do not rename card ids or change card numbers. Saved games and seeds depend on them.
- Do not change the order of the `CARDS` array. The shuffle reads it in order, so
  reordering changes every future deck.
- Do not add frameworks or a build step unless the owner asks. The game is about 150 KB
  of plain files and loads instantly.
- Do not describe a result as the player's fault, and do not describe a card as bad.
