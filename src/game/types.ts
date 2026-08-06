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

export type GameState = {
  gameId: number;
  config: Config;
  pendingConfig: Config;
  secret: Code;
  turns: Turn[];
  draft: (Color | null)[];
  solver: Solver;
  status: Status;
};
