/**
 * A step's motion as `PaperScene` frames (plan D15): the scenes the folded
 * pane already paints, posed, so every frame goes through the same painter as
 * the landed state and the export (D11) and cannot disagree with them.
 *
 * Four motions, each a pure function of the step's two scenes and an angle:
 *
 * - **A hinge** — a plain fold, an unfold, a refold, a precrease. Exactly two
 *   rigid groups (research §9): the stationary layers stay in the plane, the
 *   moving ones turn about ℓ on the rigid hinge (`lib/foldMotion/foldHinge`).
 *   Posed from the *landed* scene, whose faces are already cut along ℓ, so
 *   every face is wholly moving or wholly still: a fold's moving faces start
 *   mirrored back across ℓ, where they lay before it, and a precrease's start
 *   where they lie, since it comes back. Drawn top-down, the two planes need
 *   no depth: the moving group is drawn over the still one for a valley (it
 *   rises toward the reader) and under it for a mountain. Inside the group the
 *   stack reads as it did before the step until the paper passes edge-on, and
 *   reversed after, since the reader then sees its underside — the landed
 *   order, which the engine composes the same way (`fold/apply.rs`, *Order*),
 *   so the last frame cannot pop. Past edge-on the moving faces show their
 *   other side, a crease on them is named from it, and a face is shaded by
 *   how far it tilts. A grouped run of items — the patches a woven stack
 *   needs — fixes up the landed order only, so it is dropped while the group
 *   reads reversed. Every item is drawn while the paper moves: a layer the
 *   landed state buries may be uncovered on the way.
 * - **A turn** — the view turning over, or round (`fold/turn.rs`). The whole
 *   picture turns as one plate, about its own middle, sliding to where the
 *   landed view puts it, so it lands exactly on the after scene whatever the
 *   pane's placement does with the view's origin. Turned over, it is the
 *   before scene up to edge-on and the after scene from there — each its own
 *   order, sides and buried layers, posed back from its far end — so nothing
 *   is reordered and the switch happens where the paper has no width. Turned
 *   round, nothing about the paper changes but where it is.
 * - **Legs** — a compound step with no rigid motion between its ends (a
 *   reverse fold: its branches meet only where ℓ crosses the spine,
 *   research §9), played from the engine's `StepMotion`, whatever the family
 *   (reverse, crimp, tuck, the vertex folds, the sinks): legs in turn, each
 *   turning groups of paper rigidly about their own hinges — each its own
 *   line, some paper twice (a crimp's tip, a squash's flap) — or resting
 *   where their turns leave them. A leg is drawn in the stacking the engine
 *   names, the parent's or the landed state's, and a group the reader now
 *   sees from its other side than that stacking does has its stack read
 *   reversed; past edge-on a face shows its other side and is shaded by its
 *   tilt, as a hinge's are. The first frame is the parent's picture and the
 *   last the landed scene, and every leg starts where the one before ended.
 * - **A crossfade** — Import CP, which replaces the state with no motion
 *   between the two (D16), and the fallback for a step whose rigid motion
 *   cannot be built. The before scene fades out under the after scene's fade
 *   in, through the painter's per-face alpha; their lines change over halfway,
 *   since the painter's lines have no alpha of their own. Buried layers are
 *   left out: translucent, they would show stacks neither end shows.
 *
 * Pure: no React, no store, no engine. Coordinates are the scenes' own, scene
 * px, and the camera is the pane's: a frame never moves it.
 */

import type { FoldedFaceInk } from '../../cp-workspace/adapters/cpFoldedToScene';
import { rigidHinge, seenFromOtherFace, shownFace, tiltLighting } from '../../lib/foldMotion/foldHinge';
import type { FoldIsometry, FoldMotionGroup, FoldMotionLeg } from '../engine/foldEngineWire';
import type {
  PaperFaceItem,
  PaperItem,
  PaperLineItem,
  PaperScene,
  PaperSide,
  SceneBounds,
  ScenePoint,
} from '../../lib/paper/paperScene';

/** What one frame of a step's motion paints: a scene, and any per-face fills it needs. */
export interface FoldPosedFrame {
  scene: PaperScene;
  /** Per-face fills for this frame: a crossfade's alphas. Absent, the faces are inked as the scene says. */
  faces?: ReadonlyMap<number, FoldedFaceInk>;
  /**
   * How much of the step's layer spread the folded pane draws this frame
   * with, 0 to 1: the pane multiplies the step's spread amount by it. The
   * frame itself is never spread — a pose is the paper's own geometry — so
   * the playback eases this to 0 as a step starts and back to 1 as it lands
   * (`foldStepSpreadWeight`), and the pane's own spread picture follows
   * without a jump. Absent, the frame is drawn unspread.
   */
  spreadWeight?: number;
}

