import { useMemo } from 'react';
import {
  peekCpSegmentationArtifacts,
} from '../../cp-workspace/cpSegmentationArtifacts';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramStep } from '../document/diagramDocument';
import { foldLinkNeedsReplay, type FoldLinkContext } from '../fold/foldStepLink';
import { foldLinkContextNow, useFoldLinkContext } from '../fold/useFoldLinkContext';
import { diagramLinkStatus } from './diagramLinks';
import { linkedSourceOf, type DiagramLinkContext, type DiagramLinkStatus } from './linkStatus';

import { useCpSegmentation } from '../../cp-workspace/regions/useCpSegmentation';
export { useCpSegmentation, useCpSegmentationState, type CpSegmentationState } from '../../cp-workspace/regions/useCpSegmentation';

const NO_STATUSES: ReadonlyMap<string, DiagramLinkStatus> = new Map();

/** Whether any of these steps is linked to a region of Edit's pattern, and so needs the segmentation. */
function wantsSegmentation(steps: readonly DiagramStep[]): boolean {
  return steps.some((step) => {
    const source = linkedSourceOf(step);
    return source !== null && source.kind !== 'fold-step';
  });
}

/**
 * Whether any of these steps is linked to a Fold step the session's replay can
 * tell, and so needs it: a link to a step that is gone, a newer build's, or in
 * a sequence Fold does not show is told without it.
 */
function wantsFoldReplay(steps: readonly DiagramStep[], sequences: FoldLinkContext['sequences']): boolean {
  return steps.some((step) => {
    const source = linkedSourceOf(step);
    return source?.kind === 'fold-step' && foldLinkNeedsReplay(source, sequences);
  });
}

/**
 * Each linked step's link status, by step id (D2, D3, D6; fold-workspace
 * D17): what the cards and the Step pane say, and what Refresh is offered
 * for, each by its kind's descriptor (`diagramLinks.ts`). A step that is not
 * linked — to a pattern, the sheet it was sent from, or a Fold step — has
 * none. Statuses are memoized per document (`linkStatus`), so this costs a
 * lookup per card once the pattern has been looked at; a Fold link's is a
 * lookup in the session's replay, which the diagram holds while it has a link
 * the replay can tell.
 */
export function useDiagramLinkStatuses(
  steps: readonly DiagramStep[]
): ReadonlyMap<string, DiagramLinkStatus> {
  const document = useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);
  const segmentation = useCpSegmentation(wantsSegmentation(steps));
  const sequences = useWorkspaceStore((state) => state.foldSequences);
  const wantsFold = useMemo(() => wantsFoldReplay(steps, sequences), [steps, sequences]);
  const fold = useFoldLinkContext(wantsFold);
  return useMemo(() => {
    let statuses: Map<string, DiagramLinkStatus> | null = null;
    const context: DiagramLinkContext = { cp: { document, segmentation }, fold };
    for (const step of steps) {
      const source = linkedSourceOf(step);
      if (!source) continue;
      statuses ??= new Map();
      statuses.set(step.id, diagramLinkStatus(source, context));
    }
    return statuses ?? NO_STATUSES;
  }, [steps, document, segmentation, fold]);
}

/**
 * A step's link status as it can be told right now, without waiting for a
 * segmentation or a replay: for a surface that builds its verbs at the moment
 * it needs them (a context menu opening).
 */
export function linkStatusNow(step: DiagramStep): DiagramLinkStatus | null {
  const source = linkedSourceOf(step);
  if (!source) return null;
  return diagramLinkStatus(source, linkContextNow());
}

/** Everything a link is told against, as it stands now. */
export function linkContextNow(): DiagramLinkContext {
  const document = useWorkspaceStore.getState().oristudioCpDocument?.document ?? null;
  return {
    cp: { document, segmentation: document ? peekCpSegmentationArtifacts(document) : null },
    fold: foldLinkContextNow(),
  };
}
