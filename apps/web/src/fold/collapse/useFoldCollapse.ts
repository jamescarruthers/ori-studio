import { chooseRegionCreases } from '../../cp-workspace/regions/regionCreases';
import { useCpSegmentation } from '../../cp-workspace/regions/useCpSegmentation';
import { useMemo } from 'react';
import { CREASE_PATTERN_DOCUMENT_ID } from '../../lib/nativeProjectDesigns';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useFoldSessionState } from '../session/useFoldSession';
import { projectCpRevision } from './projectCpRevision';

export function useFoldCollapse() {
  const sequence = useFoldSessionState((state) => state.sequence);
  const cursor = useFoldSessionState((state) => state.cursor);
  const readOnly = useFoldSessionState((state) => state.readOnly);
  const cp = useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);

  const node = sequence?.steps.find((step) => step.id === cursor);
  const op = node?.op;
  const source = op?.kind === 'cp-jump' ? op.source : undefined;
  const segmentation = useCpSegmentation(!!source?.region);
  const revision = useMemo(() => {
    if (!cp) return null;
    if (!source?.region) return projectCpRevision(cp);
    const choice = chooseRegionCreases(cp, { kind: 'segment', region: source.region }, segmentation,
      { fingerprint: source.revision, drawn: true });
    return choice.status === 'found' ? choice.creases.drawnFingerprint : null;
  }, [cp, source, segmentation]);
  if (!node || op?.kind !== 'cp-jump' || !op.source) return null;
  const available = revision !== null && op.source.documentId === CREASE_PATTERN_DOCUMENT_ID;
  return { node, op, readOnly, available, changed: available && revision !== op.source.revision };
}