/** A line in scene px: a point on it and its unit direction. */
export interface ScenePxLine {
  at: ScenePoint;
  along: ScenePoint;
}

/** A run of items drawn together: a face and the lines it carries, or a grouped run (woven patches). */
interface PaperBlock {
  readonly items: readonly PaperItem[];
  /** The face the run belongs to; null for markup. */
  readonly face: number | null;
  readonly grouped: boolean;
}

/** The two rigid groups of a hinge step, built once per step. */
export interface FoldHingeMotion {
  readonly kind: 'hinge';
  /** The landed scene, which every frame is posed from. */
  readonly after: PaperScene;
  /** ℓ, in scene px. */
  readonly line: ScenePxLine;
  /**
   * Where the moving paper starts: mirrored back across ℓ (a fold lands it on
   * the far side) or where the landed scene has it (a precrease comes back).
   */
  readonly start: 'mirrored' | 'in-place';
  /** As the viewer sees it: a valley rises toward them and is drawn over the paper that stays. */
  readonly direction: 'valley' | 'mountain';
  readonly still: readonly PaperBlock[];
  /** In the landed scene's order. */
  readonly moving: readonly PaperBlock[];
  /** Every frame's: both ends' together, which bound every pose between. */
  readonly bounds: SceneBounds;
}

/** How the view turns between a turn step's two scenes, in scene px. */
export type FoldViewTurn =
  /** Turned over about an axis with this unit direction. */
  | { readonly kind: 'over'; readonly axis: ScenePoint }
  /** Turned round by this angle, radians, in the scene's own coordinates. */
  | { readonly kind: 'round'; readonly angle: number };

export interface FoldTurnMotion {
  readonly kind: 'turn';
  readonly before: PaperScene;
  readonly after: PaperScene;
  readonly turn: FoldViewTurn;
  /** What the paper turns about: the middle of the before scene. */
  readonly pivot: ScenePoint;
  /** Where the landed view puts the pivot, less where it was: slid along with the turn. */
  readonly slide: ScenePoint;
  readonly bounds: SceneBounds;
}

export interface FoldCrossfadeMotion {
  readonly kind: 'crossfade';
  readonly before: PaperScene;
  readonly after: PaperScene;
  /** Added to the after scene's face numbers, so the two scenes' faces stay apart in one frame. */
  readonly offset: number;
  readonly bounds: SceneBounds;
}

/**
 * A hinge one group of a compound step turns about during a leg (the
 * engine's `MotionGroup`), as posing reads it, the arithmetic in the model
 * frame where the engine's is: the axis `n · p = d`; `start`, from a landed
 * point in scene px to where the turn starts it there — back through what
 * the paper still does after the turn (`then`), and across the axis; and
 * `toScene` back to the scene's px. At swing θ a point sits at its start
 * pulled toward the axis and past it, `cos θ` of the way across
 * (`MotionGroup::place`, seen from above): where the turn starts it at 0,
 * where it leaves it at ±π. Up or down only says which way it lifts, which
 * a picture from above cannot see; the stacking says what covers what.
 */
export interface FoldPosedHinge {
  /** The axis' unit normal and offset, in the model frame. */
  readonly n: ScenePoint;
  readonly d: number;
  readonly start: SceneAffine;
  readonly toScene: SceneAffine;
  /** −1 when what the paper still does after this turn turns it over: it then shows its landed side on the near half. */
  readonly kept: 1 | -1;
  /** Nothing is left to do after this turn: at ±π the paper lies where it lands. */
  readonly lands: boolean;
  /** Which faces turn as one stack — about one line, one way — for a stack read from its other side. */
  readonly unit: string;
}

/** A face's turn during one leg: about its hinge from one swing to another, or resting there (`from === to`). */
export interface FoldFaceTurn {
  readonly hinge: FoldPosedHinge;
  readonly from: number;
  readonly to: number;
}

/** One leg of a compound step's motion, as posing reads it. */
export interface FoldPosedLeg {
  readonly name: FoldMotionLeg['name'];
  /** Drawn in the parent's stacking — each face where the face it is (a piece of) lay — or the landed scene's. */
  readonly stacking: FoldMotionLeg['stacking'];
  /** Every face the step moves, by `PaperFaceItem.face`: its turn in this leg, or where it rests through it. */
  readonly faces: ReadonlyMap<number, FoldFaceTurn>;
}

