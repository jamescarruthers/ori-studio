/**
 * The letters on the Layer order dialog's panes: which faces carry one, how
 * it reads, and where it sits (`implementation-plans/layer-order-dialog.md`,
 * row U8; D7 and its addition; Round3:1301-1380, `Round4-States`' label cap).
 *
 * **Which faces.** The subject, the objects picked, a pressed or hovered
 * row's faces and a clash's faces always do. While objects are being chosen,
 * so do the faces a pick can take, up to the cap (D7): with more of them
 * than {@link LAYER_ORDER_LABEL_CAP}, the nearest that many to the subject
 * keep their letters, measured on the crease pattern; pointing at a face the
 * cap left out gathers them round that face instead ({@link
 * withPointerLetters}), while pointing at a lettered one moves none, so the
 * letters hold still under a moving pointer. Every one of them stays
 * tinted, so a face past the cap is still findable; the hint counts them
 * (U10). Nothing else is ever lettered: choosing a subject, the faces with
 * choices are only tinted.
 *
 * **How it reads.** A chip in theme tokens, opaque, so it reads the same
 * over any paper: outlined in `--face-pick` for a pick (the subject, an
 * object, a row's face), in danger with a dot before the letter for a clash
 * (the list's own clash mark, so a clash reads without hue), plain for a face
 * a pick can take. A face entirely hidden on the folded paper gets a smaller,
 * quieter chip ({@link LayerPlacedLabel.under}), never a dashed one.
 *
 * **Where.** Each face offers spots, best first, each a point and the region
 * around it a chip must sit inside: on the crease pattern, points inside the
 * face (its centroid when that is inside, then the roomiest points along it,
 * `ringSpots`); on the folded paper, the middles of its largest spots
 * on top, or for a face nothing shows of, its middle and its largest spots
 * under others. Letters are placed in pixels, at a size that holds on screen,
 * so {@link placeLabels} runs per frame of the camera; what it reads per face
 * is worked out once per order and face ({@link foldedLabelIndex},
 * {@link patternLabelIndex}).
 *
 * **Only legible letters, only where they fit** (D7's addition, U8's review):
 * - a chip sits inside its region with room for the ring along the face's
 *   edge, so it never hides a face narrower than itself, nor its ring;
 * - a plain letter (a face a pick can take) takes the first of its spots
 *   where it fits clear of the letters placed before it, and is left out
 *   when none is: its face stays tinted, and zooming in makes room. On
 *   iguana-c0 at fit the fifty nearest faces lie within a few millimetres of
 *   each other, and their chips piled into one grey block;
 * - a letter that must show ({@link LayerPaneLabel.keep}: a pick's, a
 *   clash's, the face pointed at) takes a clear spot inside its face if one
 *   has room, else sits just off the face, beside it, so it never covers the
 *   tint and ring that mark it.
 *
 * Pure: no React, no store, no engine.
 */
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { Point } from '../../lib/geometry';
import { insideEvenOdd } from '../../cp-workspace/picking/polygonContains';
import type { LayerFace } from '../engine/faceIndex';
import { LAYER_ORDER_LABEL_CAP } from '../layerOrderBudgets';
import { ringArea, ringCentroid, ringInterior } from './layerPaneFigure';
import type { LayerFaceMarks } from './layerPaneMarks';

/** How a face's letter reads. */
export type LayerLabelTone = 'pick' | 'danger' | 'plain';

export interface LayerPaneLabel {
  readonly face: LayerFace;
  readonly tone: LayerLabelTone;
  /** It shows whatever room it finds: a pick's, a clash's, the face pointed at. Any other needs a clear spot it fits. */
  readonly keep: boolean;
}

export interface LayerPaneLetters {
  /** The faces lettered, in the order they are placed: picks and the clash first, then the rest. */
  readonly labels: readonly LayerPaneLabel[];
  /** The faces a pick can take whose letters the cap leaves out: tinted, unlettered. */
  readonly pastCap: readonly LayerFace[];
}

/**
 * The faces a pick can take that keep their letters: all of them up to
 * `cap`; past it, the face pointed at when it is one of them, and the `cap`
 * nearest to it (to `anchor` when nothing is pointed at), by their centroids
 * on the crease pattern, nearest first, the face's number breaking a tie.
 */
