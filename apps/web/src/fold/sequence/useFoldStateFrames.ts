import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { reportError } from '../../monitoring';
import { foldSession } from '../../store/workspaceStore/foldSession';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldScene } from '../engine/foldEngineWire';
import type { FoldSession, FoldStateCall } from '../session/foldSession';
import { foldStateFrame, type FoldStateFrame } from './foldStateFrame';

/**
 * Each landed state's frame (`foldStateFrame`), asked of the engine once per
 * state and kept for every surface: the strip, the Steps grid and the Step
 * pane read the same states, and a state never changes under its handle.
 *
 * Kept by handle, newest last, up to {@link MAX_FRAMES}: a long sequence's
 * path and its neighbours, with room. A handle from a newer engine lets every
 * older one go, since a worker that went away took its states with it.
 */
const MAX_FRAMES = 192;

const frames = createStore<{ byHandle: ReadonlyMap<string, FoldStateFrame> }>(() => ({ byHandle: new Map() }));

/** Asked and not yet answered, so a state is asked once however many surfaces want it. */
const asking = new Set<string>();

const handleKey = (state: FoldEngineStateHandle) => `${state.generation}:${state.id}`;

const askScene: FoldStateCall<FoldScene> = (engine, state) => engine.scene(state);

function keep(state: FoldEngineStateHandle, frame: FoldStateFrame): void {
  const next = new Map<string, FoldStateFrame>();
  for (const [key, held] of frames.getState().byHandle) {
    if (Number(key.split(':')[0]) >= state.generation) next.set(key, held);
  }
  next.set(handleKey(state), frame);
  for (const oldest of next.keys()) {
    if (next.size <= MAX_FRAMES) break;
    next.delete(oldest);
  }
  frames.setState({ byHandle: next });
}

/** Ask the engine for a state's frame, unless it is held or on its way. */
export function requestFoldStateFrame(session: FoldSession, state: FoldEngineStateHandle): void {
  const key = handleKey(state);
  if (frames.getState().byHandle.has(key) || asking.has(key)) return;
  asking.add(key);
  session.withState(state, askScene).then(
    (answer) => {
      asking.delete(key);
      // A state that went with its engine is asked again under its next handle.
      if (answer.status === 'answered') keep(state, foldStateFrame(answer.value));
    },
    (error: unknown) => {
      asking.delete(key);
      // Not the user's to act on: the card shows no picture, and the next state asks again.
      reportError(error, { surface: 'fold:state-frame' });
    }
  );
}

/** The frame of a state, if held. */
export function heldFoldStateFrame(state: FoldEngineStateHandle | null): FoldStateFrame | null {
  return state ? (frames.getState().byHandle.get(handleKey(state)) ?? null) : null;
}

/** Forget every frame: for tests. */
export function clearFoldStateFrames(): void {
  asking.clear();
  frames.setState({ byHandle: new Map() });
}

/**
 * The frames of these states, in order: null for a state not held yet — it is
 * asked for — and for no state. Re-renders when one of them lands.
 */
export function useFoldStateFrames(states: readonly (FoldEngineStateHandle | null)[]): (FoldStateFrame | null)[] {
  const session = foldSession();
  const byHandle = useStore(frames, (snapshot) => snapshot.byHandle);
  useEffect(() => {
    for (const state of states) if (state) requestFoldStateFrame(session, state);
  }, [session, states]);
  return useMemo(
    () => states.map((state) => (state ? (byHandle.get(handleKey(state)) ?? null) : null)),
    [byHandle, states]
  );
}