/**
 * A compound step's legs (the engine's `StepMotion`, plan D15), posed from
 * the landed scene, whose faces each lie wholly in one group. A face no
 * group of a leg names rests where its last turn left it, or, before its
 * first, where it starts — so a frame of any leg places every face, and
 * every leg starts where the one before it ended.
 */
export interface FoldLegsMotion {
  readonly kind: 'legs';
  readonly after: PaperScene;
  readonly legs: readonly FoldPosedLeg[];
  /**
   * The legs one swing of the transport plays, in order: a spread and the
   * close after it — the paper lifting to edge-on and coming down, one
   * swing through π — or a leg on its own.
   */
  readonly swings: readonly (readonly number[])[];
  /** Per landed face, the parent's stacking rank of the face it is (a piece of): bottom first. */
  readonly parentRank: ReadonlyMap<number, number>;
  /** The moving faces the parent shows the other side of than the landed scene does. */
  readonly startFlipped: ReadonlySet<number>;
  /** Every frame's: both ends' and every leg's ends, which bound every pose between. */
  readonly bounds: SceneBounds;
}

/** Where a compound step's legs are placed in the scene, and how its faces are named there. */
export interface FoldLegsPlacement {
  /** The model frame to scene px: the landed state's view, then the pane's placement. */
  readonly toScene: SceneAffine;
  /** A landed face id's place in the landed scene (`PaperFaceItem.face`). */
  readonly faceAt: (id: number) => number | undefined;
  /** A landed face's parent face — itself, or the face it was split from — by the before scene's `PaperFaceItem.face`. */
  readonly parentFace: (face: number) => number | null;
}

/** Where a crossfade's lines change over from the scene fading out to the one fading in. */
const HALFWAY = 0.5;

// ---------------------------------------------------------------------------
// Building

/**
 * A hinge step's groups: `moving` names the landed scene's faces that move
 * (by `PaperFaceItem.face`), `line` is ℓ in the scene's px.
 */
export function hingeMotion(
  before: PaperScene,
  after: PaperScene,
  moving: ReadonlySet<number>,
  line: ScenePxLine,
  start: FoldHingeMotion['start'],
  direction: FoldHingeMotion['direction']
): FoldHingeMotion {
  const still: PaperBlock[] = [];
  const turning: PaperBlock[] = [];
  for (const block of paperBlocks(after.items)) {
    (block.face !== null && moving.has(block.face) ? turning : still).push(block);
  }
  return {
    kind: 'hinge',
    after,
    line: { at: line.at, along: unit(line.along) },
    start,
    direction,
    still,
    moving: turning,
    bounds: unionBounds(before.bounds, after.bounds),
  };
}

/**
 * A turn step's motion, given the map that takes the before scene's px to the
 * after's: a reflection turns it over, a rotation turns it round. A half turn
 * is the same matrix either way round, so `halfTurn` says which way it goes.
 */
export function turnMotion(
  before: PaperScene,
  after: PaperScene,
  map: SceneAffine,
  halfTurn: 1 | -1 = 1
): FoldTurnMotion {
  const pivot = boundsCentre(before.bounds);
  const landed = applyAffine(map, pivot);
  const [a, b, c, d] = map;
  // [a c; b d]: a reflection about the line at α is [cos 2α, sin 2α; sin 2α,
  // −cos 2α], a rotation by β is [cos β, −sin β; sin β, cos β]. Either way the
  // first column's angle is 2α, or β.
  const column = Math.atan2(b, a);
  const turn: FoldViewTurn =
    a * d - b * c < 0
      ? { kind: 'over', axis: [Math.cos(column / 2), Math.sin(column / 2)] }
      : { kind: 'round', angle: roundAngle(column, halfTurn) };
  return {
    kind: 'turn',
    before,
    after,
    turn,
    pivot,
    slide: [landed[0] - pivot[0], landed[1] - pivot[1]],
    bounds: unionBounds(before.bounds, after.bounds),
  };
}

/**
 * A compound step's legs, from the engine's (`FoldStepMotionLegs.legs`):
 * every group's hinge placed in the scene, every face the step moves given a
 * turn or a rest in every leg. Null when nothing it names is in the landed
 * scene, or the placement cannot be undone: the step then has no motion to
 * pose, and is never given an invented one.
 */
