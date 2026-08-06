import { PALETTE, label } from './palette';
import type { Color, Mark } from '../game/types';

type Props = {
  color: Color | null;
  size?: 'sm' | 'md' | 'lg';
  /** Marks the slot the next keystroke will fill. */
  selected?: boolean;
  /** The player's note about this peg. Never derived from the secret. */
  mark?: Mark;
  /** Ruled out by the player, so shown spent. */
  spent?: boolean;
};

export function Peg({ color, size = 'md', selected = false, mark, spent = false }: Props) {
  if (color === null) {
    return (
      <span
        className={`peg peg--${size} peg--empty${selected ? ' peg--selected' : ''}`}
        aria-hidden="true"
      />
    );
  }

  const text = label(color);
  const classes = [
    'peg',
    `peg--${size}`,
    text.length > 1 && 'peg--wide',
    selected && 'peg--selected',
    spent && 'peg--spent',
    mark && `peg--${mark}`,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} style={{ background: PALETTE[color].hex, color: PALETTE[color].ink }}>
      {text}
      {mark && <span className="peg__mark" aria-hidden="true">{mark === 'correct' ? '✓' : '✕'}</span>}
    </span>
  );
}

/** How a code reads to a screen reader. */
export function codeLabel(code: readonly (Color | null)[]): string {
  return code.map((c) => (c === null ? 'empty' : label(c))).join(', ');
}
