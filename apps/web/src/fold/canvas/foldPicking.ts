/**
 * Picking and snapping on Fold's own geometry (plan D13), for both panes.
 *
 * Everything here is tier 1 of D14's interaction cost: asked once a frame
 * under a moving pointer, on the main thread, from data cached per state —
 * the scene's subfaces and creases and the engine's landmarks, each indexed
 * once ({@link foldPickIndex}) — never a call to the engine.
 *
 * - **The folded pane** picks in the scene frame. The topmost face and the
 *   stack under the pointer come from the scene's subfaces (the overlay's
 *   cells, every face over each, top first). Points snap to the engine's
 *   point landmarks — corners, crease crossings and marks, with the sheet
 *   point that names each — and to the midpoints of its segment landmarks;
 *   lines to the segment landmarks' visible parts. A landmark nothing shows
 *   is not there to click.
 * - **The crease-pattern pane** picks in sheet coordinates: the crease
 *   pattern's vertices and marks, and its creases by Fold's edge ids, in a
 *   `LineHitIndex` over the scene's `creases[]`.
 * - **A spread folded pane** (`FoldPaneSpreadMap`) is picked where it is
 *   drawn: each target indexed where the spread puts it — a point once per
 *   sheet point the viewer sees there, since points that lie together on
 *   the folded paper part when it is spread — and a free point read off the
 *   face drawn on top. A pick still carries where it lies unspread, which is
 *   what a step stores and what the paper lies flat on once picking starts.
 *
 * A pick carries what a step stores — sheet points, an edge's sheet ends —
 * and where to draw it on both panes. Not `nearestCpSnapTarget` (Edit's
 * Oriedita parity) and not the Diagram's picture snap, which recovers points
 * without provenance.
 *
 * Pure: no React, no store, no engine.
 */
import { LineHitIndex, type IndexedSegment } from '../../cp-workspace/picking/lineHitIndex';
import type { Point } from '../../lib/geometry';
import type { FoldRef, SheetPoint } from '../document/foldSequenceDocument';
import type { FoldLandmarks, FoldPointSource, FoldScene, FoldSegmentLandmark } from '../engine/foldEngineWire';
import {
  applyIsometry,
  boundsOf,
  insideConvex,
  invertIsometry,
  toPair,
  toPoint,
  type Bounds,
} from './foldCanvasGeometry';
import type { FoldStepSnap } from '../tools/foldToolRegistry';
import type { FoldPaneSpreadMap } from './foldPaneSpreadMap';

/** Which pane a pick was made on. */
export type FoldPaneId = 'folded' | 'crease-pattern';

/** Where a point lands: a landmark's kind, an edge's middle, or a free point (Alt). */
export type FoldPointProvenance = 'vertex' | 'crossing' | 'mark' | 'midpoint' | 'free';

/** A point reference: what an axiom input stores, and where it is drawn. */
export interface FoldPointPick {
  kind: 'point';
  provenance: FoldPointProvenance;
  /** The sheet point that names it: what a step stores. */
  sheet: SheetPoint;
  /** The Divide-line mark it is, when it is one: its id rides along for the sentence. */
  mark: string | null;
  /** Where it is in the folded pane's scene frame; null when it is on no face (cannot be). */
  scene: Point | null;
}

/** A line reference: an edge, a fold or a crease, by its sheet ends. */
export interface FoldSegmentPick {
  kind: 'segment';
  /** Fold's edge id. */
  edge: number;
  /** A raw edge of the paper, a fold (a bend of the folded form), or a flat crease. */
  segment: FoldSegmentLandmark['kind'];
  sheet: readonly [SheetPoint, SheetPoint];
  /** Its image in the folded pane's scene frame. */
  scene: readonly [Point, Point];
}

/** A point clicked as it is: a free line's end. */
export interface FoldFreePick {
  kind: 'free';
  /** The pane it was clicked on. */
  pane: FoldPaneId;
  /** Where it is in the folded pane's scene frame: the line runs through it there. */
  scene: Point;
  /**
   * The sheet point under it: where it was clicked on the crease-pattern
   * pane, the top face's point on the folded pane; null off the paper, where
   * a free line's end may lie.
   */
  sheet: SheetPoint | null;
}

export type FoldPick = FoldPointPick | FoldSegmentPick | FoldFreePick;