export function legsMotion(
  before: PaperScene,
  after: PaperScene,
  legs: readonly FoldMotionLeg[],
  placement: FoldLegsPlacement
): FoldLegsMotion | null {
  const fromScene = invertAffine(placement.toScene);
  if (!fromScene) return null;
  const turning = legs.map((leg) => {
    const faces = new Map<number, FoldFaceTurn>();
    for (const group of leg.groups) {
      const hinge = posedHinge(group, placement.toScene, fromScene);
      if (!hinge) return null;
      const turn: FoldFaceTurn = { hinge, from: group.from, to: group.to };
      for (const id of group.faces) {
        const face = placement.faceAt(id);
        if (face !== undefined) faces.set(face, turn);
      }
    }
    return faces;
  });
  if (turning.some((faces) => faces === null)) return null;
  const named = turning as Map<number, FoldFaceTurn>[];
  const moving = new Set(named.flatMap((faces) => [...faces.keys()]));
  if (moving.size === 0) return null;
  const posed: FoldPosedLeg[] = legs.map((leg, k) => {
    const faces = new Map(named[k]);
    for (const face of moving) {
      if (!faces.has(face)) faces.set(face, restingTurn(named, k, face)!);
    }
    return { name: leg.name, stacking: leg.stacking, faces };
  });
  // Where each face starts: its first leg's turn at its first angle.
  const startFlipped = new Set<number>();
  for (const [face, turn] of posed[0]!.faces) {
    if (flippedAt(turn.hinge, turn.from)) startFlipped.add(face);
  }
  const motion: FoldLegsMotion = {
    kind: 'legs',
    after,
    legs: posed,
    swings: swingsOf(posed),
    parentRank: parentRanks(before, after, placement.parentFace),
    startFlipped,
    bounds: unionBounds(before.bounds, after.bounds),
  };
  // A face's footprint moves along a straight line within a leg, so the
  // legs' ends bound every pose between them.
  let bounds = motion.bounds;
  for (let k = 0; k < posed.length; k += 1) {
    bounds = unionBounds(bounds, itemBounds(poseLegs(motion, k, 0).items));
    bounds = unionBounds(bounds, itemBounds(poseLegs(motion, k, 1).items));
  }
  return { ...motion, bounds };
}

/**
 * A group's hinge in the scene (see {@link FoldPosedHinge}); null for an
 * axis with no direction or a `then` that cannot be undone.
 */
function posedHinge(group: FoldMotionGroup, toScene: SceneAffine, fromScene: SceneAffine): FoldPosedHinge | null {
  const [nx, ny] = group.axis.n;
  const length = Math.hypot(nx, ny);
  if (!(length > 0) || !Number.isFinite(group.axis.d)) return null;
  const n: ScenePoint = [nx / length, ny / length];
  const d = group.axis.d / length;
  const then = group.then ? isometryAffine(group.then) : IDENTITY_AFFINE;
  const back = invertAffine(then);
  if (!back) return null;
  // The way the group turns; a resting one, which way it rests.
  const sense = Math.sign(group.to - group.from) || Math.sign(group.from);
  // One line, either way its normal points.
  const canonical = n[0] < 0 || (n[0] === 0 && n[1] < 0) ? -1 : 1;
  const key = [n[0] * canonical, n[1] * canonical, d * canonical].map((v) => v.toFixed(6)).join(',');
  return {
    n,
    d,
    start: composeAffine(swingAffine(n, d, 2), composeAffine(back, fromScene)),
    toScene,
    kept: determinant(then) < 0 ? -1 : 1,
    lands: group.then === undefined,
    unit: `${key}:${sense}`,
  };
}

/**
 * Where a face that leg `k` names no group for rests through it: where its
 * last turn before left it, or, with none before, where its first turn after
 * starts it.
 */
function restingTurn(legs: readonly ReadonlyMap<number, FoldFaceTurn>[], k: number, face: number): FoldFaceTurn | null {
  for (let j = k - 1; j >= 0; j -= 1) {
    const turn = legs[j]!.get(face);
    if (turn) return { hinge: turn.hinge, from: turn.to, to: turn.to };
  }
  for (let j = k + 1; j < legs.length; j += 1) {
    const turn = legs[j]!.get(face);
    if (turn) return { hinge: turn.hinge, from: turn.from, to: turn.from };
  }
  return null;
}

/** The legs a swing plays: a spread and the close after it, or a leg alone. */
function swingsOf(legs: readonly FoldPosedLeg[]): number[][] {
  const swings: number[][] = [];
  for (let k = 0; k < legs.length; k += 1) {
    if (legs[k]!.name === 'spread' && legs[k + 1]?.name === 'close') {
      swings.push([k, k + 1]);
      k += 1;
    } else {
      swings.push([k]);
    }
  }
  return swings;
}

