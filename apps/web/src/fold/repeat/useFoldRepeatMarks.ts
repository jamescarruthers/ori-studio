import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FoldOverlayInks } from '../canvas/foldPaneOverlays';
import type { FoldHit, FoldPickIndex } from '../canvas/foldPicking';
import type { SheetPoint } from '../document/foldSequenceDocument';
import { repeatOverlay, type FoldRepeatOverlay } from './repeatCanvas';
import type { FoldRepeatTool } from './useFoldRepeatTool';

/**
 * What Repeat draws over each pane while it is in hand — its axes, the one
 * taken and the one under the pointer, and a drawn line refused
 * (`repeatOverlay`) — and the pointer's hover, which previews the axis under
 * it (`hoverAxis`) until the pointer leaves it. Null marks while another tool
 * is in hand, or before the axes are found.
 */
export function useFoldRepeatMarks(
  index: FoldPickIndex | null,
  outline: readonly SheetPoint[] | null,
  repeat: FoldRepeatTool | null | undefined,
  inks: FoldOverlayInks | null
): { overlay: FoldRepeatOverlay | null; onHover: (hit: FoldHit | null) => void } {
  const marks = repeat?.marks ?? null;
  // The marks are made anew each render: read through what they say.
  const marksKey = marks ? JSON.stringify(marks) : null;
  const overlay = useMemo(
    () => (marks && inks ? repeatOverlay(index, outline, marks.axes, marks.taken, marks.hovered, marks.drawn, inks) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marksKey, inks, index, outline]
  );
  // The hover's verb, read when the pointer moves: the handler keeps its identity across renders.
  const hoverAxis = useRef(repeat?.verbs.hoverAxis);
  useEffect(() => {
    hoverAxis.current = repeat?.verbs.hoverAxis;
  });
  const onHover = useCallback((hit: FoldHit | null) => hoverAxis.current?.(hit?.repeatAxis ?? null), []);
  return { overlay, onHover };
}
