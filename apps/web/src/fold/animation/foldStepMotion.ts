/**
 * A Fold step's motion (plan D15), from what the engine says of it: the
 * parent's scene, the step's own, the step's picture (`FoldActionGeometry`)
 * and what it did (`FoldReport`). Built once per step; a frame of it is then
 * arithmetic on two `PaperScene`s (`foldStepPoses.ts`).
 *
 * Both scenes are pictured here as the folded pane pictures each state
 * ({@link FoldStepPane}: its placement, and the paper it paints there), so
 * the last frame is the landed state exactly as the pane draws it and the
 * first the parent's. Each end is placed as the pane places that state: a
 * turn changes the view, and with it where the pane puts the paper, so the
 * view's turn is measured from the parent's placement to the step's.
 *
 * Which motion a step makes:
 * - valley, mountain, unfold, refold and precrease turn on a hinge about ℓ,
 *   the moving faces being the landed state's that the report names;
 * - a turn or a rotation turns the picture as the view turns, read off the two
 *   scenes' view transforms;
 * - every compound fold — reverse, crimp, tuck, the vertex folds, the sinks —
 *   plays the engine's legs (`StepMotion`, read off its report through
 *   `stepMotionLegsOf`): groups of paper turning about their own
 *   hinges, leg after leg;
 * - Import CP crossfades, and so does any step whose motion cannot be built
 *   from what it has (no line, nothing moving, no legs, a degenerate
 *   placement): a step always has a motion, and a wrong one is never
 *   invented.
 *
 * The transport plays a step as one programme (`lib/foldMotion/foldTransport`):
 * a fold is one leg resting landed, a precrease folds, holds and comes back, a
 * turn rolls, a crossfade fades, and a compound fold swings once per stage of
 * its legs, each swing a spread and a close through π. {@link foldStepFrame}
 * maps a moment of it to a frame: the parent's scene before anything has
 * moved, the landed scene once it has all played, and a pose between.
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
import type {
  FoldActionGeometry,
  FoldIsometry,
  FoldReport,
  FoldScene,
  FoldStepMotionLegs,
} from '../engine/foldEngineWire';
import {
  affineThrough,
  crossfadeFrame,
  crossfadeMotion,
  hingeMotion,
  legsMotion,
  poseHinge,
  poseLegs,
  poseTurn,
  turnMotion,
  type FoldCrossfadeMotion,
  type FoldHingeMotion,
  type FoldLegsMotion,
  type FoldPosedFrame,
  type FoldTurnMotion,
  type SceneAffine,
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
  | 'import'
  // Compound folds, one block per family.
  | 'inside_reverse'
  | 'outside_reverse'
  | 'crimp'
  | 'tuck'
  | 'squash'
  | 'petal'
  | 'rabbit_ear'
  | 'swivel'
  | 'open_sink'
  | 'closed_sink'
  | 'unsink';

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
  /** A compound fold's legs (`stepMotionLegsOf`); absent for any other step, and for one whose legs are not in yet. */
  legs?: FoldStepMotionLegs | null;
}

export interface FoldStepMotion {
  readonly step: FoldStepPlayKind;
  /** The parent's scene, as the pane would paint it: the first frame. */
  readonly before: PaperScene;
  /** The landed scene, as the pane paints it: the last frame. */
  readonly after: PaperScene;
  readonly motion: FoldHingeMotion | FoldTurnMotion | FoldCrossfadeMotion | FoldLegsMotion;
}

/** A step's programme, carrying its kind for the analytics event. */
export type FoldStepProgramme = FoldProgramme<FoldStepPlayKind>;

/** How the folded pane pictures a state: where it places the scene frame, and the paper it paints there. */
export interface FoldPanePicture {
  place: FoldedFlatPaperSceneOptions;
  scene: PaperScene;
}

/** The folded pane's picture of a state, by its scene: what each end of a step is drawn as. */
export type FoldStepPane = (scene: FoldScene) => FoldPanePicture;

/** Every state placed alike and painted as the flat folded figure: a surface with no placement of its own, or a test. */
export function foldStepPaneAt(place: FoldedFlatPaperSceneOptions): FoldStepPane {
  return (scene) => ({ place, scene: foldedFlatPaperScene(scene, place) });
}

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

/** The step's motion, its two scenes pictured as the pane pictures each state. */
export function foldStepMotion(input: FoldStepMotionInput, pane: FoldStepPane): FoldStepMotion {
  const from = pane(input.before);
  const to = pane(input.after);
  const before = from.scene;
  const after = to.scene;
  const step = playKind(input.op);
  const crossfade = (): FoldStepMotion => ({ step, before, after, motion: crossfadeMotion(before, after) });
  switch (input.op.kind) {
    case 'valley':
    case 'mountain':
    case 'unfold':
    case 'refold':
    case 'precrease': {
      // Posed from the landed scene, so ℓ is placed as it is. A fold keeps
      // the view, so the parent's frame, which ℓ is in, is the step's.
      const hinge = hingeOf(input, before, after, to.place);
      return hinge ? { step, before, after, motion: hinge } : crossfade();
    }
    case 'turn':
    case 'rotate': {
      const turn = turnOf(input, before, after, from.place, to.place);
      return turn ? { step, before, after, motion: turn } : crossfade();
    }
    case 'cp-jump':
      return crossfade();
    // Compound folds (plan D4), every family on the engine's legs: a
    // reverse fold's blocks about ℓ, a crimp's strip and tip about ℓ1 and
    // its tip again about ℓ2, a tuck's block, a vertex fold's blocks in
    // stages about their creases, a sink's about its ring. Without legs (a
    // step whose report is not in) it crossfades rather than inventing a
    // hinge.
    case 'inside-reverse':
    case 'outside-reverse':
    case 'crimp':
    case 'tuck':
    case 'squash':
    case 'petal':
    case 'rabbit-ear':
    case 'swivel':
    case 'open-sink':
    case 'closed-sink':
    case 'unsink': {
      const legs = compoundLegs(input, before, after, to.place);
      return legs ? { step, before, after, motion: legs } : crossfade();
    }
  }
}

