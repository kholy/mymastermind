import { spaceSize } from './codes';
import { packFeedback, scorePacked } from './feedback';
import type { Config, Turn } from './types';

/** How many possible codes the panel will list. */
export const SAMPLE_LIMIT = 500;

/**
 * Largest survivor set worth caching, as a Uint32Array: 64 MB.
 *
 * Sized from the measured survivor distribution, not from dividing the space by the
 * number of distinct feedback values — feedback classes are heavily skewed, so a
 * random secret lands in a much larger class than the average. At 10x8 the expected
 * survivor count after one guess is ~10,000,000, and the largest class for a sensible
 * opening guess is ~15,100,000. See docs/DESIGN.md.
 */
export const CACHE_LIMIT = 16_000_000;

export type ScanResult = {
  /** Survivors. */
  count: number;
  /** The first min(count, SAMPLE_LIMIT) of them. */
  sample: Uint32Array;
  /** All survivors, if count <= cacheLimit; else null. */
  ids: Uint32Array | null;
};

/** Flattened turns, so the inner loop touches no objects. */
function prepare(turns: Turn[]) {
  return {
    guesses: turns.map((t) => Uint8Array.from(t.guess)),
    packed: Int32Array.from(turns, (t) => packFeedback(t.feedback)),
  };
}

/**
 * Walk the whole space, keeping codes consistent with every turn.
 *
 * The inner loop runs up to 100,000,000 times, so it carries the first turn's score
 * across odometer steps instead of recomputing it. Consecutive candidates differ in
 * one digit ~(colors-1)/colors of the time, and a single digit change patches the
 * score in O(1):
 *
 *   digit i changes a -> b:
 *     exact   += (b === guess[i]) - (a === guess[i])
 *     counts[a]--  and the color-match total drops if that took it below the guess's
 *     counts[b]++  and rises if that kept it within the guess's
 *
 * This is the one place scoring is reimplemented rather than calling scorePacked, and
 * it exists only because measurement demanded it: the straightforward version took
 * 17 s at 10x8 against a 4 s budget. `incrementalScoringMatchesScorePacked` in
 * solve.test.ts checks it against scorePacked over entire code spaces, which is what
 * keeps the two from drifting.
 *
 * Only the first turn gets this treatment. Candidates that survive it are few enough
 * to score normally against the rest.
 */
export function scanAll(
  config: Config,
  turns: Turn[],
  cacheLimit: number = CACHE_LIMIT,
): ScanResult {
  const { colors, slots } = config;
  const total = spaceSize(config);

  if (turns.length === 0) return unconstrained(config, cacheLimit);

  const { guesses, packed } = prepare(turns);
  const g0 = guesses[0];
  const want0 = packed[0];

  const capacity = Math.min(cacheLimit, total);
  const ids = new Uint32Array(capacity);
  const sample = new Uint32Array(Math.min(SAMPLE_LIMIT, total));
  const digits = new Uint8Array(slots);

  // Colors present in the first guess, and the running score of the candidate
  // against it. Seeded for the all-zero candidate, which is where the odometer starts.
  const guessCounts = new Int32Array(colors);
  for (let i = 0; i < slots; i++) guessCounts[g0[i]]++;

  const counts = new Int32Array(colors);
  counts[0] = slots;
  let exact = 0;
  for (let i = 0; i < slots; i++) if (g0[i] === 0) exact++;
  let matched = Math.min(guessCounts[0], slots);

  // Separate buffer: scoring later turns must not clobber the carried counts.
  const scratch = new Int32Array(colors);

  let count = 0;

  for (let id = 0; id < total; id++) {
    if (exact * 16 + (matched - exact) === want0) {
      let survives = true;
      for (let t = 1; t < guesses.length; t++) {
        if (scorePacked(guesses[t], digits, scratch) !== packed[t]) {
          survives = false;
          break;
        }
      }
      if (survives) {
        if (count < capacity) ids[count] = id;
        if (count < sample.length) sample[count] = id;
        count++;
      }
    }

    // Odometer: increment the last digit, carrying left, patching the score as we go.
    for (let i = slots - 1; i >= 0; i--) {
      const a = digits[i];
      const b = a + 1 < colors ? a + 1 : 0;

      digits[i] = b;
      if (g0[i] === a) exact--;
      if (g0[i] === b) exact++;
      if (--counts[a] < guessCounts[a]) matched--;
      if (++counts[b] <= guessCounts[b]) matched++;

      if (b !== 0) break;
    }
  }

  return {
    count,
    sample: sample.subarray(0, Math.min(count, sample.length)),
    ids: count <= cacheLimit ? ids.subarray(0, count) : null,
  };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * A sample of the unconstrained space, spread across it.
 *
 * Not the lowest ids, and not a plain stride either: ids are base-`colors` digits, so
 * `i * total/500` leaves the leading digits fixed for long runs and the list shows fifty
 * codes all starting `R R`. Walking by a step coprime to the space visits it in a single
 * cycle, so every entry is distinct and consecutive ones differ in the high digits too.
 */
export function strideSample(config: Config): Uint32Array {
  const total = spaceSize(config);
  const length = Math.min(SAMPLE_LIMIT, total);
  const sample = new Uint32Array(length);

  // Golden-ratio step, nudged until it shares no factor with the space.
  let step = Math.max(1, Math.floor(total * 0.6180339887));
  while (gcd(step, total) !== 1) step++;

  for (let i = 0; i < length; i++) sample[i] = (i * step) % total;
  return sample;
}

/** With no turns every code is possible, which needs no scan. */
function unconstrained(config: Config, cacheLimit: number): ScanResult {
  const total = spaceSize(config);
  const sample = strideSample(config);

  let ids: Uint32Array | null = null;
  if (total <= cacheLimit) {
    ids = new Uint32Array(total);
    for (let id = 0; id < total; id++) ids[id] = id;
  }

  return { count: total, sample, ids };
}

/**
 * Filter an already-consistent list against one new turn.
 *
 * Correct only when `ids` is exactly the survivor set of all previous turns of this
 * game at this config — the gapless invariant, enforced by the worker.
 */
export function scanCached(
  ids: Uint32Array,
  config: Config,
  turn: Turn,
  cacheLimit: number = CACHE_LIMIT,
): ScanResult {
  const { colors, slots } = config;
  const guess = Uint8Array.from(turn.guess);
  const want = packFeedback(turn.feedback);

  const survivors = new Uint32Array(ids.length);
  const sample = new Uint32Array(Math.min(SAMPLE_LIMIT, ids.length));
  const counts = new Int32Array(colors);
  const digits = new Uint8Array(slots);

  let count = 0;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    // Not an odometer: survivors are scattered, so each one is decoded. `| 0` rather
    // than Math.floor — ids stay under 2^31, and it is markedly faster here.
    let rest = id;
    for (let d = slots - 1; d >= 0; d--) {
      const next = (rest / colors) | 0;
      digits[d] = rest - next * colors;
      rest = next;
    }

    if (scorePacked(guess, digits, counts) === want) {
      survivors[count] = id;
      if (count < sample.length) sample[count] = id;
      count++;
    }
  }

  return {
    count,
    sample: sample.subarray(0, Math.min(count, sample.length)),
    ids: count <= cacheLimit ? survivors.subarray(0, count) : null,
  };
}
