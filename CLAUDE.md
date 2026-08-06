# CLAUDE.md

Guidance for working in this repository.

---

## Part 1 — Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific
instructions as needed.

Source: [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites
due to overcomplication, and clarifying questions come before implementation rather than
after mistakes.

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