/** Per landed face, the stacking rank in the before scene of the face it is (a piece of). */
function parentRanks(
  before: PaperScene,
  after: PaperScene,
  parentFace: (face: number) => number | null
): Map<number, number> {
  const rankOf = new Map<number, number>();
  before.items.forEach((item, rank) => {
    if (item.kind === 'face' && !rankOf.has(item.face)) rankOf.set(item.face, rank);
  });
  const parentRank = new Map<number, number>();
  for (const item of after.items) {
    if (item.kind !== 'face' || parentRank.has(item.face)) continue;
    const parent = parentFace(item.face);
    const rank = parent === null ? undefined : rankOf.get(parent);
    if (rank !== undefined) parentRank.set(item.face, rank);
  }
  return parentRank;
}

export function crossfadeMotion(before: PaperScene, after: PaperScene): FoldCrossfadeMotion {
  let faces = 0;
  for (const item of before.items) {
    if (item.kind === 'face') faces = Math.max(faces, item.face + 1);
  }
  return { kind: 'crossfade', before, after, offset: faces, bounds: unionBounds(before.bounds, after.bounds) };
}

/**
 * The items of a scene in the runs they are drawn in: a face and the lines it
 * carries after it, or a grouped run. Reordering runs, never items, keeps each
 * face's lines over its own fill.
 */
function paperBlocks(items: readonly PaperItem[]): PaperBlock[] {
  const blocks: { items: PaperItem[]; face: number | null; group: string | undefined }[] = [];
  for (const item of items) {
    const group = item.kind === 'markup' ? undefined : item.group;
    const face = item.kind === 'markup' ? null : (item.face ?? null);
    const open = blocks[blocks.length - 1];
    const joins =
      open !== undefined &&
      (group !== undefined
        ? open.group === group
        : open.group === undefined && item.kind !== 'face' && face === open.face);
    if (open && joins) open.items.push(item);
    else blocks.push({ items: [item], face, group });
  }
  return blocks.map(({ items: run, face, group }) => ({ items: run, face, grouped: group !== undefined }));
}

// ---------------------------------------------------------------------------
// Posing

/** The hinge step at swing `angle`: 0 where the paper starts, π where it lands. */
export function poseHinge(motion: FoldHingeMotion, angle: number): PaperScene {
  const { at, along } = motion.line;
  const across: ScenePoint = [-along[1], along[0]];
  const hinge = rigidHinge(angle);
  const tilt = Math.cos(angle);
  const mirrored = motion.start === 'mirrored';
  // A fold's moving faces start on their other side, a precrease's on the landed one's.
  const landedSide = mirrored ? shownFace(tilt) < 0 : shownFace(tilt) > 0;
  const point = (p: ScenePoint): ScenePoint => {
    const dx = p[0] - at[0];
    const dy = p[1] - at[1];
    const s = dx * along[0] + dy * along[1];
    const u = dx * across[0] + dy * across[1];
    const { v } = hinge.place(s, mirrored ? -u : u);
    return [at[0] + s * along[0] + v * across[0], at[1] + s * along[1] + v * across[1]];
  };
  const how: ItemPose = { point, flip: !landedSide, lighting: tiltLighting(tilt) };
  // The group's stack reads as the landed scene's exactly when its side does.
  const moving = landedSide ? motion.moving : [...motion.moving].reverse().filter((block) => !block.grouped);
  const still = motion.still.flatMap((block) => block.items.map(unhidden));
  const turning = moving.flatMap((block) => block.items.map((item) => posedItem(item, how)));
  return {
    bounds: motion.bounds,
    sheet: motion.after.sheet,
    items: motion.direction === 'valley' ? [...still, ...turning] : [...turning, ...still],
  };
}

/**
 * Leg `index` of a compound step, `share` of the way through it: every face
 * the leg turns swung on the rigid hinge from its turn's first angle toward
 * its last, every other moving face where it rests, the paper that stays
 * where it lies.
 *
 * Drawn in the stacking the leg names. The parent's ranks each run where
 * the face it is (a piece of) lay, markup on top; a grouped run fixes up the
 * landed order only, so it goes — and in the landed stacking too while any
 * face it draws is away from where it lands. In either, a stack the reader
 * sees from its other side than the stacking does — past edge-on, or turned
 * an odd number of times since — reads reversed: each unit of faces turning
 * together keeps its places in the order and takes them in reverse.
 */
