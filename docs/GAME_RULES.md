# Game Rules

The authoritative statement of how the game behaves. Code follows this document; where
they disagree, this document is right and the code is a bug.

## Overview

The game generates a hidden **secret code**: an ordered sequence of colored pegs. The
player submits guesses of the same length. After each guess the game returns feedback
telling the player how close the guess was — but never *which* positions were right.

## Configuration

Three settings, chosen before a game starts.

| Setting | Meaning | Range | Default |
| --- | --- | --- | --- |
| **Colors** | Size of the color alphabet | 2–10 | 6 |
| **Slots** | Length of the code | 2–8 | 4 |
| **Attempts** | Guesses allowed before losing | 1–20 | 10 |

"Attempts" is the setting the user described as *levels*: the number of guess rows on the
board. One board, one secret code per game. There is no campaign or unlockable
progression.

The classic Mastermind board is 6 colors × 4 slots × 10 attempts — the defaults above.

### Why these bounds

`colors` is capped at 10 by the palette: ten swatches is the practical limit for keeping
colors tellable apart, and it is why every peg carries its number (see `UI_SPEC.md`).
`attempts` is capped at 20 because a board much taller stops being readable at a glance;
it costs nothing else.

`slots` is the expensive one. The search space is `colors ^ slots`, so slots is the
exponent:

| colors × slots | Codes |
| --- | --- |
| 2 × 2 | 4 |
| 6 × 4 (default) | 1,296 |
| 8 × 6 | 262,144 |
| 10 × 6 | 1,000,000 |
| 8 × 8 | 16,777,216 |
| 10 × 8 (max) | 100,000,000 |

The solver has to reason about that whole space. A hundred million codes cannot be held
in memory as a list, and cannot be scanned inside a single animation frame — so at the
top of the range the solver runs in a background worker and takes a couple of seconds to
report, while the board stays fully playable. `DESIGN.md` specifies how, and states the
budget.

This is a real cost of the 10 × 8 corner, not a limitation to design around: everything
at 10 × 6 (a million codes) and below still resolves instantly.

## Setup

1. The player picks colors, slots and attempts.
2. The game draws a secret code uniformly at random: each of the `slots` positions gets
   an independently chosen color from the `colors` available.
3. **Repeated colors are allowed** in the secret. With 6 colors and 4 slots, `RED RED
   BLUE RED` is a legal secret and is exactly as likely as any other code.

Repeats being allowed is a deliberate choice, and it is the standard Mastermind rule.
It matters because it makes the feedback rules non-obvious — see the worked examples
below. It is not configurable.

## Taking a turn

1. The player fills all `slots` positions of the active row. Any color may be used any
   number of times.
2. A guess can only be submitted when every position is filled. Partial guesses are
   rejected; they don't consume an attempt.
   Repeating an earlier guess is allowed. It wastes an attempt and narrows nothing, but
   it is the player's to waste — the game does not police it.
3. The game scores the guess and locks the row with its feedback.
4. The solver panel updates.

## Feedback

Feedback is two numbers:

- **exact** — pegs that are the right color *in the right position*.
- **partial** — pegs that are the right color *in the wrong position*.

Traditionally shown as black and white key pegs respectively.

Three properties the implementation must preserve:

- `exact + partial ≤ slots`
- `(exact, partial) = (slots - 1, 1)` is impossible. One peg cannot be the only one out
  of place — if every other peg is exact, the last one has nowhere else to be. So there
  are `(slots+1)(slots+2)/2 - 1` distinct feedback values: 15 at 4 slots, 44 at 8.
- Feedback says *how many*, never *which*. The board must never reveal which specific
  positions were correct — including through ordering. Feedback pegs are rendered
  sorted (all exact pegs first), never aligned to guess positions.

### Scoring algorithm

The only correct way to handle repeated colors is to count colors, not to walk pegs
greedily. Two passes:

```
scoreGuess(guess, secret):
  exact = count of positions i where guess[i] == secret[i]

  matched = 0
  for each color c in the alphabet:
    matched += min(count of c in guess, count of c in secret)

  partial = matched - exact
  return { exact, partial }
```

`matched` is the number of pegs that pair up if position is ignored entirely. Every
exact match is also a color match, so subtracting `exact` leaves the right-color
wrong-place count. A peg is never counted twice, and a single secret peg is never
credited to two guess pegs.

