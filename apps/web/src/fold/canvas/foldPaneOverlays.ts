/**
 * What the Fold canvas draws over the paper of each pane, beside the painted
 * scene: the references picked so far, the one under the pointer, the line a
 * free fold is being drawn along, and the Divide-line marks — on the
 * renderer's overlay channels (points on top of everything, strokes on the
 * preview channel), in the pane's own frame.
 *
 * These are the tool's feedback, not the paper, so they take theme accents
 * rather than the paper style's pens: the pick accent for what is picked and
 * hovered, as References and Edit mark theirs.
 *
 * Pure: the colours are handed in, resolved by the pane.
 */
import type { Point } from '../../lib/geometry';
import type { FillGeometry, PointGeometry, Rgba, StrokeGeometry } from '../../cp-workspace/renderer/types';
import type { FoldMark, FoldModelLine } from '../document/foldSequenceDocument';
import { markPoints } from '../document/foldSequenceDocument';
import { sheetToScene, type FoldHit, type FoldPaneId, type FoldPick, type FoldPickIndex } from './foldPicking';
import type { FoldScene } from '../engine/foldEngineWire';
import { clipConvex, toPoint } from './foldCanvasGeometry';

export interface FoldOverlayInks {
  /** The pick accent: what is picked and what a click would take. */
  accent: Rgba;
  /** A mark's dot. */
  mark: Rgba;
  /** What a dot is outlined in against the paper. */
  outline: Rgba;
}

/** CSS px: a picked point's dot, the ring round the one under the pointer, a mark's dot. */
const PICKED_RADIUS = 4.5;
const HOVER_RADIUS = 8;
const MARK_RADIUS = 3;
const HOVER_FILL_ALPHA = 0.28;
/** A picked or hovered line, as a multiple of the frame's stroke width: over the crease, wider than it. */
const LINE_WIDTH_MUL = 2.6;
const HOVER_LINE_ALPHA = 0.5;

interface Dot {
  at: Point;
  radius: number;
  fill: Rgba;
  stroke: Rgba;
}

interface Stroke {
  a: Point;
  b: Point;
  color: Rgba;
  widthMul: number;
}

function packDots(dots: readonly Dot[]): PointGeometry | null {
  if (dots.length === 0) return null;
  const count = dots.length;
  const center = new Float32Array(count * 2);
  const radius = new Float32Array(count);
  const screenSpace = new Float32Array(count).fill(1);
  const fill = new Float32Array(count * 4);
  const stroke = new Float32Array(count * 4);
  dots.forEach((dot, k) => {
    center[k * 2] = dot.at.x;
    center[k * 2 + 1] = dot.at.y;
    radius[k] = dot.radius;
    fill.set(dot.fill, k * 4);
    stroke.set(dot.stroke, k * 4);
  });
  return { center, radius, screenSpace, fill, stroke, count };
}

function packStrokes(strokes: readonly Stroke[]): StrokeGeometry | null {
  if (strokes.length === 0) return null;
  const count = strokes.length;
  const a = new Float32Array(count * 2);
  const b = new Float32Array(count * 2);
  const color = new Float32Array(count * 4);
  const widthMul = new Float32Array(count);
  strokes.forEach((stroke, k) => {
    a.set([stroke.a.x, stroke.a.y], k * 2);
    b.set([stroke.b.x, stroke.b.y], k * 2);
    color.set(stroke.color, k * 4);
    widthMul[k] = stroke.widthMul;
  });
  return { a, b, color, widthMul, dashSlot: new Float32Array(count), count };
}

const withAlpha = ([r, g, b, a]: Rgba, alpha: number): Rgba => [r, g, b, a * alpha];

/** Where a pick is drawn on a pane: the scene frame on the folded pane, the sheet on the other. */
function pickOnPane(pick: FoldPick, pane: FoldPaneId): Point | readonly [Point, Point] | null {
  switch (pick.kind) {
    case 'point':
      return pane === 'folded' ? pick.scene : toPoint(pick.sheet);
    case 'segment':
      return pane === 'folded' ? pick.scene : [toPoint(pick.sheet[0]), toPoint(pick.sheet[1])];
    case 'free':
      // A free line's end is a point of the folded form; the crease pattern has no place for it.
      return pane === 'folded' ? pick.scene : null;
  }
}

export interface FoldPaneOverlay {
  points: PointGeometry | null;
  strokes: StrokeGeometry | null;
}

