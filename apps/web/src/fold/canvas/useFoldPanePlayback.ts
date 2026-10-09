import { useEffect, useMemo, useRef } from 'react';
import type { Point } from '../../lib/geometry';
import { runFoldPlaybackShortcut } from '../animation/foldPlaybackShortcuts';
import { useFoldStepMotion } from '../animation/useFoldStepMotion';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from '../animation/useFoldStepPlayback';
import { registerFoldKeyHandler } from '../sequence/foldKeys';
import { foldedPanePlacement } from './foldPaneScenes';

/**
 * The folded pane's step playback (plan D15): the step on screen's motion,
 * placed where the pane places its own scene (`foldedPanePlacement` at the
 * pane's display offset) so the first and last frames are the pane's
 * pictures; played from its parent; and Space, through the Fold panel's one
 * executor for the `fold` scope (`registerFoldKeyHandler`).
 *
 * The surface it returns is what the pane paints from (`frames`) and what
 * the bottom bar's transport presses.
 */
export function useFoldPanePlayback(stepId: string | null, offset: Point): FoldStepPlaybackSurface {
  const { x, y } = offset;
  // One placement while the offset holds, or every render would build the motion again.
  const place = useMemo(() => foldedPanePlacement({ x, y }), [x, y]);
  const motion = useFoldStepMotion(stepId, place);
  const playback = useFoldStepPlayback({ motion });
  const latest = useRef(playback);
  useEffect(() => {
    latest.current = playback;
  });
  useEffect(
    () => registerFoldKeyHandler((id) => runFoldPlaybackShortcut(id, latest.current, document.activeElement)),
    []
  );
  return playback;
}
