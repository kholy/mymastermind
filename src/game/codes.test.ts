import { describe, it, expect } from 'vitest';
import { encode, decode, decodeInto, spaceSize } from './codes';
import type { Code, Config } from './types';

const cfg = (colors: number, slots: number): Config => ({ colors, slots, attempts: 10 });

function everyCode(config: Config): Code[] {
  const out: Code[] = [];
  for (let id = 0; id < spaceSize(config); id++) out.push(decode(id, config));
  return out;
}

describe('spaceSize', () => {
  it('is colors ** slots', () => {
    expect(spaceSize(cfg(2, 2))).toBe(4);
    expect(spaceSize(cfg(6, 4))).toBe(1296);
    expect(spaceSize(cfg(10, 6))).toBe(1_000_000);
    expect(spaceSize(cfg(10, 8))).toBe(100_000_000);
  });

  it('stays inside the Uint32Array ceiling at the maximum config', () => {
    // Fails first if someone raises the slots bound without changing the encoding.
    expect(spaceSize(cfg(10, 8))).toBeLessThan(2 ** 32);
  });
});

describe('encode / decode', () => {
  it('round-trips every code in a 4x3 space', () => {
    const config = cfg(4, 3);
    for (const code of everyCode(config)) {
      expect(decode(encode(code, config), config)).toEqual(code);
    }
  });

  it('round-trips random codes at the maximum 10x8', () => {
    const config = cfg(10, 8);
    for (let n = 0; n < 200; n++) {
      const code = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
      expect(decode(encode(code, config), config)).toEqual(code);
    }
  });

  it('is order-sensitive', () => {
    const config = cfg(4, 2);
    expect(encode([0, 1], config)).not.toBe(encode([1, 0], config));
  });

  it('produces dense, unique ids over a full space', () => {
    const config = cfg(4, 3);
    const ids = everyCode(config).map((c) => encode(c, config));
    expect([...ids].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 64 }, (_, i) => i),
    );
  });
});

describe('decodeInto', () => {
  it('writes the same digits as decode', () => {
    const config = cfg(6, 4);
    const buf = new Uint8Array(4);
    for (let id = 0; id < spaceSize(config); id += 7) {
      decodeInto(id, config, buf);
      expect([...buf]).toEqual(decode(id, config));
    }
  });

  it('leaves no stale digits when one buffer is reused', () => {
    // The bug that would otherwise only appear under load.
    const config = cfg(6, 4);
    const shared = new Uint8Array(4);
    for (let id = 0; id < 500; id++) {
      decodeInto(id, config, shared);
      const fresh = new Uint8Array(4);
      decodeInto(id, config, fresh);
      expect([...shared]).toEqual([...fresh]);
    }
  });
});
