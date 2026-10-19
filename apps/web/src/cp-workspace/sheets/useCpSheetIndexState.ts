import { useEffect, useMemo, useState } from 'react';
import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ensureCpSheetIndex, peekCpSheetIndex } from './cpSheetIndex';

/** Where the open pattern's sheet index is. */
export type CpSheetIndexState =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; index: CpSheetIndex };

/**
 * The open pattern's sheet index, and where it is: asked for only when
 * something `wants` it — a diagram with no region-linked step, or a Simulate
 * workspace showing a design, has no use for it. Tens of milliseconds in the
 * engine, once per crease geometry.
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
