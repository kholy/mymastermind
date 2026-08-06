import { describe, it, expect } from 'vitest';
import { scanAll, scanCached, SAMPLE_LIMIT } from './solve';
import { decode, encode, spaceSize } from './codes';
import { scoreGuess } from './feedback';
import type { Code, Config, Turn } from './types';

const cfg = (colors: number, slots: number): Config => ({ colors, slots, attempts: 10 });

/** Small enough to force streaming mode in a tiny space. */
const TINY_CACHE = 8;

function randomCode(config: Config): Code {
  return Array.from({ length: config.slots }, () => Math.floor(Math.random() * config.colors));
}

function turnFor(guess: Code, secret: Code, config: Config): Turn {
  return { guess, feedback: scoreGuess(guess, secret, config.colors) };
}

/** Brute-force reference: every code consistent with the history. */
function referenceSurvivors(config: Config, turns: Turn[]): number[] {
  const out: number[] = [];
  for (let id = 0; id < spaceSize(config); id++) {
    const code = decode(id, config);
    if (turns.every((t) => {
      const f = scoreGuess(t.guess, code, config.colors);
      return f.exact === t.feedback.exact && f.partial === t.feedback.partial;
    })) out.push(id);
  }
  return out;
}

describe('scanAll', () => {
  it('returns the whole space when there are no turns', () => {
    const config = cfg(4, 3);
    expect(scanAll(config, []).count).toBe(spaceSize(config));
  });

  it('leaves exactly the guess when feedback is all exact', () => {
    const config = cfg(4, 3);
    const guess = [1, 2, 3];
    const result = scanAll(config, [{ guess, feedback: { exact: 3, partial: 0 } }]);
    expect(result.count).toBe(1);
    expect(decode(result.ids![0], config)).toEqual(guess);
  });

  it('agrees with brute force across random histories', () => {
    const config = cfg(4, 3);
    for (let n = 0; n < 20; n++) {
      const secret = randomCode(config);
      const turns = [1, 2].map(() => turnFor(randomCode(config), secret, config));
      expect([...scanAll(config, turns).ids!]).toEqual(referenceSurvivors(config, turns));
    }
  });

  it('populates ids iff count <= cacheLimit, and counts exactly either way', () => {
    const config = cfg(4, 3);
    const full = scanAll(config, [], TINY_CACHE);
    expect(full.count).toBe(64);
    expect(full.ids).toBeNull();

    const roomy = scanAll(config, [], 64);
    expect(roomy.ids).not.toBeNull();
    expect(roomy.ids!.length).toBe(64);
  });

  it('keeps the count exact when the cache overflows by one', () => {
    const config = cfg(4, 3);
    const turns = [turnFor([0, 1, 2], [0, 1, 3], config)];
    const truth = scanAll(config, turns).count;
    const overflowed = scanAll(config, turns, truth - 1);
    expect(overflowed.count).toBe(truth);
    expect(overflowed.ids).toBeNull();
  });

  it('caps the sample and fills it with genuine survivors', () => {
    const config = cfg(6, 4);
    const result = scanAll(config, []);
    expect(result.count).toBe(1296);
    expect(result.sample.length).toBe(SAMPLE_LIMIT);
    const survivors = new Set(result.ids!);
    for (const id of result.sample) expect(survivors.has(id)).toBe(true);
  });

  it('is idempotent for a repeated guess', () => {
    const config = cfg(4, 3);
    const secret = [0, 1, 2];
    const turn = turnFor([1, 1, 2], secret, config);
    expect(scanAll(config, [turn]).count).toBe(scanAll(config, [turn, turn]).count);
  });
});

describe('incrementalScoringMatchesScorePacked', () => {
  // scanAll carries the first turn's score across odometer steps instead of calling
  // scorePacked. That is the only reimplementation of scoring in the codebase, so it
  // is checked exhaustively: for every possible feedback value of a guess, the set
  // scanAll returns must equal the set brute force finds using scorePacked.
  it.each([
    [4, 3, [0, 1, 2]],
    [3, 4, [0, 0, 1, 2]],
    [5, 3, [4, 4, 4]],
    [2, 6, [0, 1, 1, 0, 1, 0]],
    [6, 4, [0, 1, 2, 3]],
  ])('over the whole %ix%i space, guess %j', (colors, slots, guess) => {
    const config = cfg(colors, slots);
    let checked = 0;

    for (let exact = 0; exact <= slots; exact++) {
      for (let partial = 0; partial + exact <= slots; partial++) {
        const turns: Turn[] = [{ guess, feedback: { exact, partial } }];
        expect([...(scanAll(config, turns).ids ?? [])])
          .toEqual(referenceSurvivors(config, turns));
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe('the two modes agree', () => {
  it('produces identical survivors and samples, turn by turn', () => {
    const config = cfg(4, 3);
    for (let n = 0; n < 25; n++) {
      const secret = randomCode(config);
      const turns: Turn[] = [];
      let cached = scanAll(config, []);

      for (let t = 0; t < 3; t++) {
        const turn = turnFor(randomCode(config), secret, config);
        turns.push(turn);

        cached = scanCached(cached.ids!, config, turn);
        const streamed = scanAll(config, turns, TINY_CACHE);

        expect(cached.count).toBe(streamed.count);
        expect([...cached.sample]).toEqual([...streamed.sample]);
        expect([...cached.ids!]).toEqual(referenceSurvivors(config, turns));
      }
    }
  });
});

describe('properties', () => {
  it('never eliminates the true secret', () => {
    // The invariant the whole solver panel depends on. Small configs deliberately —
    // the logic does not know how big the space is.
    for (let game = 0; game < 500; game++) {
      const config = cfg(2 + Math.floor(Math.random() * 5), 2 + Math.floor(Math.random() * 3));
      const secret = randomCode(config);
      const secretId = encode(secret, config);
      const turns: Turn[] = [];

      for (let t = 0; t < 4; t++) {
        turns.push(turnFor(randomCode(config), secret, config));
        const result = scanAll(config, turns);
        expect(result.ids).not.toBeNull();
        expect([...result.ids!]).toContain(secretId);
      }
    }
  });

  it('never reaches a count of 0', () => {
    for (let game = 0; game < 100; game++) {
      const config = cfg(2 + Math.floor(Math.random() * 5), 2 + Math.floor(Math.random() * 3));
      const secret = randomCode(config);
      const turns: Turn[] = [];
      for (let t = 0; t < 4; t++) {
        turns.push(turnFor(randomCode(config), secret, config));
        expect(scanAll(config, turns).count).toBeGreaterThan(0);
      }
    }
  });

  it('never grows the survivor set', () => {
    const config = cfg(5, 3);
    const secret = randomCode(config);
    const turns: Turn[] = [];
    let previous = spaceSize(config);
    for (let t = 0; t < 4; t++) {
      turns.push(turnFor(randomCode(config), secret, config));
      const { count } = scanAll(config, turns);
      expect(count).toBeLessThanOrEqual(previous);
      previous = count;
    }
  });
});