export function cappedFaces(
  faces: readonly LayerFace[],
  pointed: LayerFace | null,
  anchor: LayerFace | null,
  centroids: readonly (Point | null)[],
  cap: number = LAYER_ORDER_LABEL_CAP
): LayerFace[] {
  if (faces.length <= cap) return [...faces];
  const offered = pointed !== null && faces.includes(pointed) ? pointed : null;
  const from = offered ?? anchor;
  const at = from !== null ? centroids[from] : null;
  const distance = (face: LayerFace) => {
    const c = centroids[face];
    return c && at ? Math.hypot(c.x - at.x, c.y - at.y) : Infinity;
  };
  const nearest = faces
    .filter((face) => face !== offered)
    .sort((a, b) => distance(a) - distance(b) || a - b)
    .slice(0, cap);
  return offered !== null ? [offered, ...nearest] : nearest;
}

/** The faces that carry letters on both panes, and how each reads (see the module docs). */
export function paneLetters(
  marks: LayerFaceMarks,
  centroids: readonly (Point | null)[],
  cap: number = LAYER_ORDER_LABEL_CAP
): LayerPaneLetters {
  const tones = new Map<LayerFace, LayerLabelTone>();
  const clash = new Set(marks.clash);
  const pick = (face: LayerFace) => {
    if (!clash.has(face)) tones.set(face, 'pick');
  };
  for (const face of marks.clash) tones.set(face, 'danger');
  if (marks.subject !== null) pick(marks.subject);
  marks.objects.forEach(pick);
  marks.row.forEach(pick);
  const offered = marks.picking === 'object' ? marks.pickable : [];
  const kept = cappedFaces(offered, marks.pointed, marks.subject, centroids, cap);
  const keptSet = new Set(kept);
  for (const face of kept) if (!tones.has(face)) tones.set(face, 'plain');
  const labels: LayerPaneLabel[] = [];
  for (const [face, tone] of tones) if (tone !== 'plain') labels.push({ face, tone, keep: true });
  for (const [face, tone] of tones) if (tone === 'plain') labels.push({ face, tone, keep: face === marks.pointed });
  const pastCap = offered.filter((face) => !keptSet.has(face) && !tones.has(face));
  return { labels, pastCap };
}

/**
 * The letters of `marks` from `base`, the same marks' letters with nothing
 * following the pointer (`baseMarks`): a row's faces join as picks and the
 * face pointed at must show. Only past the cap, with the pointer on a face
 * the cap left out, does the cap gather round it again (D7); otherwise this
 * reads no more than the pointer's faces.
 */
export function withPointerLetters(
  base: LayerPaneLetters,
  marks: LayerFaceMarks,
  centroids: readonly (Point | null)[],
  cap: number = LAYER_ORDER_LABEL_CAP
): LayerPaneLetters {
  if (marks.pointed === null && marks.row.length === 0) return base;
  const offered = marks.picking === 'object' ? marks.pickable : [];
  const pointedOffered = marks.pointed !== null && offered.includes(marks.pointed);
  if (pointedOffered && offered.length > cap && base.pastCap.includes(marks.pointed!)) {
    return paneLetters(marks, centroids, cap);
  }
  const clash = new Set(marks.clash);
  const rowPicks = new Set(marks.row.filter((face) => !clash.has(face)));
  const labels: LayerPaneLabel[] = [];
  const seen = new Set<LayerFace>();
  for (const label of base.labels) {
    if (label.tone === 'plain') continue;
    labels.push(label);
    seen.add(label.face);
  }
  for (const face of rowPicks) {
    if (seen.has(face)) continue;
    labels.push({ face, tone: 'pick', keep: true });
    seen.add(face);
  }
  for (const label of base.labels) {
    if (label.tone !== 'plain' || seen.has(label.face)) continue;
    labels.push(label.face === marks.pointed ? { ...label, keep: true } : label);
  }
  return { labels, pastCap: base.pastCap.filter((face) => !rowPicks.has(face)) };
}

// ---------------------------------------------------------------------------
// Size

/** A chip's letter size, CSS px: a face's, and a hidden face's (Round3's `tagSize`). */
export const LABEL_FONT_PX = 10.5;
export const LABEL_UNDER_FONT_PX = 9.5;

/** A chip's box, CSS px: what the chip is drawn at and what placing it keeps clear. */
export function labelSize(text: string, under: boolean, dot: boolean): { width: number; height: number } {
  const font = under ? LABEL_UNDER_FONT_PX : LABEL_FONT_PX;
  return { width: (text.length * 0.66 + 1) * font + (dot ? 8 : 0), height: 1.55 * font };
}

