# Tarotio

A daily three-card tarot game for your star sign.

Each day a deck is shuffled for every sign and deals three hands of five cards, face
down. You turn a card, then hold your nerve: keep it, or pay a chip to pass and turn
another. A passed card is gone for good. The three cards you keep are your Past, Present
and Future, read together as your fortune for the day.

Skill and luck are scored separately. **Insight** is the chips you won from the reader's
questions. **Fortune** is what the cards gave you. The result shows what your first turns
alone would have made beside what you ended with, so you can see exactly what your passes
changed and how much of the day was the deal.

## Play it

Open `index.html` in a browser. There is nothing to install or build.

To serve it locally instead:

```bash
npm start
```

Then open `http://localhost:8080`.

## How a hand works

1. **Win chips.** Every hand comes with one chip. Answer the question to win more: two
   for right first time, one for right on the second try. Unspent chips carry over.
2. **Turn a card.** Tap any face-down card.
3. **Keep or pass.** Keep it, or pay a chip to burn it and turn another. With no chips
   left, the card you turn is the card you keep.

Two things are always on the table to reason from:

- **The moon board** shows the five moons the hand holds, but never which card is which.
  Turned cards are crossed off, so you can see what is still face down before you pass.
- **Suit marks** on the card backs show each card's suit. Cards in your sign's element
  are worth more to you, and three of a suit, a repeated number, a run of numbers or your
  sign's own card all add to the fortune. You are building a three-card hand.

Card meanings follow the Rider-Waite-Smith tradition, including reversals.

Keyboard: 1 to 4 answer a question, 1 to 5 turn a card, K keeps, P passes.

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

- `npm test` checks the rules and the content.
- `npm run simulate` plays thousands of games and prints how fortunes fall for players of different skill.
- `npm run bundle` writes `dist/tarotio.html`, the whole game in one file.

Add `?date=YYYY-MM-DD` to the address to play another day's deck while testing.

## Taking it live

[`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) is the full specification and launch
plan, written so an AI coding agent or a developer can follow it step by step: the exact
rules, the data formats, the tone rules, the balance targets, and the ordered launch tasks.
