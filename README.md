# Tarotio

A daily tarot logic puzzle. Everyone gets the same puzzle; every player draws their own reading.

Each day deals three hands of ten cards, face down in two rows of five. Every hand holds
exactly one Full Moon, and the reader gives you omens: a few true clues per hand that,
together, point to exactly where it is. Work out where it hides, turn it over, and keep
it. The three cards you keep are your Past, Present and Future, read together as your
fortune for the day.

The puzzle (where every moon and suit mark sits, and the omens) is the same for everyone,
whatever their sign. The tarot card in each place is drawn at random for you, matching its
suit mark and moon, so two players who find the same Full Moon may turn over The Sun and
the Ace of Cups. Your sign shapes how your cards are read.

Skill decides the fortune. Your fortune is the moons of your three cards: find all three
Full Moons and it is 15 moons, a Full Moon, every day. Luck only decides the hands you leave
to chance, and the result says plainly how often turning blind would have done as well.

## Play it

Open `index.html` in a browser. There is nothing to install or build. It works on a
phone and on a desktop.

To serve it locally instead:

```bash
npm start
```

Then open `http://localhost:8080`.

## How a hand works

1. **Read the omens.** Two to five clues such as "The Full Moon touches a Cups card"
   or "The Half Moon shares a column with the Full Moon". Every omen is true, and
   together they leave one card. The Past is plain; the Future always needs clues chained
   together.
2. **Turn a card.** Tap a card to pick it up, tap again to turn it over.
3. **Found it, or not.** The Full Moon is yours the moment you turn it. Turn another
   card and, if you hold a chip, you can keep it or spend the chip to burn it and turn
   again. With no chips, the card you turn is the card you keep.
4. **Win chips.** Turn the Full Moon on your first try and you win a chip for the
   hands ahead. Chips are never free: second chances are earned.

What you reason from:

- **The moon board** shows the ten moons the hand holds, but never which card is which.
- **Suit marks** on the card backs show each card's suit, or a star for Major Arcana.
- **Position**: two rows of five. A card *touches* the cards beside it and the card
  directly above or below it.

Tap an omen to light the cards it speaks of. Tap the label under a card to rule it out.

Patterns across your three cards (your element, three of a suit, a repeated number, a
run, your sign's own card) colour the reading but never change the moons, so the same
play always earns the same fortune. Card meanings follow the Rider-Waite-Smith
tradition, including reversals.

Keyboard: 1 to 5 pick up a card in the top row and 6 to 9 and 0 in the bottom row (the
same key or Enter turns it), Shift with the key rules a card out, K keeps, P passes.

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

While testing:

- **Reset today**, in the footer, clears today's reading and its stats entry so you can
  play today's puzzle again, with newly drawn cards. Tap it twice. Turn it off before launch by setting
  `TEST_TOOLS = false` in `js/app.js`.
- Add `?date=YYYY-MM-DD` to the address to play another day's deck.
- **Try a practice hand** deals a fresh random deck that never touches your stats.

## Taking it live

[`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) is the full specification and launch
plan, written so an AI coding agent or a developer can follow it step by step: the exact
rules, how the puzzles are generated, the data formats, the tone rules, the balance
targets, and the ordered launch tasks.