/** What a pointer is over on a pane: the raw point, and what a click there would take. */
export interface FoldHit {
  pane: FoldPaneId;
  /** In the pane's own frame: the scene frame on the folded pane, sheet coordinates on the other. */
  at: Point;
  /** Null for bare paper, or nothing a click would take. */
  pick: FoldPick | null;
  /**
   * On the folded pane while a woven section is shown: the interval of it
   * under the pointer, whose stack the layer picker shows (`wovenIntervalAt`).
   */
  interval?: number;
}

/**
 * The same thing under the pointer as a frame ago: by identity, or for a free
 * pick by position. Bare paper is the same hit wherever on it the pointer is,
 * over the same interval of a woven section: nothing drawn follows it there
 * (a click reads the point afresh), so a move across it re-renders nothing, as
 * a move along one crease does not.
 */
export function sameFoldHit(a: FoldHit, b: FoldHit): boolean {
  if (a.pane !== b.pane) return false;
  if (a.pick === null || b.pick === null) return a.pick === b.pick && a.interval === b.interval;
  return samePick(a.pick, b.pick);
}

export function samePick(a: FoldPick, b: FoldPick): boolean {
  if (a.kind === 'segment') return b.kind === 'segment' && a.edge === b.edge;
  if (a.kind === 'point') {
    return b.kind === 'point' && a.sheet[0] === b.sheet[0] && a.sheet[1] === b.sheet[1] && a.provenance === b.provenance;
  }
  return (
    b.kind === 'free' &&
    a.pane === b.pane &&
    a.scene.x === b.scene.x &&
    a.scene.y === b.scene.y &&
    a.sheet?.[0] === b.sheet?.[0] &&
    a.sheet?.[1] === b.sheet?.[1]
  );
}

/** A pick as an axiom input (plan D6): a sheet point, a mark's resolved point, or an edge by its ends. */
export function pickRef(pick: FoldPointPick | FoldSegmentPick): FoldRef {
  if (pick.kind === 'segment') return { kind: 'edge', a: pick.sheet[0], b: pick.sheet[1] };
  return pick.mark !== null ? { kind: 'mark', at: pick.sheet, mark: pick.mark } : { kind: 'point', at: pick.sheet };
}

// ---------------------------------------------------------------------------
// The index

/** A Divide-line mark's points, as the landmark query took them, with the mark each came from. */
export interface FoldMarkPoint {
  at: SheetPoint;
  mark: string;
}

interface IndexedSubface {
  polygon: Point[];
  box: Bounds;
  stack: readonly number[];
}

interface PointCandidate {
  provenance: FoldPointProvenance;
  sheet: SheetPoint;
  mark: string | null;
  /** Where a click finds it: in the pane's frame, as the pane draws it. */
  at: Point;
  /** Where it lies in the scene frame, unspread, when the folded pane draws it elsewhere. */
  scene?: Point;
}

/** One pane's targets, indexed. */
interface PaneIndex {
  points: PointCandidate[];
  pointHits: LineHitIndex;
  segments: FoldSegmentPick[];
  /** By indexed id − 1: the segment each indexed portion belongs to. */
  portionOf: number[];
  segmentHits: LineHitIndex;
}

export interface FoldPickIndex {
  scene: FoldScene;
  /** Model frame → scene, and back. */
  toScene: (model: Point) => Point;
  toModel: (scene: Point) => Point;
  subfaces: IndexedSubface[];
  folded: PaneIndex;
  creasePattern: PaneIndex;
  /** How the folded pane draws the paper when its layers are spread; null when it draws the scene as it is. */
  spread: FoldPaneSpreadMap | null;
}

const POINT_PRIORITY: Readonly<Record<FoldPointSource['kind'], FoldPointProvenance>> = {
  vertex: 'vertex',
  crossing: 'crossing',
  mark: 'mark',
  // A crease mark's end is where a crease stops, as at a vertex; where one
  // crosses a crease or another mark is a crossing.
  crease_mark_end: 'vertex',
  crease_mark_crossing: 'crossing',
};

function pointIndex(points: readonly PointCandidate[]): LineHitIndex {
  return new LineHitIndex(points.map((point, k): IndexedSegment => ({ id: k + 1, a: point.at, b: point.at })));
}

