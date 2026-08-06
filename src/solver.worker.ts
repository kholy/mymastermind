/// <reference lib="webworker" />
import { scanAll, scanCached } from './game/solve';
import { canUseCache, EMPTY_CACHE, type CacheState, type ScanReply, type ScanRequest } from './game/cache';

/**
 * The solver's background thread, and the only async code in the project.
 *
 * It exists because a scan at 10x8 walks 100,000,000 candidates and takes seconds; on
 * the main thread that would freeze the page. Here the board stays fully interactive
 * and the player can compose and submit their next guess while a count resolves.
 *
 * It owns the cache. Messages are processed in order, so there is no cancellation
 * protocol — late results are dropped by applyScan on the other side.
 *
 * Note it never receives the secret: everything it needs is already visible on the
 * board, which is why showing the possible codes leaks nothing.
 */
let cache: CacheState = EMPTY_CACHE;

self.onmessage = (event: MessageEvent<ScanRequest>) => {
  const message = event.data;

  if (message.type === 'reset') {
    cache = EMPTY_CACHE;
    return;
  }

  const { gameId, config, turns } = message;

  const result = canUseCache(cache, gameId, config, turns.length)
    ? scanCached(cache.ids!, config, turns[turns.length - 1])
    : scanAll(config, turns);

  cache = { ids: result.ids, cachedTurns: turns.length, cachedConfig: config, gameId };

  const reply: ScanReply = {
    type: 'result',
    gameId,
    turnsCovered: turns.length,
    count: result.count,
    sample: result.sample,
  };
  self.postMessage(reply);
};
