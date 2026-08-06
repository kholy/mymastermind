import { describe, it, expect } from 'vitest';
import {
  createInitialState, newGame, setPendingConfig, placeColor, clearSlot,
  submitGuess, applyScan, canSubmit, isSolverStale,
  toggleRuledOut, cycleMark, markAt, setDraft,
} from './game';
import { spaceSize } from './codes';
import type { Config, GameState } from './types';
import type { ScanResult } from './solve';

const cfg = (colors: number, slots: number, attempts: number): Config => ({ colors, slots, attempts });

/** Deterministic RNG so the secret is known. */
const fixedRng = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** A state whose secret is exactly `code`. */
function stateWithSecret(code: number[], config: Config): GameState {
  const state = createInitialState(config, fixedRng(code.map((c) => c / config.colors)));
  expect(state.secret).toEqual(code);
  return state;
}

function play(state: GameState, guess: number[]): GameState {
  let next = state;
  guess.forEach((c, i) => { next = placeColor(next, i, c); });
  return submitGuess(next);
}

const scan = (count: number, sample: number[] = []): ScanResult => ({
  count, sample: Uint32Array.from(sample), ids: null,
});

describe('createInitialState / newGame', () => {
  it('produces a secret in range and an empty draft', () => {
    const state = createInitialState(cfg(6, 4, 10));
    expect(state.secret).toHaveLength(4);
    for (const c of state.secret) expect(c).toBeGreaterThanOrEqual(0);
    for (const c of state.secret) expect(c).toBeLessThan(6);
    expect(state.draft).toEqual([null, null, null, null]);
    expect(state.status).toBe('playing');
  });

  it('seeds the count analytically, without scanning', () => {
    const config = cfg(10, 8, 20);
    const state = createInitialState(config);
    expect(state.solver.count).toBe(spaceSize(config));
    expect(state.solver.turnsCovered).toBe(0);
  });

  it('seeds a spread sample rather than a run of near-identical codes', () => {
    const state = createInitialState(cfg(10, 8, 20));
    const sample = [...state.solver.sample];
    expect(sample.length).toBe(500);
    expect(new Set(sample).size).toBe(500);

    // Every leading digit should appear: a plain stride leaves the top pegs fixed for
    // fifty rows at a time, which reads as a broken list.
    const leading = new Set(sample.map((id) => Math.floor(id / 10 ** 7)));
    expect(leading.size).toBe(10);
  });

  it('spreads the sample in small spaces too', () => {
    const state = createInitialState(cfg(2, 2, 10));
    expect([...state.solver.sample].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic with a seeded rng', () => {
    const config = cfg(6, 4, 10);
    const a = createInitialState(config, fixedRng([0.1, 0.5, 0.9, 0.3]));
    const b = createInitialState(config, fixedRng([0.1, 0.5, 0.9, 0.3]));
    expect(a.secret).toEqual(b.secret);
  });

  it('increments gameId and adopts pendingConfig', () => {
    let state = createInitialState(cfg(6, 4, 10));
    state = setPendingConfig(state, { colors: 8, slots: 5 });
    const next = newGame(state);
    expect(next.gameId).toBe(state.gameId + 1);
    expect(next.config).toEqual(cfg(8, 5, 10));
    expect(next.secret).toHaveLength(5);
  });
});

describe('setPendingConfig', () => {
  it('leaves the running game completely alone', () => {
    const before = play(createInitialState(cfg(6, 4, 10)), [0, 1, 2, 3]);
    const after = setPendingConfig(before, { colors: 10, slots: 8 });
    expect(after.config).toEqual(before.config);
    expect(after.secret).toEqual(before.secret);
    expect(after.turns).toEqual(before.turns);
    expect(after.status).toBe(before.status);
    expect(after.pendingConfig).toEqual(cfg(10, 8, 10));
  });
});

describe('submitGuess', () => {
  it('refuses an incomplete draft without consuming an attempt', () => {
    const state = placeColor(createInitialState(cfg(6, 4, 10)), 0, 3);
    expect(canSubmit(state)).toBe(false);
    expect(submitGuess(state)).toBe(state);
    expect(submitGuess(state).turns).toHaveLength(0);
  });

  it('appends the turn, scores it, and clears the draft', () => {
    const state = play(stateWithSecret([0, 1, 2, 3], cfg(6, 4, 10)), [0, 1, 3, 2]);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].feedback).toEqual({ exact: 2, partial: 2 });
    expect(state.draft).toEqual([null, null, null, null]);
  });

  it('wins on an exact guess', () => {
    const state = play(stateWithSecret([0, 1, 2, 3], cfg(6, 4, 10)), [0, 1, 2, 3]);
    expect(state.status).toBe('won');
  });

  it('loses when attempts run out', () => {
    let state = stateWithSecret([0, 1, 2, 3], cfg(6, 4, 2));
    state = play(state, [5, 5, 5, 5]);
    expect(state.status).toBe('playing');
    state = play(state, [5, 5, 5, 5]);
    expect(state.status).toBe('lost');
    expect(state.turns).toHaveLength(2);
  });

  it('treats a win on the final attempt as a win', () => {
    const state = play(stateWithSecret([0, 1, 2, 3], cfg(6, 4, 1)), [0, 1, 2, 3]);
    expect(state.status).toBe('won');
  });

  it('does nothing once the game is over', () => {
    const won = play(stateWithSecret([0, 1, 2, 3], cfg(6, 4, 10)), [0, 1, 2, 3]);
    expect(play(won, [5, 5, 5, 5])).toBe(won);
    expect(placeColor(won, 0, 1)).toBe(won);
    expect(clearSlot(won, 0)).toBe(won);
  });

  it('never exceeds the attempt limit', () => {
    let state = stateWithSecret([0, 1, 2, 3], cfg(6, 4, 3));
    for (let i = 0; i < 10; i++) state = play(state, [5, 5, 5, 5]);
    expect(state.turns.length).toBeLessThanOrEqual(3);
  });

  it('leaves the solver untouched — scanning is not its job', () => {
    const before = createInitialState(cfg(6, 4, 10));
    const after = play(before, [0, 1, 2, 3]);
    expect(after.solver).toBe(before.solver);
    expect(isSolverStale(after)).toBe(true);
  });
});