function playKind(op: FoldOp): FoldStepPlayKind {
  switch (op.kind) {
    case 'cp-jump':
      return 'import';
    case 'inside-reverse':
      return 'inside_reverse';
    case 'outside-reverse':
      return 'outside_reverse';
    case 'rabbit-ear':
      return 'rabbit_ear';
    case 'open-sink':
      return 'open_sink';
    case 'closed-sink':
      return 'closed_sink';
    default:
      return op.kind;
  }
}

/**
 * A compound step's legs (the engine's `StepMotion`), placed as the pane
 * places the landed state: every hinge from the model frame through the
 * step's view to the pane's px (a compound fold keeps the view, so the
 * parent's frame is the step's), the turning faces by their place in the
 * landed scene, and each landed face's parent face — itself, or the face it
 * was split from — by its place in the parent's.
 */
function compoundLegs(
  input: FoldStepMotionInput,
  before: PaperScene,
  after: PaperScene,
  place: FoldedFlatPaperSceneOptions
): FoldLegsMotion | null {
  const legs = input.legs?.legs;
  if (!legs || legs.length === 0) return null;
  const toScene = modelToScene(input.after.view_transform, place);
  if (!toScene) return null;
  const landedAt = new Map(input.after.lineage.map((face, index) => [face.id, index]));
  const parentAt = new Map(input.before.lineage.map((face, index) => [face.id, index]));
  const parentFace = (face: number): number | null => {
    const lineage = input.after.lineage[face];
    if (!lineage) return null;
    return parentAt.get(lineage.id) ?? (lineage.parent === null ? null : (parentAt.get(lineage.parent) ?? null));
  };
  return legsMotion(before, after, legs, { toScene, faceAt: (id) => landedAt.get(id), parentFace });
}

/** The model frame to the pane's px — the view, then the placement — read off three points; null when it flattens. */
function modelToScene(view: FoldIsometry, place: FoldedFlatPaperSceneOptions): SceneAffine | null {
  const corners: [Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  const from = corners.map((p): ScenePoint => [p.x, p.y]) as [ScenePoint, ScenePoint, ScenePoint];
  const to = corners.map((p) => place.toScenePx(applyIsometry(view, p))) as [ScenePoint, ScenePoint, ScenePoint];
  return affineThrough(from, to);
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
 * the step's (the model frame does not move in a turn), from where the pane
 * places the parent to where it places the step, read off three points.
 */
function turnOf(
  input: FoldStepMotionInput,
  before: PaperScene,
  after: PaperScene,
  placeBefore: FoldedFlatPaperSceneOptions,
  placeAfter: FoldedFlatPaperSceneOptions
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
  const from = corners.map((p) => placeBefore.toScenePx(p)) as [ScenePoint, ScenePoint, ScenePoint];
  const to = corners.map((p) => placeAfter.toScenePx(toAfter(p))) as [ScenePoint, ScenePoint, ScenePoint];
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
    case 'legs':
      // One swing per stage, each a fold's pace, played in turn: its spread
      // and close meet edge-on and pass through it at speed, and the press
      // at a swing's end is the pause before the next stage turns.
      return motion.swings.map((_, swing) => ({ ...leg(FOLD_PACE), flap: swing }));
  }
}

/**
 * The frame at a moment of the step's programme: the parent's scene before
 * anything has moved, the landed scene once all of it has played, and the
 * pose the transport holds between.
 */
export function foldStepFrame(step: FoldStepMotion, moment: FoldStepMoment): FoldPosedFrame {
  if (moment.progress >= 1) return { scene: step.after };
  if (moment.progress <= 0) return { scene: step.before };
  // A programme of several legs starts each from its rest, where the
  // transport has no pose; the time played says where the paper is.
  const pose = moment.pose ?? runPose(seekFoldRun(runAtRest(foldStepProgramme(step).legs), moment.progress));
  if (!pose) return { scene: step.before };
  const { motion } = step;
  switch (motion.kind) {
    case 'hinge':
      return { scene: poseHinge(motion, pose.angle) };
    case 'turn':
      return { scene: poseTurn(motion, pose.angle) };
    case 'crossfade':
      return crossfadeFrame(motion, pose.angle / Math.PI);
    case 'legs':
      return { scene: poseSwing(motion, pose.flap, pose.angle) };
  }
}

/**
 * A compound step's swing `swing` at `angle`, 0 to π: a spread's share up to
 * edge-on and its close's after it, or a lone leg's share of the whole.
 */
export function poseSwing(motion: FoldLegsMotion, swing: number, angle: number): PaperScene {
  const legs = motion.swings[Math.max(0, Math.min(motion.swings.length - 1, swing))] ?? [0];
  const [first = 0, second] = legs;
  if (second === undefined) return poseLegs(motion, first, angle / Math.PI);
  const half = Math.PI / 2;
  return angle < half ? poseLegs(motion, first, angle / half) : poseLegs(motion, second, (angle - half) / half);
}

/** The frame `progress` of the way through the step's programme, by its time: for a scrubber, or a test. */
export function foldStepFrameAt(step: FoldStepMotion, progress: number): FoldPosedFrame {
  const run = seekFoldRun(runAtRest(foldStepProgramme(step).legs), progress);
  return foldStepFrame(step, { progress, pose: runPose(run) });
}
