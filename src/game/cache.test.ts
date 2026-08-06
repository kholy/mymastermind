import { describe, it, expect } from 'vitest';
import { canUseCache, EMPTY_CACHE, type CacheState } from './cache';
import { scanAll, scanCached } from './solve';
import { scoreGuess } from './feedback';
import type { Config, Turn } from './types';

const config: Config = { colors: 6, slots: 4, attempts: 10 };

const cached = (over: Partial<CacheState> = {}): CacheState => ({
  ids: Uint32Array.from([1, 2, 3]),
  cachedTurns: 2,
  cachedConfig: config,
  gameId: 7,
  ...over,
});

describe('canUseCache', () => {
  it('accepts exactly one new turn, same game, same config', () => {
    expect(canUseCache(cached(), 7, config, 3)).toBe(true);
  });

  it('rejects an empty cache', () => {
    expect(canUseCache(EMPTY_CACHE, 7, config, 1)).toBe(false);
    expect(canUseCache(cached({ ids: null }), 7, config, 3)).toBe(false);
  });

  it('rejects a skipped post', () => {
    // The dangerous case: filtering by only the newest turn would leave survivors the
    // skipped turn should have eliminated, and the count would be silently too high.
    expect(canUseCache(cached(), 7, config, 4)).toBe(false);
  });

  it('rejects a duplicate post', () => {
    expect(canUseCache(cached(), 7, config, 2)).toBe(false);
  });

  it('rejects a different game', () => {
    expect(canUseCache(cached(), 8, config, 3)).toBe(false);
  });

  it('rejects a different code space', () => {
    expect(canUseCache(cached(), 7, { ...config, colors: 10 }, 3)).toBe(false);
    expect(canUseCache(cached(), 7, { ...config, slots: 8 }, 3)).toBe(false);
  });
});

describe('the guard keeps the cached mode honest', () => {
  it('a skipped turn would give the wrong count if the cache were used anyway', () => {
    // Demonstrates why the turn-count condition exists, rather than just asserting it.
    const secret = [0, 1, 2, 3];
    const turn = (guess: number[]): Turn => ({
      guess,
      feedback: scoreGuess(guess, secret, config.colors),
    });

    const t1 = turn([0, 1, 4, 5]);
    const t2 = turn([2, 2, 2, 3]);

    const afterOne = scanAll(config, [t1]);
    const truth = scanAll(config, [t1, t2]).count;

    // Correct: cache covers t1, one new turn t2.
    expect(scanCached(afterOne.ids!, config, t2).count).toBe(truth);

    // What a missing guard would allow: cache covers nothing, but we filter by t2 only.
    const wrong = scanCached(scanAll(config, []).ids!, config, t2).count;
    expect(wrong).toBeGreaterThan(truth);
  });
});