describe('placeColor / clearSlot', () => {
  it('does not mutate the input state', () => {
    const before = createInitialState(cfg(6, 4, 10));
    const draftBefore = [...before.draft];
    placeColor(before, 1, 4);
    expect(before.draft).toEqual(draftBefore);
  });

  it('clears a filled slot', () => {
    let state = placeColor(createInitialState(cfg(6, 4, 10)), 2, 5);
    expect(state.draft[2]).toBe(5);
    state = clearSlot(state, 2);
    expect(state.draft[2]).toBeNull();
  });
});

describe('ruling colors out', () => {
  it('starts with nothing ruled out, sized to the config', () => {
    const state = createInitialState(cfg(8, 4, 10));
    expect(state.notes.ruledOut).toEqual(new Array(8).fill(false));
  });

  it('toggles a color off and back on', () => {
    let state = toggleRuledOut(createInitialState(cfg(6, 4, 10)), 2);
    expect(state.notes.ruledOut[2]).toBe(true);
    state = toggleRuledOut(state, 2);
    expect(state.notes.ruledOut[2]).toBe(false);
  });

  it('refuses to place a ruled-out color', () => {
    // Enforced in the reducer, so the palette and the keyboard cannot disagree.
    const state = toggleRuledOut(createInitialState(cfg(6, 4, 10)), 3);
    expect(placeColor(state, 0, 3)).toBe(state);
    expect(placeColor(state, 0, 4).draft[0]).toBe(4);
  });

  it('still lets the solver hand over a code containing a ruled-out color', () => {
    // The player's belief may be wrong; the one remaining possibility is not.
    const state = toggleRuledOut(createInitialState(cfg(6, 4, 10)), 3);
    expect(setDraft(state, [3, 3, 3, 3]).draft).toEqual([3, 3, 3, 3]);
  });

  it('clears on a new game', () => {
    const state = toggleRuledOut(createInitialState(cfg(6, 4, 10)), 1);
    expect(newGame(state).notes.ruledOut).toEqual(new Array(6).fill(false));
  });
});

