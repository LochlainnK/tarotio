# Tarotio

A daily three-card tarot game for your star sign.

Each day a deck is shuffled for every sign and deals three hands of five cards, face
down. You answer the reader's question to earn a glimpse of the hand, then keep one card.
The three cards you keep are your Past, Present and Future, read together as your fortune
for the day.

Skill and luck are scored separately. **Insight** is what you earned from the questions.
**Fortune** is what the deck gave you. The result shows every reading the deck could have
dealt, so you can see how much of your day was you and how much was the shuffle.

## Play it

Open `index.html` in a browser. There is nothing to install or build.

To serve it locally instead:

```bash
npm start
```

Then open `http://localhost:8080`.

## How a day works

1. **Answer.** Right first time earns two glimpses. Right on the second try earns one.
2. **Glimpse.** Each glimpse turns one face-down card face up.
3. **Keep.** Choose any card, seen or unseen.
4. Repeat for the Present and the Future, then read your three cards.

Card meanings follow the Rider-Waite-Smith tradition, including reversals. Cards in your
sign's element shine a step brighter, and patterns across the three cards (a shared suit,
a repeated number, a run, your sign's own card) add to the fortune.

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
