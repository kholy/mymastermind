# CLAUDE.md

Guidance for working in this repository.

---

## Part 1 — How to work here

Four habits that head off the ways coding assistants usually go wrong. Combine them with
whatever the task itself demands.

The four principles are adapted from
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md);
the wording here is this repository's own.

**What they cost:** deliberation, at the expense of speed. On a one-line change, skip the
ceremony and use judgment.

### 1. Understand the task before writing code

*Guesses stay hidden. Say them out loud instead.*

- Write down what you're taking for granted. Where you can't, ask.
- A request that can be read two ways gets both readings raised, not one chosen quietly.
- Noticed a shorter route? Argue for it. Disagreement is part of the job.
- Genuinely stuck on what something means? Stop and name the specific thing that's
  unclear. Guessing costs more than asking.

### 2. Write the least code that works

*Build what was asked for. Nothing on speculation.*

- Features nobody requested don't get written.
- One call site doesn't justify an abstraction.
- Knobs and options are features too — they need asking for.
- Don't guard against states that cannot occur.
- If the 200 lines you just wrote would fit in 50, write the 50.

The check: would an experienced colleague reading this call it more machinery than the
problem deserves? Then it is.

### 3. Change as little as possible

*Confine edits to the task. Tidy up after yourself, nobody else.*

Working in code that already exists:

- Leave neighbouring code, comments, and formatting alone, however tempting.
- Working code doesn't get refactored as a side errand.
- Follow the conventions already there, including the ones you'd have chosen differently.
- Spotted unrelated dead code? Say so and leave it in place.

When an edit strands something:

- Delete the imports, variables, and functions *your* change orphaned.
- Leave dead code you didn't create until someone asks for it.

The check: point at any modified line and trace it back to what was actually requested.

### 4. Make success checkable, then check it

*Decide what "done" looks like first. Iterate until it's demonstrably true.*

Turn instructions into things that can pass or fail:

- "Add validation" becomes "tests covering the bad inputs, currently red, then green."
- "Fix the bug" becomes "a test that reproduces it, then that test passing."
- "Refactor X" becomes "the suite is green before, and green after."

For anything multi-step, sketch the shape first:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

A sharp definition of done lets the work proceed without interruption. A vague one
("make it work") guarantees more questions later.

**Signs it's working:** diffs contain only what the task required, less gets thrown away
for being overbuilt, and the questions arrive before the code rather than after the
rework.

---

## Part 2 — This Project

A Mastermind game as an interactive front-end app. The player guesses a hidden code of
colored pegs and receives exact/partial feedback after each guess. A solver panel shows
how many codes remain consistent with the feedback so far.

### Stack

React + TypeScript + Vite. Vitest for unit tests. No other runtime dependencies —
if you reach for a library, say why first. Commands are in [`README.md`](README.md).

### Where things live

| Path | Contains |
| --- | --- |
| `src/game/` | Pure game logic. No React, no DOM, no I/O, no async. |
| `src/solver.worker.ts` | The only async code in the project. A thin wrapper over `src/game/solve.ts`. |
| `src/ui/` | React components. Rendering and input only. |
| `docs/` | Design docs — read these before changing behavior. |

The `src/game/` ↔ `src/ui/` split is the one architectural rule that matters here.
Game logic must stay pure and directly testable; if a rule change requires touching a
component, the rule is in the wrong place.

### Documents

Each states something once; the others link to it rather than restating it. Keep it that
way — a fact written down twice is a fact that will drift.

- [`docs/GAME_RULES.md`](docs/GAME_RULES.md) — rules, the feedback algorithm, and the
  **config bounds table, which is the spec** for colors/slots/attempts ranges
- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, state model, solver, worker protocol
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — screens, interaction, accessibility
- [`docs/TESTING.md`](docs/TESTING.md) — build order and success criteria

### Project-specific rules

- **Feedback scoring is defined once**, in `src/game/feedback.ts` — one function, with an
  optional reusable buffer for hot loops. Duplicate-color handling is subtle enough that a
  second implementation would drift; the worked examples in `docs/GAME_RULES.md` pin it
  down. Never reimplement it inline.
- **The solver must never be able to eliminate the true secret.** The invariant the whole
  feature rests on; it has a dedicated property test. If you change filtering, that test
  must still pass.
- **Never materialize the full code space.** At 10 colors × 8 slots it is 100,000,000
  codes. The solver walks the integer range and caches only the survivors. Any
  `allCodes()`-shaped function reintroduces the bug the design exists to avoid.
- **The worker's cache is only valid for a gapless turn sequence** at one config in one
  game. `docs/DESIGN.md` states the invariant and the four conditions that guard it; a
  cache used outside them reports a count that is too high, and nothing looks broken.
- **Measure before optimizing the scan.** `docs/DESIGN.md` names the remedy and
  deliberately does not call for it up front.
- **Don't add difficulty presets, scoring, timers, persistence, or online play.** None
  were asked for. Configurability is limited to colors, slots, and attempts.
- When a config bound changes, update the table in `docs/GAME_RULES.md` — it is the spec,
  not a description — and re-check the two ceilings in `docs/DESIGN.md`.
