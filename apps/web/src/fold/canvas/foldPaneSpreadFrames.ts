/**
 * The folded pane's layer spread over a playing step. A step's frames are
 * the paper's own geometry, never spread (`foldStepPlayback.ts`); each says
 * how much of the spread the pane draws it with (`FoldPosedFrame.spreadWeight`):
 * all of it as the step starts, none while the paper moves, all again as it
 * lands. The pane multiplies by that weight the spread of the state the frame
 * is at: the parent's in the first half of a play, the step's own in the
 * second — each the spread the pane shows that state at rest
 * (`foldStateSpread`), so a play starts on the parent's spread picture and
 * hands back to the step's without a jump.
 *
 * A frame with weight is drawn as its state's picture with the spread that
 * share of the way on (`weightedSpread`, at the pane's own placement): the
 * spread is a picture of a state, and the weight is only above nought over
 * the first and last `FOLD_SPREAD_EASE_MS` of a play, while the paper has
 * barely left the state or is pressing into it. A fold has turned under two
 * degrees by then, which the pane cannot draw apart; a rotation has turned a
 * few, which it holds until the spread has folded away.
 *
 * Pure: no React, no store, no engine.
 */
import type { LayerSpreadOptions } from '../../cp-workspace/folded/foldedLayerSpread';
import { weightedSpread } from '../../cp-workspace/folded/layerSpreadSettings';
import type { PaperScene } from '../../lib/paper/paperScene';
import type { FoldPlaybackPosition, FoldPosedSceneSource } from '../animation/foldStepPlayback';
import type { FoldPosedFrame } from '../animation/foldStepPoses';
import type { FoldScene } from '../engine/foldEngineWire';
import { foldedDisplayOffset, foldedPaneScene, type FoldPaneDisplay } from './foldPaneScenes';

/** A state's picture on the folded pane, its spread `weight` (0 to 1) of the way on. */
export type FoldSpreadEnd = (weight: number) => PaperScene;

/** The two states a step plays between, as the pane spreads them; null for a state it shows unspread. */
export interface FoldStepSpreadEnds {
  /** The parent's: what a play starts from. */
  readonly before: FoldSpreadEnd | null;
  /** The step's own: what a play lands on. */
  readonly after: FoldSpreadEnd | null;
}

export const NO_SPREAD_ENDS: FoldStepSpreadEnds = { before: null, after: null };

/**
 * A state's picture as the folded pane draws it at rest — at its display
 * offset, under the pane's switches — its spread part of the way on; null for
 * no spread, which leaves every frame as it is.
 */
export function foldSpreadEnd(
  scene: FoldScene,
  sheet: readonly (readonly [number, number])[],
  display: FoldPaneDisplay,
  spread: LayerSpreadOptions | null
): FoldSpreadEnd | null {
  if (!spread) return null;
  const offset = foldedDisplayOffset(scene, sheet);
  return (weight) => foldedPaneScene(scene, display, offset, weightedSpread(spread, weight));
}

/**
 * The frame the pane draws `progress` of the way through a play: the posed
 * frame while it carries no weight, else the picture of the state it is at
 * with that much of its spread — the parent's before halfway, the step's
 * after. A crossfade's fills go with the posed frame.
 */
export function spreadPaneFrame(frame: FoldPosedFrame, progress: number, ends: FoldStepSpreadEnds): FoldPosedFrame {
  const weight = frame.spreadWeight ?? 0;
  if (!(weight > 0)) return frame;
  const end = progress < 0.5 ? ends.before : ends.after;
  return end ? { scene: end(weight), spreadWeight: weight } : frame;
}

/**
 * The playback's frames as the folded pane draws them (`spreadPaneFrame`):
 * the same source when neither state is spread. Each pushed frame is spread
 * once, however often the pane reads it.
 */
export function spreadPaneFrames(
  frames: FoldPosedSceneSource,
  position: FoldPlaybackPosition,
  ends: FoldStepSpreadEnds
): FoldPosedSceneSource {
  if (!ends.before && !ends.after) return frames;
  let pushed: FoldPosedFrame | null = null;
  let drawn: FoldPosedFrame | null = null;
  return {
    current: () => {
      const frame = frames.current();
      if (frame !== pushed) {
        pushed = frame;
        drawn = frame ? spreadPaneFrame(frame, position.current(), ends) : null;
      }
      return drawn;
    },
    subscribe: frames.subscribe,
  };
}
