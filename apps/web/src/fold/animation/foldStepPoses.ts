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
 *   research §9), played from the engine's `StepMotion`: each group turns
 *   on the rigid hinge about ℓ from where the parent had it, the leg up to
 *   edge-on drawn in the parent's stacking and the leg after it in the
 *   landed state's, so the last frame is the landed scene and the stacking
 *   changes only where the turning paper has no width.
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
 * One leg of a compound step's visual motion (the engine's `StepMotion`,
 * plan D15), in scene px: the swing it covers, how it is stacked, and the
 * landed scene's faces that turn about ℓ.
 */
export interface FoldPosedLeg {
  /** The swing it covers, 0 where the paper lay to π where it lands. */
  readonly from: number;
  readonly to: number;
  /** Stacked as the parent stacks it, or as the landed state does. */
  readonly stacking: 'parent' | 'landed';
}

/**
 * A compound step whose groups turn about ℓ without a rigid motion between
 * (a reverse fold: research §9), as legs: posed from the landed scene, every
 * turning face starts mirrored back across ℓ, where the parent had it, and
 * lands where it lies. Up to edge-on the paper is drawn in the parent's
 * stacking — each landed face ranked as the parent face it is (a piece of)
 * lay — and past it in the landed scene's, so the last frame is the landed
 * state and the order changes only where the turning paper has no width.
 */
export interface FoldLegsMotion {
  readonly kind: 'legs';
  readonly after: PaperScene;
  readonly line: ScenePxLine;
  readonly legs: readonly FoldPosedLeg[];
  /** The landed scene's faces that turn, by `PaperFaceItem.face`. */
  readonly moving: ReadonlySet<number>;
  /** Per landed face, the parent's stacking rank of the face it is (a piece of): bottom first. */
  readonly parentRank: ReadonlyMap<number, number>;
  readonly bounds: SceneBounds;
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
 * A compound step's legs: `moving` names the landed scene's turning faces,
 * `parentFace` each landed face's parent face (by the before scene's
 * `PaperFaceItem.face`), `line` is ℓ in the scene's px.
 */
export function legsMotion(
  before: PaperScene,
  after: PaperScene,
  moving: ReadonlySet<number>,
  parentFace: (face: number) => number | null,
  line: ScenePxLine,
  legs: readonly FoldPosedLeg[]
): FoldLegsMotion {
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
  return {
    kind: 'legs',
    after,
    line: { at: line.at, along: unit(line.along) },
    legs,
    moving,
    parentRank,
    bounds: unionBounds(before.bounds, after.bounds),
  };
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
 * The compound step at swing `angle`: 0 where the paper starts, π where it
 * lands. Every turning face swings on the rigid hinge from where the parent
 * had it, showing the side it showed there until edge-on; the leg the angle
 * is in says whose stacking the frame is drawn in.
 */
export function poseLegs(motion: FoldLegsMotion, angle: number): PaperScene {
  const leg = motion.legs.find((each) => angle >= each.from && angle <= each.to) ?? motion.legs[motion.legs.length - 1];
  const { at, along } = motion.line;
  const across: ScenePoint = [-along[1], along[0]];
  const hinge = rigidHinge(angle);
  const tilt = Math.cos(angle);
  const landedSide = shownFace(tilt) < 0;
  const point = (p: ScenePoint): ScenePoint => {
    const dx = p[0] - at[0];
    const dy = p[1] - at[1];
    const s = dx * along[0] + dy * along[1];
    const u = dx * across[0] + dy * across[1];
    const { v } = hinge.place(s, -u);
    return [at[0] + s * along[0] + v * across[0], at[1] + s * along[1] + v * across[1]];
  };
  const how: ItemPose = { point, flip: !landedSide, lighting: tiltLighting(tilt) };
  const blocks = paperBlocks(motion.after.items);
  // The parent's stacking: each run where the face it is (a piece of) lay,
  // markup on top; a grouped run fixes up the landed order only, so it goes.
  const rank = (block: PaperBlock) =>
    block.face === null ? Number.POSITIVE_INFINITY : (motion.parentRank.get(block.face) ?? Number.POSITIVE_INFINITY);
  const ordered =
    leg?.stacking === 'parent'
      ? blocks
          .map((block, index) => ({ block, index }))
          .filter(({ block }) => !block.grouped)
          .sort((a, b) => rank(a.block) - rank(b.block) || a.index - b.index)
          .map(({ block }) => block)
      : blocks;
  const items = ordered.flatMap((block) =>
    block.face !== null && motion.moving.has(block.face)
      ? block.items.map((item) => posedItem(item, how))
      : block.items.map(unhidden)
  );
  return { bounds: motion.bounds, sheet: motion.after.sheet, items };
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
