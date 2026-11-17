# Tarotio implementation guide

This file is written for an AI coding agent (or a developer) who will take the working
game in this repository and ship it as a real, public daily game. Read all of it before
changing anything. Follow the tasks in section 9 in order.

If an instruction here conflicts with something you would normally do, follow this file.
If something is not covered, ask the project owner instead of guessing.

---

## 1. What Tarotio is

Tarotio is a daily puzzle, in the family of Wordle: one puzzle per day, a few minutes to
play, a spoiler-free result to share, a streak to keep.

The player picks their star sign. Each day a 78-card tarot deck is shuffled for that sign
and deals **three hands of ten cards, face down in two rows of five**. The player keeps **one card from each
hand**. Those three cards are their **Past, Present and Future**, and the game reads them
together as the player's fortune for the day.

The game in one hand:

1. **Read the omens.** Each hand comes with two to four omens: true statements such as
   "The brightest card is a Cups card" or "The Gibbous Moon sits at one end of the row".
   Taken together they leave exactly one place the brightest card can be.
2. **Turn a card.** The player taps a card to pick it up and taps again to turn it over.
3. **Found it, or not.** Turning the brightest card keeps it at once. Turning any other
   card, a player holding a chip can keep it or pay the chip to pass and turn again. A
   passed card is burned and cannot be taken back. With no chip, the card turned is kept.
4. **Win chips.** Turning a hand's brightest card on the first try wins a chip for the
   hands ahead. Chips are never given away free: second chances are earned by skill.

What the player can see, and reasons from:

- **The moon board.** A row of ten moons above the hand: exactly what the hand holds,
  but never which card is which.
- **Suit marks.** The back of each card shows its suit (or a star for Major Arcana).
- **Position.** The cards sit in a grid of two rows of five. Omens talk about rows,
  columns, corners, and which cards touch (beside in a row, or directly above or below).

The omens tie those three together. Working them out is the skill.

**Skill decides the fortune.** Every deck is dealt so that its three brightest cards make
its best reading, and that reading is a Full Moon. Read all three hands true and the Full
Moon is yours, every day. Luck only decides the hands a player leaves to chance.

The result screen always shows two separate things:

- **Insight** (0 to 6): how well the omens were read. Two for each hand where the first
  card turned was the brightest, one where it was found after passing.
- **Fortune** (New Moon to Full Moon): how bright the three kept cards are.

It also shows **the deck's best reading** (always the three brightest cards, always a Full
Moon) and **how often turning blind would have done as well**. A player who read nothing
and still drew a Full Moon can see it was fortune. A player who read every hand can see the
Full Moon was earned.

**Current state:** everything above works today, fully in the browser, with no server and
no build step. Open `index.html` and play. Your job is to launch it, not to redesign it.

---

## 2. Rules you must not break

These are the product. Every change you make is checked against them.

1. **Every puzzle must be fair.** Each omen is true. Together the omens leave exactly one
   place for the brightest card. No omen is spare, and no single omen gives the answer
   away. These four properties are tested for every hand; never ship an omen change that
   breaks them.
2. **Omens only speak of what the player can see or work out:** positions, suit marks and
   the moons on the board. Never a card's name, number or orientation.
3. **Skill decides the fortune; luck fills the gaps.** The deal guarantees that reading all
   three hands true gives the deck's best reading and a Full Moon (section 4.2). Never
   loosen that rule. Chips are only won by reading a hand true; never hand them out free,
   because a free chip is a free re-roll and puts luck back in charge.
4. **Never put the player down.** There is no losing, no "wrong", no "bad luck", no
   "unlucky", no "fail", no "mistake". A low result is a "deep" or "gentle" day. An unsolved
   hand is "knotty omens". A pass that did not pay is "the price of nerve".
   `tests/engine.test.js` has a banned-word test. Keep it passing and extend it when you add text.
5. **Keep skill and luck visibly separate.** Insight and Fortune are never merged into one
   score. The result must always show: the Insight meter, the Fortune meter, the deck's
   best, the odds of doing as well blind, the path of cards turned in each hand, and how
   the omens fitted.
