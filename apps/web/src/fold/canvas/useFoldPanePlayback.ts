import { useEffect, useMemo, useRef } from 'react';
import type { LayerSpreadOptions } from '../../cp-workspace/folded/foldedLayerSpread';
import { runFoldPlaybackShortcut } from '../animation/foldPlaybackShortcuts';
import { useFoldStepMotion, useFoldStepScenes } from '../animation/useFoldStepMotion';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from '../animation/useFoldStepPlayback';
import { registerFoldKeyHandler } from '../sequence/foldKeys';
import { FOLD_PANE_DISPLAY_DEFAULT, foldedPanePictures, type FoldPaneDisplay } from './foldPaneScenes';
import { foldSpreadEnd, NO_SPREAD_ENDS, spreadPaneFrames } from './foldPaneSpreadFrames';

export interface FoldPanePlaybackInput {
  /** The step on screen; null for the sheet, which has nothing to play. */
  stepId: string | null;
  /** The sheet's outline (`FoldStateSummary.sheet`), whose middle a turn turns the model about; null until landed. */
  sheet: readonly (readonly [number, number])[] | null;
  /** The pane's switches, which every frame follows as the pane's own picture does. */
  display: FoldPaneDisplay;
  /**
   * The spreads the pane shows the parent and the step at rest (null for
   * none): a play starts on the one and lands on the other, each eased by
   * the frames' weight (`spreadPaneFrames`). None at all draws every frame
   * unspread.
   */
  spreads?: { before: LayerSpreadOptions | null; after: LayerSpreadOptions | null } | null;
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
 * The frames are the paper's own geometry; the pane draws them with the
 * spreads it shows the two states at rest, weighted as each frame says
 * (`spreadPaneFrames`), so a spread folds away as the step starts and opens
 * again as it lands — the paper resting at that end meanwhile
 * (`FoldStepPlayback.setSpreadEnds`), so the motion is never held still or
 * cut short by a picture of the state.
 *
 * The surface it returns is what the pane paints from (`frames`) and what
 * the bottom bar's transport and Space press.
 */
export function useFoldPanePlayback({
  stepId,
  sheet,
  display,
  reveal,
  spreads = null,
}: FoldPanePlaybackInput): FoldStepPlaybackSurface {
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
  const spreadBefore = spreads?.before ?? null;
  const spreadAfter = spreads?.after ?? null;
  // The paper rests at an end drawn spread while its spread eases, and moves between.
  const spreadEnds = useMemo(
    () => ({ before: spreadBefore !== null, after: spreadAfter !== null }),
    [spreadBefore, spreadAfter]
  );
  const playback = useFoldStepPlayback({ motion, spreadEnds });
  // Each end's picture with its spread part of the way on, as the pane places that state.
  const { before, after } = useFoldStepScenes(stepId);
  const ends = useMemo(() => {
    if (!sheet || !before || !after) return NO_SPREAD_ENDS;
    const shown = { ...FOLD_PANE_DISPLAY_DEFAULT, precreases };
    return {
      before: foldSpreadEnd(before, sheet, shown, spreadBefore),
      after: foldSpreadEnd(after, sheet, shown, spreadAfter),
    };
    // The sheet is read through its key, as the pictures are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetKey, precreases, before, after, spreadBefore, spreadAfter]);
  const { frames, position } = playback;
  const spreadFrames = useMemo(() => spreadPaneFrames(frames, position, ends), [frames, position, ends]);
  const spread = useMemo(() => ({ ...playback, frames: spreadFrames }), [playback, spreadFrames]);
  // `reveal` should keep its identity (a module function), or the surface is new each render.
  const surface = useMemo(() => (reveal ? revealingPlayback(spread, reveal) : spread), [spread, reveal]);
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
