/**
 * A Fold step's motion (plan D15), from what the engine says of it: the
 * parent's scene, the step's own, the step's picture (`FoldActionGeometry`)
 * and what it did (`FoldReport`). Built once per step; a frame of it is then
 * arithmetic on two `PaperScene`s (`foldStepPoses.ts`).
 *
 * Both scenes are built here with the folded pane's own placement
 * (`foldedFlatPaperScene` and the options the pane builds its scene with), so
 * the last frame is the landed state exactly as the pane draws it, the first
 * the parent's, and ℓ and the view's turn are measured in the same px.
 *
 * Which motion a step makes:
 * - valley, mountain, unfold, refold and precrease turn on a hinge about ℓ,
 *   the moving faces being the landed state's that the report names;
 * - a turn or a rotation turns the picture as the view turns, read off the two
 *   scenes' view transforms;
 * - Import CP crossfades, and so does any step whose rigid motion cannot be
 *   built from what it has (no line, nothing moving, a degenerate placement):
 *   a step always has a motion, and a wrong one is never invented.
 *
 * The transport plays a step as one programme (`lib/foldMotion/foldTransport`):
 * a fold is one leg resting landed, a precrease folds, holds and comes back, a
 * turn rolls, and a crossfade fades. {@link foldStepFrame} maps a moment of it
 * to a frame: the parent's scene before anything has moved, the landed scene
 * once it has all played, and a pose between.
 *
 * Pure: no React, no store, no engine.
 */

import { foldedFlatPaperScene, type FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import {
  FOLD_PACE,
  TURN_OVER_PACE,
  TWIN_HOLD_MS,
  runAtRest,
  runPose,
  seekFoldRun,
  type FoldLeg,
  type FoldLegPace,
  type FoldPose,
} from '../../lib/foldMotion/foldPlayback';
import type { FoldProgramme } from '../../lib/foldMotion/foldTransport';
import type { Point } from '../../lib/geometry';
import type { PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldOp } from '../document/foldSequenceDocument';
import type { FoldActionGeometry, FoldIsometry, FoldReport, FoldScene } from '../engine/foldEngineWire';
import {
  affineThrough,
  crossfadeFrame,
  crossfadeMotion,
  hingeMotion,
  poseHinge,
  poseTurn,
  turnMotion,
  type FoldCrossfadeMotion,
  type FoldHingeMotion,
  type FoldPosedFrame,
  type FoldTurnMotion,
} from './foldStepPoses';

/** What kind of step moves, in the analytics event's spelling (D18: a closed enum). */
export type FoldStepPlayKind =
  | 'valley'
  | 'mountain'
  | 'precrease'
  | 'unfold'
  | 'refold'
  | 'turn'
  | 'rotate'
  | 'import';

/** What a step's motion is built from: all of it the session's (`fold/session`). */
export interface FoldStepMotionInput {
  /** The step as the document stores it. */
  op: FoldOp;
  /** The parent state's scene: the sheet's for a first step. */
  before: FoldScene;
  /** The step's own landed state's scene. */
  after: FoldScene;
  /** The step's picture on its parent (`stepAction`); null for a turn, a rotation or an import. */
  action: FoldActionGeometry | null;
  /** What the step did; null for a turn, a rotation or an import. */
  report: FoldReport | null;
}

export interface FoldStepMotion {
  readonly step: FoldStepPlayKind;
  /** The parent's scene, as the pane would paint it: the first frame. */
  readonly before: PaperScene;
  /** The landed scene, as the pane paints it: the last frame. */
  readonly after: PaperScene;
  readonly motion: FoldHingeMotion | FoldTurnMotion | FoldCrossfadeMotion;
}

/** A step's programme, carrying its kind for the analytics event. */
export type FoldStepProgramme = FoldProgramme<FoldStepPlayKind>;

/** A rotation: no edge to follow round, so quicker than a turn-over, and as gently eased. */
export const ROTATE_PACE: FoldLegPace = { durationMs: 900, roll: true };
/** Import CP: a change of picture, not a motion, so it is brief. */
export const CROSSFADE_PACE: FoldLegPace = { durationMs: 600, roll: true };

/** Where the transport is in a step's programme: the share of its time played, and the pose there. */
export interface FoldStepMoment {
  progress: number;
  pose: FoldPose | null;
}

// ---------------------------------------------------------------------------
// Building

/** The step's motion, its two scenes built with the pane's placement. */
export function foldStepMotion(input: FoldStepMotionInput, place: FoldedFlatPaperSceneOptions): FoldStepMotion {
  const before = foldedFlatPaperScene(input.before, place);
  const after = foldedFlatPaperScene(input.after, place);
  const step = playKind(input.op);
  const crossfade = (): FoldStepMotion => ({ step, before, after, motion: crossfadeMotion(before, after) });
  switch (input.op.kind) {
    case 'valley':
    case 'mountain':
    case 'unfold':
    case 'refold':
    case 'precrease': {
      const hinge = hingeOf(input, before, after, place);
      return hinge ? { step, before, after, motion: hinge } : crossfade();
    }
    case 'turn':
    case 'rotate': {
      const turn = turnOf(input, before, after, place);
      return turn ? { step, before, after, motion: turn } : crossfade();
    }
    case 'cp-jump':
      return crossfade();
  }
}

function playKind(op: FoldOp): FoldStepPlayKind {
  return op.kind === 'cp-jump' ? 'import' : op.kind;
}

function hingeOf(
  input: FoldStepMotionInput,
  before: PaperScene,
  after: PaperScene,
  place: FoldedFlatPaperSceneOptions
): FoldHingeMotion | null {
  const line = input.action?.line;
  if (!input.action || !line || !input.report) return null;
  // The report names faces by id; the scene by place, beside each place's id.
  const ids = new Set(input.report.moving_faces);
  const moving = new Set<number>();
  input.after.lineage.forEach((face, index) => {
    if (ids.has(face.id)) moving.add(index);
  });
  if (moving.size === 0) return null;
  const from = place.toScenePx(line[0]);
  const to = place.toScenePx(line[1]);
  const along: ScenePoint = [to[0] - from[0], to[1] - from[1]];
  if (Math.hypot(along[0], along[1]) === 0) return null;
  return hingeMotion(
    before,
    after,
    moving,
    { at: from, along },
    input.op.kind === 'precrease' ? 'in-place' : 'mirrored',
    input.action.direction
  );
}

/**
 * The view's turn in the pane's px: the map from the parent's scene frame to
 * the step's (the model frame does not move in a turn), conjugated by the
 * pane's placement and read off three points.
 */
function turnOf(
  input: FoldStepMotionInput,
  before: PaperScene,
  after: PaperScene,
  place: FoldedFlatPaperSceneOptions
): FoldTurnMotion | null {
  const inverse = invertIsometry(input.before.view_transform);
  if (!inverse) return null;
  const toAfter = (p: Point): Point => applyIsometry(input.after.view_transform, applyIsometry(inverse, p));
  const size = input.before.sheet > 0 ? input.before.sheet : 1;
  const corners: [Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: 0, y: size },
  ];
  const from = corners.map((p) => place.toScenePx(p)) as [ScenePoint, ScenePoint, ScenePoint];
  const to = corners.map((p) => place.toScenePx(toAfter(p))) as [ScenePoint, ScenePoint, ScenePoint];
  const map = affineThrough(from, to);
  if (!map) return null;
  // A half turn is the same matrix either way round: the op says which, in
  // the model's counter-clockwise sense, which the placement may mirror.
  const op = input.op;
  const ccw = op.kind === 'rotate' && op.rotate.direction === 'cw' ? -1 : 1;
  const kept = orientation(from) >= 0 ? 1 : -1;
  return turnMotion(before, after, map, ccw * kept > 0 ? 1 : -1);
}

