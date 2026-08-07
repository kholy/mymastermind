# Design

Architecture, state model, and the solver. Read [`GAME_RULES.md`](GAME_RULES.md) first —
this document assumes its vocabulary (`exact`, `partial`, *possible code*), and its
config bounds table is the spec for the ranges referenced here.

## Shape of the app

A single-page React app with no backend, no router, no persistence. Everything lives in
memory for the duration of one page load; a reload starts over.

There is one hard architectural rule:

```
src/game/   pure logic     no React, no DOM, no async, no randomness at call sites
src/ui/     presentation   no rules, no scoring, no filtering
```

Every rule in `GAME_RULES.md` is implemented in `src/game/` as a plain function over
plain data, and is testable without rendering anything. Components read state and emit
events; they never compute feedback or decide whether the game is over.

The secret's randomness is injected (`newGame` takes an optional RNG) so tests can pin a
known secret. That is the only injected dependency in the project — resist adding more.

## Data model

```ts
// src/game/types.ts

/** A color is an index into the palette: 0 .. colors-1. */
type Color = number;

/** A code as its digits, most significant first. Length === slots. */
type Code = Color[];

/** A code packed into an integer. See "Encoding" below. */
type CodeId = number;

type Feedback = { exact: number; partial: number };

type Turn = { guess: Code; feedback: Feedback };

/** Ranges are specified in GAME_RULES.md and enforced by the SetupPanel inputs. */
type Config = { colors: number; slots: number; attempts: number };

type Status = 'playing' | 'won' | 'lost';

/** What the UI knows about the possible codes. Not the codes themselves. */
type Solver = {
  count: number;           // always known; seeded analytically by newGame
  sample: Uint32Array;     // up to SAMPLE_LIMIT possible codes, for the on-demand list
  turnsCovered: number;    // the turn count this result reflects
};

/** A player's note about one peg in a past guess. */
type Mark = 'correct' | 'wrong';

/** The player's own deductions. Beliefs, not evidence — see below. */
type Notes = {
  ruledOut: boolean[];             // one flag per color
  marks: Record<string, Mark>;     // keyed `${turnIndex}:${slotIndex}`
};

type GameState = {
  gameId: number;             // increments on every New game
  config: Config;             // the running game's config — never changes mid-game
  pendingConfig: Config;      // what the setup dropdowns currently show
  secret: Code;
  turns: Turn[];              // completed guesses, oldest first
  draft: (Color | null)[];    // the active row; length === config.slots
  notes: Notes;
  solver: Solver;
  status: Status;
};
```

`notes` sits in game state because it is per-game session data that must reset when a
game does — putting it here means `newGame` clears it for free, with no second lifecycle
to keep in step. It is nonetheless **not** part of the rules:

> Nothing in `notes` is ever read by `scoreGuess`, by either scan function, or by the
> worker. It changes what is drawn, and it stops `placeColor` accepting a ruled-out
> color. That is all.

`GAME_RULES.md` explains why that boundary carries weight: the solver's guarantee is that
the secret is always among the candidates, and it holds only because every constraint
applied came from real feedback. A mistaken note allowed to filter the set could eliminate
the right answer while the count still looked authoritative. `notes never reach the
solver` in `game.test.ts` pins this down by annotating everything and asserting the solver
state is byte-identical.

Ruling out is enforced in `placeColor` rather than by disabling the palette button, so the
click path and the keyboard path cannot drift apart. Hiding ruled-out colors in the
history is purely a render-time decision in `Board` — `turns` is never rewritten, which
is what makes bringing a color back restore the pegs and their marks exactly.

