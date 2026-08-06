# Testing

Success criteria, stated as checks. Per principle 4 in `CLAUDE.md`, each feature below is
written as something verifiable rather than as "make it work" — the point is to be able
to loop to green without asking.

Unit tests use Vitest and cover `src/game/` plus the worker's cache-guard decision, which
is extracted as a pure function precisely so it can be tested here. Components are checked
by hand against `UI_SPEC.md` using the manual checklist at the end; there is no component
test harness, because the logic that can actually be wrong is all outside the components.

```
npm test              # once
npm test -- --watch   # while working
```

## Build order

Each step is verifiable on its own. Don't start a step until the previous one is green.

```
1. codes.ts       → verify: round-trip and space-size tests pass
2. feedback.ts    → verify: all 10 worked examples from GAME_RULES.md pass
3. solve.ts       → verify: scan tests, both modes agree, secret-survives property
4. game.ts        → verify: reducer tests, incl. win-on-last-attempt and applyScan ordering
5. worker         → verify: cache-guard tests; then a 10×8 game resolves in the browser
6. UI             → verify: manual checklist below
7. perf           → verify: measure the table below; record the numbers here
```

Build the worker before the UI, not with it. Its cache guard is pure decision logic and
the most likely place for a silent wrong answer; testing it behind a rendered board is
much harder than testing it alone.

If step 7 misses its budget, `DESIGN.md` names the remedy. Don't pre-apply it — measure
first, then optimize the thing the measurement indicts.

## `codes.ts`

- `expect(decode(encode(c, config), config)).toEqual(c)` for every code in a 4×3 space,
  and for random codes at the maximum 10×8. (Note `toEqual` — `decode` returns a new
  array, so `===` would compare references and pass vacuously on nothing.)
- `encode` is order-sensitive: `encode([0,1])` ≠ `encode([1,0])`.
- Ids are dense and unique: over a full 4×3 space, `encode` produces exactly `0 .. 63`
  with no gaps and no repeats.
- `decodeInto` writes the same digits as `decode`, and reusing one buffer across many
  calls gives the same results as fresh ones — the bug that would otherwise appear only
  under load, as stale digits from a previous candidate.
- `spaceSize` returns `colors ** slots` for `2×2`, `6×4`, `10×6`, `10×8`.
- `spaceSize({colors: 10, slots: 8}) === 100_000_000`, and it is below `2 ** 32`. This is
  the assertion that fails first if someone raises the `slots` bound without changing the
  encoding — which is the whole point of having it.

## `feedback.ts`

