# Tarotio implementation guide

This file is written for an AI coding agent (or a developer) who will take the working
game in this repository and ship it as a real, public daily game. Read all of it before
changing anything. Follow the tasks in section 9 in order.

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

The game in one hand:

1. **Win chips.** Every hand comes with one chip. A tarot or astrology question wins up
   to two more.
2. **Turn a card.** The player taps a face-down card and it turns over.
3. **Keep or pass.** Keep it, or pay a chip to pass. A passed card is burned and cannot be
   taken back. With no chips left, the card turned is the card kept.

Two things are always public, and they are what make it a game of judgement:

- **The moon board.** Above each hand is a row of five moons: exactly what the hand
  holds, but never which card is which. Turned cards are crossed off. Before every pass
  the player can see what is still face down.
- **Suit marks.** The back of each card shows its suit (or a star for Major Arcana). The
  player's own element is worth extra, and three of a suit is worth extra, so there is a
  reason to turn one card rather than another and a hand to build across the three hands.

The result screen always shows two separate things:

- **Insight** (0 to 6): chips won from the questions. This is knowledge.
- **Fortune** (New Moon to Full Moon): how bright the three kept cards are.

It also shows **what the first turns alone would have made** next to what the player
ended with. That gap is exactly what their chips and their nerve did. A player who won no
chips and still drew a Full Moon can see it was the deal. A player who dug through three
passes for it can see it was theirs.

**Current state:** everything above works today, fully in the browser, with no server and
no build step. Open `index.html` and play. Your job is to launch it, not to redesign it.

---

## 2. Rules you must not break

These are the product. Every change you make is checked against them.

1. **It has to be fun to play.** The fun is the keep-or-pass decision: a real gamble with
   visible stakes. Every hand must give every player at least one such decision, which is
   why every hand comes with a free chip. Do not gate the game behind the questions.
2. **Never put the player down.** There is no losing, no "wrong", no "bad luck", no
   "unlucky", no "fail". A low result is a "deep" or "gentle" day that asks something of
   the player. Hard cards (The Tower, Ten of Swords) are written as honest and survivable.
   A pass that did not pay off is "the price of nerve". `tests/engine.test.js` has a
   banned-word test. Keep it passing and extend it when you add text.
3. **Keep skill and luck visibly separate.** Insight and Fortune are never merged into one
   score. The result must always show: the Insight meter, the Fortune meter, the path of
   cards turned in each hand, "first turns alone" beside the final reading, and the chart
   of the 125 blind readings.
4. **Luck must stay real in both directions.** A player who wins no chips must sometimes
   reach Full Moon. A perfect player must sometimes land lower. Section 7 has the targets.
5. **No sign may be luckier than another.** Check this in the simulator after any change
   to bonuses or card brightness (section 7 explains why Air signs need a larger bonus).
6. **Stay rooted in real tarot.** Card meanings follow the Rider-Waite-Smith tradition.
   Sign-to-card links are the Golden Dawn attributions. Do not invent meanings, and do not
   add cards, suits or signs. Reversals, suit emphasis, repeated numbers and the
   quintessence card are all techniques real readers use; keep them accurate.
7. **Same day and same sign means the same deck, for everyone, on every device.** All
   randomness comes from the seeded generator in `js/engine.js`. Never call `Math.random()`
   for anything that affects a daily game.
8. **One daily reading per day.** Progress is saved after every action so a refresh cannot
   undo a pass or re-roll a question. Practice hands are separate and never touch stats.
9. **A face-down card shows its suit and nothing else.** Its face, name, number,
   orientation and brightness must not be in the page in any form until it is turned.
   The moon board gives the set of moons in the hand, never their positions.
10. **The cards must not move while the player is choosing.** At the table the reader's
    panel sits below the hand, so changing text never shifts a card under a finger. On a
    phone the spread, the hand and the Keep and Pass buttons must fit on one screen.