/** How strongly the moving set is tinted, and the flap under the pointer over that. */
const MOVING_TINT = 0.3;
const HOVERED_TINT = 0.5;

/**
 * The paper a located fold moves, tinted in the theme's accent over the
 * folded pane (plan D11: "a theme accent drawn over the paper, never a paper
 * colour"): every cell of the scene with a moving face in its stack, cut to
 * the moving side of the line — the engine's moving faces are the parent's,
 * and the line cuts them, so a whole-face tint would light paper that stays.
 * The flap under the pointer in the layer picker is lit again over that.
 * Fills in the pane's frame, for the overlay fill channel; null when nothing
 * is located.
 */
export function foldMovingTint(
  index: FoldPickIndex,
  moving: { line: FoldModelLine; sign: 1 | -1; faces: readonly number[]; hovered: readonly number[] } | null,
  accent: Rgba
): FillGeometry | null {
  if (!moving || moving.faces.length === 0) return null;
  const at = new Map(index.scene.lineage.map((face, k) => [face.id, k]));
  const toIndices = (ids: readonly number[]) =>
    new Set(ids.flatMap((id) => {
      const k = at.get(id);
      return k === undefined ? [] : [k];
    }));
  const faces = toIndices(moving.faces);
  const hovered = toIndices(moving.hovered);
  const triangles: number[] = [];
  const colors: number[] = [];
  const add = (stackHas: (face: number) => boolean, alpha: number) => {
    const color = [accent[0], accent[1], accent[2], accent[3] * alpha];
    for (const cell of index.subfaces) {
      if (!cell.stack.some(stackHas)) continue;
      const piece = clipConvex(cell.polygon, moving.line, moving.sign);
      for (let k = 1; k + 1 < piece.length; k += 1) {
        for (const corner of [piece[0]!, piece[k]!, piece[k + 1]!]) {
          triangles.push(corner.x, corner.y);
          colors.push(...color);
        }
      }
    }
  };
  add((face) => faces.has(face), MOVING_TINT);
  if (hovered.size > 0) add((face) => hovered.has(face), HOVERED_TINT);
  if (triangles.length === 0) return null;
  return { position: new Float32Array(triangles), color: new Float32Array(colors), count: triangles.length / 2 };
}

export interface FoldPaneOverlayInput {
  pane: FoldPaneId;
  scene: FoldScene | null;
  picks: readonly FoldPick[];
  hovered: FoldHit | null;
  /** While a free line is being drawn: its first end, which the live line runs from to the pointer. */
  freeFrom: Point | null;
  marks: readonly FoldMark[];
  inks: FoldOverlayInks;
}

/** The overlay for one pane. */
export function foldPaneOverlay(input: FoldPaneOverlayInput): FoldPaneOverlay {
  const { pane, inks } = input;
  const dots: Dot[] = [];
  const strokes: Stroke[] = [];

  // The marks, under the picks: each point a mark makes, where the pane shows it.
  for (const mark of input.marks) {
    for (const point of markPoints(mark)) {
      const at = pane === 'folded' ? (input.scene ? sheetToScene(input.scene, point) : null) : toPoint(point);
      if (at) dots.push({ at, radius: MARK_RADIUS, fill: inks.mark, stroke: inks.outline });
    }
  }

  const draw = (pick: FoldPick, hover: boolean) => {
    const at = pickOnPane(pick, pane);
    if (!at) return;
    if ('x' in at) {
      dots.push(
        hover
          ? { at, radius: HOVER_RADIUS, fill: withAlpha(inks.accent, HOVER_FILL_ALPHA), stroke: inks.accent }
          : { at, radius: PICKED_RADIUS, fill: inks.accent, stroke: inks.outline }
      );
    } else {
      strokes.push({
        a: at[0],
        b: at[1],
        color: hover ? withAlpha(inks.accent, HOVER_LINE_ALPHA) : inks.accent,
        widthMul: LINE_WIDTH_MUL,
      });
    }
  };
  for (const pick of input.picks) draw(pick, false);

  const hovered = input.hovered;
  if (hovered?.pick) draw(hovered.pick, true);
  // The line a free fold is being drawn along, from its first end to the pointer.
  if (input.freeFrom && hovered?.pane === pane && pane === 'folded') {
    strokes.push({ a: input.freeFrom, b: hovered.at, color: withAlpha(inks.accent, HOVER_LINE_ALPHA), widthMul: 1 });
  }
  return { points: packDots(dots), strokes: packStrokes(strokes) };
}
