import { useEffect, useMemo, useState } from 'react';
import { ensureCpSegmentationArtifacts, peekCpSegmentationArtifacts } from '../cpSegmentationArtifacts';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldArtifacts } from '../../engine/types';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** Where the open pattern's kernel-space segmentation is. */
export type CpSegmentationState =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; artifacts: FoldArtifacts };

/**
 * The open pattern's kernel-space segmentation, and where it is: asked for
 * only when something `wants` it — segmenting a large pattern takes a second,
 * and a diagram with no region-linked step has no use for it.
 */
export function useCpSegmentationState(wants: boolean): CpSegmentationState {
  const document = useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);
  const [settled, setSettled] = useState<{
    document: OristudioCpDocumentSnapshot;
    artifacts: FoldArtifacts | null;
  } | null>(null);
  const peeked = document ? peekCpSegmentationArtifacts(document) : null;
  useEffect(() => {
    if (!wants || !document || peeked) return undefined;
    let live = true;
    void ensureCpSegmentationArtifacts(document).then((artifacts) => {
      if (live) setSettled({ document, artifacts });
    });
    return () => {
      live = false;
    };
  }, [wants, document, peeked]);
  // One object per answer, so what is built from it is built once.
  return useMemo((): CpSegmentationState => {
    if (!document) return { status: 'no-pattern' };
    if (peeked) return { status: 'ready', artifacts: peeked };
    if (settled?.document === document) {
      return settled.artifacts ? { status: 'ready', artifacts: settled.artifacts } : { status: 'failed' };
    }
    return { status: 'pending' };
  }, [document, peeked, settled]);
}

/** {@link useCpSegmentationState}'s segmentation, or null while there is none. */
export function useCpSegmentation(wants: boolean): FoldArtifacts | null {
  const state = useCpSegmentationState(wants);
  return state.status === 'ready' ? state.artifacts : null;
}
