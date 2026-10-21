import type { OristudioCpLineSegment } from '../engine/oristudioCpTypes';

/**
 * Automatic solve/import cleanup must preserve reference junctions. The
 * kernel's crease pass does not see cyan edges (Oriedita's rule), so two
 * collinear creases meeting where an aux line ends would merge past it, and its
 * aux pass would merge the references themselves. Keep cyan lines, and creases
 * touching their endpoints, out of the automatic sweep; the explicit Delete
 * Extra Vertices command is the user's to run over them.
 * IDs are one-based kernel line IDs, as in DeleteExtraVerticesAmong.
 */
export function extraVertexCleanupLineIds(
  segments: readonly OristudioCpLineSegment[],
  lineIds: readonly number[]
): number[] {
  const references = segments.filter((s) => s.color === 'Cyan3').flatMap((s) => [s.a, s.b]);
  if (references.length === 0) return [...lineIds];
  return lineIds.filter((id) => {
    const line = segments[id - 1];
    return line && line.color !== 'Cyan3' && !references.some((p) =>
      Math.hypot(p.x - line.a.x, p.y - line.a.y) < 1e-4 ||
      Math.hypot(p.x - line.b.x, p.y - line.b.y) < 1e-4
    );
  });
}