// ---------------------------------------------------------------------------
// Where

/** A place a face's letter may sit: a point, and the region round it the chip must stay inside, in the pane's frame. */
export interface LayerLabelSpot {
  readonly at: Point;
  readonly region: readonly Point[];
}

/** Where a face's letter may sit, best first, and the face itself, to sit beside when it must. */
export interface LayerLabelSpots {
  /** Some part of the face shows: the spots are its parts on top. */
  readonly visible: boolean;
  readonly spots: readonly LayerLabelSpot[];
  /** The face's whole outline in the pane's frame: what a letter that must show sits beside. */
  readonly outline: readonly Point[];
}

/** How many lines each way across a region {@link ringSpots} reads. */
const SPOT_LINES = 9;

/** The sorted crossings of `ring` with the line `y = at` (`horizontal`) or `x = at`, along the line. */
function lineCrossings(ring: readonly Point[], horizontal: boolean, at: number): number[] {
  const out: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!;
    const b = ring[j]!;
    const [au, av, bu, bv] = horizontal ? [a.y, a.x, b.y, b.x] : [a.x, a.y, b.x, b.y];
    if (au > at !== bu > at) out.push(av + ((at - au) * (bv - av)) / (bu - au));
  }
  return out.sort((l, r) => l - r);
}

/** How long the run inside `ring` through `p` is, across (`horizontal`) or down; 0 outside. */
function runThrough(ring: readonly Point[], horizontal: boolean, p: Point): number {
  const along = horizontal ? p.x : p.y;
  const crossings = lineCrossings(ring, horizontal, horizontal ? p.y : p.x);
  for (let c = 0; c + 1 < crossings.length; c += 2) {
    if (crossings[c]! <= along && along <= crossings[c + 1]!) return crossings[c + 1]! - crossings[c]!;
  }
  return 0;
}

/**
 * Up to `count` points inside `ring`, best first: its centroid when that is
 * inside, then the roomiest middles of its runs across and down (a point's
 * room is the shorter of the two runs through it), each kept from the ones
 * before by the ring's longer side over `count + 1`. So a long face offers
 * points along its length, whichever way it lies.
 */