/** The visible stretches of a segment landmark, along it from `a` (its `at[0]`) to `b`. */
function visiblePortions(segment: FoldSegmentLandmark, a: Point, b: Point): [Point, Point][] {
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return segment.visible.flatMap(([from, to]) => (to - from > 1e-9 ? [[at(from), at(to)] as [Point, Point]] : []));
}

/** Each segment's portions, indexed: `portionOf` says which segment an indexed id is part of. */
function segmentIndex(portions: readonly [Point, Point][][]): { hits: LineHitIndex; portionOf: number[] } {
  const indexed: IndexedSegment[] = [];
  const portionOf: number[] = [];
  portions.forEach((list, segment) => {
    for (const [a, b] of list) {
      // Every portion its own id: the index skips an id it has seen, so two
      // portions sharing one would hide the nearer behind the first found.
      indexed.push({ id: indexed.length + 1, a, b });
      portionOf.push(segment);
    }
  });
  return { hits: new LineHitIndex(indexed), portionOf };
}

/**
 * Where a sheet point is in the scene frame: through the transform of a face
 * whose sheet outline holds it. A point on a crease is on two faces, whose
 * transforms agree there.
 */
export function sheetToScene(scene: FoldScene, sheet: SheetPoint, epsilon = 1e-7): Point | null {
  const p = toPoint(sheet);
  for (const [face, { points }] of scene.faces.entries()) {
    const outline = points.map((vertex) => scene.sheet_points[vertex]);
    if (outline.some((corner) => corner === undefined)) continue;
    if (!insideConvex(outline as Point[], p, epsilon)) continue;
    const transform = scene.face_transforms[face];
    if (transform) return applyIsometry(transform, p);
  }
  return null;
}

/** The faces over a point of the scene, top first; empty off the paper. */
function stackAt(subfaces: readonly IndexedSubface[], p: Point, epsilon = 0): readonly number[] {
  for (const subface of subfaces) {
    const { box } = subface;
    if (p.x < box.minX - epsilon || p.x > box.maxX + epsilon || p.y < box.minY - epsilon || p.y > box.maxY + epsilon) {
      continue;
    }
    if (insideConvex(subface.polygon, p, epsilon)) return subface.stack;
  }
  return [];
}

/** Two drawn points the pane cannot tell apart: one target, the first named. */
const SAME_DRAWN = 1e-9;

/**
 * The folded pane's point targets for one landmark: where the viewer sees it,
 * named by the first sheet point the viewer sees there (vertices first, then
 * crossings, then marks: the engine's order). Spread, each sheet point the
 * viewer sees there is a target of its own where the spread draws it — a
 * corner of one layer and a crease of another, together on the folded paper,
 * are apart on the spread picture.
 */
function landmarkTargets(
  landmark: NonNullable<FoldLandmarks['points']>[number],
  at: Point,
  marks: readonly FoldMarkPoint[],
  spread: FoldPaneSpreadMap | null
): PointCandidate[] {
  const candidate = (source: FoldPointSource): PointCandidate => ({
    provenance: POINT_PRIORITY[source.kind],
    sheet: source.sheet,
    mark: source.kind === 'mark' ? (marks[source.mark]?.mark ?? null) : null,
    at,
  });
  const first = landmark.sources.find((each) => each.visible) ?? landmark.sources[0];
  if (!first) return [];
  if (!spread) return [candidate(first)];
  const targets: PointCandidate[] = [];
  for (const source of [first, ...landmark.sources.filter((each) => each.visible && each !== first)]) {
    const drawn = spread.sheet(source.sheet) ?? at;
    if (targets.some((target) => Math.hypot(target.at.x - drawn.x, target.at.y - drawn.y) <= SAME_DRAWN)) continue;
    targets.push({ ...candidate(source), at: drawn, scene: at });
  }
  return targets;
}

/**
 * Index a state's targets, once per scene and landmarks: what every pointer
 * move over either pane reads. With `spread`, the folded pane's targets are
 * indexed where the spread draws them (see the module notes).
 */
