import { useEffect, useReducer, useRef, useState } from 'react';
import { Board } from './Board';
import { SetupPanel } from './SetupPanel';
import { SolverPanel } from './SolverPanel';
import { Peg, codeLabel } from './Peg';
import {
  applyScan, clearSlot, createInitialState, newGame, placeColor,
  setDraft, setPendingConfig, submitGuess,
} from '../game/game';
import type { ScanReply, ScanRequest } from '../game/cache';
import type { Code, Color, Config, GameState } from '../game/types';

type Action =
  | { type: 'place'; slot: number; color: Color }
  | { type: 'clear'; slot: number }
  | { type: 'useCode'; code: Code }
  | { type: 'submit' }
  | { type: 'newGame' }
  | { type: 'setPending'; patch: Partial<Config> }
  | { type: 'scan'; reply: ScanReply };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'place': return placeColor(state, action.slot, action.color);
    case 'clear': return clearSlot(state, action.slot);
    case 'useCode': return setDraft(state, action.code);
    case 'submit': return submitGuess(state);
    case 'newGame': return newGame(state);
    case 'setPending': return setPendingConfig(state, action.patch);
    case 'scan':
      return applyScan(state, action.reply, action.reply.turnsCovered, action.reply.gameId);
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState());
  const workerRef = useRef<Worker | null>(null);

  // Bumped whenever a worker is created, so the scan effect re-posts to the new one.
  // StrictMode double-mounts in development, which would otherwise leave the second
  // worker having never received the current turns.
  const [workerEpoch, setWorkerEpoch] = useState(0);

  useEffect(() => {
    const worker = new Worker(new URL('../solver.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ScanReply>) =>
      dispatch({ type: 'scan', reply: event.data });

    workerRef.current = worker;
    setWorkerEpoch((n) => n + 1);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const { gameId, config, turns } = state;

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const message: ScanRequest =
      turns.length === 0
        ? { type: 'reset', gameId }
        : { type: 'scan', gameId, config, turns };

    worker.postMessage(message);
  }, [gameId, config, turns, workerEpoch]);

  const over = state.status !== 'playing';

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Mastermind</h1>
        <SetupPanel
          state={state}
          onChange={(patch) => dispatch({ type: 'setPending', patch })}
          onNewGame={() => dispatch({ type: 'newGame' })}
        />
      </header>

      <main className="layout">
        <section className="board-column">
          <Board
            state={state}
            onPlace={(slot, color) => dispatch({ type: 'place', slot, color })}
            onClear={(slot) => dispatch({ type: 'clear', slot })}
            onSubmit={() => dispatch({ type: 'submit' })}
          />

          {over && (
            <div className={`banner banner--${state.status}`} role="status">
              <p className="banner__line">
                {state.status === 'won'
                  ? `Cracked it in ${turns.length}.`
                  : 'Out of attempts. The code was:'}
              </p>
              <p className="banner__code" aria-label={codeLabel(state.secret)}>
                {state.secret.map((c, i) => <Peg key={i} color={c} size="lg" />)}
              </p>
            </div>
          )}
        </section>

        <SolverPanel state={state} onUseCode={(code) => dispatch({ type: 'useCode', code })} />
      </main>
    </div>
  );
}
