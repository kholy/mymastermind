import { spaceSize } from './codes';
import { scoreGuess } from './feedback';
import { strideSample } from './solve';
import type { Code, Color, Config, GameState, Solver } from './types';

export const DEFAULT_CONFIG: Config = { colors: 6, slots: 4, attempts: 10 };

function drawSecret(config: Config, rng: () => number): Code {
  return Array.from({ length: config.slots }, () => Math.floor(rng() * config.colors));
}

/**
 * The solver state for a board with no guesses on it.
 *
 * Arithmetic, not a scan: with no constraints every code is possible. A newGame that
 * scanned would take seconds at 10x8 — on the main thread, before the board appeared.
 */
function seedSolver(config: Config): Solver {
  return { count: spaceSize(config), sample: strideSample(config), turnsCovered: 0 };
}

function startGame(gameId: number, config: Config, rng: () => number): GameState {
  return {
    gameId,
    config,
    pendingConfig: config,
    secret: drawSecret(config, rng),
    turns: [],
    draft: new Array(config.slots).fill(null),
    solver: seedSolver(config),
    status: 'playing',
  };
}

export function createInitialState(
  config: Config = DEFAULT_CONFIG,
  rng: () => number = Math.random,
): GameState {
  return startGame(1, config, rng);
}

/** Start a fresh game from whatever the setup dropdowns currently show. */
export function newGame(state: GameState, rng: () => number = Math.random): GameState {
  return startGame(state.gameId + 1, state.pendingConfig, rng);
}

/** Change what the dropdowns show. Deliberately does not disturb the running game. */
export function setPendingConfig(state: GameState, patch: Partial<Config>): GameState {
  return { ...state, pendingConfig: { ...state.pendingConfig, ...patch } };
}

export function placeColor(state: GameState, slot: number, color: Color): GameState {
  if (state.status !== 'playing') return state;
  const draft = [...state.draft];
  draft[slot] = color;
  return { ...state, draft };
}

export function clearSlot(state: GameState, slot: number): GameState {
  if (state.status !== 'playing') return state;
  const draft = [...state.draft];
  draft[slot] = null;
  return { ...state, draft };
}

/** Fill the whole active row at once — used by the solver panel's last remaining code. */
export function setDraft(state: GameState, code: Code): GameState {
  if (state.status !== 'playing') return state;
  return { ...state, draft: [...code] };
}

export function canSubmit(state: GameState): boolean {
  return state.status === 'playing' && state.draft.every((c) => c !== null);
}

export function submitGuess(state: GameState): GameState {
  if (!canSubmit(state)) return state;

  const guess = state.draft as Code;
  const feedback = scoreGuess(guess, state.secret, state.config.colors);
  const turns = [...state.turns, { guess, feedback }];

  // Win is checked first, so winning on the final attempt is a win.
  const status =
    feedback.exact === state.config.slots
      ? 'won'
      : turns.length === state.config.attempts
        ? 'lost'
        : 'playing';

  return {
    ...state,
    turns,
    draft: new Array(state.config.slots).fill(null),
    status,
  };
}

/**
 * Land a scan result from the worker.
 *
 * Both guards matter. `gameId` catches a scan still in flight when the player hit
 * New game — its turnsCovered is *greater* than the fresh state's 0, so a
 * turnsCovered-only check would accept it and paint the dead game's count onto a new
 * board. `turnsCovered` catches ordinary late and duplicate results.
 */
export function applyScan(
  state: GameState,
  update: { count: number; sample: Uint32Array },
  turnsCovered: number,
  gameId: number,
): GameState {
  if (gameId !== state.gameId) return state;
  if (turnsCovered <= state.solver.turnsCovered) return state;

  return {
    ...state,
    solver: { count: update.count, sample: update.sample, turnsCovered },
  };
}

/** The count on screen belongs to an earlier turn than the board. */
export function isSolverStale(state: GameState): boolean {
  return state.solver.turnsCovered < state.turns.length;
}
