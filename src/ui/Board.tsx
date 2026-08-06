import { useEffect, useRef, useState } from 'react';
import { Peg, codeLabel } from './Peg';
import { PALETTE, label, shortcut } from './palette';
import { releaseFocus } from './focus';
import { canSubmit, markAt } from '../game/game';
import type { Color, Feedback, GameState } from '../game/types';

type Props = {
  state: GameState;
  onPlace: (slot: number, color: Color) => void;
  onClear: (slot: number) => void;
  onSubmit: () => void;
  onCycleMark: (turn: number, slot: number) => void;
  onToggleRuledOut: (color: Color) => void;
};

const MARK_TEXT = {
  correct: 'for sure correct',
  wrong: 'for sure wrong',
  none: 'unmarked',
} as const;

/**
 * Feedback as a two-row key-peg cluster.
 *
 * Exact pegs always fill it first, in reading order. That is not cosmetic: peg placement
 * must carry no positional information about the guess, so this never derives its layout
 * from which slots matched.
 */
function FeedbackPegs({ feedback, slots }: { feedback: Feedback; slots: number }) {
  const pegs = Array.from({ length: slots }, (_, i) =>
    i < feedback.exact ? 'exact' : i < feedback.exact + feedback.partial ? 'partial' : 'none',
  );

  return (
    <span
      className="keys"
      style={{ '--cols': Math.ceil(slots / 2) } as React.CSSProperties}
      role="img"
      aria-label={`${feedback.exact} exact, ${feedback.partial} partial`}
    >
      {pegs.map((kind, i) => (
        <span key={i} className={`key key--${kind}`} />
      ))}
    </span>
  );
}

