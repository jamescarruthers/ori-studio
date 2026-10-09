import { useEffect, useMemo, useRef } from 'react';
import { runFoldPlaybackShortcut } from '../animation/foldPlaybackShortcuts';
import { useFoldStepMotion } from '../animation/useFoldStepMotion';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from '../animation/useFoldStepPlayback';
import { registerFoldKeyHandler } from '../sequence/foldKeys';
import { FOLD_PANE_DISPLAY_DEFAULT, foldedPanePictures, type FoldPaneDisplay } from './foldPaneScenes';

export interface FoldPanePlaybackInput {
  /** The step on screen; null for the sheet, which has nothing to play. */
  stepId: string | null;
  /** The sheet's outline (`FoldStateSummary.sheet`), whose middle a turn turns the model about; null until landed. */
  sheet: readonly (readonly [number, number])[] | null;
  /** The pane's switches, which every frame follows as the pane's own picture does. */
  display: FoldPaneDisplay;
  /**
   * Bring the folded pane on screen, where it is not: called before the
   * transport plays, steps or scrubs, since the frames are drawn there alone.
   * A phone shows one pane at a time; elsewhere there is nothing to bring.
   */
  reveal?: () => void;
}

/**
 * The transport's presses, each bringing the folded pane on screen first: a
 * play the reader asks for is one they see, never a Pause icon over the
 * crease pattern with nothing moving.
 */
export function revealingPlayback(
  playback: FoldStepPlaybackSurface,
  reveal: () => void
): FoldStepPlaybackSurface {
  return {
    ...playback,
    toggle: (press) => {
      reveal();
      playback.toggle(press);
    },
    step: (direction) => {
      reveal();
      playback.step(direction);
    },
    seek: (progress) => {
      reveal();
      playback.seek(progress);
    },
  };
}

/**
 * The folded pane's step playback (plan D15): the step on screen's motion,
 * each end pictured as the pane pictures that state (`foldedPanePictures`,
 * at each state's own display offset) so the first and last frames are the
 * pane's pictures of the parent and the step; played from its parent; and
 * Space, through the Fold panel's one executor for the `fold` scope
 * (`registerFoldKeyHandler`).
 *
 * The surface it returns is what the pane paints from (`frames`) and what
 * the bottom bar's transport and Space press.
 */
export function useFoldPanePlayback({ stepId, sheet, display, reveal }: FoldPanePlaybackInput): FoldStepPlaybackSurface {
  // One way of picturing while the sheet and the switches hold, or every render would build the motion again.
  const sheetKey = sheet ? sheet.map(([x, y]) => `${x},${y}`).join(';') : null;
  // The folded pane draws its paper by the precreases switch alone.
  const { precreases } = display;
  const pane = useMemo(
    () => (sheet ? foldedPanePictures(sheet, { ...FOLD_PANE_DISPLAY_DEFAULT, precreases }) : null),
    // The sheet is read through its key: an equal outline must not build the motion again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheetKey, precreases]
  );
  const motion = useFoldStepMotion(stepId, pane);
  const playback = useFoldStepPlayback({ motion });
  // `reveal` should keep its identity (a module function), or the surface is new each render.
  const surface = useMemo(() => (reveal ? revealingPlayback(playback, reveal) : playback), [playback, reveal]);
  const latest = useRef(surface);
  useEffect(() => {
    latest.current = surface;
  });
  useEffect(
    () => registerFoldKeyHandler((id) => runFoldPlaybackShortcut(id, latest.current, document.activeElement)),
    []
  );
  return surface;
}
