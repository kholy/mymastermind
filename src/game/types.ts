/** A color is an index into the palette: 0 .. colors-1. */
export type Color = number;

/** A code as its digits, most significant first. Length === slots. */
export type Code = Color[];

/** A code packed into an integer. See codes.ts. */
export type CodeId = number;

export type Feedback = { exact: number; partial: number };

export type Turn = { guess: Code; feedback: Feedback };

/** Ranges are specified in docs/GAME_RULES.md and enforced by the SetupPanel inputs. */
export type Config = { colors: number; slots: number; attempts: number };

export type Status = 'playing' | 'won' | 'lost';

/** What the UI knows about the possible codes. Not the codes themselves. */
export type Solver = {
  count: number;
  sample: Uint32Array;
  turnsCovered: number;
};

/** A player's note about one peg in a past guess. */
export type Mark = 'correct' | 'wrong';

/**
 * The player's own deductions: colors they have ruled out, and pegs they believe are
 * settled. Kept beside the game, never fed into it.
 *
 * These are beliefs and may be wrong. The solver counts possible codes from feedback
 * alone, which is what guarantees the true secret is never eliminated — a mistaken note
 * that filtered the candidate set could rule out the real answer and the panel would
 * start lying. So a note that contradicts the count is information, not a bug.
 */
export type Notes = {
  /** One flag per color, indexed by color. */
  ruledOut: boolean[];
  /** Keyed `${turnIndex}:${slotIndex}`. Absent means unmarked. */
  marks: Record<string, Mark>;
};

export type GameState = {
  gameId: number;
  config: Config;
  pendingConfig: Config;
  secret: Code;
  turns: Turn[];
  draft: (Color | null)[];
  notes: Notes;
  solver: Solver;
  status: Status;
};