export function ringSpots(ring: readonly Point[], count: number): Point[] {
  if (ring.length < 3 || count <= 0) return [];
  const xs = ring.map(({ x }) => x);
  const ys = ring.map(({ y }) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const candidates: { at: Point; room: number }[] = [];
  const consider = (at: Point) => {
    const room = Math.min(runThrough(ring, true, at), runThrough(ring, false, at));
    if (room > 0) candidates.push({ at, room });
  };
  for (let k = 1; k <= SPOT_LINES; k += 1) {
    const y = top + (k * height) / (SPOT_LINES + 1);
    const across = lineCrossings(ring, true, y);
    for (let c = 0; c + 1 < across.length; c += 2) consider({ x: (across[c]! + across[c + 1]!) / 2, y });
    const x = left + (k * width) / (SPOT_LINES + 1);
    const down = lineCrossings(ring, false, x);
    for (let c = 0; c + 1 < down.length; c += 2) consider({ x, y: (down[c]! + down[c + 1]!) / 2 });
  }
  candidates.sort((a, b) => b.room - a.room);
  const out: Point[] = [];
  const centroid = ringCentroid(ring);
  if (centroid && insideEvenOdd(ring, centroid)) out.push(centroid);
  const apart = Math.max(width, height) / (count + 1);
  for (const { at } of candidates) {
    if (out.length >= count) break;
    if (out.every((p) => Math.hypot(p.x - at.x, p.y - at.y) >= apart)) out.push(at);
  }
  if (out.length === 0) {
    const inside = ringInterior(ring);
    if (inside) out.push(inside);
  }
  return out;
}

/**
 * How many points a face's letter tries on the crease pattern; on the folded
 * paper, how many of a shown face's spots, of a hidden one's, and points in
 * each.
 */
const PATTERN_TRIES = 6;
const VISIBLE_TRIES = 8;
const HIDDEN_TRIES = 6;
const SPOTS_PER_REGION = 3;

/**
 * Where each face's letter may sit on the crease pattern: points inside its
 * ring, the ring the region. Worked out for a face the first time it is asked
 * for, and kept.
 */
export function patternLabelIndex(rings: readonly (readonly Point[])[]): (face: LayerFace) => LayerLabelSpots | null {
  const cache = new Map<LayerFace, LayerLabelSpots | null>();
  return (face) => {
    let spots = cache.get(face);
    if (spots === undefined) {
      const ring = rings[face];
      spots =
        ring && ring.length >= 3
          ? { visible: true, spots: ringSpots(ring, PATTERN_TRIES).map((at) => ({ at, region: ring })), outline: ring }
          : null;
      cache.set(face, spots);
    }
    return spots;
  };
}

/**
 * Where each face's letter may sit on the folded paper of `scene` (the side
 * shown, stacked in the order on screen): points in its spots on top
 * (`ringSpots`), largest spot first, each spot their region; for a face
 * nothing shows of, points in its outline, then in its largest spots under
 * others. The spots each face is in
 * are gathered once per scene; a face's letter spots, the first time asked.
 */
export function foldedLabelIndex(scene: OristudioCpFoldedPaperScene): (face: LayerFace) => LayerLabelSpots | null {
  const onTop = new Map<LayerFace, number[]>();
  const under = new Map<LayerFace, number[]>();
  scene.subfaces.forEach((subface, spot) => {
    subface.faces_top_to_bottom.forEach((face, depth) => {
      const into = depth === 0 ? onTop : under;
      const list = into.get(face);
      if (list) list.push(spot);
      else into.set(face, [spot]);
    });
  });
  const areas = new Map<number, number>();
  const areaOf = (spot: number) => {
    let area = areas.get(spot);
    if (area === undefined) {
      area = ringArea(scene.subfaces[spot]!.polygon);
      areas.set(spot, area);
    }
    return area;
  };
  const within = (region: readonly Point[]): LayerLabelSpot[] =>
    ringSpots(region, SPOTS_PER_REGION).map((at) => ({ at, region }));
  const largest = (spots: readonly number[] | undefined, count: number): LayerLabelSpot[] =>
    (spots ?? [])
      .slice()
      .sort((a, b) => areaOf(b) - areaOf(a))
      .slice(0, count)
      .flatMap((spot) => within(scene.subfaces[spot]!.polygon));
  const cache = new Map<LayerFace, LayerLabelSpots | null>();
  return (face) => {
    let spots = cache.get(face);
    if (spots !== undefined) return spots;
    const outline = scene.faces[face]?.outline ?? [];
    const shown = onTop.get(face);
    if (shown && shown.length > 0) {
      spots = { visible: true, spots: largest(shown, VISIBLE_TRIES), outline };
    } else if (outline.length >= 3 || under.has(face)) {
      spots = { visible: false, spots: [...within(outline), ...largest(under.get(face), HIDDEN_TRIES)], outline };
    } else {
      spots = null;
    }
    cache.set(face, spots);
    return spots;
  };
}

/** A letter placed on a pane, CSS px of the canvas box: its centre and its box. */
export interface LayerPlacedLabel {
  readonly face: LayerFace;
  readonly text: string;
  readonly tone: LayerLabelTone;
  /** Nothing of the face shows: the quieter chip. */
  readonly under: boolean;
  /** It sits beside its face, which had no room for it. */
  readonly off: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The space kept between two letters, CSS px. */
const LABEL_GAP_PX = 2;
/**
 * The room a chip keeps from its region's edge, CSS px: the widest ring
 * (2 px, set in half its stroke plus a pixel) and a pixel more, so a chip
 * never covers the ring along its face.
 */
export const LABEL_EDGE_ROOM_PX = 4;
/** How far a letter that sits beside its face keeps from it, CSS px. */
const LABEL_OFF_GAP_PX = 3;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whether a chip of `size` centred at `at` lies inside `region` (CSS px), `room` in from its edge. */
export function chipFits(at: Point, size: { width: number; height: number }, region: readonly Point[], room: number): boolean {
  const halfW = size.width / 2 + room;
  const halfH = size.height / 2 + room;
  const corners: Point[] = [
    { x: at.x - halfW, y: at.y - halfH },
    { x: at.x + halfW, y: at.y - halfH },
    { x: at.x + halfW, y: at.y + halfH },
    { x: at.x - halfW, y: at.y + halfH },
  ];
  if (!corners.every((corner) => insideEvenOdd(region, corner))) return false;
  // A notch can bite into a box whose corners are all inside: no edge of the region may cross it.
  return region.every((a, i) => {
    const b = region[(i + 1) % region.length]!;
    return !segmentCrossesBox(a, b, at.x - halfW, at.y - halfH, at.x + halfW, at.y + halfH);
  });
}

/** Whether the segment `a`–`b` passes through the open box. */
function segmentCrossesBox(a: Point, b: Point, minX: number, minY: number, maxX: number, maxY: number): boolean {
  // Liang–Barsky clipping against the box, strictly inside.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dy, a.y - minY],
    [dy, maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/** Whether a chip of `size` centred at `at` lies inside `frame`, the pane's box, CSS px. */
function chipInFrame(at: Point, size: { width: number; height: number }, frame: { width: number; height: number }): boolean {
  return (
    at.x - size.width / 2 >= 0 &&
    at.y - size.height / 2 >= 0 &&
    at.x + size.width / 2 <= frame.width &&
    at.y + size.height / 2 <= frame.height
  );
}

/** Points beside an on-screen outline's box where a chip of `size` sits clear of it: above, below, right, left. */
function besideSpots(outline: readonly Point[], size: { width: number; height: number }): Point[] {
  if (outline.length === 0) return [];
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const gapX = size.width / 2 + LABEL_OFF_GAP_PX;
  const gapY = size.height / 2 + LABEL_OFF_GAP_PX;
  return [
    { x: midX, y: minY - gapY },
    { x: midX, y: maxY + gapY },
    { x: maxX + gapX, y: midY },
    { x: minX - gapX, y: midY },
  ];
}

/**
 * `labels` placed in the pane's pixels (see the module docs): each at the
 * first of its spots (through `project`) where it fits inside its region
 * clear of the letters placed before it; a letter that must show, beside its
 * face when none is, clear of them if it can be; any other left out.
 *
 * In their order, but the letters that must show before the rest, and of
 * each, a face that shows before a hidden one, whose letter sits over
 * another face's paper: so a hidden face never takes the one spot of the
 * face on top there. The earliest come out on top, so they go last in the
 * answer, which is the order to draw them in.
 *
 * `frame`, the pane's box, keeps a letter set beside its face on screen: a
 * face along the pane's edge takes its letter on the side away from it.
 */
export function placeLabels(
  labels: readonly LayerPaneLabel[],
  spotsOf: (face: LayerFace) => LayerLabelSpots | null,
  textOf: (face: LayerFace) => string,
  project: (point: Point) => Point,
  frame: { readonly width: number; readonly height: number } | null = null
): LayerPlacedLabel[] {
  const rank = ({ face, keep }: LayerPaneLabel) => (keep ? 0 : 2) + (spotsOf(face)?.visible === false ? 1 : 0);
  const ordered = labels
    .map((label, order) => ({ label, order, rank: rank(label) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ label }) => label);
  const placed: LayerPlacedLabel[] = [];
  const clear = (box: Box) =>
    placed.every(
      (other) =>
        Math.abs(other.x - box.x) > (other.width + box.width) / 2 + LABEL_GAP_PX ||
        Math.abs(other.y - box.y) > (other.height + box.height) / 2 + LABEL_GAP_PX
    );
  for (const { face, tone, keep } of ordered) {
    const spots = spotsOf(face);
    const text = textOf(face);
    if (!spots || text === '') continue;
    const under = !spots.visible;
    const size = labelSize(text, under, tone === 'danger');
    const box = (at: Point): Box => ({ x: at.x, y: at.y, ...size });
    const inside = spots.spots
      .map(({ at, region }) => ({ at: project(at), region: region.map(project) }))
      .filter(({ at, region }) => chipFits(at, size, region, LABEL_EDGE_ROOM_PX))
      .map(({ at }) => at);
    let at = inside.find((p) => clear(box(p))) ?? null;
    let off = false;
    if (!at && keep) {
      // Beside the face on screen, clear of the rest; else inside it over another letter; else beside it whatever it covers.
      const around = besideSpots(spots.outline.map(project), size);
      const onScreen = frame ? around.filter((p) => chipInFrame(p, size, frame)) : around;
      const besideClear = onScreen.find((p) => clear(box(p)));
      at = besideClear ?? inside[0] ?? onScreen[0] ?? around[0] ?? null;
      off = at !== null && (besideClear !== undefined || inside.length === 0);
    }
    if (!at) continue;
    placed.push({ face, text, tone, under, off, x: at.x, y: at.y, ...size });
  }
  return placed.reverse();
}
