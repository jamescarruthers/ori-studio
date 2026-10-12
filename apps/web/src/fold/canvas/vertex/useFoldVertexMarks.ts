import { useMemo } from 'react';
import type { FoldModelDirection } from '../../document/foldSequenceDocument';
import type { FoldOverlayInks, FoldOverlayMarks } from '../foldPaneOverlays';
import type { FoldPickIndex } from '../foldPicking';
import type { FoldVertexPreview } from './useFoldVertexStep';
import { vertexOverlayMarks } from './vertexOverlay';

const NONE: readonly boolean[] = [];

/**
 * A vertex tool's marks over the folded pane (`vertexOverlay`), once the
 * engine has described its flap, line or fan: from its answer for the fold
 * as it will be folded when there is one (a squash's spine where it was
 * aimed), else its first, with where the spine was aimed (`target`) drawn
 * faint when that fold was refused. Rebuilt when those, the fourth crease
 * taken, or the pane's inks change — never on a pointer move, which redraws
 * the overlay with them as they are.
 */
export function useFoldVertexMarks(
  index: FoldPickIndex | null,
  vertex: FoldVertexPreview | null,
  target: FoldModelDirection | null,
  inks: FoldOverlayInks | null
): FoldOverlayMarks | null {
  const answered = vertex?.answer?.analysis ?? null;
  const analysis = answered ?? vertex?.base?.analysis ?? null;
  const emergent = vertex?.emergent ?? null;
  const emergents = vertex?.base?.emergents ?? NONE;
  // The tools keep the target until it is aimed again: its identity is its value.
  const aimed = answered ? null : target;
  return useMemo(
    () =>
      index && analysis && inks
        ? vertexOverlayMarks(index, { analysis, emergent, emergents, aimed: aimed && [aimed[0], aimed[1]] }, inks)
        : null,
    [index, analysis, emergent, emergents, aimed, inks]
  );
}
