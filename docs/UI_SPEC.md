# UI Specification

Screens, interaction, and accessibility. Behavior described here must not encode game
rules — those live in [`GAME_RULES.md`](GAME_RULES.md) and are implemented in
`src/game/`.

## Layout

One screen. No navigation, no modals.

```
┌────────────────────────────────────────────────────────────┐
│  MASTERMIND                                                │
│  Colors [6 ▾]   Slots [4 ▾]   Attempts [10 ▾]  [New game]  │
├──────────────────────────────┬─────────────────────────────┤
│                              │                             │
│   1  ● ● ● ●      ●●○·       │   Possible codes            │
│   2  ● ● ● ●      ●○··       │                             │
│   3  ● ● ● ●      ●●○○       │        1,204                │
│  ▸4  ○ ○ ○ ○                 │                             │
│   5                          │   [ Show codes ▸ ]          │
│   6                          │                             │
│   ⋮                          │                             │
│                              │                             │
│   [R][O][Y][G][T][B]         │                             │
│   [   Submit guess    ]      │                             │
│                              │                             │
├──────────────────────────────┴─────────────────────────────┤
```

Two columns on screens ≥ 900 px; the solver panel stacks below the board otherwise. The
board column is fixed-width and centered — it should not stretch to fill a wide monitor.

The board shows all `attempts` rows from the start, so the player can see how much room
is left. Future rows are empty outlines.

At the maximum 20 rows × 8 slots the board is tall — taller than a laptop viewport once
the header and palette are accounted for, and it is not worth distorting the design to
pretend otherwise. **The page scrolls.** What must hold instead:

- The active row is scrolled into view after each submission.
- The palette and submit button are always reachable — they stay pinned below the board
  rather than sitting at the bottom of a long scroll.
- Locked rows may shrink to fit; they are read, not touched. The active row's slots and
  the palette buttons keep their full touch targets.

## The board

### Locked rows

A completed guess: the row index, the guessed pegs, and its feedback cluster. Rows never
change after submission.

### Feedback pegs

Rendered as a compact cluster next to the guess — a two-row grid `⌈slots/2⌉` wide, so
2×2 for 4 slots and 2×4 for 8.

- `exact` pegs are filled dark (`●` above).
- `partial` pegs are hollow / outlined (`○`).
- Remaining positions in the cluster are empty background (`·`).

Exact pegs always fill the cluster first, in reading order. This is not cosmetic: peg
placement must carry no positional information about the guess. Never derive the peg
layout from which slots matched.

Text alternative for screen readers: `2 exact, 1 partial`.

### The active row

Marked with a `▸` and a subtle highlight. It has a **selected slot**, shown with a ring.

- Clicking a slot selects it.
- Clicking a palette color places that color in the selected slot, then advances
  selection to the next empty slot (wrapping); if none are empty, selection stays.
- Clicking a filled slot in the active row selects it; clicking the selected slot again
  clears it.

This gives fast entry — pick colors left to right without ever touching the slots — while
still allowing correction of any position.

### Palette

One button per available color, labeled with its letter. Buttons show the color swatch,
its letter, and expose the color name to assistive tech.

| # | Name | Letter | Hex |
| --- | --- | --- | --- |
| 1 | Red | R | `#D7263D` |
| 2 | Orange | O | `#F46036` |
| 3 | Yellow | Y | `#EFCA08` |
| 4 | Green | G | `#2E933C` |
| 5 | Teal | T | `#0FA3B1` |
| 6 | Blue | B | `#2D5BFF` |
| 7 | Purple | P | `#8338EC` |
| 8 | Magenta | M | `#E5399C` |
| 9 | White | W | `#F2F0EC` |
| 10 | Black | K | `#2B2B2B` |

A config of `n` colors uses the first `n` entries, so the default 6 spans the full hue
circle rather than clustering. Positions 9 and 10 are deliberately not hues — at ten
swatches the hue circle is crowded, and white and black stay distinct from everything
above them at any size. They are also the classic Mastermind extras.

White needs a defined border, not just a fill: at `#F2F0EC` on an `#F7F5F2` board it
would otherwise be nearly invisible. Give every peg the same subtle border so white
isn't a special case in the CSS.

**The letter is always rendered on every peg**, on the board and in the solver list — not
a toggle, not a preference. Ten hues cannot be made reliably distinguishable for all
forms of color vision deficiency — red/orange and green/teal collide under common ones —
and a color-matching game is unplayable if two colors read the same. At ten colors the
letter stops being a helpful annotation and becomes the primary channel; the color is
what makes it fast for people who can use it.

### Submit

Disabled until every slot is filled and the game is still playable. When disabled, the
reason is available as a tooltip / `aria-describedby` (`Fill all 4 slots`), not just a
grayed-out button.

## Solver panel

Always visible, always showing the count.

- Heading: `Possible codes`
- The count, large, with thousands separators. Before the first guess this is the full
  space (e.g. `1,296`), shown immediately — it is arithmetic, not a scan.
- A disclosure button: `Show codes ▸` / `Hide codes ▾`. Collapsed by default; once
  opened, it stays open for the rest of the game.
- Expanded, it lists up to 500 codes as peg rows in a scrollable box with a fixed max
  height. If more remain, a line above reads `Showing 500 of 100,000,000`.
- At a count of 1: show that code with `This is the only possibility.` **Clicking it
  fills the active row**, so winning from there is one click rather than eight. The
  player still submits it — the game does not auto-win.
- Before the first guess the sample is seeded without a scan, so expanding the list on a
  fresh board shows 500 codes spread across the space, not an empty box.

### While calculating