export function poseLegs(motion: FoldLegsMotion, index: number, share: number): PaperScene {
  const leg = motion.legs[Math.max(0, Math.min(motion.legs.length - 1, index))];
  if (!leg) return motion.after;
  const t = Math.max(0, Math.min(1, share));
  // One pose per turn: a group's faces share it.
  const poses = new Map<FoldFaceTurn, FacePose>();
  const poseOf = (face: number | null | undefined): FacePose | null => {
    const turn = face === null || face === undefined ? undefined : leg.faces.get(face);
    if (!turn) return null;
    let pose = poses.get(turn);
    if (!pose) {
      pose = facePose(turn.hinge, turn.from + t * (turn.to - turn.from));
      poses.set(turn, pose);
    }
    return pose;
  };
  const away = (item: PaperItem) => item.kind !== 'markup' && poseOf(item.face)?.moved === true;
  const blocks = paperBlocks(motion.after.items);
  const rank = (block: PaperBlock) =>
    block.face === null ? Number.POSITIVE_INFINITY : (motion.parentRank.get(block.face) ?? Number.POSITIVE_INFINITY);
  const ordered =
    leg.stacking === 'parent'
      ? blocks
          .map((block, at) => ({ block, at }))
          .filter(({ block }) => !block.grouped)
          .sort((a, b) => rank(a.block) - rank(b.block) || a.at - b.at)
          .map(({ block }) => block)
      : blocks.filter((block) => !block.grouped || !block.items.some(away));
  // A stack seen from its other side than the stacking's: its runs' places, taken in reverse.
  const reversed = (face: number, pose: FacePose) =>
    leg.stacking === 'parent' ? pose.flipped !== motion.startFlipped.has(face) : pose.flipped;
  const units = new Map<string, number[]>();
  ordered.forEach((block, at) => {
    const pose = block.grouped ? null : poseOf(block.face);
    if (block.face === null || !pose || !reversed(block.face, pose)) return;
    const places = units.get(pose.hinge.unit) ?? [];
    places.push(at);
    units.set(pose.hinge.unit, places);
  });
  const drawn = [...ordered];
  for (const places of units.values()) {
    places.forEach((at, k) => {
      drawn[at] = ordered[places[places.length - 1 - k]!]!;
    });
  }
  const items = drawn.flatMap((block) => {
    const pose = poseOf(block.face);
    return pose?.moved ? block.items.map((item) => posedItem(item, pose.how)) : block.items.map(unhidden);
  });
  return { bounds: motion.bounds, sheet: motion.after.sheet, items };
}

/** How one turn places its faces at a swing: the item pose, and what the stacking needs to know of it. */
interface FacePose {
  readonly how: ItemPose;
  readonly hinge: FoldPosedHinge;
  /** Showing the other side than the landed scene does. */
  readonly flipped: boolean;
  /** Anywhere but where it lands: posed rather than drawn as the landed scene has it. */
  readonly moved: boolean;
}

/** Whether paper turned to `angle` about `hinge` shows the other side than it lands showing: edge-on counts as turned. */
function flippedAt(hinge: FoldPosedHinge, angle: number): boolean {
  // The footprint's orientation against the landed one's is −cos θ · det(then).
  return shownFace(Math.cos(angle) * hinge.kept) > 0;
}

function facePose(hinge: FoldPosedHinge, angle: number): FacePose {
  const tilt = Math.cos(angle);
  const map = composeAffine(hinge.toScene, composeAffine(swingAffine(hinge.n, hinge.d, 1 - tilt), hinge.start));
  const flipped = flippedAt(hinge, angle);
  return {
    how: { point: (p) => applyAffine(map, p), flip: flipped, lighting: tiltLighting(tilt) },
    hinge,
    flipped,
    moved: !(hinge.lands && Math.abs(Math.abs(angle) - Math.PI) < 1e-12),
  };
}

