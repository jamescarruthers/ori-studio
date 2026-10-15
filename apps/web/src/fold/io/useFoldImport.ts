import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { trackFoldChoiceOffered } from '../../analytics/trackFold';
import { trackFoldCpImported } from '../../analytics/trackFoldIo';
import { reportError } from '../../monitoring';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { getOristudioCpFoldedFigurePaperScene } from '../../store/workspaceStore/oristudioCpRuntime';
import { projectCpImport } from '../collapse/projectCpImport';
import { foldStartingFigureScene } from './foldEditFigure';
import { createFoldImportFlow, type FoldImportFlow, type FoldImportFlowState, type FoldImportRequest } from './foldImportFlow';

/** What the dialog reads before its flow exists: nothing under way. */
const IDLE = createStore<FoldImportFlowState>(() => ({ phase: 'idle' }));

/** The import flow as the app runs it: the app's session, Edit's figures, the analytics event. */
export function createAppFoldImportFlow(): FoldImportFlow {
  return createFoldImportFlow({
    session: foldSession(),
    editFoldedFigure: () =>
      foldStartingFigureScene(useWorkspaceStore.getState(), (handle) => getOristudioCpFoldedFigurePaperScene(handle)),
    projectCp: projectCpImport,
    onImported: trackFoldCpImported,
    onChoiceOffered: (orders) => trackFoldChoiceOffered('import_order', orders),
  });
}

/**
 * Import CP's flow for a dialog's lifetime (`foldImportFlow.ts`): made when
 * the dialog mounts — holding the engine from then on — opened on `initial`
 * when it brings one, and let go with everything it holds when it unmounts.
 * Made in an effect, so React's double mount in development makes a second
 * flow rather than reusing one already disposed.
 */
export function useFoldImportFlow(initial: FoldImportRequest | null): {
  flow: FoldImportFlow | null;
  state: FoldImportFlowState;
} {
  const [flow, setFlow] = useState<FoldImportFlow | null>(null);
  useEffect(() => {
    const made = createAppFoldImportFlow();
    setFlow(made);
    if (initial) void made.open(initial);
    return () => {
      made.dispose();
      setFlow((current) => (current === made ? null : current));
    };
  }, [initial]);
  const state = useStore(flow?.store ?? IDLE);
  // An error is no refusal: the dialog says it plainly, and it is reported.
  useEffect(() => {
    if (state.phase === 'failed') reportError(state.error, { surface: 'fold:import' });
  }, [state]);
  return { flow, state };
}