`solver` is a derived value kept in state because computing it is expensive and it
arrives asynchronously — see [Solver](#solver). Note what it does *not* contain: the set
of possible codes. At maximum configuration that set can hold a hundred million entries,
so it never crosses onto the main thread. The UI needs a number and at most 500 codes to
draw; that is exactly what it gets.

Three fields exist purely to make asynchrony safe, and each earns its place:

- **`solver.turnsCovered`** lets the panel tell whether its count is current
  (`turnsCovered === turns.length`) or still catching up. A number, not a boolean flag:
  the turn count is the fact, and it makes a late result impossible to apply by mistake.
- **`gameId`** distinguishes "this result is from an older turn" from "this result is
  from a *dead game*". Turn counts reset to 0 on `New game`, so they are not monotone
  across games and `turnsCovered` alone cannot tell the two apart — a scan still in
  flight when the player restarts would otherwise paint the previous game's count onto a
  fresh board.
- **`pendingConfig`** is what the dropdowns show; `config` is what the game is being
  played with. They differ whenever the player changes a dropdown mid-game, which
  `UI_SPEC.md` requires *not* to restart the game. The board, palette, and solver read
  `config` and never `pendingConfig`; `New game` copies pending over.

Everything else derives trivially at render time:

- attempts used → `turns.length`
- attempts left → `config.attempts - turns.length`
- can submit → `status === 'playing' && draft.every(c => c !== null)`
- count is stale → `solver.turnsCovered < turns.length`

Don't add those to state.

## Encoding

Codes are handled as integers wherever many of them are stored. A code is a number in
base `colors`, most significant digit first:

```
encode([R, G, B, Y]) with colors=6  →  0*6³ + 1*6² + 2*6¹ + 3*6⁰  =  51
```

The encoding exists for exactly one reason: the cached survivor list (see
[Two modes](#two-modes)) can hold up to `CACHE_LIMIT` codes, and as a `Uint32Array` that
is 64 MB of contiguous memory instead of sixteen million JavaScript arrays. Nothing else
in the design requires it. If cached mode were ever removed, the encoding should go with
it.

The largest possible id is `10⁸ - 1 = 99,999,999`, comfortably inside `Uint32Array`'s
range of ~4.29 billion. See [Changing a config bound](#changing-a-config-bound) — that
headroom is smaller than it looks.

```ts
// src/game/codes.ts
encode(code: Code, config: Config): CodeId
decode(id: CodeId, config: Config): Code               // allocates; for rendering
decodeInto(id: CodeId, config: Config, out: Uint8Array): void   // for hot loops
spaceSize(config: Config): number                      // colors ** slots
```

`decodeInto` is not a micro-optimization. The scan loop visits up to 100,000,000
candidates, and an allocating `decode` would mean 100,000,000 short-lived arrays per
scan — GC pressure that would dominate the runtime and blow the memory budget. Scans use
`decodeInto` with a single reused buffer. `decode` is for rendering, which touches at
most a few hundred codes.

There is deliberately no `allCodes()`. A function that materializes the whole space is
exactly the thing that cannot exist at 10 × 8, and having it available would invite its
use. The set of every possible code *is* the integer range `0 .. spaceSize-1`, so it can
be walked without ever being built.

## Modules

### `src/game/feedback.ts`

```ts
scorePacked(guess: Uint8Array, secret: Uint8Array, counts: Int32Array): number
scoreGuess(guess: ArrayLike<Color>, secret: ArrayLike<Color>, colors: number): Feedback
```

The two-pass algorithm from `GAME_RULES.md`. This is the single definition of scoring in
the codebase. Its duplicate-color behavior is subtle enough that a second implementation
would drift — never write one.

The optional `counts` buffer is why this is one function rather than two: hot loops pass
a reused `Int32Array` of length `colors`, everyone else omits it and takes the
allocation. `secret` is `ArrayLike` so the scan can pass its `Uint8Array` decode buffer
without converting.

### `src/game/solve.ts`

Two pure functions and two constants. Neither function knows what a worker is — they are
ordinary synchronous functions over plain data, and are unit-tested as such.

```ts
const SAMPLE_LIMIT = 500;
const CACHE_LIMIT = 16_000_000;   // 64 MB as a Uint32Array

type ScanResult = {
  count: number;            // survivors
  sample: Uint32Array;      // the first min(count, SAMPLE_LIMIT) of them
  ids: Uint32Array | null;  // all survivors, if count <= cacheLimit; else null
};

/** Walk the whole space, keeping codes consistent with every turn. */
scanAll(config: Config, turns: Turn[], cacheLimit = CACHE_LIMIT): ScanResult

/** Filter an already-consistent list against one new turn. */
scanCached(ids: Uint32Array, config: Config, turn: Turn, cacheLimit = CACHE_LIMIT): ScanResult
```

A candidate survives iff `scoreGuess(turn.guess, decodeInto(c), colors) === turn.feedback`
for the turns being checked. `scanAll` checks each candidate against turns in order and
bails on the first mismatch — the earliest turn eliminates most candidates, so later
turns cost comparatively little.

`cacheLimit` is a parameter, not just a constant, so tests can force streaming mode in a
4 × 3 space instead of needing a hundred million candidates. Without that the streaming
path would be untestable in practice, and would rot.

`scanAll` cannot know `count` before it finishes, so it fills a `cacheLimit`-sized
`Uint32Array` and abandons it (returning `ids: null`) if it overflows. That speculative
64 MB allocation is the design's peak memory, and it is why `CACHE_LIMIT` and the memory
budget in `TESTING.md` have to be chosen together.

### Enumeration

Walk the space as a **digit odometer** — carry an array of `slots` digits and increment
it — rather than decoding each id from scratch. This is not an optimization to defer: it
is no more code than eight divisions per candidate, and it removes the largest term from
the inner loop. Encode only survivors, at the point they are stored.

### Two modes

The obvious design — build the full candidate list once, narrow it every turn — is
correct and fast, and works right up until it doesn't. At 10 × 8 the initial list alone
is 400 MB, so it cannot be built.

So the solver has two modes:

- **Streaming.** Walk `0 .. spaceSize-1`, checking each candidate against the full turn
  history. Counts and samples without storing anything. Memory is O(sample); time is
  O(spaceSize) *every turn*.
- **Cached.** Hold the surviving ids in a `Uint32Array` and filter that list against
  each new turn. Time is O(survivors) — milliseconds or less once the set is small.

The rule: **after any scan, if `count <= CACHE_LIMIT`, keep the ids and use cached mode
from then on; otherwise stay streaming.**

### Why `CACHE_LIMIT` is 16,000,000

This constant decides whether the expensive configurations pay their cost once or every
turn, so it is sized from the measured survivor distribution rather than a guess.

A tempting estimate is that a guess partitions the space into the number of distinct
feedback values (44 at 8 slots), leaving ~2.3M survivors at 10 × 8. **That estimate is
wrong, and any limit derived from it is too small.** Feedback classes are heavily skewed —
`(exact: 0, partial: k)` outcomes dominate — so the class a random secret actually lands
in is far larger than the average class. Measured at 10 colors × 8 slots:

| First guess | Largest feedback class | Expected survivors | P(> 2,000,000) |
| --- | --- | --- | --- |
| all distinct `01234567` | 15,112,500 (15.1%) | 10,022,967 | 91.6% |
| paired `00112233` | 13,288,250 (13.3%) | 8,456,990 | 91.2% |
| all one color `00000000` | 43,012,250 (43.0%) | 35,518,805 | 99.5% |

So a 2,000,000 limit would fail to engage after the first guess in over 90% of 10 × 8
games, and the space would not drop under it until roughly guess 3 — meaning three full
100M scans, not one.

16,000,000 sits just above the largest feedback class for any sensible opening guess, so
**a 10 × 8 game caches after guess 1 in essentially every game and pays the streaming
cost exactly once.** The degenerate all-one-color opening (43M survivors) still streams
for another turn; that is an acceptable price for a guess nobody makes twice.

At 64 MB it is also the design's memory ceiling. `TESTING.md` records the measurement
that confirms both halves of this.

### The gapless invariant

Cached mode filters by only the newest turn, which is correct **iff** the cached list is
exactly the survivor set of all previous turns, in this game, at this config. Stated
precisely:

> The cache is the survivor set of exactly `cachedTurns` turns of game `gameId` at
> config `cachedConfig`.

Monotonicity (a code ruled out at turn 2 never becomes possible again at turn 5) is what
makes incremental filtering *equivalent* to batch filtering, but it is not what makes it
*safe* — safety needs the turn sequence to be contiguous, with no gaps and no config
change underneath it. That invariant is enforced in the worker, below, not assumed.

### `src/game/game.ts`

The reducer. Pure; takes state and an action, returns new state.

```ts
newGame(state, rng?: () => number): GameState   // uses state.pendingConfig
setPendingConfig(state, patch: Partial<Config>): GameState
placeColor(state, slot: number, color: Color): GameState
clearSlot(state, slot: number): GameState
submitGuess(state): GameState
toggleRuledOut(state, color: Color): GameState
cycleMark(state, turn: number, slot: number): GameState
applyScan(state, update, turnsCovered: number, gameId: number): GameState
```

`newGame` increments `gameId`, copies `pendingConfig` into `config`, draws a secret, and
seeds the solver **without scanning**: `count = spaceSize(config)`, because with no
constraints every code is possible and that is arithmetic. The sample is seeded too —
strided across the space (`floor(i * spaceSize / SAMPLE_LIMIT)`) rather than taken from
the bottom, since ids `0..499` all share a long leading prefix and would look broken.

`submitGuess`:

1. Refuse if `status !== 'playing'` or the draft has an empty slot. Return state
   unchanged — no attempt is consumed.
2. Score the draft against the secret.
3. Append the turn and clear the draft.
4. Set status: `won` if `exact === slots`, else `lost` if `turns.length === attempts`,
   else `playing`. Win is checked first, so winning on the final attempt is a win.

It does **not** touch `solver` — scanning is not its job.

`placeColor` and `clearSlot` return state unchanged when `status !== 'playing'`. The
palette is hidden after the game ends, but the keyboard handler is global.

`applyScan` ignores any result whose `gameId` differs from the current one, or whose
`turnsCovered` is not greater than the one already in state. Late, duplicated, and
orphaned results are therefore harmless rather than something callers must prevent.

## Solver

The panel answers one question: **how many codes are still possible?** The set is defined
in `GAME_RULES.md`; how it is displayed is specified in
[`UI_SPEC.md`](UI_SPEC.md#solver-panel) and is not restated here. This section covers how
it is computed.

### Correctness invariant

> The true secret is always in the candidate set.

This holds because the secret satisfies every constraint by construction — for each past
turn, `feedback` *was* `scoreGuess(guess, secret)`. If the invariant ever breaks, the
scoring function and the filter disagree, which means the feedback shown to the player is
lying. `TESTING.md` specifies the property test that guards this. Treat a failure there
as a correctness emergency, not a flaky test.

A corollary worth knowing: the count can never reach 0. The panel needs no empty state.

### Cost

Worst case is the first `scanAll` at 10 colors × 8 slots: 100,000,000 candidates, each
scored against the first turn. With the odometer enumeration and a reused decode buffer
that is roughly 30 operations each — order three billion simple operations, plus a
64 MB allocation.

| Space | Budget | Measured |
| --- | --- | --- |
| ≤ `CACHE_LIMIT` (16M) — every config up to 10 × 7 | under 100 ms | 74 ms at 10 × 6 |
| 10 × 8 — first scan | under 4 s | 3.5 s |
| 10 × 8 — second scan (cached, ~14M ids) | under 3 s | 2.4 s |
| 10 × 8 — third scan onward | under 300 ms | 168 ms |

Seconds, not frames: no amount of tuning makes three billion operations a frame. It is
acceptable only because it happens in a worker, twice per game at the very largest
configuration, while the board stays playable.

**The measurement did indict the straightforward version, and the optimization was
applied.** Scoring each candidate from scratch took 17 s. Carrying the first turn's score
across odometer steps — `exact` and the per-color match total patched in O(1) per changed
digit — brought it to 2.5 s, and making `scorePacked` monomorphic on `Uint8Array` took
10 × 6 from 120 ms to 18 ms. Both changes are in `solve.ts`, and
`incrementalScoringMatchesScorePacked` in the tests is what keeps the fast path honest.

Two further attempts were measured and **rejected** for being no faster: nibble-packing
the cached ids to avoid division, and fusing decode into scoring. The remaining cost is
branch misprediction, not arithmetic, so the op-count model stops predicting anything
useful here. Don't re-litigate these without a measurement.

### The worker

`src/solver.worker.ts` is a thin wrapper around `solve.ts` and the only async code in the
project. It exists because a multi-second scan on the main thread freezes the page; in a
worker the board stays fully interactive and the player can compose and submit their next
guess while a count is still resolving.

It owns the cache — nothing else does — and holds exactly the state the gapless invariant
names:

```ts
{ ids: Uint32Array | null, cachedTurns: number, cachedConfig: Config, gameId: number }
```

Protocol — two message types, discriminated:

```ts
// main thread → worker
{ type: 'reset',  gameId: number, config: Config }
{ type: 'scan',   gameId: number, config: Config, turns: Turn[] }
// worker → main thread
{ type: 'result', gameId: number, turnsCovered: number, result: ScanResult }
```

`reset` drops the cache. On `scan`, the worker uses `scanCached` **iff all four hold** —
`ids !== null`, `gameId` matches, `config` equals `cachedConfig`, and
`turns.length === cachedTurns + 1` — and otherwise falls back to `scanAll`. Any violation
is a cache that does not satisfy the gapless invariant, and the fallback is always
correct, just slower.

That last condition is the one that matters. Without it a skipped or batched post would
leave survivors that the skipped turn should have eliminated, and the panel would
silently report a count that is too high — the failure mode hardest to notice, because
nothing looks broken.

Messages are processed in order, so no cancellation protocol is needed. If the player
races ahead, results simply arrive a turn behind and `applyScan` drops the stale ones.

The worker never receives the secret. Everything it needs is already visible on the
board, which is why showing the possible codes leaks nothing.

Two implementation notes that will otherwise cost an hour each:

- Instantiate as `new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })` —
  Vite requires this exact form to bundle a worker.
- React StrictMode double-mounts effects in development, which creates two workers and
  posts twice. Create the worker in a ref, terminate it in the effect cleanup, and make
  the scan post idempotent (it already is — `applyScan` drops duplicates).

## File layout

```
src/
  game/
    types.ts          Config, Code, Feedback, Turn, GameState, Solver
    codes.ts          encode / decode / decodeInto / spaceSize
    feedback.ts       scorePacked (the definition) + scoreGuess (the wrapper)
    solve.ts          scanAll / scanCached / strideSample / SAMPLE_LIMIT / CACHE_LIMIT
    cache.ts          the worker protocol types + canUseCache
    game.ts           the reducer
  solver.worker.ts    owns the cache; wraps solve.ts
  ui/
    App.tsx           owns GameState and the worker; composes the screen
    SetupPanel.tsx    colors / slots / attempts controls + New game
    Board.tsx         all rows, feedback clusters, palette, keyboard handling
    Peg.tsx           a colored circle with its number, plus mark / spent states
    SolverPanel.tsx   count + collapse bar + on-demand list
    palette.ts        the 10 colors: hex + ink, with label() and shortcut()
    focus.ts          releaseFocus — hands the keyboard back after a mouse click
  main.tsx
  styles.css
docs/
  DESIGN.md  GAME_RULES.md  UI_SPEC.md  TESTING.md
```

`cache.ts` holds the worker's decision logic rather than the worker itself, so
`canUseCache` is a pure function with its own tests. The worker is then thin enough to
read at a glance.

`feedback.ts` exports two functions but has one implementation: `scorePacked` returns
`exact * 16 + partial` as a number because the scan calls it up to 100,000,000 times and
an object per call is an object per candidate, and it takes `Uint8Array` so the scan's
call site stays monomorphic. `scoreGuess` unpacks it for game logic and tests.

`Peg` is the only component with genuine reuse — locked rows, the active row, palette
buttons, and the solver's code list all render one, and `UI_SPEC.md` makes its number
load-bearing everywhere. Feedback clusters and the win/loss banner are a handful of lines
each with one call site, so they live in `Board.tsx` and `App.tsx` rather than becoming
files.

`App.tsx` holds all state. Everything below it takes props and calls callbacks — no
context, no store, no local state except `SolverPanel`'s expanded flag and the selected
slot in `Board`. The state is one object updated by one reducer; adding a state library
here would be pure ceremony.

`App.tsx` also owns the worker: it creates one, posts `scan` after each submitted guess
and `reset` on `New game`, and dispatches `applyScan` on each reply. No other component
knows the worker exists.

## Changing a config bound

`GAME_RULES.md` holds the bounds table and is the spec. Two constraints set the ceiling
on `slots`, and both are worth knowing before touching it:

- **The `Uint32Array` ceiling.** Ids must stay under 4.29 billion. 10⁸ has 43× headroom,
  but slots is an exponent: 10 × 9 is 10 billion and would silently corrupt every id.
  Raising `slots` past 9 requires changing the encoding first, not just the bound.
  `TESTING.md` asserts this so it fails loudly rather than silently.
- **Scan time.** It grows linearly with the space, so 10 × 9 is ten times the current
  worst case — around 30 s, past the point where a progress indicator rescues it.

Colors and attempts are cheap; slots costs exponentially, and 8 is the last value that
stays comfortably inside both. Above 10 colors, `palette.ts` also needs entries that stay
distinguishable, which is what sets the color limit.

## Deliberately out of scope

Not built, not stubbed, not designed for: difficulty presets, scoring or leaderboards,
timers, save/resume, undo, animation beyond simple transitions, a hint or auto-solve
button, multiplayer, a codemaker mode where the player sets the secret.

Some of these are natural extensions. None were asked for. Adding an extension point
"just in case" costs more than adding the feature later, when its actual requirements
are known.