/** The turn step at `angle`: 0 the before scene, π the after scene. */
export function poseTurn(motion: FoldTurnMotion, angle: number): PaperScene {
  const share = Math.max(0, Math.min(1, angle / Math.PI));
  const { pivot, slide, turn } = motion;
  const slid: ScenePoint = [pivot[0] + slide[0] * share, pivot[1] + slide[1] * share];
  if (turn.kind === 'round') {
    const cos = Math.cos(turn.angle * share);
    const sin = Math.sin(turn.angle * share);
    const point = (p: ScenePoint): ScenePoint => {
      const dx = p[0] - pivot[0];
      const dy = p[1] - pivot[1];
      return [slid[0] + dx * cos - dy * sin, slid[1] + dx * sin + dy * cos];
    };
    return placedScene(motion.before, motion.bounds, { point, flip: false, lighting: 1 }, true);
  }
  // Up to edge-on the before scene turning away; past it the after scene
  // turning back from its far end, where it lies about the slid pivot.
  const late = angle > Math.PI / 2;
  const source = late ? motion.after : motion.before;
  const from: ScenePoint = late ? [pivot[0] + slide[0], pivot[1] + slide[1]] : pivot;
  const axis = turn.axis;
  const normal: ScenePoint = [-axis[1], axis[0]];
  const squash = Math.cos(late ? Math.PI - angle : angle);
  const point = (p: ScenePoint): ScenePoint => {
    const dx = p[0] - from[0];
    const dy = p[1] - from[1];
    const s = dx * axis[0] + dy * axis[1];
    const v = (dx * normal[0] + dy * normal[1]) * squash;
    return [slid[0] + s * axis[0] + v * normal[0], slid[1] + s * axis[1] + v * normal[1]];
  };
  return placedScene(source, motion.bounds, { point, flip: false, lighting: tiltLighting(squash) }, true);
}

/** The crossfade `share` of the way from the before scene to the after scene. */
export function crossfadeFrame(motion: FoldCrossfadeMotion, share: number): FoldPosedFrame {
  const into = Math.max(0, Math.min(1, share));
  const faces = new Map<number, FoldedFaceInk>();
  const items: PaperItem[] = [];
  const lines = into < HALFWAY ? 'before' : 'after';
  for (const item of motion.before.items) {
    if (item.hidden || (item.kind !== 'face' && lines !== 'before')) continue;
    if (item.kind === 'face') faces.set(item.face, { alpha: 1 - into });
    items.push(item);
  }
  for (const item of motion.after.items) {
    if (item.hidden || (item.kind !== 'face' && lines !== 'after')) continue;
    const moved = renumbered(item, motion.offset);
    if (moved.kind === 'face') faces.set(moved.face, { alpha: into });
    items.push(moved);
  }
  return { scene: { bounds: motion.bounds, sheet: motion.after.sheet, items }, faces };
}

/** How every point and face of a posed run goes. */
interface ItemPose {
  point: (p: ScenePoint) => ScenePoint;
  /** The paper shows its other side: the side flips and a crease is named from it. */
  flip: boolean;
  /** Multiplies the face's own shade. */
  lighting: number;
}

function placedScene(source: PaperScene, bounds: SceneBounds, how: ItemPose, keepHidden: boolean): PaperScene {
  return {
    bounds,
    sheet: source.sheet,
    items: source.items.map((item) => posedItem(item, how, keepHidden)),
  };
}

function posedItem(item: PaperItem, how: ItemPose, keepHidden = false): PaperItem {
  const hidden = keepHidden ? item.hidden : false;
  if (item.kind === 'face') return posedFace(item, how, hidden);
  if (item.kind === 'line') return posedLine(item, how, hidden);
  return item;
}

function posedFace(item: PaperFaceItem, how: ItemPose, hidden: boolean): PaperFaceItem {
  const posed: PaperFaceItem = {
    ...item,
    rings: item.rings.map((ring) => ring.map(how.point)),
    side: how.flip ? otherSide(item.side) : item.side,
    shade: item.shade * how.lighting,
    hidden,
  };
  if (how.flip && item.outline) posed.outline = seenFromOtherFace(item.outline);
  return posed;
}

function posedLine(item: PaperLineItem, how: ItemPose, hidden: boolean): PaperLineItem {
  const posed: PaperLineItem = {
    ...item,
    a: how.point(item.a),
    b: how.point(item.b),
    role: how.flip ? seenFromOtherFace(item.role) : item.role,
    hidden,
  };
  if (item.whole) posed.whole = { ...item.whole, a: how.point(item.whole.a), b: how.point(item.whole.b) };
  return posed;
}

/** Drawn while the paper moves, whatever the landed state buries. */
function unhidden(item: PaperItem): PaperItem {
  return item.hidden ? { ...item, hidden: false } : item;
}

/** The after scene's item with its faces numbered past the before scene's, and its groups kept apart. */
function renumbered(item: PaperItem, offset: number): PaperItem {
  if (item.kind === 'markup') return item;
  const group = item.group === undefined ? {} : { group: `${item.group}-after` };
  if (item.kind === 'face') return { ...item, face: item.face + offset, ...group };
  return { ...item, ...(item.face === undefined ? {} : { face: item.face + offset }), ...group };
}

function otherSide(side: PaperSide): PaperSide {
  return side === 'front' ? 'back' : 'front';
}

// ---------------------------------------------------------------------------
// Plane geometry

