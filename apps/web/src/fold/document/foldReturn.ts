/** History dependencies for an append-only return. No store or engine calls. */
import type { FoldNodeReplay } from './foldReplay';
import type { FoldReturnOp, FoldSequenceDocument } from './foldSequenceDocument';
import { foldStepTree, pathTo } from './foldStepTree';

export type FoldReturnDependencyCode = 'return_target_invalid' | 'return_state_unavailable' | 'return_source_changed';
type ReturnNode<S> = Omit<Pick<FoldNodeReplay<S>, 'state' | 'fingerprint' | 'status' | 'path'>, 'path'> & { path: string | null };
export function foldReturnPath(sequence: FoldSequenceDocument, parent: string | null, target: string | null) {
  if (parent === null || target === parent) return null;
  const path = pathTo(foldStepTree(sequence.steps), parent);
  return path && (target === null || path.slice(0, -1).some((n) => n.id === target)) ? path : null;
}

export function resolveFoldReturn<S>(
  sequence: FoldSequenceDocument,
  parent: string | null,
  op: FoldReturnOp,
  sheet: ReturnNode<S>,
  nodes: ReadonlyMap<string, ReturnNode<S>>
): { target: S; history: S[] } | { code: FoldReturnDependencyCode } {
  const path = foldReturnPath(sequence, parent, op.target);
  if (!path || parent === null) {
    return { code: 'return_target_invalid' };
  }
  const source = nodes.get(parent);
  const target = op.target === null ? sheet : nodes.get(op.target);
  if (source?.state == null || target?.state == null || source.status === 'broken' || target.status === 'broken') {
    return { code: 'return_state_unavailable' };
  }
  if (source.path !== op.source.path || source.fingerprint !== op.source.state ||
      target.fingerprint !== op.source.targetState) return { code: 'return_source_changed' };
  const history: S[] = [];
  for (const node of [sheet, ...path.map((n) => nodes.get(n.id))]) {
    if (node?.state === null || node?.state === undefined) return { code: 'return_state_unavailable' };
    history.push(node.state);
  }
  return { target: target.state, history };
}
