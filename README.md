# mymastermind

A Mastermind game as an interactive front-end app. Guess the hidden code of colored pegs;
after each guess you learn how many pegs are the right color in the right place, and how
many are the right color in the wrong place. A side panel tracks how many codes are still
consistent with everything you've been told.

Colors (2–10), code length (2–8), and number of attempts (1–20) are all configurable.

**Status: playable.** 68 unit tests, measured performance recorded in
[`docs/TESTING.md`](docs/TESTING.md).

```
npm install
npm run dev      # play it
npm test         # unit tests
npm run build    # typecheck + production build
```

Play with the mouse or entirely from the keyboard: `1`–`9`/`0` place colors, arrows move
between slots, `Backspace` clears, `Enter` submits.

## Documents

| Document | What's in it |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Working guidelines and project conventions |
| [`docs/GAME_RULES.md`](docs/GAME_RULES.md) | Rules, config bounds, the feedback algorithm and its worked examples |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Architecture, state model, code encoding, solver |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | Screens, interaction, keyboard, accessibility |
| [`docs/TESTING.md`](docs/TESTING.md) | Build order and success criteria |

Read `GAME_RULES.md` first — the others assume its vocabulary.

## Stack

React + TypeScript + Vite, Vitest for tests. No runtime dependencies.

The solver runs in a Web Worker. At the largest configuration — 10 colors × 8 slots —
there are 100,000,000 possible codes, so the first scan takes a few seconds; the board
stays fully playable while it runs, and the game is instant from the third guess on.

## License

[MIT](LICENSE).

The four working principles in [`CLAUDE.md`](CLAUDE.md) are adapted from
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills),
rewritten in this repository's own words.

Mastermind is a trademark of its respective owner. This is an independent
implementation of the game's public rules, with no affiliation.
