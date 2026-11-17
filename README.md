# Tarotio

A daily tarot puzzle for your star sign.

Each day a deck is shuffled for every sign and deals three hands of five cards, face
down. The reader gives you omens: a few true clues per hand that, together, point to
exactly one card, the brightest. Work out where it hides, turn it over, and keep it. The
three cards you keep are your Past, Present and Future, read together as your fortune for
the day.

Skill decides the fortune. Every deck is dealt so that its three brightest cards make its
best reading, and that reading is a Full Moon: read all three hands true and the Full Moon
is yours, every day. Luck only decides the hands you leave to chance, and the result says
plainly how often turning blind would have done as well.

## Play it

Open `index.html` in a browser. There is nothing to install or build. It works on a
phone and on a desktop.

To serve it locally instead:

```bash
npm start
```

Then open `http://localhost:8080`.

## How a hand works

1. **Read the omens.** Two to four clues such as "The brightest card is a Cups card" or
   "The Gibbous Moon sits at one end of the row". Every omen is true, and together they
   leave one card. The Past is plain; the Future takes some untangling.
2. **Turn a card.** Tap a card to pick it up, tap again to turn it over.
3. **Found it, or not.** The brightest card is yours the moment you turn it. Turn another
   card and, if you hold a chip, you can keep it or spend the chip to burn it and turn
   again. With no chips, the card you turn is the card you keep.
4. **Win chips.** Turn the brightest card on your first try and you win a chip for the
   hands ahead. Chips are never free: second chances are earned.

What you reason from:

- **The moon board** shows the five moons the hand holds, but never which card is which.
- **Suit marks** on the card backs show each card's suit, or a star for Major Arcana.
- **Position**: the cards sit in a row of five.

Tap an omen to light the cards it speaks of. Tap the label under a card to rule it out.

The three cards are read together, so the right three are worth more than their moons:
cards in your sign's element, three of a suit, a repeated number, a run of numbers or
your sign's own card all add to the fortune. Card meanings follow the Rider-Waite-Smith
tradition, including reversals.

Keyboard: 1 to 5 pick up a card (the same key or Enter turns it), Shift with 1 to 5 rules
a card out, K keeps, P passes.

## Develop

```bash
npm test
```

```bash
npm run simulate
```

```bash
npm run bundle
```

- `npm test` checks the rules and the content, including that every puzzle is true,
  solvable, and has no spare or giveaway clue.
- `npm run simulate` plays thousands of games and prints how fortunes fall for players of
  different skill, and whether any sign is luckier than another.
- `npm run bundle` writes `dist/tarotio.html`, the whole game in one file.

Add `?date=YYYY-MM-DD` to the address to play another day's deck while testing.

## Taking it live

[`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) is the full specification and launch
plan, written so an AI coding agent or a developer can follow it step by step: the exact
rules, how the puzzles are generated, the data formats, the tone rules, the balance
targets, and the ordered launch tasks.