/** `x' = a x + b y + c`, `y' = d x + e y + f`. */
function applyIsometry([a, b, c, d, e, f]: FoldIsometry, p: Point): Point {
  return { x: a * p.x + b * p.y + c, y: d * p.x + e * p.y + f };
}

function invertIsometry([a, b, c, d, e, f]: FoldIsometry): FoldIsometry | null {
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-12) return null;
  const ia = e / det;
  const ib = -b / det;
  const id = -d / det;
  const ie = a / det;
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)];
}

/** The sign of the triangle's winding: whether the placement keeps the frame's orientation. */
function orientation([p0, p1, p2]: readonly [ScenePoint, ScenePoint, ScenePoint]): number {
  return (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
}

// ---------------------------------------------------------------------------
// Playing

const PROGRAMMES = new WeakMap<FoldStepMotion, FoldStepProgramme>();

/**
 * What the transport plays for a step: one programme per motion, the same
 * object each time, since the transport tells a new step by its programme.
 * Played on arrival only under the auto-play setting: arriving at a step
 * shows it landed, and a reader stepping through should not have it replayed
 * under every press.
 */
export function foldStepProgramme(motion: FoldStepMotion): FoldStepProgramme {
  let programme = PROGRAMMES.get(motion);
  if (!programme) {
    programme = { kind: motion.step, legs: legsOf(motion), arrival: 'auto-play' };
    PROGRAMMES.set(motion, programme);
  }
  return programme;
}

function legsOf({ motion }: FoldStepMotion): FoldLeg[] {
  const leg = (pace: FoldLegPace, heading: FoldLeg['heading'] = 'fold', holdMs = 0): FoldLeg => ({
    flap: 0,
    heading,
    holdMs,
    ...pace,
  });
  switch (motion.kind) {
    case 'hinge':
      // A precrease folds, rests a moment so the landing can be read, and
      // comes back; a fold lands and stays.
      return motion.start === 'in-place'
        ? [leg(FOLD_PACE, 'fold', TWIN_HOLD_MS), leg(FOLD_PACE, 'unfold')]
        : [leg(FOLD_PACE)];
    case 'turn':
      return [leg(motion.turn.kind === 'over' ? TURN_OVER_PACE : ROTATE_PACE)];
    case 'crossfade':
      return [leg(CROSSFADE_PACE)];
  }
}

/**
 * The frame at a moment of the step's programme: the parent's scene before
 * anything has moved, the landed scene once all of it has played, and the
 * pose the transport holds between.
 */
export function foldStepFrame(step: FoldStepMotion, moment: FoldStepMoment): FoldPosedFrame {
  if (moment.progress >= 1) return { scene: step.after };
  const pose = moment.pose;
  if (moment.progress <= 0 || !pose) return { scene: step.before };
  const { motion } = step;
  switch (motion.kind) {
    case 'hinge':
      return { scene: poseHinge(motion, pose.angle) };
    case 'turn':
      return { scene: poseTurn(motion, pose.angle) };
    case 'crossfade':
      return crossfadeFrame(motion, pose.angle / Math.PI);
  }
}

/** The frame `progress` of the way through the step's programme, by its time: for a scrubber, or a test. */
export function foldStepFrameAt(step: FoldStepMotion, progress: number): FoldPosedFrame {
  const run = seekFoldRun(runAtRest(foldStepProgramme(step).legs), progress);
  return foldStepFrame(step, { progress, pose: runPose(run) });
}
