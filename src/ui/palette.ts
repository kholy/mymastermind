export type Swatch = {
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
  { hex: '#D7263D', ink: LIGHT }, // red
  { hex: '#F46036', ink: DARK },  // orange
  { hex: '#EFCA08', ink: DARK },  // yellow
  { hex: '#2E933C', ink: LIGHT }, // green
  { hex: '#0FA3B1', ink: DARK },  // teal
  { hex: '#2D5BFF', ink: LIGHT }, // blue
  { hex: '#8338EC', ink: LIGHT }, // purple
  { hex: '#E5399C', ink: LIGHT }, // magenta
  { hex: '#F2F0EC', ink: DARK },  // white
  { hex: '#2B2B2B', ink: LIGHT }, // black
];

export const MAX_COLORS = PALETTE.length;

/**
 * What a color is called: its number, counting from 1.
 *
 * Always rendered on the peg. Ten hues cannot be made reliably distinguishable under
 * color vision deficiency, so the number carries the meaning and the color makes it fast.
 */
export function label(color: number): string {
  return String(color + 1);
}

/**
 * The key that places this color. Colors 1-9 use their own digit; the tenth uses 0,
 * because that is where the digit row runs out.
 */
export function shortcut(color: number): string {
  return color === 9 ? '0' : String(color + 1);
}