describe('marking pegs in past guesses', () => {
  const played = () => play(createInitialState(cfg(6, 4, 10)), [0, 1, 2, 3]);

  it('cycles unmarked -> correct -> wrong -> unmarked', () => {
    let state = played();
    expect(markAt(state, 0, 1)).toBeUndefined();
    state = cycleMark(state, 0, 1);
    expect(markAt(state, 0, 1)).toBe('correct');
    state = cycleMark(state, 0, 1);
    expect(markAt(state, 0, 1)).toBe('wrong');
    state = cycleMark(state, 0, 1);
    expect(markAt(state, 0, 1)).toBeUndefined();
  });

  it('keeps marks independent per turn and slot', () => {
    let state = cycleMark(played(), 0, 0);
    state = cycleMark(state, 0, 2);
    state = cycleMark(state, 0, 2);
    expect(markAt(state, 0, 0)).toBe('correct');
    expect(markAt(state, 0, 2)).toBe('wrong');
    expect(markAt(state, 0, 1)).toBeUndefined();
  });

  it('does not mutate the input state', () => {
    const before = played();
    cycleMark(before, 0, 0);
    expect(before.notes.marks).toEqual({});
  });

  it('clears on a new game', () => {
    expect(newGame(cycleMark(played(), 0, 0)).notes.marks).toEqual({});
  });
});

describe('notes never reach the solver', () => {
  it('leaves the count untouched however the player annotates', () => {
    // The load-bearing property: the count is derived from feedback alone. If a note
    // could filter candidates, a mistaken one could eliminate the true secret.
    const base = play(createInitialState(cfg(6, 4, 10)), [0, 1, 2, 3]);
    const scanned = applyScan(base, scan(256, [1, 2, 3]), 1, base.gameId);

    let annotated = scanned;
    for (let c = 0; c < 6; c++) annotated = toggleRuledOut(annotated, c);
    for (let s = 0; s < 4; s++) annotated = cycleMark(annotated, 0, s);

    expect(annotated.solver).toEqual(scanned.solver);
    expect(annotated.turns).toEqual(scanned.turns);
    expect(annotated.secret).toEqual(scanned.secret);
  });
});

describe('applyScan', () => {
  const base = () => play(createInitialState(cfg(6, 4, 10)), [0, 1, 2, 3]);

  it('applies a current result', () => {
    const state = applyScan(base(), scan(256, [1, 2, 3]), 1, 1);
    expect(state.solver.count).toBe(256);
    expect(state.solver.turnsCovered).toBe(1);
    expect(isSolverStale(state)).toBe(false);
  });

  it('ignores a result older than the one already applied', () => {
    const state = applyScan(base(), scan(256), 1, 1);
    const stale = applyScan(state, scan(999999), 0, 1);
    expect(stale).toBe(state);
  });

  it('ignores the same result twice', () => {
    const state = applyScan(base(), scan(256), 1, 1);
    expect(applyScan(state, scan(256), 1, 1)).toBe(state);
  });

  it('ignores a result from a game that has been restarted', () => {
    // The real sequence: 3 turns, a scan starts, the player hits New game, then the
    // in-flight result lands. Its turnsCovered of 3 is GREATER than the fresh state's
    // 0, so a turnsCovered-only guard would accept it.
    let state = createInitialState(cfg(6, 4, 10));
    for (let i = 0; i < 3; i++) state = play(state, [0, 1, 2, 3]);
    const deadGameId = state.gameId;

    const fresh = newGame(state);
    const after = applyScan(fresh, scan(7), 3, deadGameId);

    expect(after).toBe(fresh);
    expect(after.solver.count).toBe(spaceSize(fresh.config));
  });
});
