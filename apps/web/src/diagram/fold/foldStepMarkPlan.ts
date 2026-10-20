/**
 * Where a Fold step's marks go on the Diagram's picture of it, by the
 * conventions of published diagrams (Yoshizawa–Randlett, as Lang's
 * diagramming conventions set them out), from what the step names: the
 * engine's picture of the step (`FoldActionGeometry`) — its line, the spans
 * of it the moving paper is creased along, an arrow from a grip on the
 * moving paper to where it lands — with its arrow placed by the references
 * the step was made from, and the points it names circled.
 *
 * - **Through two points** (O1), a segment: the two points circled and the
 *   line between them say it all; no arrow. A segment's ends are otherwise
 *   left uncircled (owner, 2026-10-20).
 * - **Point onto point** (O2): both points circled, the arrow from the one
 *   that moves to the one it lands on.
 * - **Line onto line** (O3): the arrow from the line that moves to the one
 *   it lands on. Lines that meet — a bisector — take it halfway along the
 *   shorter of the two edges brought together, as far out from the corner
 *   as the edges allow; parallel lines take it from one to the other, as
 *   long as an arrow between them can be.
 * - **A rabbit ear** draws every crease it folds: the three valley folds
 *   along the bisectors and the short mountain fold to the edge, each in
 *   its own line, read off the states either side of it
 *   ({@link stepFoldedCreases}), and the arrow of the flap swung over, from
 *   the ear's tip to where the fold lays it.
 *
 * Anything else keeps the engine's picture. Every point is in the scene
 * frame of the state the step folds from — the picture's, before it is
 * posed — as the engine's are.
 *
 * Pure: no React, no store, no engine.
 */

import { alongLine, applyIsometry, insideConvex, invertIsometry, lineThrough, sideOf } from '../../fold/canvas/foldCanvasGeometry';
import { compose } from '../../fold/repeat/repeatGeometry';
import type { FoldOp, FoldRef, SheetPoint } from '../../fold/document/foldSequenceDocument';
import type { FoldActionGeometry, FoldGrip, FoldLineSpan, FoldScene } from '../../fold/engine/foldEngineWire';
import { foldStateFrame, ringContains, sheetToScene, type FoldStateFrame } from '../../fold/sequence/foldStateFrame';
import type { Point } from '../../lib/geometry';

/** A point a step's picture circles, and how many layers lie over it as the viewer sees them. */
export interface FoldStepRing {
  at: Point;
  behind: number;
}

/** The engine's picture of a step, as the Diagram draws its marks: its arrow placed, the points it names circled. */
export interface FoldStepAction extends FoldActionGeometry {
  /** In the scene frame, as the rest; none when it names no point. */
  rings?: readonly FoldStepRing[];
}

/** What a step's marks are placed by: its stored operation, and the states either side of it. */
export interface FoldStepMarkContext {
  /** Null for a step a newer build made, whose references this build cannot read. */
  op: FoldOp | null;
  /** The state the step folds from: the frame its picture is drawn in. */
  parent: FoldScene;
  /** The state it lands, when known: what a rabbit ear's creases and an arrow's landed cover are read from. */
  child?: FoldScene | null;
}

/** Below this, in sheet units, two points are one and a length is none. */
const EPSILON = 1e-7;

