import type { Config, Turn } from './types';

/** What the worker remembers between scans. Nothing else owns this. */
export type CacheState = {
  ids: Uint32Array | null;
  cachedTurns: number;
  cachedConfig: Config | null;
  gameId: number;
};

export const EMPTY_CACHE: CacheState = {
  ids: null,
  cachedTurns: 0,
  cachedConfig: null,
  gameId: 0,
};

export type ScanRequest =
  | { type: 'reset'; gameId: number }
  | { type: 'scan'; gameId: number; config: Config; turns: Turn[] };

/** Only count and sample cross back — ids can be 64 MB and stay in the worker. */
export type ScanReply = {
  type: 'result';
  gameId: number;
  turnsCovered: number;
  count: number;
  sample: Uint32Array;
};

/**
 * Whether the cached survivor list may be filtered by just the newest turn.
 *
 * The gapless invariant: the cache is the survivor set of exactly `cachedTurns` turns
 * of game `gameId` at config `cachedConfig`. All four conditions enforce it, and the
 * turn-count one is the one that matters — filtering by only the newest turn after a
 * skipped post would leave survivors the skipped turn should have eliminated, and the
 * panel would report a count that is too high with nothing looking broken.
 *
 * Returning false is always safe; it just means a full rescan.
 */
export function canUseCache(
  cache: CacheState,
  gameId: number,
  config: Config,
  turnCount: number,
): boolean {
  if (cache.ids === null || cache.cachedConfig === null) return false;
  if (cache.gameId !== gameId) return false;
  // colors and slots define the code space; attempts cannot change without a new game.
  if (cache.cachedConfig.colors !== config.colors) return false;
  if (cache.cachedConfig.slots !== config.slots) return false;
  return turnCount === cache.cachedTurns + 1;
}