6. **Luck stays real but small.** A perfect reader always gets a Full Moon. A player who
   ignores the omens must still reach a Full Moon now and then (about 4%), and the result
   must say plainly when a fortune was luck. Section 7 has the targets.
7. **No sign may be luckier than another.** The deal rule makes a perfect reading a Full
   Moon for every sign. Check the simulator's element spread after any change to bonuses
   or card brightness.
8. **Stay rooted in real tarot.** Card meanings follow the Rider-Waite-Smith tradition.
   Sign-to-card links are the Golden Dawn attributions. Do not invent meanings, and do not
   add cards, suits or signs. Reversals, suit emphasis, repeated numbers and the
   quintessence card are all techniques real readers use; keep them accurate.
9. **Same day and same sign means the same deck and the same omens, for everyone, on every
   device.** All randomness comes from the seeded generator in `js/engine.js`. Never call
   `Math.random()` for anything that affects a daily game.
10. **One daily reading per day.** Progress is saved after every action so a refresh cannot
    undo a turn or a pass. Practice hands are separate and never touch stats.
11. **A face-down card shows its suit and nothing else.** Its face, name, number,
    orientation and brightness must not be in the page in any form until it is turned.
12. **Turning a card takes two taps.** The first picks it up, the second turns it. A stray
    tap must never spend a turn.
13. **The cards must not move while the player is thinking.** Nothing above the hand
    changes height during a hand.
14. **It must work as well on a phone as on a desktop.** On a phone the hand, the omens
    and the choice share one screen and the main button stays within thumb reach. On a wide
    screen the table and the omens sit side by side. No sideways scrolling at 360 px.
15. **Animation marks a moment in play and never blocks it.** Every animation is switched
    off under `prefers-reduced-motion`, and the game must be fully playable without them.
16. **Sharing is spoiler-free.** The share text uses moons only and never names a card.
17. **A damaged save must never lock a player out.** Saved state is validated on load
    (`validGame` in `js/app.js`); anything out of range is dropped and the day starts clean.
18. **The game works with no network after load, no account, and no tracking by default.**

---

## 3. Files

| File | What it holds | Change it when |
|---|---|---|
| `index.html` | Page structure, the three views (intro, play, reading), dialogs, the SVG icon sprite | Adding meta tags, new static copy |
| `styles.css` | All styling. Colour tokens on `:root` (night theme default, day theme override), the phone and wide-screen layouts, and every animation in one section | Visual changes only |
| `js/cards.js` | The 78 cards (keywords, fortune text, brightness for upright and reversed), the 4 suits, the 12 signs | Editing card or sign text |
| `js/engine.js` | Every rule: seeding, the deal, the omens, the moon board, scoring, patterns, odds, reading text, share text. No DOM | Changing rules, omens or reading templates |
| `js/app.js` | The UI: renders views, records actions, saves to `localStorage`, runs the animations that need script | Changing interaction or layout logic |
| `tests/engine.test.js` | Rule, puzzle and content tests | Whenever you change the data or engine files |
| `tools/simulate.js` | Balance simulation, including the per-sign fairness check | Run after any change to numbers |
| `tools/bundle.js` | Builds `dist/tarotio.html`, the whole game in one file | Run when a host needs a single file |

Scripts load in this order and each depends on the one before: `cards.js`, `engine.js`,
`app.js`. They are plain scripts, not ES modules, so the page also works when opened
straight from disk. `cards.js` and `engine.js` also load in Node for tests.

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
3. Split into three hands of ten: Past, Present, Future. Places in a hand are numbered row
   by row: 0-4 the top row, 5-9 the bottom row.
4. A deal is used only if all of these hold, checked cheapest first:
   - every hand is fair (`handIsFair`): **exactly one brightest card**, of brightness 4
     or 5, and some card of brightness 1 or 2;
   - the three brightest cards together score at least the Full Moon threshold (16) for
     this sign (`perfectReading`);
   - no other combination of one card per hand scores higher (`deckOdds(...).best`);
   - every hand carries a real puzzle (`hasPuzzle`): at least two omens are needed to pin
     its brightest card;
   - the Future's real omens are chained (`makeOmens(...).chained`, see 4.3).
   Otherwise reshuffle with the next attempt number (still deterministic) and try again.
   The best-reading check scores all 1,000 readings with `quickTotal`, plain arithmetic
   that a test keeps equal to `scoreSpread`. A deal plus all its omens takes about 12 ms
   on a desktop (95th percentile 60 ms).