11. **Sharing is spoiler-free.** The share text uses moons only and never names a card,
    because everyone with the same sign has the same deck.
12. **A damaged save must never lock a player out.** Saved state is validated on load
    (`validGame` in `js/app.js`); anything out of range is dropped and the day starts clean.
13. **The game works with no network after load, no account, and no tracking by default.**

---

## 3. Files

| File | What it holds | Change it when |
|---|---|---|
| `index.html` | Page structure, the three views (intro, play, reading), dialogs, the SVG icon sprite | Adding meta tags, new static copy |
| `styles.css` | All styling. Colours are tokens on `:root`, with a night theme (default) and a day theme | Visual changes only |
| `js/cards.js` | The 78 cards (keywords, fortune text, brightness for upright and reversed), the 4 suits, the 12 signs | Editing card or sign text |
| `js/trivia.js` | Hand-written lore questions | Adding questions |
| `js/engine.js` | Every rule: seeding, the deal, the moon board, questions, scoring, patterns, odds, reading text, share text. No DOM | Changing rules or reading templates |
| `js/app.js` | The UI: renders views, records actions, saves to `localStorage` | Changing interaction or layout logic |
| `tests/engine.test.js` | Rule and content tests | Whenever you change the data or engine files |
| `tools/simulate.js` | Balance simulation, including the per-sign fairness check | Run after any change to numbers |
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

### 4.3 Chips

| Source | Chips |
|---|---|
| Every hand, from the reader | 1 (`CHIPS_PER_HAND`) |
| Question right first time | 2 (`CHIPS_FIRST_TRY`) |
| Question right on the second try | 1 (`CHIPS_SECOND_TRY`) |
| Question missed twice | 0 |

A pass costs 1 chip (`PASS_PRICE`). Unspent chips carry to the next hand. Chips have no
value at the end; they are only for passing. Chips are added when the question is settled.

### 4.4 One hand (repeated three times)

| Phase | What happens |
|---|---|
| `question` | Four-option question. Easy for the Past, medium for the Present, hard for the Future. Two tries. |
| `answered` | The answer and a one-line explanation are shown either way. Chips are added. |
| `turn` | The player taps any face-down card. If they hold a chip and another card is still face down, go to `decide`. Otherwise the card is kept at once (`forced: true`) and the hand goes to `reveal`. |
| `decide` | The turned card is shown with its brightness, keywords, what it adds to the spread, and how many face-down cards are brighter or dimmer. **Keep** goes to `reveal`. **Pass** costs a chip, burns the card, and returns to `turn`. |
| `reveal` | All five cards turn face up so the player sees what else was there. |

How a card came to be kept (`howKept`):

- `first`: kept on the first turn, with a chip in hand to pass. A choice.
- `fate`: kept on the first turn because there was no chip to pass with.
- `dug`: found after at least one pass, and kept by choice.
- `last`: kept after at least one pass, when the chips or the cards ran out.

Keyboard: 1 to 4 (or A to D) answer a question, 1 to 5 turn a card, K keeps, P passes,
Enter activates the focused button. After each action focus moves to the next control.

### 4.5 What the player can see

- **Moon board** (`handBoard`): the five brightness values in the hand, brightest first,
  each marked face down, face up, passed or kept. Equal moons are ordered by state only,
  never by position, so the board cannot reveal where a card sits. There is a test for this.
- **Suit marks** (`aura`): each face-down card shows its suit, or a star for Major
  Arcana. Cards in the player's element are ringed and labelled with their bonus.