export function foldPickIndex(
  scene: FoldScene,
  landmarks: FoldLandmarks | null,
  marks: readonly FoldMarkPoint[],
  spread: FoldPaneSpreadMap | null = null
): FoldPickIndex {
  const view = scene.view_transform;
  const back = invertIsometry(view);
  const toScene = (model: Point) => applyIsometry(view, model);
  const toModel = (point: Point) => applyIsometry(back, point);
  const subfaces = scene.subfaces.map(({ polygon, faces_top_to_bottom }) => ({
    polygon: polygon.map((p) => ({ x: p.x, y: p.y })),
    box: boundsOf(polygon) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    stack: faces_top_to_bottom,
  }));

  // --- The folded pane: the engine's landmarks, as the viewer sees them.
  const foldedPoints: PointCandidate[] = [];
  for (const landmark of landmarks?.points ?? []) {
    if (!landmark.visible) continue;
    foldedPoints.push(...landmarkTargets(landmark, toScene(toPoint(landmark.at)), marks, spread));
  }
  const foldedSegments: FoldSegmentPick[] = [];
  const foldedPortions: [Point, Point][][] = [];
  for (const segment of landmarks?.segments ?? []) {
    const a = toScene(toPoint(segment.at[0]));
    const b = toScene(toPoint(segment.at[1]));
    const sheet: [SheetPoint, SheetPoint] = [segment.sheet.a, segment.sheet.b];
    // Found where the pane draws it: the segment where the spread puts its ends.
    const [p, q] = spread ? spread.segment(sheet, [a, b]) : [a, b];
    const portions = visiblePortions(segment, p, q);
    if (portions.length === 0) continue;
    foldedSegments.push({ kind: 'segment', edge: segment.edge, segment: segment.kind, sheet, scene: [a, b] });
    foldedPortions.push(portions);
    // An edge's middle, where the viewer sees it: a landmark the engine's
    // points do not list, named by the sheet point half way along.
    if (segment.visible.some(([from, to]) => from <= 0.5 && to >= 0.5)) {
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      foldedPoints.push({
        provenance: 'midpoint',
        sheet: [(segment.sheet.a[0] + segment.sheet.b[0]) / 2, (segment.sheet.a[1] + segment.sheet.b[1]) / 2],
        mark: null,
        ...(spread ? { at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, scene: middle } : { at: middle }),
      });
    }
  }
  const folded = segmentIndex(foldedPortions);

  // --- The crease-pattern pane: the sheet, every crease and vertex on it.
  const cpPoints: PointCandidate[] = [];
  const seenVertex = new Set<number>();
  const cpSegments: FoldSegmentPick[] = [];
  const cpPortions: [Point, Point][][] = [];
  for (const crease of scene.creases) {
    for (const [k, vertex] of crease.vertices.entries()) {
      if (seenVertex.has(vertex)) continue;
      seenVertex.add(vertex);
      const at = k === 0 ? crease.from : crease.to;
      cpPoints.push({ provenance: 'vertex', sheet: toPair(at), mark: null, at: { x: at.x, y: at.y } });
    }
    const sheet: [SheetPoint, SheetPoint] = [toPair(crease.from), toPair(crease.to)];
    const a = sheetToScene(scene, sheet[0]);
    const b = sheetToScene(scene, sheet[1]);
    if (!a || !b) continue;
    cpSegments.push({
      kind: 'segment',
      edge: crease.id,
      segment: crease.kind === 'border' ? 'raw_edge' : crease.kind === 'fold' ? 'bend' : 'crease',
      sheet,
      scene: [a, b],
    });
    cpPortions.push([[crease.from, crease.to]]);
    cpPoints.push({
      provenance: 'midpoint',
      sheet: [(sheet[0][0] + sheet[1][0]) / 2, (sheet[0][1] + sheet[1][1]) / 2],
      mark: null,
      at: { x: (crease.from.x + crease.to.x) / 2, y: (crease.from.y + crease.to.y) / 2 },
    });
  }
  for (const mark of marks) {
    cpPoints.push({ provenance: 'mark', sheet: mark.at, mark: mark.mark, at: toPoint(mark.at) });
  }
  const cp = segmentIndex(cpPortions);

  return {
    scene,
    toScene,
    toModel,
    subfaces,
    folded: {
      points: foldedPoints,
      pointHits: pointIndex(foldedPoints),
      segments: foldedSegments,
      portionOf: folded.portionOf,
      segmentHits: folded.hits,
    },
    creasePattern: {
      points: cpPoints,
      pointHits: pointIndex(cpPoints),
      segments: cpSegments,
      portionOf: cp.portionOf,
      segmentHits: cp.hits,
    },
    spread,
  };
}

