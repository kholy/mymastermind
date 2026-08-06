import type { Color, Feedback } from './types';

/**
 * Score a guess against a secret, packed as `exact * 16 + partial`.
 *
 * This is the single definition of scoring in the codebase; scoreGuess below is a
 * thin unpacking wrapper. It returns a number rather than a Feedback object because
 * the scan loop calls it up to 100,000,000 times per scan, and an object per call
 * would be an object per candidate.
 *
 * The only correct way to handle repeated colors is to count colors rather than
 * walk pegs greedily: `matched` is how many pegs pair up ignoring position, and
 * every exact match is also a color match, so the difference is the
 * right-color-wrong-place count. See docs/GAME_RULES.md for the worked examples
 * that pin this down.
 *
 * `counts` is a caller-owned scratch buffer with one entry per color; it is cleared on
 * entry, so hot loops reuse one rather than allocating per candidate.
 */
export function scorePacked(
  guess: Uint8Array,
  secret: Uint8Array,
  counts: Int32Array,
): number {
  const tally = counts;
  tally.fill(0);

  let exact = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) exact++;
    tally[guess[i]]++;
  }

  // Consume the guess's tally with the secret's pegs: each secret peg pairs with
  // at most one guess peg of the same color.
  let matched = 0;
  for (let i = 0; i < guess.length; i++) {
    const c = secret[i];
    if (tally[c] > 0) {
      tally[c]--;
      matched++;
    }
  }

  return exact * 16 + (matched - exact);
}

export function packFeedback(feedback: Feedback): number {
  return feedback.exact * 16 + feedback.partial;
}

export function unpackFeedback(packed: number): Feedback {
  return { exact: packed >> 4, partial: packed & 15 };
}

/**
 * Score a guess against a secret. The convenient form, for game logic and tests.
 *
 * Converts to typed arrays and delegates. That allocation is deliberate: it keeps
 * scorePacked monomorphic on Uint8Array, which is worth far more in the scan loop
 * than it costs here — this is called once per guess, that one up to 100,000,000
 * times per scan.
 */
export function scoreGuess(
  guess: ArrayLike<Color>,
  secret: ArrayLike<Color>,
  colors: number,
): Feedback {
  return unpackFeedback(
    scorePacked(Uint8Array.from(guess), Uint8Array.from(secret), new Int32Array(colors)),
  );
}