- **Running count**: moons kept so far, beside the totals needed for each tier.
- **Keep preview** (`keepPreview`): what the turned card adds now (its moons plus any
  bonus it completes) and what a later card could still complete ("Two Cups: a third
  makes a Trine").

### 4.6 Brightness

Every card face has a brightness (`a`, "auspice") from 1 to 5, shown as a moon phase:

| Value | Moon | Typical cards |
|---|---|---|
| 5 | Full Moon | The Sun, The Star, Ten of Cups, any Ace, upright |
| 4 | Gibbous Moon | The Chariot upright, The Devil reversed, Ten of Swords reversed |
| 3 | Half Moon | The Hermit upright, The Tower reversed |
| 2 | Crescent Moon | Most reversed cards, Death, The Moon upright |
| 1 | New Moon | The Tower, The Devil, Three, Nine and Ten of Swords, Five of Cups, Five of Pentacles, upright |

The hardest cards get brighter when reversed. That is traditional.

### 4.7 Scoring a reading (`scoreSpread`)

`total = brightness of the three kept cards + pattern bonuses`

| Pattern | Card-table nickname | Bonus |
|---|---|---|
| A kept card is in the suit of your sign's element ("attuned") | | +1 per card (+2 per card for Air signs, see section 7) |
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
| 16 or more | 5 | Full Moon, Blessed |
| 14 to 15 | 4 | Gibbous Moon, Favoured |
| 11 to 13 | 3 | Half Moon, Steady |
| 9 to 10 | 2 | Crescent Moon, Gentle |
| 8 or less | 1 | New Moon, Deep |

### 4.8 Insight

Insight is the number of chips won from the three questions, 0 to 6 (the reader's free
chips do not count). Titles: Wanderer, Seeker, Apprentice, Reader, Keen Eye, Seer, Oracle.
Every title is respectful.

### 4.9 Telling luck from skill (`summarize`, `deckOdds`, `standing`)

- **First turns alone.** The engine scores the first card turned in each hand as if it
  had been kept (`firstScore`). The difference from the real score (`lift`) is what the
  passes did. Positive: the chips paid. Zero with no passes: the whole reading was the
  deal. Negative: the chase cost a little, and the text says so kindly.
- **The 125 blind readings.** One card from each of three hands gives 5 x 5 x 5 = 125
  readings. The engine scores all of them and reports how many fall in each tier and what
  share the player's reading beats. This is what picking blind would give.
- **The path.** For each hand, every card turned is recorded in order, so the result can
  show "passed a Crescent, passed a Half, kept a Full".

Do not replace any of these with an estimate.

### 4.10 Questions (`questionsFor`)

Three pools, one per difficulty tier. Lore questions come from `js/trivia.js`; the rest
are generated from the card and sign data, so they teach the same meanings the readings use.

| Tier | Asked for | Pool today | Made of |
|---|---|---|---|
| 1 | Past | 59 | lore, "which element is this sign", "which Major Arcana card means these keywords" |
| 2 | Present | 116 | lore, "which card belongs to this sign", keywords to a Minor card, upright meaning of a Major |
| 3 | Future | 177 | lore, reversed meanings, Major Arcana numbers, upright meaning of a Minor |

Generated questions are built to be reasoned out, not memorised. When the answer is a
Minor Arcana card, the wrong options come from the three other suits, so knowing what the
suits stand for (taught in tier 1) is enough. When the answer is a meaning, one wrong
option is the same card's other orientation and the rest come from other suits.

For day number `d`, each pool is shuffled by a seed for its cycle and the game walks
through it one question a day. A question cannot repeat until its whole pool has been
used. Questions depend on the date only, so every sign gets the same three questions.

### 4.11 The reading text (`summarize`)

Each reading is assembled from:

- a headline for the tier (7 variants per tier),
- the day in one line, built from the first keyword of each card ("From a spark waiting,
  through rigidity, toward compassion"), which is unique to the spread,
- for each position, a lead sentence built from the card's keywords (3 variants per
  position) plus that card face's own fortune text (156 unique texts: 78 cards x 2 orientations),
- a line about which element leads the spread (left out when a pattern already says it),
- every pattern found,
- the quintessence card: add the three card numbers, reduce the digits until the total
  is 22 or less, and read the Major Arcana card with that number (22 is The Fool),
- a closing line: one of 3 openers for the sign, then one of 3 closers for the tier,
- a verdict on skill and luck (3 insight bands x 3 fortune bands x 2 variants),
- the "first turns alone" line and a line on how the first turns fell.

The same sentence must never appear twice in one reading. There is a test for it.

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
  opens: ['Leo, the day goes better when you are in it.', 'Leo, your generosity fills a room.', '...'],
  gift: 'your warmth and sense of occasion',
  ease: 'waiting for applause before you believe it went well' }
