export type Swatch = {
  name: string;
  /** Always rendered on the peg — the primary channel, not an annotation. */
  letter: string;
  hex: string;
  /** Near-black or near-white, whichever passes contrast against hex. */
  ink: string;
};

const DARK = '#231F1C';
const LIGHT = '#FFFFFF';

/**
 * Ten colors. A config of n uses the first n, so the default 6 spans the hue circle
 * rather than clustering. Positions 9 and 10 are deliberately not hues: at ten swatches
 * the circle is crowded, and white and black stay distinct from everything above them.
 */
export const PALETTE: Swatch[] = [
  { name: 'Red', letter: 'R', hex: '#D7263D', ink: LIGHT },
  { name: 'Orange', letter: 'O', hex: '#F46036', ink: DARK },
  { name: 'Yellow', letter: 'Y', hex: '#EFCA08', ink: DARK },
  { name: 'Green', letter: 'G', hex: '#2E933C', ink: LIGHT },
  { name: 'Teal', letter: 'T', hex: '#0FA3B1', ink: DARK },
  { name: 'Blue', letter: 'B', hex: '#2D5BFF', ink: LIGHT },
  { name: 'Purple', letter: 'P', hex: '#8338EC', ink: LIGHT },
  { name: 'Magenta', letter: 'M', hex: '#E5399C', ink: LIGHT },
  { name: 'White', letter: 'W', hex: '#F2F0EC', ink: DARK },
  { name: 'Black', letter: 'K', hex: '#2B2B2B', ink: LIGHT },
];

export const MAX_COLORS = PALETTE.length;