The count is computed in a worker, so it always arrives at least one frame after the row
it belongs to. In small configurations that gap is imperceptible; at 10 × 8 it is
seconds. The panel handles both with one rule:

**Show the stale treatment only once a scan has been outstanding for 200 ms.** Below that
threshold the panel simply shows the previous count and then the new one — no flicker, no
spinner for work that finishes in 8 ms. Do not gate this on config size; gate it on
elapsed time, and small configs never reach the threshold on their own.

Past the threshold, while `solver.turnsCovered < turns.length`:

- Keep the last known count visible but visibly stale: dimmed, with `after guess 2`
  beneath it, so a large number is never mistaken for the current one.
- Show an indeterminate progress bar and `Narrowing…`. A streaming scan does know its
  position in the space, but reporting it would mean posting progress messages purely for
  cosmetics; an indeterminate bar is the honest and cheaper choice.
- If the code list is expanded, dim it and label it with the same `after guess 2` rather
  than emptying or disabling it. The stale sample is still useful — it is a superset of
  what remains — and blanking the requested feature for seconds at a time is worse than
  showing it marked as old.

The rest of the app stays fully interactive throughout. The player can compose and submit
their next guess while a scan runs — that is the entire reason the work is in a worker,
and any UI that blocks input during a scan has thrown the benefit away.

## Setup

Three `<select>` controls and a `New game` button, in the header. Changing a control does
not restart the game; only `New game` does, using the currently selected values. A game
in progress is therefore never destroyed by a stray click on a dropdown.

This means two configs exist at once — the dropdowns' (`pendingConfig`) and the running
game's (`config`). The board, palette, and solver read the running one, always. Switching
Colors from 6 to 10 mid-game must not grow the palette: the guesses already on the board
are in the running game's alphabet.

When the dropdowns differ from the running game, mark the `New game` button to say so
(`New game (6 → 10 colors)` or a simple modified dot) — otherwise a player who changes a
dropdown and sees nothing happen will assume the control is broken.

`New game` asks for confirmation only when a game is genuinely in progress —
`status === 'playing' && turns.length > 0`. A fresh untouched board never prompts. The
confirmation is an inline two-step on the button itself (`New game` → `Discard game?`),
not `window.confirm`; the layout has no modals and this doesn't warrant introducing one.

## End of game

A banner replaces the palette and submit button.

- Win: `Cracked it in 4.` plus the code.
- Loss: `Out of attempts. The code was:` plus the code.

The board and solver panel remain, unchanged, for review. The only action is `New game`.

While the game is playable, the secret must not exist anywhere in the rendered DOM — not
as a hidden element, a `data-` attribute, or a class name. It lives in React state only.
The one exception is the solver's sole remaining code at a count of 1, which the visible
board already determines; see `GAME_RULES.md`.

## Keyboard

The whole game is playable without a mouse.

| Key | Action |
| --- | --- |
| `1`–`9`, `0` | Place the nth color in the selected slot, advance selection (`0` = the 10th) |
| `←` `→` | Move the selected slot, wrapping at both ends |
| `Backspace` | Clear the selected slot; if it was already empty, step back and clear that one |
| `Enter` | Submit, when the row is complete |
| `Tab` | Standard focus order: setup → board → palette → submit → solver |

`Backspace` behaving as "clear, else step back and clear" is the Wordle convention and is
what fast typists expect — a key that only moves when the slot is empty would strand the
player one press behind. Arrow keys wrap because palette entry already wraps, and two
different wrapping rules in one row would be arbitrary.

A number key above the configured color count does nothing — no beep, no error. At 6
colors, `7`–`9` and `0` are inert.

Keys are ignored entirely once the game is over.

**Enter belongs to whatever has focus.** The board claims it only when no control does,
because a keyboard user who tabs to a button and presses Enter means that button, not
"submit my guess". Clicking a button with the mouse leaves it focused, though, which
would quietly break Enter for the rest of the game — so our buttons release focus on
mouse-up, and `New game` hands focus back to the board explicitly, since typing a guess
is what happens next. Keyboard activation never fires mouse-up, so tab order survives.

Focus order follows the visual layout. Focus rings are never removed.

## Visual direction

Restrained and tactile — the board is the interface, so the chrome around it should be
quiet. A warm off-white board on a neutral page, pegs as the only saturated element,
empty slots reading as holes rather than outlines. Settle the exact palette by eye during
implementation; the two things that are not free choices:

- **Peg letters** must be near-black or near-white, whichever passes contrast against
  the swatch. This is the accessibility channel, not decoration.
- **Numbers use tabular figures** — the count, row indices, and the `Showing X of Y`
  line all change in place, and proportional digits make them jitter.

Motion is minimal and respects `prefers-reduced-motion`. Dark mode is not in scope.

## Accessibility

- Every peg carries a text label; color is never the sole channel.
- Feedback clusters expose `2 exact, 1 partial` as text.
- Submitting a guess announces the feedback immediately via a polite live region:
  `Guess 3: 2 exact, 1 partial.` The count follows as a **second** announcement when it
  resolves: `42 possible codes remain.` They must not be combined — at 10 × 8 the count
  is seconds away, so a single announcement would either stall or quote the previous
  turn's number as if it were current. In small configs the two coalesce naturally.
- Win/loss announces assertively.
- Interactive elements are ≥ 44 px on touch: palette buttons, active-row slots, the
  disclosure control, and the submit and `New game` buttons. Locked-row pegs are not
  interactive and may be smaller — which is what makes a 20-row board fit.
- Text meets WCAG AA against its background; peg letters meet AA against their swatch.
