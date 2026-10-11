import { useMemo } from 'react';
import type { FoldOverlayInks, FoldOverlayMarks } from '../foldPaneOverlays';
import type { FoldPickIndex } from '../foldPicking';
import type { FoldVertexPreview } from './useFoldVertexStep';
import { vertexOverlayMarks } from './vertexOverlay';

const NONE: readonly boolean[] = [];

/**
 * A vertex tool's marks over the folded pane (`vertexOverlay`), once the
 * engine has described its flap, line or fan: from its answer for the fold
 * as it will be folded when there is one (a squash's spine where it was
 * aimed), else its first; rebuilt when that answer, the fourth crease or the
 * ridge taken, or the pane's inks change — never on a pointer move, which
 * redraws the overlay with them as they are.
 */
export function useFoldVertexMarks(
  index: FoldPickIndex | null,
  vertex: FoldVertexPreview | null,
  inks: FoldOverlayInks | null
): FoldOverlayMarks | null {
  const analysis = vertex?.answer?.analysis ?? vertex?.base?.analysis ?? null;
  const emergent = vertex?.emergent ?? null;
  const emergents = vertex?.base?.emergents ?? NONE;
  const ridge = vertex && vertex.ridge !== null ? (vertex.ridges[vertex.ridge]?.direction ?? null) : null;
  return useMemo(
    () =>
      index && analysis && inks ? vertexOverlayMarks(index, { analysis, emergent, emergents, ridge }, inks) : null,
    [index, analysis, emergent, emergents, ridge, inks]
  );
}