/** `x' = a x + c y + e`, `y' = b x + d y + f`, as `[a, b, c, d, e, f]` (SVG's matrix order). */
export type SceneAffine = readonly [number, number, number, number, number, number];

export function applyAffine([a, b, c, d, e, f]: SceneAffine, [x, y]: ScenePoint): ScenePoint {
  return [a * x + c * y + e, b * x + d * y + f];
}

/**
 * The affine map taking three points to three others, or null when the first
 * three are collinear.
 */
export function affineThrough(
  from: readonly [ScenePoint, ScenePoint, ScenePoint],
  to: readonly [ScenePoint, ScenePoint, ScenePoint]
): SceneAffine | null {
  const [p0, p1, p2] = from;
  const [q0, q1, q2] = to;
  // L·[u v] = [u' v'], with u, v the first triple's edges from p0.
  const u = [p1[0] - p0[0], p1[1] - p0[1]] as const;
  const v = [p2[0] - p0[0], p2[1] - p0[1]] as const;
  const det = u[0] * v[1] - v[0] * u[1];
  if (Math.abs(det) < 1e-12) return null;
  const uu = [q1[0] - q0[0], q1[1] - q0[1]] as const;
  const vv = [q2[0] - q0[0], q2[1] - q0[1]] as const;
  // L = [uu vv] · [u v]⁻¹
  const a = (uu[0] * v[1] - vv[0] * u[1]) / det;
  const c = (vv[0] * u[0] - uu[0] * v[0]) / det;
  const b = (uu[1] * v[1] - vv[1] * u[1]) / det;
  const d = (vv[1] * u[0] - uu[1] * v[0]) / det;
  return [a, b, c, d, q0[0] - (a * p0[0] + c * p0[1]), q0[1] - (b * p0[0] + d * p0[1])];
}

const IDENTITY_AFFINE: SceneAffine = [1, 0, 0, 1, 0, 0];

/** `outer ∘ inner`: `inner` first. */
export function composeAffine(outer: SceneAffine, inner: SceneAffine): SceneAffine {
  const [a, b, c, d, e, f] = outer;
  const [p, q, r, s, t, u] = inner;
  return [a * p + c * q, b * p + d * q, a * r + c * s, b * r + d * s, a * t + c * u + e, b * t + d * u + f];
}

/** The map undone, or null when it flattens the plane. */
export function invertAffine([a, b, c, d, e, f]: SceneAffine): SceneAffine | null {
  const det = a * d - b * c;
  if (!(Math.abs(det) > 1e-12)) return null;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

function determinant([a, b, c, d]: SceneAffine): number {
  return a * d - b * c;
}

/** The engine's isometry (`x' = a x + b y + c`) in this module's order. */
export function isometryAffine([a, b, c, d, e, f]: FoldIsometry): SceneAffine {
  return [a, d, b, e, c, f];
}

/**
 * `p − k (n · p − d) n`: a point pulled `k` times its distance across the
 * line `n · p = d` (unit `n`) — 0 leaves it, 2 reflects it, and `1 − cos θ`
 * is where paper swung by θ about the line is seen from above.
 */
function swingAffine([nx, ny]: ScenePoint, d: number, k: number): SceneAffine {
  return [1 - k * nx * nx, -k * nx * ny, -k * nx * ny, 1 - k * ny * ny, k * d * nx, k * d * ny];
}

/** The bounds of the faces and lines among `items`. */
function itemBounds(items: readonly PaperItem[]): SceneBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = ([x, y]: ScenePoint) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const item of items) {
    if (item.kind === 'face') item.rings.forEach((ring) => ring.forEach(add));
    else if (item.kind === 'line') [item.a, item.b].forEach(add);
  }
  return minX <= maxX ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** A rotation's angle, a half turn taken the way `halfTurn` says (the matrix cannot). */
function roundAngle(angle: number, halfTurn: 1 | -1): number {
  return Math.abs(Math.abs(angle) - Math.PI) < 1e-9 ? Math.PI * halfTurn : angle;
}

function unit([x, y]: ScenePoint): ScenePoint {
  const length = Math.hypot(x, y);
  return length > 0 ? [x / length, y / length] : [1, 0];
}

function boundsCentre(bounds: SceneBounds): ScenePoint {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

function unionBounds(a: SceneBounds, b: SceneBounds): SceneBounds {
  const empty = (bounds: SceneBounds) =>
    bounds.minX === 0 && bounds.minY === 0 && bounds.maxX === 0 && bounds.maxY === 0;
  if (empty(a)) return b;
  if (empty(b)) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