```

`opens` holds three opening sentences so a daily player does not read the same one every
day. `gift` and `ease` are noun phrases that complete "Lean on {gift}" and "go easy on {ease}".

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
  daily: { v: 2, mode: 'daily', date: '2026-11-14', sign: 'leo', seedKey: '2026-11-14|leo',
           round: 1, phase: 'decide', done: false, chips: 2,
           rounds: [
             { tries: [1], solved: true, earned: 2, turned: [3, 0, 4], pick: 4, forced: false },
             { tries: [0, 2], solved: true, earned: 1, turned: [1], pick: null, forced: false },
             { tries: [], solved: null, earned: 0, turned: [], pick: null, forced: false } ] },
  history: [{ date: '2026-11-14', sign: 'leo', insight: 3, tier: 3, total: 12, pct: 61, passes: 2, first: 9 }] }
```

- `turned` is the cards turned in that hand, in order. Every turned card except `pick`
  has been passed.
- `chips` is the chips in hand right now.
- `daily.v` is the game-state version (`GAME_VERSION` in `js/app.js`). A saved game with a
  different version is dropped on load; `sign` and `history` are kept. If you change the
  shape of `daily`, raise `GAME_VERSION`. If you change the shape of the whole store,
  change the key and write a migration. Never wipe a player's streak.

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
- When a pass did not pay off, call it the price of nerve. Never call it a mistake.
- Never promise outcomes about health, money, law or relationships. Fortunes are prompts
  for reflection.
- Banned words in player-facing text: stupid, dumb, fail, failed, failure, loser, lost,
  bad luck, unlucky, terrible, awful, wrong, pathetic, cursed, doomed.

---

## 7. Balance

Run `npm run simulate` after changing any of: a card's `a`, `REVERSED_CHANCE`, any chip
number, any `BONUS` value, `ATTUNED_BY_SUIT`, a tier `min`, or the `handIsFair` rule.

The simulator models two kinds of skill: how often the player answers right (this wins
chips), and how well they play the table (random taps, careful use of the moon board, or
a "shark" who also reads the suit marks).

Current output (400 days x 12 signs per player type):

| Player | Avg insight | New | Crescent | Half | Gibbous | Full |
|---|---|---|---|---|---|---|
| No answers right, random taps | 0.0 | 4.0% | 12.1% | 42.4% | 31.8% | 9.8% |
| No answers right, careful | 0.0 | 2.3% | 8.7% | 43.7% | 34.3% | 11.1% |
| Pure guesser, careful | 2.2 | 0.4% | 3.4% | 30.9% | 45.3% | 19.9% |
| Learner, careful | 3.8 | 0.2% | 1.4% | 24.5% | 49.2% | 24.7% |
| Regular, careful | 5.0 | 0.1% | 0.6% | 18.6% | 52.5% | 28.3% |
| Regular, shark | 5.1 | 0.0% | 0.2% | 13.0% | 46.2% | 40.7% |
| All answers right, careful | 6.0 | 0.0% | 0.2% | 15.9% | 52.4% | 31.5% |
| All answers right, shark | 6.0 | 0.0% | 0.0% | 11.3% | 46.8% | 41.8% |

Picking one card blind from each hand (no passes at all) reaches Full Moon about 2% of
the time and Gibbous about 10%. That is the baseline the "125 readings" chart shows.

