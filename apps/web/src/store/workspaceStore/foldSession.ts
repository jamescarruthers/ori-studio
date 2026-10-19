import type { StoreApi } from 'zustand';
import { trackFoldEngineCrashed } from '../../analytics/trackFoldEngine';
import {
  createFoldSession,
  type FoldSession,
  type FoldSessionDocumentSource,
  type FoldSessionRuntime,
} from '../../fold/session/foldSession';
import {
  askFoldSequenceClient,
  createFoldPreviewChannel,
  foldSequenceClientGeneration,
  foldSequenceEngineSource,
  onFoldSequenceClientLost,
  releaseFoldSequenceClient,
  retainFoldSequenceClient,
} from './foldSequenceRuntime';
import { shownFoldSequence } from './foldState';
import { useWorkspaceStore } from './store';
import type { WorkspaceState } from './types';

// The Fold session as the app runs it (`fold/session/foldSession.ts`): the
// shown sequence from the workspace store's Fold slice, the engine in the Fold
// worker (`foldSequenceRuntime`), errors to the error toast through the
// store's `error`, as the worker-failure sink sends them, and each crash of
// the engine, with what came of it, to analytics.

/** The shown sequence, the reader's place and the load, as the slice holds them. */
export function foldSessionDocumentSource(store: StoreApi<WorkspaceState>): FoldSessionDocumentSource {
  return {
    read: () => {
      const state = store.getState();
      return { loadId: state.foldLoadId, held: shownFoldSequence(state), reader: state.foldReader };
    },
    subscribe: (listener) =>
      store.subscribe((state, previous) => {
        if (
          state.foldSequences !== previous.foldSequences ||
          state.foldReader !== previous.foldReader ||
          state.foldLoadId !== previous.foldLoadId
        ) {
          listener();
        }
      }),
    commit: (draft, loadId) => store.getState().commitFoldStep(draft, { loadId }),
  };
}

/** The Fold worker, reference-counted, as the session drives it. */
export const foldSequenceSessionRuntime: FoldSessionRuntime = {
  retain: () => {
    retainFoldSequenceClient();
  },
  release: releaseFoldSequenceClient,
  generation: foldSequenceClientGeneration,
  onLost: onFoldSequenceClientLost,
  ask: askFoldSequenceClient,
  createChannel: createFoldPreviewChannel,
  source: foldSequenceEngineSource,
};

let session: FoldSession | null = null;

/**
 * The app's one Fold session, made on first use. It listens to the store from
 * then on, but starts the worker and replays only while a Fold surface holds
 * it (`useFoldSession`).
 */
export function foldSession(): FoldSession {
  session ??= createFoldSession({
    document: foldSessionDocumentSource(useWorkspaceStore),
    runtime: foldSequenceSessionRuntime,
    reportError: (error) => useWorkspaceStore.setState({ error }),
    onEngineCrash: trackFoldEngineCrashed,
  });
  return session;
}