Note that `scoreGuess` is **symmetric**: `scoreGuess(a, b) == scoreGuess(b, a)`. The
solver relies on this.

### Worked examples

Alphabet `R G B Y`. These are the test cases; they exist to pin down the duplicate
behavior.

The letters are notation for these examples only — they read better than digits in a
table where the columns are also numbers. The interface labels colors `1`–`10`; here
`R G B Y` are colors 1–4, which is exactly how `feedback.test.ts` binds them.

| # | Secret | Guess | exact | partial | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | `R G B Y` | `R G B Y` | 4 | 0 | Win. |
| 2 | `R G B Y` | `Y B G R` | 0 | 4 | Every color present, none in place. |
| 3 | `R G B Y` | `R G Y B` | 2 | 2 | First two placed, last two swapped. |
| 4 | `R R G G` | `R G R G` | 2 | 2 | Positions 1 and 4 exact; the middle pair swaps. |
| 5 | `R R R R` | `R G B Y` | 1 | 0 | Guess holds one `R`, so only one can match. |
| 6 | `R G B Y` | `R R R R` | 1 | 0 | The mirror of #5 — symmetry. |
| 7 | `R R G B` | `R R R R` | 2 | 0 | Secret has two `R`. Extra guess `R`s score nothing. |
| 8 | `R G G B` | `G G R R` | 1 | 2 | Position 2 exact; one `G` and one `R` misplaced. The second guessed `R` finds no partner. |
| 9 | `R G B Y` | `G G G G` | 1 | 0 | One `G` in the secret, matched in place. |
| 10 | `R R B B` | `B B R R` | 0 | 4 | Full cross-swap of two duplicated pairs. |

A naive greedy implementation typically gets #7 and #8 wrong by double-crediting a
single secret peg.

## Ending the game

- **Win** — feedback is `exact == slots`. The game ends immediately, on that guess,
  even if it was the last attempt.
- **Loss** — the player has used all `attempts` without winning.

In both cases the secret is revealed and no further guesses are accepted. The board and
solver panel stay on screen for review.

### What the game never leaks

While the game is playable, the secret is never rendered and never reachable from the
page, **with one deliberate exception**: when the solver's possible-code count reaches 1,
that code is the secret and is shown.

That is not a leak. The possible set is derived entirely from the guesses and feedback
already on the board, so a player with a pencil could compute it; the panel saves
bookkeeping, it does not tell them anything they weren't told. A count of 1 means the
board itself has already determined the answer.

The distinction that matters: the secret is never rendered *because the game knows it*.
It appears only where the visible board implies it. So there is no hidden element, no
`data-` attribute, no class name, and nothing in the worker's messages.

## Possible codes

At any point, a code is **possible** if it is consistent with every piece of feedback
given so far. Formally, candidate `c` survives if for every past turn `(guess g,
feedback f)`:

```
scoreGuess(g, c) == f
```

This set is what the solver panel counts. Before the first guess it holds all
`colors ^ slots` codes. It shrinks monotonically and always contains the true secret.
It is derived purely from the visible board, so showing it leaks nothing the player
couldn't compute themselves — it saves bookkeeping, it doesn't cheat.

Reaching a count of 1 means the remaining code is provably the secret. The game does not
auto-win at that point; the player still submits it.

## Notes are not rules

The player can annotate the board — rule colors out, mark pegs in past guesses as for
sure correct or for sure wrong (see [`UI_SPEC.md`](UI_SPEC.md#the-players-notes)). These
are **beliefs**, and beliefs can be wrong.

**No annotation is ever an input to the game or to the solver.** Feedback is scored
against the secret; possible codes are filtered by feedback alone. A note changes what is
drawn and what the palette will let you place — nothing else.

This is not fastidiousness. The solver's guarantee is that the true secret is always in
the candidate set, and that holds precisely because every constraint applied to it came
from real feedback. Let a mistaken note filter the set and the solver could eliminate the
right answer while still reporting a confident count — the panel would be lying, and
nothing on screen would look wrong.

So the two can disagree, and that is a feature: a code containing a color you have ruled
out, still listed as possible, means the evidence does not support your deduction.

Implementation lives in `src/game/`, described in [`DESIGN.md`](DESIGN.md).