Targets to keep after any change:

- "No answers right, random taps" reaches Full Moon between 5% and 12% of the time.
- "All answers right, shark" reaches Full Moon between 30% and 45% of the time, and
  lands on Half Moon or lower at least 8% of the time.
- Each step up in answers, and the step from careful to shark, raises the Full Moon share.
- **Sign fairness:** the "spread between the luckiest and unluckiest sign" line stays
  under 0.5 moons.

**Why Air signs get +2.** Swords is the darkest suit in the deck (average brightness 2.6
against about 3.4 for the others). Because suit marks are visible, players turn cards in
their own element on purpose. With a +1 bonus for every sign, Gemini, Libra and Aquarius
reached Full Moon about half as often as the other signs. `ATTUNED_BY_SUIT.swords = 2`
closes that gap to within noise. Do not "simplify" it back to 1.

If a change breaks a target, undo it or adjust tier thresholds until the targets hold.
Then update the table above.

---

## 8. What is already done (do not rebuild)

- Sign picker, remembered between visits.
- Three hands with question, second try, chips, turn, keep or pass, full-hand reveal.
- The moon board, suit marks on card backs, running moon count, keep preview with
  bonuses and "what a third card could complete".
- A layout where the hand never moves while the player is choosing, and where the whole
  table fits on a 360 x 640 phone screen.
- Keyboard play with focus following the action.
- Mid-game save and resume, with validation so a damaged or outdated save starts the day
  clean. A finished daily reopens on its reading.
- Result screen: tier, one-line arc, three-card reading with the path of each hand,
  patterns, quintessence card, closing, verdict, "first turns alone" beside the final
  reading, Insight and Fortune meters, per-hand breakdown, chart of the 125 blind readings.
- Share to clipboard with a text fallback, spoiler-free, one row of moons per hand.
- Stats: readings, current streak, best streak, average insight, the last 14 readings as
  moons, fortune history, "lucky breaks" and "earned" counts.
- Countdown to the next deck and a prompt when a new day starts.
- Practice hands that do not affect stats.
- Day and night themes, reduced-motion support, an inline favicon.
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
4. A favicon is already inline in `index.html`. Replace it only if the owner supplies artwork.

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
4. A face-down card must never request its image. Only set `src` when the card is turned,
   exactly as the current code only inserts the face markup when a card is turned.
5. Keep the suit marks on the card backs. They are part of the game, not decoration.

Done when: every one of the 78 ids has an image, reversed cards show rotated 180 degrees,
and the network tab shows no card image loading before its card is turned.

### Task 6. Analytics (optional, ask the owner first)

Use a cookieless, privacy-first tool. Send only these events, with no personal data:

| Event | Properties |
|---|---|
| `game_start` | `mode`, `sign` |
| `question_answered` | `round`, `tries`, `solved` |
| `card_turned` | `round`, `turn_number`, `decision` (`keep`, `pass` or `forced`) |
| `game_finish` | `mode`, `insight`, `tier`, `passes`, `lift` |
| `share` | `mode`, `tier` |

Put the calls in `js/app.js` next to `newGame`, `answer`, `turn`, `keep`, `pass`,
`finishGame` and `share`. Wrap each in `try/catch` so a blocked script can never break play.

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
work out where the bright cards are. For a casual game that is acceptable. If the owner
wants to prevent it:

1. Add one endpoint, `GET /api/daily?date=YYYY-MM-DD&sign=leo`, that returns the three
   questions and, for each hand, only the public information: the five suit marks in
   position order and the sorted list of five moons. Compute them with the same
   `js/engine.js`, using the seed key `"<date>|<sign>|<SECRET>"` where `SECRET` is an
   environment variable that is never sent to the browser.
2. Add `POST /api/turn` that takes the date, sign, hand and position and returns that
   card. The server must record turns per player so a passed card cannot be turned again
   and a kept card ends the hand. This needs a session or account; ask the owner which.
