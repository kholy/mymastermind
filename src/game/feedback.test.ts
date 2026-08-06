import { describe, it, expect } from 'vitest';
import { scoreGuess, scorePacked } from './feedback';
import { decode, spaceSize } from './codes';
import type { Code, Config } from './types';

// Alphabet R G B Y -> 0 1 2 3, matching docs/GAME_RULES.md.
const R = 0, G = 1, B = 2, Y = 3;

/**
 * The ten worked examples from docs/GAME_RULES.md. These ARE the specification —
 * if one fails, the code is wrong. Do not edit them to match an implementation.
 */
const WORKED_EXAMPLES: [n: number, secret: Code, guess: Code, exact: number, partial: number][] = [
  [1, [R, G, B, Y], [R, G, B, Y], 4, 0],
  [2, [R, G, B, Y], [Y, B, G, R], 0, 4],
  [3, [R, G, B, Y], [R, G, Y, B], 2, 2],
  [4, [R, R, G, G], [R, G, R, G], 2, 2],
  [5, [R, R, R, R], [R, G, B, Y], 1, 0],
  [6, [R, G, B, Y], [R, R, R, R], 1, 0],
  [7, [R, R, G, B], [R, R, R, R], 2, 0],
  [8, [R, G, G, B], [G, G, R, R], 1, 2],
  [9, [R, G, B, Y], [G, G, G, G], 1, 0],
  [10, [R, R, B, B], [B, B, R, R], 0, 4],
];

describe('scoreGuess — worked examples from GAME_RULES.md', () => {
  it.each(WORKED_EXAMPLES)(
    'example %i: secret %j / guess %j -> %i exact, %i partial',
    (_n, secret, guess, exact, partial) => {
      expect(scoreGuess(guess, secret, 4)).toEqual({ exact, partial });
    },
  );
});

const cfg = (colors: number, slots: number): Config => ({ colors, slots, attempts: 10 });

function everyCode(config: Config): Code[] {
  return Array.from({ length: spaceSize(config) }, (_, id) => decode(id, config));
}

describe('scoreGuess — properties', () => {
  const config = cfg(4, 3);
  const all = everyCode(config);

  it('scores identical codes as all exact', () => {
    for (const code of all) {
      expect(scoreGuess(code, code, 4)).toEqual({ exact: 3, partial: 0 });
    }
  });

  it('scores codes sharing no colors as nothing', () => {
    expect(scoreGuess([R, R, R], [G, B, Y], 4)).toEqual({ exact: 0, partial: 0 });
  });

  it('never exceeds slots, over the full space', () => {
    for (const a of all) {
      for (const b of all) {
        const { exact, partial } = scoreGuess(a, b, 4);
        expect(exact + partial).toBeLessThanOrEqual(3);
      }
    }
  });

  it('never returns (slots-1, 1), which is impossible', () => {
    for (const a of all) {
      for (const b of all) {
        const { exact, partial } = scoreGuess(a, b, 4);
        expect(exact === 2 && partial === 1).toBe(false);
      }
    }
  });

  it('is symmetric, over the full space', () => {
    for (const a of all) {
      for (const b of all) {
        expect(scoreGuess(a, b, 4)).toEqual(scoreGuess(b, a, 4));
      }
    }
  });

  it('gives identical results whether the scratch buffer is reused or fresh', () => {
    // The bug that would otherwise appear only under load: a stale tally from the
    // previous candidate leaking into the next score.
    const shared = new Int32Array(4);
    for (const a of all) {
      for (const b of all) {
        const ta = Uint8Array.from(a);
        const tb = Uint8Array.from(b);
        expect(scorePacked(ta, tb, shared)).toBe(scorePacked(ta, tb, new Int32Array(4)));
      }
    }
  });
});
