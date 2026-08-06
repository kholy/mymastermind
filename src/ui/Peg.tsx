import { PALETTE } from './palette';
import type { Color } from '../game/types';

type Props = {
  color: Color | null;
  size?: 'sm' | 'md' | 'lg';
  /** Marks the slot the next keystroke will fill. */
  selected?: boolean;
};

/**
 * A colored circle with its letter. The letter is not optional: ten hues cannot be made
 * reliably distinguishable under color vision deficiency, so it carries the meaning and
 * the color makes it fast.
 */
export function Peg({ color, size = 'md', selected = false }: Props) {
  if (color === null) {
    return (
      <span
        className={`peg peg--${size} peg--empty${selected ? ' peg--selected' : ''}`}
        aria-hidden="true"
      />
    );
  }

  const swatch = PALETTE[color];
  return (
    <span
      className={`peg peg--${size}${selected ? ' peg--selected' : ''}`}
      style={{ background: swatch.hex, color: swatch.ink }}
    >
      {swatch.letter}
    </span>
  );
}

export function codeLabel(code: readonly (Color | null)[]): string {
  return code.map((c) => (c === null ? 'empty' : PALETTE[c].name)).join(' ');
}
