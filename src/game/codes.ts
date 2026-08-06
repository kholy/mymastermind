import type { Code, CodeId, Config } from './types';

/** Number of possible codes: colors ** slots. */
export function spaceSize(config: Config): number {
  return config.colors ** config.slots;
}

/** Pack a code into an integer, most significant digit first. */
export function encode(code: Code, config: Config): CodeId {
  let id = 0;
  for (const digit of code) id = id * config.colors + digit;
  return id;
}

/** Unpack an id. Allocates — for rendering, not for scan loops. */
export function decode(id: CodeId, config: Config): Code {
  const out: Code = new Array(config.slots);
  for (let i = config.slots - 1; i >= 0; i--) {
    out[i] = id % config.colors;
    id = Math.floor(id / config.colors);
  }
  return out;
}

/**
 * Unpack into a caller-owned buffer. The scan loop visits up to 100,000,000
 * candidates, so an allocating decode would mean 100,000,000 short-lived arrays.
 */
export function decodeInto(id: CodeId, config: Config, out: Uint8Array): void {
  for (let i = config.slots - 1; i >= 0; i--) {
    out[i] = id % config.colors;
    id = Math.floor(id / config.colors);
  }
}

// There is deliberately no allCodes(). At 10 colors x 8 slots the space is
// 100,000,000 codes; materializing it is the bug the solver exists to avoid.