const toPoint = ([x, y]: readonly [number, number]): Point => ({ x, y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (v: Point): Point | null => {
  const length = Math.hypot(v.x, v.y);
  return length > EPSILON ? { x: v.x / length, y: v.y / length } : null;
};
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const along = (from: Point, direction: Point, by: number): Point => ({ x: from.x + direction.x * by, y: from.y + direction.y * by });

/** `action` with its marks placed by the step's own references (see the module docs). */
export function foldStepAction(action: FoldActionGeometry, context: FoldStepMarkContext): FoldStepAction {
  const { op, parent } = context;
  if (!op) return action;
  const frame = foldStateFrame(parent);
  let placed: FoldStepAction = action;
  if (op.kind === 'rabbit-ear' && context.child) {
    const creases = stepFoldedCreases(parent, context.child);
    if (creases.length > 0) placed = { ...placed, spans: creases };
    const swung = earSwung(op.corners, frame, parent, context.child);
    if (swung) placed = { ...placed, grip: swung };
  }
  if ((op.kind === 'valley' || op.kind === 'mountain' || op.kind === 'precrease') && op.line.via === 'axiom') {
    placed = axiomPlaced(placed, op, frame, context);
  }
  return placed;
}

/**
 * A rabbit ear's arrow: the ear's tip — the corner of the triangle the ear
 * is made from, the one the fold carries farthest; its ridge, a valley fold,
 * runs to it — swung over to where the fold lays it, the flap's motion as
 * diagrams draw it. Null when the states do not say.
 */
function earSwung(
  corners: readonly [SheetPoint, SheetPoint, SheetPoint],
  frame: FoldStateFrame,
  parent: FoldScene,
  child: FoldScene
): FoldGrip | null {
  const landedFrame = foldStateFrame(child);
  // The state it lands, in the frame of the one before: the views differ by the model's turn at most.
  const toParent = compose(parent.view_transform, invertIsometry(child.view_transform));
  let tip: { corner: SheetPoint; at: Point; image: Point; landed: Point; moved: number } | null = null;
  for (const corner of corners) {
    const [at, landed] = [scenePoint(frame, corner), scenePoint(landedFrame, corner)];
    if (!at || !landed) continue;
    const image = applyIsometry(toParent, landed);
    const moved = distance(at, image);
    if (moved > EPSILON && (!tip || moved > tip.moved)) tip = { corner, at, image, landed, moved };
  }
  if (!tip) return null;
  return {
    at: tip.at,
    image: tip.image,
    hidden_at: layersOver(parent, frame, tip.corner, tip.at),
    hidden_image: landedCover(child, tip.corner, tip.landed),
  };
}

/** `action` with `rings` added, none twice. */
function withRings(action: FoldStepAction, rings: readonly FoldStepRing[]): FoldStepAction {
  const all = [...(action.rings ?? [])];
  for (const ring of rings) if (!all.some((had) => distance(had.at, ring.at) < 1e-6)) all.push(ring);
  return all.length > 0 ? { ...action, rings: all } : action;
}

/** The arrow and the circles of a plain fold or a precrease whose line an axiom located. */
function axiomPlaced(
  action: FoldStepAction,
  op: Extract<FoldOp, { kind: 'valley' | 'mountain' | 'precrease' }>,
  frame: FoldStateFrame,
  { parent, child }: FoldStepMarkContext
): FoldStepAction {
  if (op.line.via !== 'axiom') return action;
  const fold = action.line ? lineThrough(action.line[0], action.line[1]) : null;
  if (!fold) return action;
  const { axiom, inputs } = op.line;
  // Through two points, a segment: the two points circled and the line between them; an arrow would add nothing.
  if (axiom === 1 && op.kind === 'precrease' && op.extent?.kind === 'segment') {
    const points = inputs.flatMap((input) => {
      if (input.kind === 'edge') return [];
      const at = scenePoint(frame, input.at);
      return at ? [{ at, behind: layersOver(parent, frame, input.at, at) }] : [];
    });
    return withRings({ ...action, grip: null }, points);
  }
  // Which side of the line moves: the engine's grip is on the moving paper; the op's own moving point otherwise.
  const movingPoint = action.grip?.at ?? (op.moving ? scenePoint(frame, op.moving) : null);
  const moving = movingPoint ? Math.sign(sideOf(fold, movingPoint)) : 0;
  const precrease = op.kind === 'precrease';
  const grip = (at: Point, sheet: SheetPoint | null, image: Point): FoldGrip => ({
    at,
    image,
    hidden_at: sheet ? layersOver(parent, frame, sheet, at) : 0,
    // A precrease unfolds again: nothing lands.
    hidden_image: precrease || !child || !sheet ? null : landedCover(child, sheet, image),
  });
  if (axiom === 2) {
    const placed = pointOntoPoint(inputs, frame, fold, moving);
    if (!placed) return action;
    const { mover, target } = placed;
    return withRings(
      { ...action, grip: grip(mover.scene, mover.sheet, target.scene) },
      [mover, target].map(({ scene, sheet }) => ({ at: scene, behind: layersOver(parent, frame, sheet, scene) }))
    );
  }
  if (axiom === 3) {
    // A segment's arrow crosses the line where it is creased.
    const extent = op.kind === 'precrease' && op.extent ? action.line : null;
    const placed = lineOntoLine(inputs, frame, fold, moving, extent);
    return placed ? { ...action, grip: grip(placed.at, placed.sheet, placed.image) } : action;
  }
  return action;
}

/**
 * The point `by` of the stretch `lo`–`hi` an arrow can start from: its
 * middle, or — for a crease of part of the line, `extent` its ends — the
 * middle of the part whose arrow crosses the fold line within it, where
 * there is one. `foot(by)` is where the arrow from `by` crosses the line,
 * along it (`alongLine`), linear in `by`.
 */
function startAlong(
  lo: number,
  hi: number,
  foot: (by: number) => number,
  fold: NonNullable<ReturnType<typeof lineThrough>>,
  extent: readonly [Point, Point] | null
): number {
  const middle = (lo + hi) / 2;
  if (!extent) return middle;
  const [f0, f1] = [foot(lo), foot(hi)];
  if (!(Math.abs(f1 - f0) > EPSILON)) return middle;
  const [e0, e1] = extent.map((end) => alongLine(fold, end)).sort((a, b) => a - b) as [number, number];
  const [x0, x1] = [Math.max(Math.min(f0, f1), e0), Math.min(Math.max(f0, f1), e1)];
  if (!(x1 - x0 > EPSILON)) return middle;
  return lo + ((hi - lo) * ((x0 + x1) / 2 - f0)) / (f1 - f0);
}

/** A reference point where the state shows it, and the sheet point it is. */
interface PlacedPoint {
  scene: Point;
  sheet: SheetPoint;
}

function scenePoint(frame: FoldStateFrame, sheet: SheetPoint): Point | null {
  const at = sheetToScene(frame, sheet);
  return at ? toPoint(at) : null;
}

/** O2's two points where the state shows them, the one on the moving side first. */
function pointOntoPoint(
  inputs: readonly FoldRef[],
  frame: FoldStateFrame,
  fold: NonNullable<ReturnType<typeof lineThrough>>,
  moving: number
): { mover: PlacedPoint; target: PlacedPoint } | null {
  const [p, q] = inputs;
  if (!p || !q || p.kind === 'edge' || q.kind === 'edge') return null;
  const [P, Q] = [scenePoint(frame, p.at), scenePoint(frame, q.at)];
  if (!P || !Q || distance(P, Q) < EPSILON) return null;
  const first = { scene: P, sheet: p.at };
  const second = { scene: Q, sheet: q.at };
  const qMoves = moving !== 0 && Math.sign(sideOf(fold, Q)) === moving && Math.sign(sideOf(fold, P)) !== moving;
  return qMoves ? { mover: second, target: first } : { mover: first, target: second };
}

/** One of O3's lines where the state shows it: an edge or a crease, by its ends. */
interface PlacedSegment {
  a: Point;
  b: Point;
  sheet: readonly [SheetPoint, SheetPoint];
  direction: Point;
  length: number;
}

function placedSegment(frame: FoldStateFrame, ref: FoldRef | undefined): PlacedSegment | null {
  if (!ref || ref.kind !== 'edge') return null;
  const [a, b] = [scenePoint(frame, ref.a), scenePoint(frame, ref.b)];
  if (!a || !b) return null;
  const direction = unit({ x: b.x - a.x, y: b.y - a.y });
  return direction ? { a, b, sheet: [ref.a, ref.b], direction, length: distance(a, b) } : null;
}

/** The sheet point `by` along a placed segment from its first end, its two ends' map being affine along it. */
function sheetAlong(segment: PlacedSegment, by: number): SheetPoint {
  const t = by / segment.length;
  const [a, b] = segment.sheet;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function reflect(fold: NonNullable<ReturnType<typeof lineThrough>>, p: Point): Point {
  const s = sideOf(fold, p);
  return { x: p.x - 2 * s * fold.n[0], y: p.y - 2 * s * fold.n[1] };
}

function reflectDirection(fold: NonNullable<ReturnType<typeof lineThrough>>, v: Point): Point {
  const s = v.x * fold.n[0] + v.y * fold.n[1];
  return { x: v.x - 2 * s * fold.n[0], y: v.y - 2 * s * fold.n[1] };
}

/**
 * O3's arrow: from a point of the line that moves to where the fold puts it
 * on the other. Lines that meet: halfway along the stretch both edges cover
 * out from where they meet — for two edges from one corner, halfway along
 * the shorter. Parallel lines: from one to the other, halfway along the
 * stretch they face each other. A crease of part of the line, `extent` its
 * ends, takes its arrow across that part where it can.
 */
function lineOntoLine(
  inputs: readonly FoldRef[],
  frame: FoldStateFrame,
  fold: NonNullable<ReturnType<typeof lineThrough>>,
  moving: number,
  extent: readonly [Point, Point] | null
): { at: Point; image: Point; sheet: SheetPoint } | null {
  const lines = [placedSegment(frame, inputs[0]), placedSegment(frame, inputs[1])];
  const [first, second] = lines;
  if (!first || !second) return null;
  const onMovingSide = (p: Point) => moving === 0 || Math.sign(sideOf(fold, p)) === moving;
  const cross = first.direction.x * second.direction.y - first.direction.y * second.direction.x;
  if (Math.abs(cross) < 1e-6) {
    // Parallel: the stretch of the moving line facing the other one's image.
    for (const [mover, target] of [
      [first, second],
      [second, first],
    ] as const) {
      const middle = along(mover.a, mover.direction, mover.length / 2);
      if (!onMovingSide(middle)) continue;
      const images = [reflect(fold, target.a), reflect(fold, target.b)].map((p) => dot({ x: p.x - mover.a.x, y: p.y - mover.a.y }, mover.direction));
      const lo = Math.max(0, Math.min(...images));
      const hi = Math.min(mover.length, Math.max(...images));
      if (!(hi - lo > EPSILON)) continue;
      const by = startAlong(lo, hi, (t) => alongLine(fold, along(mover.a, mover.direction, t)), fold, extent);
      const at = along(mover.a, mover.direction, by);
      return { at, image: reflect(fold, at), sheet: sheetAlong(mover, by) };
    }
    return null;
  }
  // Meeting at a corner: each ray of each line out from it, paired with its image along the other.
  const t = ((second.a.x - first.a.x) * second.direction.y - (second.a.y - first.a.y) * second.direction.x) / cross;
  const corner = along(first.a, first.direction, t);
  const reach = (segment: PlacedSegment, direction: Point): [number, number] | null => {
    const ends = [segment.a, segment.b].map((p) => dot({ x: p.x - corner.x, y: p.y - corner.y }, direction));
    const lo = Math.max(0, Math.min(...ends));
    const hi = Math.max(...ends);
    return hi - lo > EPSILON ? [lo, hi] : null;
  };
  let best: { by: number; out: Point; back: Point; mover: PlacedSegment; covered: number } | null = null;
  for (const [mover, target] of [
    [first, second],
    [second, first],
  ] as const) {
    for (const sign of [1, -1]) {
      const out = { x: mover.direction.x * sign, y: mover.direction.y * sign };
      const own = reach(mover, out);
      if (!own || !onMovingSide(along(corner, out, (own[0] + own[1]) / 2))) continue;
      const back = reflectDirection(fold, out);
      // The image of the ray must run along the other line.
      if (Math.abs(dot(back, target.direction)) < 1 - 1e-6) continue;
      const other = reach(target, back);
      if (!other) continue;
      const [lo, hi] = [Math.max(own[0], other[0]), Math.min(own[1], other[1])];
      if (!(hi - lo > EPSILON) || (best && best.covered >= hi - lo)) continue;
      const by = startAlong(lo, hi, (t) => alongLine(fold, along(corner, out, t)), fold, extent);
      best = { by, out, back, mover, covered: hi - lo };
    }
  }
  if (!best) return null;
  const at = along(corner, best.out, best.by);
  const fromStart = dot({ x: at.x - best.mover.a.x, y: at.y - best.mover.a.y }, best.mover.direction);
  return { at, image: along(corner, best.back, best.by), sheet: sheetAlong(best.mover, fromStart) };
}

/** The face holding a sheet point in a state's frame, or −1 off the paper. */
function faceOf(frame: FoldStateFrame, sheet: SheetPoint): number {
  return frame.faces.findIndex((face) => ringContains(face.sheet, sheet));
}

/**
 * How many layers lie over a sheet point at the scene point `at`, as the
 * viewer sees them: over the highest of the faces holding it — a corner or
 * the middle of the sheet is a vertex of many, all folded to one place; 0
 * when none can say.
 */
function layersOver(scene: FoldScene, frame: FoldStateFrame, sheet: SheetPoint, at: Point): number {
  const faces = frame.faces.flatMap((face, index) => (ringContains(face.sheet, sheet) ? [index] : []));
  let over = Infinity;
  for (const cell of scene.subfaces) {
    if (!insideConvex(cell.polygon, at, 1e-9)) continue;
    for (const face of faces) {
      const depth = cell.faces_top_to_bottom.indexOf(face);
      if (depth >= 0) over = Math.min(over, depth);
    }
  }
  return Number.isFinite(over) ? over : 0;
}

/** How many layers lie over a sheet point where a fold lands it at `image`, in the state it lands; null unless it lands there. */
function landedCover(child: FoldScene, sheet: SheetPoint, image: Point): number | null {
  const frame = foldStateFrame(child);
  const face = faceOf(frame, sheet);
  const transform = face < 0 ? undefined : child.face_transforms[face];
  if (!transform) return null;
  const landed = applyIsometry(transform, { x: sheet[0], y: sheet[1] });
  if (distance(landed, image) > 1e-6) return null;
  return layersOver(child, frame, sheet, image);
}

/**
 * Every crease a step folds, as the state it folds from shows it: each crease
 * folded in the state it lands that was not folded — flat, or not there — in
 * the state before, where that state puts it, in the letter the viewer sees
 * (a face showing its back shows a crease's other letter), drawn behind
 * where a layer that stays covers it. Read off the two states' scenes, so a
 * fold along creases precreased before — a rabbit ear's bisectors, often —
 * is drawn whole, not only along the crease it made.
 */
export function stepFoldedCreases(parent: FoldScene, child: FoldScene): FoldLineSpan[] {
  const frame = foldStateFrame(parent);
  const folded = parent.creases.filter((crease) => crease.kind === 'fold' && crease.letter !== null);
  const spans: FoldLineSpan[] = [];
  for (const crease of child.creases) {
    if (crease.kind !== 'fold' || crease.letter === null) continue;
    const [from, to] = [crease.from, crease.to];
    // Folded before, the same way: not this step's.
    if (folded.some((before) => before.letter === crease.letter && covers(before.from, before.to, from, to))) continue;
    const middle: SheetPoint = [(from.x + to.x) / 2, (from.y + to.y) / 2];
    const face = faceOf(frame, middle);
    const transform = face < 0 ? undefined : parent.face_transforms[face];
    if (!transform) continue;
    const seen = parent.faces[face]!.front_up ? crease.letter : crease.letter === 'valley' ? 'mountain' : 'valley';
    spans.push({
      from: applyIsometry(transform, from),
      to: applyIsometry(transform, to),
      direction: seen,
      hidden: !shownAt(parent, frame, from, to),
    });
  }
  return joinedSpans(spans);
}

/** Whether the segment a–b of the sheet covers c–d: c and d both on it. */
function covers(a: Point, b: Point, c: Point, d: Point): boolean {
  const length = distance(a, b);
  if (!(length > EPSILON)) return false;
  const on = (p: Point) => {
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
    const off = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length;
    return off < 1e-6 && t > -1e-6 && t < 1 + 1e-6;
  };
  return on(c) && on(d);
}

/**
 * Whether the viewer sees the sheet segment from–to in a state: its paper is
 * on top beside its middle, on either side of it — a crease lies where two
 * faces meet, or across a flat crease's two.
 */
function shownAt(scene: FoldScene, frame: FoldStateFrame, from: Point, to: Point): boolean {
  const length = distance(from, to);
  if (!(length > EPSILON)) return false;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  const step = Math.min(1e-4, length / 8);
  return [1, -1].some((side) => {
    const sheet: SheetPoint = [middle.x + normal.x * side * step, middle.y + normal.y * side * step];
    const face = faceOf(frame, sheet);
    const transform = face < 0 ? undefined : scene.face_transforms[face];
    if (!transform) return false;
    const at = applyIsometry(transform, { x: sheet[0], y: sheet[1] });
    const cell = scene.subfaces.find((each) => insideConvex(each.polygon, at, 1e-12));
    return cell?.faces_top_to_bottom[0] === face;
  });
}

/**
 * The creases as lines to draw: those that lie end to end on one line in one
 * letter and are seen alike joined into one, and one under another — the
 * layers of a flap creased together — drawn once, the one seen.
 */
function joinedSpans(spans: readonly FoldLineSpan[]): FoldLineSpan[] {
  const shown = spans.filter((span) => !span.hidden);
  // A layer's crease under one the viewer sees, where it is: drawn by the one seen.
  const behind = spans.filter((span) => span.hidden && !shown.some((over) => covers(over.from, over.to, span.from, span.to)));
  const lines: FoldLineSpan[] = [];
  for (const span of [...shown, ...behind]) {
    if (lines.some((had) => had.hidden === span.hidden && covers(had.from, had.to, span.from, span.to))) continue;
    const joined = lines.findIndex((had) => had.hidden === span.hidden && had.direction === span.direction && endToEnd(had, span));
    if (joined < 0) {
      lines.push({ ...span });
      continue;
    }
    lines[joined] = joinedLine(lines[joined]!, span);
  }
  return lines;
}

/** Whether two spans lie on one line and share an end. */
function endToEnd(a: FoldLineSpan, b: FoldLineSpan): boolean {
  const line = lineThrough(a.from, a.to);
  if (!line || Math.abs(sideOf(line, b.from)) > 1e-6 || Math.abs(sideOf(line, b.to)) > 1e-6) return false;
  return [a.from, a.to].some((p) => [b.from, b.to].some((q) => distance(p, q) < 1e-6));
}

/** Two spans end to end on one line, as one: from the end of one the other does not share, to the other's. */
function joinedLine(a: FoldLineSpan, b: FoldLineSpan): FoldLineSpan {
  const ends = [a.from, a.to, b.from, b.to];
  let [from, to] = [a.from, a.to];
  let longest = -1;
  for (const p of ends) {
    for (const q of ends) {
      const d = distance(p, q);
      if (d > longest) [longest, from, to] = [d, p, q];
    }
  }
  return { ...a, from, to };
}
