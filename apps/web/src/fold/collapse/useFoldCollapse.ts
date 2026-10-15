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
  const revision = useMemo(() => cp && projectCpRevision(cp), [cp]);
  const node = sequence?.steps.find((step) => step.id === cursor);
  const op = node?.op;
  if (!node || op?.kind !== 'cp-jump' || !op.source) return null;
  const available = revision !== null && op.source.documentId === CREASE_PATTERN_DOCUMENT_ID;
  return { node, op, readOnly, available, changed: available && revision !== op.source.revision };
}
