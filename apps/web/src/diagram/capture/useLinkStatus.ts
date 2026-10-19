import { useMemo } from 'react';
import { peekCpSheetIndex } from '../../cp-workspace/sheets/cpSheetIndex';
import { useCpSheetIndex } from '../../cp-workspace/sheets/useCpSheetIndexState';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramStep } from '../document/diagramDocument';
import { linkedSourceOf, linkStatus, type DiagramLinkStatus } from './linkStatus';

const NO_STATUSES: ReadonlyMap<string, DiagramLinkStatus> = new Map();

/** Whether any of these steps is linked to a region, and so needs the sheet index. */
function wantsSheetIndex(steps: readonly DiagramStep[]): boolean {
  return steps.some((step) => linkedSourceOf(step) !== null);
}

/**
 * Each linked step's link status, by step id (D2, D3, D6): what the cards
 * and the Step pane say, and what Refresh is offered for. A step that is not
 * linked — to a pattern, or to the sheet it was sent from — has none. Statuses are memoized by the lines' content (`linkStatus`), so this costs a
 * lookup per card once the pattern has been looked at.
 */
export function useDiagramLinkStatuses(
  steps: readonly DiagramStep[]
): ReadonlyMap<string, DiagramLinkStatus> {
  const document = useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);
  const sheets = useCpSheetIndex(wantsSheetIndex(steps));
  return useMemo(() => {
    let statuses: Map<string, DiagramLinkStatus> | null = null;
    for (const step of steps) {
      const source = linkedSourceOf(step);
      if (!source) continue;
      statuses ??= new Map();
      statuses.set(step.id, linkStatus(source, document, sheets));
    }
    return statuses ?? NO_STATUSES;
  }, [steps, document, sheets]);
}

/**
 * A step's link status as it can be told right now, without waiting for the
 * sheet index: for a surface that builds its verbs at the moment it needs
 * them (a context menu opening).
 */
export function linkStatusNow(step: DiagramStep): DiagramLinkStatus | null {
  const source = linkedSourceOf(step);
  if (!source) return null;
  const document = useWorkspaceStore.getState().oristudioCpDocument?.document ?? null;
  return linkStatus(source, document, peekCpSheetIndex(document));
}