`dealHands(seedKey, signId)` needs the sign, because bonuses depend on it. It throws
without one.

Why each rule matters:

- One brightest card: every omen says "the brightest card", so it has to mean one thing.
- Perfect reading = best reading = Full Moon: this is what makes the game skill-based.
  Reading every hand true always gives the top fortune, on every day, for every sign.

### 4.3 The omens (`makeOmens`, `omensFor`)

Omens are built per hand:

1. **List every true statement** from the vocabulary below (`omenPool`).
2. **Drop giveaways:** any statement that pins the brightest card by itself.
3. **Search** for a set of the planned shape that is *sufficient* (only one place is left
   for the brightest card) and *lean* (removing any omen leaves more than one place). The
   first such set in seeded-shuffle order is used.

**How "places left" is worked out.** A place is still possible for the brightest card if
*some* layout of the hand's moons makes every omen true with the brightest card there.
Direct omens are just sets of places, so they intersect. For indirect omens,
`feasible(c, constraints, counts, T)` searches for such a layout, but only over the
places and moons the omens name; every other place takes whatever moons are left, which
always fits because places and moons number the same. This is exact. Checking every
layout instead (up to 75,600 per hand) would be too slow on a phone; the tests still do
it on sample hands and compare (`arrangements`, test "the fast fairness check agrees with
checking every layout").

The vocabulary has two kinds:

- **Direct** omens are about the brightest card itself: its row; outer, middle, left or
  right columns; corners; its suit or not; whether it is the only one of its suit; what
  suit it touches, sits beside in its row, or sits above or below; which column side or
  row of a uniquely marked card it is on; diagonal to a uniquely marked card; between two
  cards of the same suit.
- **Indirect** omens are about other cards and have to be chained, as constraints:
  `cmp` ("The Cups card in the top row outshines the Wands card"), `dim` / `peak` ("…is
  dimmer than / outshines every card it touches"), `place` for a moon that appears once
  on the board ("The Half Moon is in the bottom row", "…is a Cups card", "…sits in a
  corner"), and `rel` for that moon against the brightest card ("The Half Moon touches /
  shares a column with / is in the same row as the brightest card", "The brightest card
  lies in a column left of the Half Moon").

A card that has to be named in an indirect omen is named so a player can find it without
counting: "the Swords card" if it is the only one, else "the Swords card in the top row",
else "the left-hand Swords card in the top row", else "the third card of the top row".

Difficulty rises through the day (`OMEN_PLANS`, direct + indirect, "chained" meaning the
indirect omens together rule out a place that none rules out alone):

| Hand | Tier | Shapes, in order tried | In practice |
|---|---|---|---|
| Past | 1 | 2 + 0, 3 + 0 | two plain omens |
| Present | 2 | 2 + 1, 1 + 2, 3 + 1 | three omens, one about other cards |
| Future | 3 | chained 1 + 2, 2 + 2, 1 + 3, 0 + 2, 0 + 3, 2 + 3, 3 + 2 | three or four omens, always chained |

Only indirect omens that share a subject (a card, a named moon, or the brightest card) can
chain, so chained plans only try linked sets (`linked`); at most `OMEN_TRIES` (300) linked
sets are scored per plan. The deal guarantees the Future is chained.

If a hand allows none of its tier's shapes, the generator falls back to an easier tier,
then to any shape in `OMEN_ANY`. The seed for a hand's omens is
`"omens|<seedKey>|<handIndex>"`, so omens are the same for everyone with that sign and day.
`omensFor` caches the result for the session.

Each omen carries `focus` (the places it speaks of) and `moons` (the board moons it
names). Tapping an omen lights those up. This is a reading aid, never the answer.

### 4.4 Chips

Players start with none. Turning a hand's brightest card **on the first try** wins 1 chip
(`CHIPS_PER_READ`) for the hands ahead; the last hand wins none, as there is nothing left
to spend it on. A pass costs 1 (`PASS_PRICE`). Unspent chips carry over. Chips have no
value at the end.

So a player who reads the Past and Present true reaches the Future, the hardest hand,
with two chips in hand. Skill buys room. A player who guesses rarely has a chip at all.

The chip count is not trusted from storage: on resume it is recomputed from the hands
played (`chipsWon` less passes).

### 4.5 One hand (repeated three times)

| Phase | What happens |
|---|---|
| `turn` | The omens are on screen. The player picks a card up (first tap) and turns it (second tap, or the Turn it over button). The brightest card is kept at once and the hand goes to `reveal`. Any other card: with a chip in hand and another card face down, go to `decide`; otherwise it is kept at once (`forced: true`). |
| `decide` | Only reached on a card that is not the brightest. The panel says so ("the brightest is still face down"), shows what the card adds to the spread and how many face-down cards are brighter or dimmer, and warns if it is the last chip with hands to come. **Keep** goes to `reveal`. **Pass** costs a chip, burns the card, and returns to `turn`. |
| `reveal` | All ten cards turn face up, the kept card flies to its place in the spread, and below the cards a row of small maps of the grid shows how each omen narrowed the places down. |

The player can also **rule a card out** by tapping the label under it. That is their own
pencil mark (`marks`); it changes nothing in the rules.

How a card came to be kept (`howKept`): `first` (kept on the first turn, including the
brightest card found at once), `fate` (kept on the first turn because there was no chip),
`dug` (kept after a pass, by choice or because it was the brightest), `last` (kept after a
pass when the chips or cards ran out).

Keyboard: 1 to 5 pick up a card in the top row, 6 to 9 and 0 in the bottom row; the same
key or Enter turns it. Shift with the key rules a card out. K keeps, P passes.

Layout: on phones and tablets (under 980 px) the order is spread, omens, moon board, cards,
choice. The omens sit above the cards so a player can read the clues and see the grid
together; the omen panel never changes height during a hand, so the cards never move. On
wide screens the table (spread, moon board, cards) is on the left and the omens and
choice on the right.

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
| A kept card is in the suit of your sign's element ("attuned") | | +1 per card (`ATTUNED_BY_SUIT`) |
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

The deal guarantees the three brightest cards are the best reading, so a reader never has
to choose between the brightest card and a pattern.

### 4.8 Insight (`handInsight`)

Per hand: 2 if the first card turned is the hand's brightest (`INSIGHT_FIRST_TURN`), 1 if
the brightest card was turned later (`INSIGHT_FOUND_LATER`), 0 otherwise. Total 0 to 6.
Titles: Wanderer, Seeker, Apprentice, Reader, Keen Eye, Seer, Oracle. Every title is respectful.

Insight is counted on turning, not keeping, so a player who finds the brightest card and
passes it to chase a pattern is not marked down.

### 4.9 Telling luck from skill (`summarize`)

- **The odds of doing it blind** (`blindFirstTurnChance`). Turning blind finds the
  brightest card first in one hand in ten. All three: once in 1,000 games. Two of three:
  about one game in 36. At least one: about one game in four. The result states the
  figure for what the player did.
- **The deck's best.** Always the three brightest cards and always a Full Moon (`ceiling`).
  A perfect reader is told it was skill. Anyone else is told where the omens pointed.
- **The 1,000 blind readings** (`deckOdds`, `standing`). One card from each of three hands
  gives 1,000 readings; the chart shows how many fall in each tier and which the player hit.
- **First turns alone** (`firstScore`, `lift`). What the first card turned in each hand
  would have made, against the final reading: what the passes changed.
- **The path** and **how the omens fitted.** Every card turned in each hand, in order, and
  for each omen the positions it left.

Do not replace any of these with an estimate.

### 4.10 The reading text (`summarize`)

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
- the odds line and the deck-ceiling line.

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
- `a` is the brightness, 1 to 5. Changing one changes the balance and the puzzles: rerun
  the simulation and the tests.

### Sign (`js/cards.js`)

```js
{ id: 'leo', name: 'Leo', glyph: '♌', dates: 'Jul 23 – Aug 22', element: 'Fire', suit: 'wands',
  modality: 'Fixed', ruler: 'the Sun', card: 'strength',
  opens: ['Leo, the day goes better when you are in it.', 'Leo, your generosity fills a room.', '...'],
  gift: 'your warmth and sense of occasion',
  ease: 'waiting for applause before you believe it went well' }
```

### Omen (built in `js/engine.js`, never stored)

```js
{ kind: 'direct', text: 'The brightest card sits in a corner.',
  set: 0b1000110001,      // direct only: the places it allows, one bit per place
  focus: [0, 4, 5, 9],    // places the omen speaks of, lit when the player taps it
  moons: [],              // board moons it names
  test: function (a) {}   // true if this omen holds for a layout of moons, a[place] = moon
}
{ kind: 'indirect', text: 'The Half Moon touches the brightest card.',
  con: { type: 'rel', v: 3, rel: 'touch' },   // indirect only: the constraint feasible() reads
  focus: [], moons: [3], test: function (a) {} }
```

### Saved state (`localStorage` key `tarotio.v1`)

```js
{ v: 1,
  sign: 'leo',
  daily: { v: 4, mode: 'daily', date: '2026-11-16', sign: 'leo', seedKey: '2026-11-16|leo',
           round: 1, phase: 'decide', done: false, chips: 1,
           rounds: [
             { turned: [2], pick: 2, forced: false, marks: [3] },
             { turned: [0], pick: null, forced: false, marks: [] },
             { turned: [], pick: null, forced: false, marks: [] } ] },
  history: [{ date: '2026-11-16', sign: 'leo', insight: 5, tier: 4, total: 14, pct: 99, passes: 1, finds: 2 }] }
```

- `turned` is the cards turned in that hand, in order. Every turned card except `pick`
  has been passed. `marks` is the cards the player ruled out.
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
- Omens are short, exact and neutral. One fact each. Always "the brightest card", never
  "the best" or "the right" card.
- When a hand was not solved, say where the omens pointed and move on. Never comment on
  the player's reasoning.
- When the result is low, credit the shuffle. When it is high on low insight, call it
  luck warmly ("Fortune like this is given, never earned, so enjoy it").
- Never promise outcomes about health, money, law or relationships. Fortunes are prompts
  for reflection.
- Banned words in player-facing text: stupid, dumb, fail, failed, failure, loser, lost,
  bad luck, unlucky, terrible, awful, wrong, pathetic, cursed, doomed, mistake.

---

## 7. Balance

Run `npm run simulate` after changing any of: a card's `a`, `REVERSED_CHANCE`, a chip
rule, any `BONUS` value, `ATTUNED_BY_SUIT`, a tier `min`, the deal rule, or the omen
generator.

Players are modelled on the real omens: each omen is applied correctly with probability
p, in order, stopping at the first one they cannot use. They turn cards among the places
still possible, and pass when they hold a chip and the card is not the brightest.

Current output (200 days x 12 signs per player type, two rows of five):

| Player | Avg insight | New | Crescent | Half | Gibbous | Full |
|---|---|---|---|---|---|---|
| Blind: ignores the omens | 0.6 | 34.3% | 35.0% | 25.0% | 4.6% | 1.2% |
| Uses half the omens (p .5) | 2.1 | 15.3% | 23.0% | 37.5% | 14.2% | 10.0% |
| Learner (p .7) | 3.4 | 6.0% | 12.0% | 32.5% | 19.9% | 29.7% |
| Regular (p .85) | 4.6 | 1.3% | 4.3% | 21.5% | 16.8% | 56.2% |
| Sharp (p .95) | 5.5 | 0.1% | 0.8% | 9.0% | 7.1% | 83.0% |
| Perfect reader (p 1) | 6.0 | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% |

Full Moon rate by element for a learner: Fire 28.2%, Earth 31.5%, Air 29.8%, Water 29.2%.

Targets to keep after any change:

- A perfect reader gets a Full Moon 100% of the time. (Guaranteed by the deal rule; the
  tests check it too.)
- Full Moon rises steeply with skill: blind 0.5-4%, p .5 about 6-15%, p .85 about 45-70%,
  p .95 at least 75%.
- Blind players reach Gibbous or Full 3-10% of the time: luck is real, but small.
- **Element fairness:** the "spread between the luckiest and unluckiest element" stays
  under 5 points.
- Every Future hand is chained (a test checks every deal in its sample).

**How this changed.** The second row (ten cards instead of five) made the puzzle harder
and luck smaller: a blind first turn finds the brightest card one time in ten instead of
one in five, and the Future always needs chained reasoning. With one row, the same players
reached a Full Moon 3.9%, 19%, 40%, 65%, 88% and 100% of the time. Before the deal rule, a deck's best reading was a Full Moon on only
about 55% of days, so even a perfect reader got the top fortune only 41% of the time, and
everyone got a free chip per hand to re-roll blind. Now the deal guarantees a perfect
reading is the best and a Full Moon, and chips are won by reading true.

**Why every element gets +1.** An earlier version gave Air signs +2 for Swords, the
darkest suit, because players could chase their own suit. Under the deal rule that made
Air slightly brighter on average; with +1 for everyone the elements are equal within
noise. If a future change makes one element fall behind, adjust `ATTUNED_BY_SUIT` and
re-run the simulator.

If a change breaks a target, undo it or adjust tier thresholds until the targets hold.
Then update the table above.

---

## 8. What is already done (do not rebuild)

- Sign picker, remembered between visits.
- The omen puzzle: generator, three difficulty tiers, tap-to-light, rule-out pencil marks,
  and a hand-by-hand account of how the omens fitted.
- Three hands with pick up, turn, keep or pass, full-hand reveal. The brightest card is
  kept the moment it is turned.
- Chips won by reading a hand true, recomputed from play on resume.
- The deal rule: a perfect reading is always the deck's best and a Full Moon.
- The moon board, suit marks on card backs, running moon count, keep preview with
  bonuses and "what a third card could complete".
- Two layouts: one column on phones (fits a 360 x 640 screen, main button within thumb
  reach), two columns on wide screens. Hover behaviour only where a pointer can hover.
- Animations: the deal, the card lift and turn, the strike when a card is passed, the
  kept card flying to its place, the moon count ticking up, chips popping, the panel's
  words rising in, and on the result the moon waxing to its phase, the three cards turning
  in order and stars for a Full Moon. All off under reduced motion.
- Keyboard play with focus following the action.
- Mid-game save and resume, with validation so a damaged or outdated save starts the day
  clean. A finished daily reopens on its reading.
- Result screen: tier, one-line arc, three-card reading with the path of each hand,
  patterns, quintessence card, closing, verdict, the odds of doing it blind, the deck's
  best, Insight and Fortune meters, per-hand breakdown with maps of how the omens fitted, chart of the 1,000 blind readings.
- Share to clipboard with a text fallback, spoiler-free, one row of moons per hand.
- Stats: readings, current streak, best streak, average insight, the last 14 readings as
  moons, fortune history, "lucky breaks" and "earned" counts.
- Countdown to the next deck and a prompt when a new day starts.
- Practice hands that do not affect stats.
- Day and night themes, an inline favicon.
- QA shortcut: add `?date=YYYY-MM-DD` to the address to play another day's deck.
- Testing tool: a **Reset today** button in the footer, shown while `TEST_TOOLS` is `true`
  in `js/app.js`. Two taps (the page cannot show a confirmation dialog) clear today's
  daily reading and today's stats entry, keep the sign, and return to the start, so the
  same deck can be played again. It must be off at launch: see Task 1.

---

## 9. Launch tasks, in order

Do one task at a time. After each, run `npm test`, play one full game by hand, and commit.

### Task 1. Set the launch date

1. In `js/engine.js`, set `CONFIG.EPOCH` to the real launch date (`YYYY-MM-DD`). That date is Day 1.
2. Update the `days` helper and the three dates in the "day numbers" test in
   `tests/engine.test.js` to match.
3. In `js/app.js`, set `TEST_TOOLS = false`. This hides the **Reset today** button.
   Leaving it on would let players replay the daily until they like their fortune.

Done when: `npm test` passes, the masthead reads "Day 1" on launch day, and the footer
shows no Testing strip.

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
5. Keep the suit marks on the card backs. The omens depend on them.

Done when: every one of the 78 ids has an image, reversed cards show rotated 180 degrees,
and the network tab shows no card image loading before its card is turned.

### Task 6. Analytics (optional, ask the owner first)

Use a cookieless, privacy-first tool. Send only these events, with no personal data:

| Event | Properties |
|---|---|
| `game_start` | `mode`, `sign` |
| `card_turned` | `round`, `turn_number`, `was_brightest`, `decision` (`keep`, `pass` or `forced`) |
| `game_finish` | `mode`, `insight`, `tier`, `passes`, `first_finds` |
| `share` | `mode`, `tier` |

`was_brightest` per round is the figure to watch: it tells you whether the Past, Present
and Future puzzles are as hard as intended. Put the calls in `js/app.js` next to `newGame`,
`turn`, `keep`, `pass`, `finishGame` and `share`. Wrap each in `try/catch` so a blocked
script can never break play.

Done when: events arrive for a test game, and the game still works with the analytics
host blocked.

### Task 7. Install and offline support (optional)

1. Add `manifest.webmanifest` (name "Tarotio", `display: standalone`, theme colour
   `#163b34`, icons at 192 and 512).
2. Add a service worker that caches `index.html`, `styles.css` and the three scripts.
   Give the cache a version name and change it on every release.
3. Do not cache across days in a way that hides a new deck: the deck is computed in the
   browser from the date, so cached files are fine as long as releases update the cache.

Done when: the site installs to a phone home screen and a game can be played in airplane mode.

### Task 8. Server-dealt decks (optional hardening)

Today the deck is computed in the browser, so a determined player could read the code and
find the brightest cards without solving anything. For a casual game that is acceptable.
If the owner wants to prevent it:

1. Add `GET /api/daily?date=YYYY-MM-DD&sign=leo` that returns, for each hand, only the
   public information: the ten suit marks in place order, the sorted list of ten
   moons, and the omen texts with their `focus` and `moons`. Compute them with the same
   `js/engine.js`, using the seed key `"<date>|<sign>|<SECRET>"` where `SECRET` is an
   environment variable that is never sent to the browser.
2. Add `POST /api/turn` that takes the date, sign, hand and position and returns that
   card. The server must record turns per player so a passed card cannot be turned again
   and a kept card ends the hand. This needs a session or account; ask the owner which.
3. Refuse dates later than today (allow 14 hours of slack for time zones).
4. Practice hands stay local.

Done when: the page never receives a card it has not turned, two devices get the same
deck and omens, and a request for tomorrow is refused.

### Task 9. Final checks before announcing

Run through this list on a phone and a desktop, in day and night themes:

- [ ] `npm test` passes and `npm run simulate` meets every target in section 7, including sign fairness.
- [ ] Solve all three hands by reasoning alone, on paper if needed. Each must have exactly one answer.
- [ ] Reading all three hands true gives a Full Moon, and the result says it was skill.
- [ ] A first hand turned wrong is kept at once (no chips yet). A hand read true shows a chip won.
- [ ] A full daily game works with keyboard only.
- [ ] Refreshing in every phase resumes in the same phase with the same cards, chips, omens and pencil marks.
- [ ] A single tap on a card only picks it up. It takes a second tap to turn it.
- [ ] A passed card stays passed after a refresh.
- [ ] After finishing, the page shows the reading and offers no second daily game.
- [ ] `TEST_TOOLS` is `false` and there is no Reset today button anywhere on the page.
- [ ] Changing the device date forward one day offers a new deck and keeps the streak.
- [ ] The share text contains no card names.
- [ ] No horizontal scrolling at 360 px wide, in every phase.
- [ ] On a 360 x 640 phone, the hand, the omens and the main button are on screen together.
- [ ] At 1280 px wide, the hand and the omens sit side by side.
- [ ] The ten cards stay in the same place for the whole hand.
- [ ] On a phone, the omens sit above the grid and both rows of cards are on screen with them.
- [ ] In dev tools, a face-down card's markup contains no face, name or brightness.
- [ ] With "reduce motion" on, nothing flips, flies or fades, and every number is correct at once.
- [ ] With `localStorage` blocked (private window), a game can still be played to the end.
- [ ] With the saved state edited to nonsense in dev tools, the page still loads to a clean start.
- [ ] The words in section 6's banned list appear nowhere in the interface.

---

## 10. Adding content after launch

**More kinds of omen.** Add a template in `omenPool` in `js/engine.js`. A direct omen is
just a set of places. An indirect omen needs a constraint type that `feasible()`,
`conTest()` and `subjects()` all understand; add it to all three. Each needs a sentence,
a `focus` list and a truth that depends only on places, suit marks and moons. Then run `npm test`: the puzzle tests check
that every dealt hand still gets omens that are true, sufficient, lean and free of
giveaways. Play at least ten hands that use the new template before shipping it. A new
template changes which omens future days get; that is fine, but never ship one on a day
people are already playing.

**More reading variety.** Add strings to `TIERS[n].lines`, `TIERS[n].close`,
`POSITIONS[n].leads` or `VERDICTS` in `js/engine.js`, or to a sign's `opens` in
`js/cards.js`. Lead templates must contain `{k}`. Closing templates may use `{gift}`,
`{Gift}` and `{ease}`.

**Another language.** Copy `js/cards.js` into per-language files with the same ids and
numbers, and move the strings in `js/engine.js` (including the omen sentences) and
`js/app.js` into a strings table. Keywords must still be exactly three noun phrases. Do
not change any `a` value, id or number per language: the deck and the puzzle must be the
same in every language.

---

## 11. Mistakes to avoid

- Do not merge Insight and Fortune into one number or one leaderboard.
- Do not let an omen mention anything the player cannot see: a card's name, its number,
  whether it is reversed.
- Do not hand-write omens for a day. They must come from the generator, or the fairness
  tests mean nothing.
- Do not remove the unique-brightest rule from the deal. "The brightest card" must mean
  exactly one card.
- Do not hand out chips free (one per hand, a starting chip, a daily bonus). A free chip is
  a free re-roll and puts luck back in charge. Chips are won by reading a hand true.
- Do not loosen the deal rule. If a perfect reading can fall short of a Full Moon, the
  game stops rewarding skill.
- Do not let passed cards be taken back. The gamble is the point.
- Do not make a card turn on a single tap.
- Do not add a timer. Time pressure is not part of this game.
- Do not add hints that give the answer. Lighting the cards an omen speaks of is the limit.
- Do not let a player replay the daily to get a better fortune. Practice hands exist for
  that. The Reset today button is for testing only and must be off at launch.
- Do not put a face-down card's face, name, orientation or brightness in the page, in
  hidden markup, `title` attributes or `aria-label`s. Suit only.
- Do not sort the moon board in any way that depends on card position.
- Do not use `Math.random()` in `js/engine.js`.
- Do not rename card ids or change card numbers. Saved games and seeds depend on them.
- Do not change the order of the `CARDS` array. The shuffle reads it in order, so
  reordering changes every future deck.
- Do not animate cards in from the right edge. On a narrow phone that makes the page
  scroll sideways for a moment. Cards fly in from the upper left.
- Do not add an animation that the player has to wait for before they can act, and do
  not add one without a reduced-motion fallback.
- Do not put anything of changing height above the hand.
- Do not replace `feasible()` with checking every layout of the moons in the game itself.
  It is exact but too slow for a phone at ten cards; keep the brute-force check in the tests.
- Do not add frameworks or a build step unless the owner asks. The game is about 180 KB
  of plain files and loads instantly.
- Do not describe a result as the player's fault, and do not describe a card as bad.
