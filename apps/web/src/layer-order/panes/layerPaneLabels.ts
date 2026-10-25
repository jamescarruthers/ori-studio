/**
 * The letters on the Layer order dialog's panes: which faces carry one, how
 * it reads, and where it sits (`implementation-plans/layer-order-dialog.md`,
 * row U8; D7; Round3:1301-1380, `Round4-States`' label cap).
 *
 * **Which faces.** The subject, the objects picked, a pressed or hovered
 * row's faces and a clash's faces always do. While objects are being chosen,
 * so do the faces a pick can take, up to the cap (D7): with more of them
 * than {@link LAYER_ORDER_LABEL_CAP}, the face pointed at and the nearest
 * that many to it keep their letters, measured on the crease pattern, or the
 * nearest to the subject while nothing is pointed at. Every one of them stays
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
 * **Where.** On the crease pattern, inside the face, at its centroid when
 * that is inside. On the folded paper, on a part of the face that shows: the
 * middle of its largest spot on top, or the next largest where another
 * letter already sits; a hidden face's at its middle, or over one of its
 * spots. Letters are placed in pixels, at a size that holds on screen, so
 * {@link placeLabels} runs per frame of the camera; what it reads per face is
 * worked out once per order ({@link foldedLabelSpots}).
 *
 * **Only legible letters.** The cap counts faces, not room: on iguana-c0 at
 * fit, the fifty nearest faces lie within a few millimetres of each other on
 * screen, and their chips piled into one grey block no letter could be read
 * from. So a letter that must show ({@link LayerPaneLabel.keep}: a pick's, a
 * clash's, the face pointed at) is placed whatever it covers, and any other
 * that finds no clear spot is left out, its face still tinted; zooming in
 * makes room, and more of the cap's letters show.
 *
 * Pure: no React, no store, no engine.
 */
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { Point } from '../../lib/geometry';
import type { LayerFace } from '../engine/faceIndex';
import { LAYER_ORDER_LABEL_CAP } from '../layerOrderBudgets';
import { ringArea, ringInterior } from './layerPaneFigure';
import type { LayerFaceMarks } from './layerPaneMarks';

/** How a face's letter reads. */
export type LayerLabelTone = 'pick' | 'danger' | 'plain';

export interface LayerPaneLabel {
  readonly face: LayerFace;
  readonly tone: LayerLabelTone;
  /** It shows whatever it covers: a pick's, a clash's, the face pointed at. Any other needs a clear spot. */
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

/** Where a face's letter may sit, in the pane's frame, best first. */
export interface LayerLabelSpots {
  /** Some part of the face shows: the spots are its parts on top. */
  readonly visible: boolean;
  readonly at: readonly Point[];
}

/** The most spots a shown face's letter tries, and a hidden one's beside its middle. */
const VISIBLE_TRIES = 8;
const HIDDEN_TRIES = 6;

/**
 * Where each of `faces` may carry its letter on the folded paper of `scene`
 * (the side shown, stacked in the order on screen): its spots on top,
 * largest first; for a face nothing shows of, its outline's middle, then its
 * largest spots.
 */
export function foldedLabelSpots(
  scene: OristudioCpFoldedPaperScene,
  faces: Iterable<LayerFace>
): Map<LayerFace, LayerLabelSpots> {
  const wanted = new Set(faces);
  const onTop = new Map<LayerFace, { area: number; at: Point }[]>();
  const under = new Map<LayerFace, { area: number; at: Point }[]>();
  scene.subfaces.forEach((subface) => {
    const holds = subface.faces_top_to_bottom.filter((face) => wanted.has(face));
    if (holds.length === 0) return;
    const at = ringInterior(subface.polygon);
    if (!at) return;
    const spot = { area: ringArea(subface.polygon), at };
    for (const face of holds) {
      const into = subface.faces_top_to_bottom[0] === face ? onTop : under;
      const list = into.get(face);
      if (list) list.push(spot);
      else into.set(face, [spot]);
    }
  });
  const largest = (spots: { area: number; at: Point }[] | undefined, count: number) =>
    (spots ?? [])
      .slice()
      .sort((a, b) => b.area - a.area)
      .slice(0, count)
      .map((spot) => spot.at);
  const out = new Map<LayerFace, LayerLabelSpots>();
  for (const face of wanted) {
    const shown = onTop.get(face);
    if (shown && shown.length > 0) {
      out.set(face, { visible: true, at: largest(shown, VISIBLE_TRIES) });
      continue;
    }
    const outline = scene.faces[face]?.outline ?? [];
    const middle = ringInterior(outline);
    out.set(face, { visible: false, at: [...(middle ? [middle] : []), ...largest(under.get(face), HIDDEN_TRIES)] });
  }
  return out;
}

/** A letter placed on a pane, CSS px of the canvas box: its centre and its box. */
export interface LayerPlacedLabel {
  readonly face: LayerFace;
  readonly text: string;
  readonly tone: LayerLabelTone;
  /** Nothing of the face shows: the quieter chip. */
  readonly under: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The space kept between two letters, CSS px. */
const LABEL_GAP_PX = 2;

/**
 * `labels` placed in the pane's pixels, in their order: each at the first of
 * its spots (through `project`) whose box clears every letter placed before
 * it; with none clear, a letter that must show at its first spot, and any
 * other left out. The earliest come out on top, so they go last in the
 * answer, which is the order to draw them in.
 */
export function placeLabels(
  labels: readonly LayerPaneLabel[],
  spotsOf: (face: LayerFace) => LayerLabelSpots | null,
  textOf: (face: LayerFace) => string,
  project: (point: Point) => Point
): LayerPlacedLabel[] {
  const placed: LayerPlacedLabel[] = [];
  for (const { face, tone, keep } of labels) {
    const spots = spotsOf(face);
    const text = textOf(face);
    if (!spots || spots.at.length === 0 || text === '') continue;
    const under = !spots.visible;
    const size = labelSize(text, under, tone === 'danger');
    const clear = (x: number, y: number) =>
      placed.every(
        (other) =>
          Math.abs(other.x - x) > (other.width + size.width) / 2 + LABEL_GAP_PX ||
          Math.abs(other.y - y) > (other.height + size.height) / 2 + LABEL_GAP_PX
      );
    const candidates = spots.at.map(project);
    const at = candidates.find((p) => clear(p.x, p.y)) ?? (keep ? candidates[0]! : null);
    if (!at) continue;
    placed.push({ face, text, tone, under, x: at.x, y: at.y, ...size });
  }
  return placed.reverse();
}
