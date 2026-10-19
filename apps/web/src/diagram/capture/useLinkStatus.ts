import { useEffect, useMemo, useState } from 'react';
import { ensureCpSheetIndex, peekCpSheetIndex } from '../../cp-workspace/sheets/cpSheetIndex';
import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramStep } from '../document/diagramDocument';
import { linkedSourceOf, linkStatus, type DiagramLinkStatus } from './linkStatus';

const NO_STATUSES: ReadonlyMap<string, DiagramLinkStatus> = new Map();

/** Where the open pattern's sheet index is. */
export type CpSheetIndexState =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; index: CpSheetIndex };

/**
 * The open pattern's sheet index, and where it is: asked for only when
 * something `wants` it, since a diagram with no region-linked step has no use
 * for it. Tens of milliseconds in the engine, once per crease geometry.
 */
export function useCpSheetIndexState(wants: boolean): CpSheetIndexState {
  const document = useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);
  const [settled, setSettled] = useState<{
    document: OristudioCpDocumentSnapshot;
    index: CpSheetIndex | null;
  } | null>(null);
  const peeked = document ? peekCpSheetIndex(document) : null;
  useEffect(() => {
    if (!wants || !document || peeked) return undefined;
    let live = true;
    void ensureCpSheetIndex(document).then((index) => {
      if (live) setSettled({ document, index });
    });
    return () => {
      live = false;
    };
  }, [wants, document, peeked]);
  // One object per answer, so what is built from it is built once.
  return useMemo((): CpSheetIndexState => {
    if (!document) return { status: 'no-pattern' };
    if (peeked) return { status: 'ready', index: peeked };
    if (settled?.document === document) {
      return settled.index ? { status: 'ready', index: settled.index } : { status: 'failed' };
    }
    return { status: 'pending' };
  }, [document, peeked, settled]);
}

/** {@link useCpSheetIndexState}'s index, or null while there is none. */
export function useCpSheetIndex(wants: boolean): CpSheetIndex | null {
  const state = useCpSheetIndexState(wants);
  return state.status === 'ready' ? state.index : null;
}

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