- **All ten worked examples in [`GAME_RULES.md`](GAME_RULES.md#worked-examples)**, as a
  table-driven test, quoting each example's number. These are the specification; they
  are not optional and they are not to be edited to match the implementation. If one
  fails, the code is wrong.
- Identical codes score `{ exact: slots, partial: 0 }`.
- Codes sharing no colors score `{ exact: 0, partial: 0 }`.
- `exact + partial <= slots`, over the full 4×3 space (all 4,096 pairs).
- Symmetry: `scoreGuess(a, b) === scoreGuess(b, a)`, over the full 4×3 space.
- The reusable-buffer variant returns identical results to the allocating one.

## `solve.ts`

Both scan functions are pure and synchronous, so all of this runs without a worker. Keep
the configs small — these assertions are about correctness, not speed.

Pass a small `cacheLimit` to force streaming mode in a 4×3 space — that parameter exists
precisely so the streaming path is reachable without a hundred million candidates. Every
test below should run against **both** modes.

- `scanAll` with no turns returns `count === spaceSize(config)`.
- Scanning on feedback `{ exact: slots, partial: 0 }` leaves exactly one survivor: the
  guess itself.
- Survivors are monotone: each turn's count is ≤ the previous turn's, and every survivor
  was already a survivor before.
- `sample` holds `min(count, SAMPLE_LIMIT)` ids, all of them genuine survivors.
- `ids` is populated iff `count <= cacheLimit`, and when populated its length is `count`.
- With `cacheLimit` set just below the true survivor count, `ids` is `null` and `count`
  is still exact — the overflow path must abandon the buffer without corrupting the
  count.
- A guess that has already been made eliminates nothing further (idempotent).

**The two modes agree.** The load-bearing test for the whole two-mode design: for several
random 4×3 games, applying `scanCached` turn by turn must produce exactly the same
survivor set as calling `scanAll` against the full history. Compare the sets, not just the
counts — and compare the `sample` arrays too, since the UI shows them and nothing else
pins them to the same 500 codes.

**Property — the secret always survives.** For 500 random games (`colors` 2–6, `slots`
2–4, random secret, random guesses until the game ends), assert after every turn that the
survivor set contains `encode(secret)`. This is the invariant the whole solver panel
depends on; a failure means the feedback shown to players contradicts itself.

Small configs deliberately — 10×8 would be 500 × 100,000,000 scans, and the invariant is
about the logic, which doesn't know how big the space is.

**Property — the count never reaches 0.** Falls out of the above, but assert it directly:
the panel has no empty state and shouldn't need one.

## `game.ts`

- `newGame` produces a secret of length `slots` with colors in range, an empty draft of
  length `slots`, `status: 'playing'`, and `solver.count === spaceSize(config)` — with no
  scan performed. The initial count is arithmetic; a `newGame` that scans would take
  seconds at 10×8.
- `newGame` seeds a non-empty `solver.sample`, strided across the space, without scanning.
  At 10×8 the seeded ids must not all share a leading digit.
- `newGame` adopts `pendingConfig` as the running `config`; `setPendingConfig` changes
  only `pendingConfig` and leaves `config`, `secret`, `turns` and `status` untouched.
- `placeColor` / `clearSlot` / `submitGuess` all return state unchanged when
  `status !== 'playing'`.
- With a seeded RNG, `newGame` is deterministic.
- `submitGuess` on an incomplete draft returns state **unchanged** — no turn appended,
  no attempt consumed.
- `submitGuess` after the game ends returns state unchanged.
- A correct guess sets `status: 'won'` and appends the turn.
- Running out of attempts sets `status: 'lost'`.
- **Winning on the final attempt is a win, not a loss.** Explicit test: `attempts: 1`,
  guess the secret.
- `turns.length` never exceeds `config.attempts`.
- The draft clears after a successful submission.
- `placeColor` / `clearSlot` never mutate the input state (structural sharing is fine;
  the previous object must be unchanged).
- `submitGuess` leaves `solver` untouched — scanning is not its job.

### The player's notes

- `newGame` starts with nothing ruled out and no marks, sized to the config, and clears
  both when a game restarts.
- `toggleRuledOut` flips a color off and back on.
- `placeColor` refuses a ruled-out color and still accepts every other one. Test the
  reducer, not the button — the whole point of enforcing it there is that the keyboard
  path is covered too.
- `setDraft` still accepts a code containing a ruled-out color, because the solver's sole
  remaining possibility outranks a belief.
- `cycleMark` runs unmarked → correct → wrong → unmarked, keeps marks independent per
  turn and slot, and does not mutate the input state.

**Property — notes never reach the solver.** Play a turn, apply a scan, then rule out
every color and mark every peg. `solver`, `turns`, and `secret` must come back identical.

This is the guard on the boundary in `GAME_RULES.md`: the solver's promise that the secret
is always among the candidates holds only because every constraint came from real
feedback. If a note could filter the candidate set, a mistaken one could eliminate the
right answer while the count still read as authoritative — a failure with no visible
symptom, which is why it gets a test rather than a comment.

### `applyScan`

The ordering guarantees. This is where async bugs would otherwise live, and every case
below is a real sequence a player can produce:

- A result with matching `gameId` and `turnsCovered === turns.length` is applied, setting
  count and sample.
- A result with `turnsCovered <= solver.turnsCovered` is **ignored** — state comes back
  identical. The late-arriving stale scan; it must be a no-op rather than a count that
  jumps backwards.
- Applying the same result twice is a no-op.
- **A result whose `gameId` doesn't match is ignored.** Reproduce the actual sequence:
  play 3 turns, start a scan, call `newGame`, then deliver the in-flight result. Its
  `turnsCovered` of 3 is *greater* than the fresh state's 0, so a `turnsCovered`-only
  guard would accept it and paint the dead game's count onto a new board. This is the
  test that catches it.
- `newGame` increments `gameId`, so a result can never be mistaken for the current game
  by coincidence.

### Worker cache guard

The worker's mode choice is pure decision logic — extract it so it can be tested without
a worker. Given cache state `{ ids, cachedTurns, cachedConfig, gameId }` and an incoming
`scan` message, it must choose `scanCached` **only** when all four hold, and `scanAll`
otherwise:

- `ids !== null`, `gameId` matches, `config` equals `cachedConfig`, and
  `turns.length === cachedTurns + 1` → `scanCached`.
- `turns.length === cachedTurns + 2` (a skipped post) → **`scanAll`**. Filtering by only
  the newest turn would leave survivors the skipped turn should have eliminated, and the
  panel would report a count that is too high with nothing looking broken.
- A different `config` → `scanAll`. Ids from a 6×4 space are meaningless in a 10×8 one.
- A different `gameId`, or after `reset` → `scanAll`.
- `turns.length === cachedTurns` (a duplicate post) → either is correct, since refiltering
  by an applied turn is idempotent. Pick one and assert it, rather than leaving it to
  chance.

## Performance

Measurements, recorded here, not asserted in CI — timing assertions are flaky on shared
runners. Take them in a production build, not the dev server.

Measured in a production build (`npm run build && npm run preview`), Chromium 142,
WSL2 / Linux 6.6, 2026-08-07.

| Measurement | Budget | Measured |
| --- | --- | --- |
| First scan at 10 × 6 (1,000,000 codes) | under 100 ms | **74 ms** ✓ |
| First scan at 10 × 8 (100,000,000 codes) | under 4 s | **3,522 ms** ✓ |
| **Survivors after guess 1 at 10 × 8** | **must be ≤ 16M** | **9.4M median, 15.1M worst of 10** ✓ |
| Second scan at 10 × 8 (cached, ~14M ids) | under 3 s — see below | **2,381 ms** ✓ |
| Third scan onward at 10 × 8 | under 300 ms | **168 ms**, then 48 ms ✓ |
| Main-thread heap at 10 × 8 | under 100 MB | **5 MB** ✓ |

The second-scan budget was **corrected from 100 ms**, which was never achievable and was
set without evidence. Cached mode is O(survivors) at roughly 170 ns each, and the cached
set after one guess at 10 × 8 is ~14,000,000 — so ~2.4 s is what the algorithm costs,
not a defect. The 100 ms figure holds from the third scan on, once the set is under a
million. A 10 × 8 game is therefore slow for two turns and instant thereafter.

The 5 MB main-thread heap is the load-bearing one: it confirms the 100,000,000-code space
and the 56 MB cached list never leave the worker.

The third row is the one that validates the *design* rather than the implementation, and
it is why `CACHE_LIMIT` is 16,000,000 rather than the 2,000,000 an earlier draft assumed.
The reasoning is in [DESIGN.md](DESIGN.md#why-cache_limit-is-16000000): feedback classes
are heavily skewed, so a random secret lands in a much larger class than the average, and
the expected survivor count after one guess at 10 × 8 is ~10,000,000 — not the ~2,300,000
that dividing by the 44 distinct feedback values suggests.

If the measured median lands above 16,000,000, the cache is not engaging after guess 1
and a 10 × 8 game streams for multiple turns. Raise the limit and the memory budget
together — they are one decision, since the limit *is* the peak allocation.

The memory row guards the reason for streaming at all. Peak should be roughly the 64 MB
scan buffer; if it approaches the 400 MB the full space would occupy, something is
materializing the space and the streaming path isn't doing what it claims.

If a budget is missed, see [Cost](DESIGN.md#cost). Optimize only the thing the
measurement indicts.

## Manual checklist

Run against `npm run dev` before calling the UI done. Each item traces to a section of
[`UI_SPEC.md`](UI_SPEC.md).

**Play**
- [ ] A default game (6/4/10) is playable to a win and to a loss.
- [ ] Submit is disabled until all slots are filled, and gives a reason.
- [ ] Clicking colors fills slots left to right without touching the slots.
- [ ] Clicking the selected slot clears it; a cleared slot can be refilled.
- [ ] Locked rows never change.

**Config**
- [ ] Each of 2×2×1 and the maximum 10×8×20 starts and plays.
- [ ] At 10×8×20 the page scrolls, the active row is scrolled into view after each
      submission, and the palette and submit stay reachable without hunting.
- [ ] Every peg renders its number; white has a visible border against the board.
- [ ] At 10 colors the palette reads `1`–`10`, `10` fits inside its peg, and key `0`
      places it.

**Notes**
- [ ] The corner toggle rules a color out and brings it back.
- [ ] A ruled-out swatch shows its ↺ badge **without hovering**, and one press restores
      the color to full use, including its number key.
- [ ] On a touch device the ✕ toggle is visible without hover — otherwise ruling out
      cannot be discovered or undone there at all.
- [ ] A ruled-out swatch is visibly spent but its number is still readable, and it is
      neither hidden nor removed from the row.
- [ ] A ruled-out color cannot be placed by clicking it **or** by pressing its number key.
- [ ] Ruling a color out leaves the draft and all locked rows untouched.
- [ ] Clicking a peg in a past guess cycles it correct → wrong → unmarked, and the ✓/✕
      badges are legible at 10 × 8 peg sizes.
- [ ] **The possible-codes count does not move when anything is ruled out or marked.**
- [ ] The hint says the marks are the player's notes, not the game's verdict.
- [ ] `New game` clears every mark and restores every ruled-out color.
- [ ] Changing a dropdown mid-game does not restart the game, and does **not** change the
      palette or board — a 6-color game stays 6-color after switching the dropdown to 10.
- [ ] The `New game` button indicates when the dropdowns differ from the running game.
- [ ] `New game` asks for confirmation only when `turns.length > 0` and the game is still
      playing; a fresh board and a finished game both skip it.

**Solver — small configs**
- [ ] Initial count equals `colors ^ slots` (1,296 at defaults), shown instantly.
- [ ] Expanding the list on a fresh board before any guess shows 500 codes spread across
      the space — not an empty box, and not 500 codes sharing the same leading pegs.
- [ ] The count drops after every guess and never increases.
- [ ] The list is collapsed by default and stays open once opened.
- [ ] At a count of 1, the shown code is the actual secret — verified after winning — and
      clicking it fills the active row.
- [ ] The `Narrowing…` treatment is never seen at 6×4: scans finish well inside the
      200 ms threshold, so no spinner should ever flash.

**Solver — 10×8**
- [ ] Initial count shows `100,000,000` immediately, with no delay and no scan.
- [ ] After the first guess the panel shows the stale count dimmed, labelled with the
      turn it belongs to, plus `Narrowing…`.
- [ ] An expanded code list goes dimmed and labelled while stale — not emptied, not
      disabled.
- [ ] **The board stays fully interactive while the scan runs** — the next guess can be
      composed and submitted mid-scan. This is the whole reason for the worker; if input
      blocks, the design is not implemented.
- [ ] Submitting mid-scan does not produce a count that jumps backwards or settles on a
      stale value.
- [ ] The count eventually resolves and the panel returns to normal.
- [ ] **Guess 2 resolves in well under a second** — this confirms the set went cached
      after guess 1, which is the entire premise of `CACHE_LIMIT`. If guess 2 also takes
      seconds, record the survivor count and see the performance table above.
- [ ] `New game` *during* a 10×8 scan produces a fresh board whose count is
      `100,000,000` and stays there — the dead game's result must never land.
- [ ] The list shows `Showing 500 of …` while the count is large.

**Leakage**
- [ ] With a game in progress **and the solver count above 1**, the secret appears nowhere
      in the DOM. Search the inspector for the code's numbers and for `secret`. (At a
      count of 1 the secret is shown deliberately — see `GAME_RULES.md`.)
- [ ] The worker never receives the secret. Check the posted messages: `gameId`, `config`
      and `turns` only. Everything the solver needs is already on the board.

**Keyboard and a11y**
- [ ] A full game is playable with keys only: `1`–`9`/`0`, arrows, `Backspace`, `Enter`.
- [ ] At 10 colors, `0` places the 10th color. At 6 colors, `7`–`9`/`0` do nothing.
- [ ] Arrow keys wrap at both ends; `Backspace` on an empty slot steps back and clears.
- [ ] Keys do nothing once the game is over.
- [ ] After clicking palette colors with the mouse, Enter still submits — it does not
      re-fire the last button clicked.
- [ ] Tabbing to `Show codes` and pressing Enter toggles the list rather than submitting.
- [ ] Feedback is announced immediately on submit; the count is announced separately when
      it resolves.
- [ ] Tab order matches the visual layout; focus is always visible.
- [ ] With a screen reader, each guess announces its feedback and the remaining count.
- [ ] Every peg shows its number, on the board and in the solver list.
- [ ] Feedback pegs read as `N exact, M partial`.
- [ ] With `prefers-reduced-motion`, nothing animates.

**Responsive**
- [ ] At 375 px wide the solver panel stacks below the board and nothing overflows.
- [ ] At 375 px, a 10×8×20 game is still playable: palette buttons and active-row slots
      keep ≥44 px targets, locked-row pegs shrink, and nothing overflows horizontally.
      This is the tightest layout the app allows.
- [ ] At 1920 px the board stays centered and does not stretch.
