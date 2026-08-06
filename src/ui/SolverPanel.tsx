import { useEffect, useState } from 'react';
import { Peg } from './Peg';
import { releaseFocus } from './focus';
import { decode, spaceSize } from '../game/codes';
import { isSolverStale } from '../game/game';
import type { Code, GameState } from '../game/types';

type Props = {
  state: GameState;
  onUseCode: (code: Code) => void;
};

/** Wait this long before admitting a scan is slow — below it, no spinner flashes. */
const STALE_DELAY_MS = 200;

export function SolverPanel({ state, onUseCode }: Props) {
  const { config, solver, status } = state;
  const [expanded, setExpanded] = useState(false);
  const [showStale, setShowStale] = useState(false);

  const stale = isSolverStale(state);

  // Gate the stale treatment on elapsed time, not config size: small configs simply
  // never reach the threshold.
  useEffect(() => {
    if (!stale) {
      setShowStale(false);
      return;
    }
    const timer = setTimeout(() => setShowStale(true), STALE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stale, solver.turnsCovered]);

  const total = spaceSize(config);
  const only = solver.count === 1 && !stale ? decode(solver.sample[0], config) : null;

  // Log scale: the space collapses by orders of magnitude, so a linear bar would sit
  // pinned at zero from the first guess onward.
  const remaining = total <= 1 ? 0 : Math.log(solver.count) / Math.log(total);

  return (
    <aside className={`solver${showStale ? ' solver--stale' : ''}`}>
      <h2 className="solver__title">Possible codes</h2>

      <p className="solver__count" aria-live="polite">
        {solver.count.toLocaleString()}
      </p>

      <div className="solver__bar" aria-hidden="true">
        <span className="solver__fill" style={{ width: `${Math.max(remaining * 100, 0.6)}%` }} />
      </div>

      <p className="solver__caption">
        {showStale && solver.turnsCovered > 0
          ? `after guess ${solver.turnsCovered}`
          : `of ${total.toLocaleString()} at the start`}
      </p>

      {showStale && (
        <p className="solver__working" role="status">
          <span className="solver__indeterminate" aria-hidden="true" />
          Narrowing…
        </p>
      )}

      {only && (
        <div className="solver__only">
          <p>This is the only possibility.</p>
          <button type="button" className="only__code" onClick={() => onUseCode(only)} onMouseUp={releaseFocus}>
            {only.map((c, i) => <Peg key={i} color={c} size="sm" />)}
            <span className="only__hint">{status === 'playing' ? 'Use it' : ''}</span>
          </button>
        </div>
      )}

      {!only && (
        <>
          <button
            type="button"
            className="solver__toggle"
            onClick={() => setExpanded((e) => !e)}
            onMouseUp={releaseFocus}
            aria-expanded={expanded}
          >
            {expanded ? 'Hide codes' : 'Show codes'}
          </button>

          {expanded && (
            <div className="codes">
              {solver.count > solver.sample.length && (
                <p className="codes__note">
                  Showing {solver.sample.length} of {solver.count.toLocaleString()}
                </p>
              )}
              <ul className="codes__list">
                {[...solver.sample].map((id) => (
                  <li key={id} className="codes__row">
                    {decode(id, config).map((c, i) => <Peg key={i} color={c} size="sm" />)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