3. Refuse dates later than today (allow 14 hours of slack for time zones).
4. Practice hands stay local.

Done when: the page never receives a card it has not turned, two devices get the same
deck, and a request for tomorrow is refused.

### Task 9. Final checks before announcing

Run through this list on a phone and a desktop, in day and night themes:

- [ ] `npm test` passes and `npm run simulate` meets every target in section 7, including sign fairness.
- [ ] A full daily game works with keyboard only.
- [ ] Refreshing in every phase resumes in the same phase with the same cards, chips and question.
- [ ] A passed card stays passed after a refresh.
- [ ] After finishing, the page shows the reading and offers no second daily game.
- [ ] Changing the device date forward one day offers a new deck and keeps the streak.
- [ ] The share text contains no card names.
- [ ] No horizontal scrolling at 360 px wide, in every phase.
- [ ] On a 360 x 640 phone, the hand and the Keep and Pass buttons are on screen together.
- [ ] The five cards stay in the same place through turn, decide and pass.
- [ ] The moon board matches the cards in every phase.
- [ ] In dev tools, a face-down card's markup contains no face, name or brightness.
- [ ] With "reduce motion" on, cards change without flipping or flying.
- [ ] With `localStorage` blocked (private window), a game can still be played to the end.
- [ ] With the saved state edited to nonsense in dev tools, the page still loads to a clean start.
- [ ] The words in section 6's banned list appear nowhere in the interface.

---

## 10. Adding content after launch

**More lore questions.** Add rows to `LORE` in `js/trivia.js`. Verify each fact against
two independent sources. Keep the right answer in `a[0]`, keep all four options the same
kind of thing and similar in length, and write an `x` that teaches. Tier 1 should be
answerable by a curious beginner. Appending rows changes which question falls on which
future day; that is fine, but never edit or reorder rows on the same day people are playing.

**More reading variety.** Add strings to `TIERS[n].lines`, `TIERS[n].close`,
`POSITIONS[n].leads` or `VERDICTS` in `js/engine.js`, or to a sign's `opens` in
`js/cards.js`. Lead templates must contain `{k}`. Closing templates may use `{gift}`,
`{Gift}` and `{ease}`.

**Another language.** Copy `js/cards.js` and `js/trivia.js` into per-language files with
the same ids and numbers, and move the strings in `js/engine.js` and `js/app.js` into a
strings table. Keywords must still be exactly three noun phrases. Do not change any `a`
value, id or number per language: the deck must be the same in every language.

---

## 11. Mistakes to avoid

- Do not merge Insight and Fortune into one number or one leaderboard.
- Do not remove the free chip per hand. Without it a player who misses the question has
  no decision to make, and the game stops being a game for them.
- Do not let passed cards be taken back. The gamble is the point.
- Do not give leftover chips a score value without re-running the simulation and asking
  the owner: it would mix skill into Fortune.
- Do not add a timer to questions or decisions. Time pressure is not part of this game.
- Do not let a player replay the daily to get a better fortune. Practice hands exist for that.
- Do not put a face-down card's face, name, orientation or brightness in the page, in
  hidden markup, `title` attributes or `aria-label`s. Suit only.
- Do not sort the moon board in any way that depends on card position.
- Do not use `Math.random()` in `js/engine.js`.
- Do not rename card ids or change card numbers. Saved games and seeds depend on them.
- Do not change the order of the `CARDS` array. The shuffle reads it in order, so
  reordering changes every future deck.
- Do not animate cards in from the right edge. On a narrow phone that makes the page
  scroll sideways for a moment. Cards fly in from the upper left.
- Do not put the reader's panel above the hand while cards are being turned.
- Do not add frameworks or a build step unless the owner asks. The game is about 180 KB
  of plain files and loads instantly.
- Do not describe a result as the player's fault, and do not describe a card as bad.
