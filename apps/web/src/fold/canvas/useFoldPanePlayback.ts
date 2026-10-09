import { useEffect, useMemo, useRef } from 'react';
import { runFoldPlaybackShortcut } from '../animation/foldPlaybackShortcuts';
import { useFoldStepMotion } from '../animation/useFoldStepMotion';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from '../animation/useFoldStepPlayback';
import { registerFoldKeyHandler } from '../sequence/foldKeys';
import { foldedPanePictures } from './foldPaneScenes';

/**
 * The folded pane's step playback (plan D15): the step on screen's motion,
 * each end pictured as the pane pictures that state (`foldedPanePictures`,
 * at each state's own display offset) so the first and last frames are the
 * pane's pictures of the parent and the step; played from its parent; and
 * Space, through the Fold panel's one executor for the `fold` scope
 * (`registerFoldKeyHandler`).
 *
 * `sheet` is the sheet's outline (`FoldStateSummary.sheet`), whose middle a
 * turn turns the model about; null while the state on screen has not landed.
 *
 * The surface it returns is what the pane paints from (`frames`) and what
 * the bottom bar's transport presses.
 */
export function useFoldPanePlayback(
  stepId: string | null,
  sheet: readonly (readonly [number, number])[] | null
): FoldStepPlaybackSurface {
  // One way of picturing while the sheet holds, or every render would build the motion again.
  const sheetKey = sheet ? sheet.map(([x, y]) => `${x},${y}`).join(';') : null;
  // The sheet is read through its key: an equal outline must not build the motion again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pane = useMemo(() => (sheet ? foldedPanePictures(sheet) : null), [sheetKey]);
  const motion = useFoldStepMotion(stepId, pane);
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