// ---------------------------------------------------------------------------
// Queries

/** The faces under a point of the folded pane, top first: the topmost face is the first. */
export function foldStackAt(index: FoldPickIndex, scene: Point): readonly number[] {
  return stackAt(index.subfaces, scene);
}

/**
 * The sheet point of the top face under a point of the folded pane: where a
 * free point on the paper, a mark made by a pick or a depth seed is anchored.
 * Null off the paper.
 */
export function topSheetPointAt(index: FoldPickIndex, scene: Point): SheetPoint | null {
  const top = stackAt(index.subfaces, scene, 1e-9)[0];
  if (top === undefined) return null;
  const transform = index.scene.face_transforms[top];
  if (!transform) return null;
  return toPair(applyIsometry(invertIsometry(transform), scene));
}

/** Hit radii, in the pane's frame. */
export interface FoldHitRadii {
  point: number;
  line: number;
}

function pointPick(index: FoldPickIndex, onFolded: boolean, candidate: PointCandidate): FoldPointPick {
  return {
    kind: 'point',
    provenance: candidate.provenance,
    sheet: candidate.sheet,
    mark: candidate.mark,
    scene: onFolded ? (candidate.scene ?? candidate.at) : sheetToScene(index.scene, candidate.sheet),
  };
}

/**
 * The paper under a point of the folded pane as the pane draws it: where it
 * lies in the scene frame, and the sheet point it is — the face on top
 * there, read back through the spread when the pane draws one. Null off the
 * paper.
 */
function paperUnder(index: FoldPickIndex, at: Point): { scene: Point; sheet: SheetPoint } | null {
  if (index.spread) return index.spread.under(at);
  const sheet = topSheetPointAt(index, at);
  return sheet ? { scene: at, sheet } : null;
}

/**
 * What a click at `at` on `pane` takes for a click that snaps by `snap`:
 * the nearest point landmark, or with `free` held any point of the paper; the
 * nearest line (a fold or a crease only, unless `edges`); or the point itself.
 */
export function resolveFoldPick(
  index: FoldPickIndex,
  pane: FoldPaneId,
  at: Point,
  radii: FoldHitRadii,
  { snap, edges, free }: { snap: FoldStepSnap; edges: boolean; free: boolean }
): FoldPick | null {
  const onFolded = pane === 'folded';
  const targets = onFolded ? index.folded : index.creasePattern;
  switch (snap) {
    case 'free': {
      if (onFolded) {
        // Off the paper a free line's end lies where it is clicked: no spread reaches there.
        const under = paperUnder(index, at);
        return { kind: 'free', pane, scene: under?.scene ?? at, sheet: under?.sheet ?? null };
      }
      const sheet = toPair(at);
      const scene = sheetToScene(index.scene, sheet);
      return scene ? { kind: 'free', pane, scene, sheet } : null;
    }
    case 'point':
    case 'crease':
    case 'candidate': {
      if (free) {
        // Alt (or its latch): the point under the pointer, on the paper.
        if (onFolded) {
          const under = paperUnder(index, at);
          return under ? { kind: 'point', provenance: 'free', sheet: under.sheet, mark: null, scene: under.scene } : null;
        }
        const sheet = insideSheet(index, at);
        return sheet ? { kind: 'point', provenance: 'free', sheet, mark: null, scene: sheetToScene(index.scene, sheet) } : null;
      }
      const hit = targets.pointHits.query(at.x, at.y, radii.point);
      const candidate = hit > 0 ? targets.points[hit - 1] : undefined;
      return candidate ? pointPick(index, onFolded, candidate) : null;
    }
    case 'crease-required': {
      const hits = targets.segmentHits.segmentsNear(at.x, at.y, radii.line);
      let best: FoldSegmentPick | null = null;
      let bestDistance = Infinity;
      for (const portion of hits) {
        const segment = targets.segments[targets.portionOf[portion.id - 1] ?? -1];
        if (!segment || (!edges && segment.segment === 'raw_edge')) continue;
        const distance = distanceToSegment(at, portion.a, portion.b);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = segment;
        }
      }
      return best;
    }
  }
}

/** A sheet point on the crease-pattern pane, when it is on the sheet. */
function insideSheet(index: FoldPickIndex, at: Point): SheetPoint | null {
  return sheetToScene(index.scene, toPair(at)) ? toPair(at) : null;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
