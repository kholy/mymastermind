import { useState } from 'react';
import { MAX_COLORS } from './palette';
import type { Config, GameState } from '../game/types';

type Props = {
  state: GameState;
  onChange: (patch: Partial<Config>) => void;
  onNewGame: () => void;
};

const BOUNDS = {
  colors: { min: 2, max: MAX_COLORS },
  slots: { min: 2, max: 8 },
  attempts: { min: 1, max: 20 },
} as const;

function range(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

export function SetupPanel({ state, onChange, onNewGame }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { config, pendingConfig, turns, status } = state;

  const changed =
    pendingConfig.colors !== config.colors ||
    pendingConfig.slots !== config.slots ||
    pendingConfig.attempts !== config.attempts;

  // Only a game genuinely underway is worth protecting.
  const inProgress = status === 'playing' && turns.length > 0;

  function click(event: React.MouseEvent<HTMLButtonElement>) {
    if (inProgress && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onNewGame();
    // Hand the keyboard back to the board — typing a guess is what happens next, and a
    // button left holding focus would swallow the Enter that submits it.
    event.currentTarget.blur();
  }

  return (
    <div className="setup">
      {(['colors', 'slots', 'attempts'] as const).map((key) => (
        <label key={key} className="setup__field">
          <span className="setup__label">{key}</span>
          <select
            value={pendingConfig[key]}
            onChange={(e) => onChange({ [key]: Number(e.target.value) })}
          >
            {range(BOUNDS[key].min, BOUNDS[key].max).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="button"
        className={`setup__new${confirming ? ' setup__new--confirming' : ''}`}
        onClick={click}
        onBlur={() => setConfirming(false)}
      >
        {confirming ? 'Discard game?' : 'New game'}
        {changed && !confirming && <span className="setup__dot" aria-label="settings changed" />}
      </button>
    </div>
  );
}