export function Board({
  state, onPlace, onClear, onSubmit, onCycleMark, onToggleRuledOut,
}: Props) {
  const { config, turns, draft, status, notes } = state;
  const [selected, setSelected] = useState(0);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const playing = status === 'playing';
  const ready = canSubmit(state);

  useEffect(() => setSelected(0), [turns.length, state.gameId]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);

  /** Next empty slot at or after `from`, wrapping; stays put if the row is full. */
  function nextEmpty(from: number, current: (Color | null)[]): number {
    for (let i = 0; i < config.slots; i++) {
      const slot = (from + i) % config.slots;
      if (current[slot] === null) return slot;
    }
    return from;
  }

  function place(slot: number, color: Color) {
    if (notes.ruledOut[color]) return;
    const after = [...draft];
    after[slot] = color;
    onPlace(slot, color);
    setSelected(nextEmpty((slot + 1) % config.slots, after));
  }

  function clickSlot(slot: number) {
    if (!playing) return;
    if (slot === selected && draft[slot] !== null) onClear(slot);
    setSelected(slot);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!playing) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;

      const { key } = event;

      // Enter and Space belong to whichever control has focus. The board only claims
      // them when nothing does — otherwise tabbing to a button and pressing Enter would
      // both activate it and submit a guess. Mouse clicks release focus (see
      // releaseFocus), so after clicking around, Enter still submits.
      if ((key === 'Enter' || key === ' ') && target?.closest('button, select, a')) return;

      if (/^[0-9]$/.test(key)) {
        const color = key === '0' ? 9 : Number(key) - 1;
        if (color < config.colors) {
          event.preventDefault();
          place(selected, color);
        }
        return;
      }

      if (key === 'ArrowLeft') {
        event.preventDefault();
        setSelected((s) => (s - 1 + config.slots) % config.slots);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        setSelected((s) => (s + 1) % config.slots);
      } else if (key === 'Backspace') {
        event.preventDefault();
        // Clear, else step back and clear that one — the fast-entry convention.
        if (draft[selected] !== null) {
          onClear(selected);
        } else {
          const back = (selected - 1 + config.slots) % config.slots;
          onClear(back);
          setSelected(back);
        }
      } else if (key === 'Enter' && ready) {
        event.preventDefault();
        onSubmit();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const rows = Array.from({ length: config.attempts }, (_, i) => i);

  return (
    <div className="board" style={{ '--slots': config.slots } as React.CSSProperties}>
      <ol className="rows">
        {rows.map((i) => {
          const turn = turns[i];
          const isActive = i === turns.length && playing;

          if (turn) {
            return (
              <li key={i} className="row row--locked">
                <span className="row__index">{i + 1}</span>
                <span className="row__pegs">
                  {turn.guess.map((c, j) => {
                    const mark = markAt(state, i, j);
                    return (
                      <button
                        key={j}
                        type="button"
                        className="slot slot--markable"
                        onClick={() => onCycleMark(i, j)}
                        onMouseUp={releaseFocus}
                        aria-label={
                          `Guess ${i + 1}, slot ${j + 1}: color ${label(c)}, ` +
                          `${MARK_TEXT[mark ?? 'none']}. Click to change.`
                        }
                      >
                        <Peg color={c} mark={mark} />
                      </button>
                    );
                  })}
                </span>
                <FeedbackPegs feedback={turn.feedback} slots={config.slots} />
              </li>
            );
          }

          if (isActive) {
            return (
              <li key={i} className="row row--active" ref={activeRowRef as never}>
                <span className="row__index" aria-hidden="true">{i + 1}</span>
                <span className="row__pegs">
                  {draft.map((c, j) => (
                    <button
                      key={j}
                      type="button"
                      className="slot"
                      aria-label={`Slot ${j + 1}: ${c === null ? 'empty' : `color ${label(c)}`}`}
                      aria-current={j === selected}
                      onClick={() => clickSlot(j)}
                      onMouseUp={releaseFocus}
                    >
                      <Peg color={c} size="lg" selected={j === selected} />
                    </button>
                  ))}
                </span>
                <span className="keys keys--pending" aria-hidden="true" />
              </li>
            );
          }

          return (
            <li key={i} className="row row--future" aria-hidden="true">
              <span className="row__index">{i + 1}</span>
              <span className="row__pegs">
                {Array.from({ length: config.slots }, (_, j) => <Peg key={j} color={null} />)}
              </span>
              <span className="keys keys--pending" />
            </li>
          );
        })}
      </ol>

      {turns.length > 0 && playing && (
        <p className="hint hint--marks">
          Click a peg above to mark it <span className="chip chip--correct">✓ correct</span> or{' '}
          <span className="chip chip--wrong">✕ wrong</span>. Your notes, not the game's.
        </p>
      )}

      {playing && (
        <div className="controls">
          <div className="palette" role="group" aria-label="Colors">
            {PALETTE.slice(0, config.colors).map((swatch, color) => {
              const out = notes.ruledOut[color];
              return (
                <span key={color} className={`palette__item${out ? ' palette__item--out' : ''}`}>
                  <button
                    type="button"
                    className="palette__button"
                    style={{ background: swatch.hex, color: swatch.ink }}
                    onClick={() => place(selected, color)}
                    onMouseUp={releaseFocus}
                    disabled={out}
                    aria-label={`Color ${label(color)} — key ${shortcut(color)}`}
                  >
                    {label(color)}
                  </button>
                  <button
                    type="button"
                    className="palette__rule-out"
                    onClick={() => onToggleRuledOut(color)}
                    onMouseUp={releaseFocus}
                    aria-pressed={out}
                    aria-label={`${out ? 'Bring back' : 'Rule out'} color ${label(color)}`}
                    title={out ? 'Bring this color back' : 'Rule this color out'}
                  >
                    {out ? '↺' : '✕'}
                  </button>
                </span>
              );
            })}
          </div>

          <button
            type="button"
            className="submit"
            onClick={onSubmit}
            onMouseUp={releaseFocus}
            disabled={!ready}
            aria-describedby="submit-hint"
          >
            Submit guess
          </button>
          <p id="submit-hint" className="hint">
            {ready ? 'Or press Enter' : `Fill all ${config.slots} slots`}
          </p>
        </div>
      )}
    </div>
  );
}

export { codeLabel };
