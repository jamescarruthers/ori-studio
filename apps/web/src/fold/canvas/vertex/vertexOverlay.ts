/**
 * What a vertex tool draws over the folded pane while it previews (plan
 * D14): the creases its fold would make and the choices it offers, from the
 * engine's description, in the theme's pick accent — the tool's feedback,
 * never the paper's pens, since which of these creases is a mountain and
 * which a valley is the landed state's to say (the crease-pattern pane draws
 * it).
 *
 * - **Squash**: its vertex, each layer's crease, the spine as it lies
 *   (faint), and where it lands (bold): the hinge line until a point is
 *   clicked; where it was aimed, faint, when that cannot land.
 * - **Petal fold**: H between its ends, and the kite creases down to the
 *   open corner.
 * - **Rabbit ear, swivel**: the center, the three given rays, and the fourth
 *   crease taken (bold) — the ridge the flap rises along — among the other
 *   candidates (faint; one that does not fit fainter still).
 *
 * Each ray runs from its vertex to where it leaves the paper. Pure: the
 * colours are handed in, resolved by the pane.
 */
import type { Point } from '../../../lib/geometry';
import type { Rgba } from '../../../cp-workspace/renderer/types';
import type { FoldFanAnalysis, FoldVertexAnalysis } from '../../engine/foldEngineSquashWire';
import type { FoldModelPoint } from '../../engine/foldEngineWire';
import { alongLine, chordOfConvex, lineThrough, pointOnLine, toPoint } from '../foldCanvasGeometry';
import type { FoldOverlayDot, FoldOverlayInks, FoldOverlayMarks, FoldOverlayStroke } from '../foldPaneOverlays';
import type { FoldPickIndex } from '../foldPicking';

/** CSS px: a vertex's dot. */
const VERTEX_RADIUS = 4;
/** Stroke widths, as multiples of the frame's: a crease, the choice taken. */
const CREASE_WIDTH = 1.6;
const CHOSEN_WIDTH = 2.6;
/** How faint what is not taken is drawn: the spine as it lies, a candidate not taken, one that does not fit. */
const FAINT = 0.4;
const UNFIT = 0.18;
/** How far a ray runs, in model units, when it starts on the paper's edge and the paper gives it no length. */
const EDGE_RAY = 0.2;

const withAlpha = ([r, g, b, a]: Rgba, alpha: number): Rgba => [r, g, b, a * alpha];

/** What the vertex overlay reads: the description, and the choices taken of what it lists. */
export interface FoldVertexOverlayInput {
  analysis: FoldVertexAnalysis;
  /** A fan's fourth crease taken, by index into its candidates; null for none. */
  emergent: number | null;
  /** Per candidate, whether it fits; empty when unknown. */
  emergents: readonly boolean[];
  /**
   * Where a squash's spine was aimed, as a model-frame direction from its
   * vertex, when that fold was refused and the analysis drawn is the hinge
   * line's: drawn faint, so the folder sees where they aimed. Null otherwise.
   */
  aimed?: FoldModelPoint | null;
}

function rotate([x, y]: FoldModelPoint, angle: number): FoldModelPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x - s * y, s * x + c * y];
}

/**
 * Where a ray from a point of the folded form leaves the paper: walked from
 * cell to cell of the scene as far as they carry it on. A ray along the
 * paper's edge, which no cell's inside meets, runs a fixed short way.
 */
export function rayOnPaper(index: FoldPickIndex, from: Point, toward: Point): Point {
  const line = lineThrough(from, toward);
  if (!line) return from;
  const start = alongLine(line, from);
  // Toward `toward`, whichever way the line's own direction runs.
  const sign = alongLine(line, toward) >= start ? 1 : -1;
  let reach = 0;
  for (let grown = true; grown; ) {
    grown = false;
    for (const cell of index.subfaces) {
      const chord = chordOfConvex(cell.polygon, line);
      if (!chord) continue;
      const [lo, hi] = sign > 0 ? [chord[0] - start, chord[1] - start] : [start - chord[1], start - chord[0]];
      if (lo <= reach + 1e-9 && hi > reach + 1e-9) {
        reach = hi;
        grown = true;
      }
    }
  }
  return pointOnLine(line, start + sign * (reach > 1e-9 ? reach : EDGE_RAY));
}

/** A ray from a model point along a model direction, to the paper's edge, in the scene frame. */
function ray(index: FoldPickIndex, from: FoldModelPoint, direction: FoldModelPoint): [Point, Point] {
  const a = index.toScene(toPoint(from));
  const b = index.toScene({ x: from[0] + direction[0], y: from[1] + direction[1] });
  return [a, rayOnPaper(index, a, b)];
}

function fanStrokes(
  index: FoldPickIndex,
  analysis: FoldFanAnalysis,
  input: FoldVertexOverlayInput,
  accent: Rgba
): FoldOverlayStroke[] {
  const strokes: FoldOverlayStroke[] = [];
  const stroke = ([a, b]: [Point, Point], color: Rgba, widthMul: number) => strokes.push({ a, b, color, widthMul });
  for (const given of analysis.given) stroke(ray(index, analysis.center, given), accent, CREASE_WIDTH);
  analysis.candidates.forEach((candidate, k) => {
    const taken = k === input.emergent;
    const fits = input.emergents[k] ?? true;
    const color = taken ? accent : withAlpha(accent, fits ? FAINT : UNFIT);
    stroke(ray(index, analysis.center, candidate), color, taken ? CHOSEN_WIDTH : CREASE_WIDTH);
  });
  return strokes;
}

/** The vertex tool's marks over the folded pane (see the module docs). */
export function vertexOverlayMarks(
  index: FoldPickIndex,
  input: FoldVertexOverlayInput,
  inks: Pick<FoldOverlayInks, 'accent' | 'outline'>
): FoldOverlayMarks {
  const { analysis } = input;
  const { accent, outline } = inks;
  const dots: FoldOverlayDot[] = [];
  const strokes: FoldOverlayStroke[] = [];
  const dot = (p: FoldModelPoint) =>
    dots.push({ at: index.toScene(toPoint(p)), radius: VERTEX_RADIUS, fill: accent, stroke: outline });
  const segment = (a: FoldModelPoint, b: FoldModelPoint, widthMul: number) =>
    strokes.push({ a: index.toScene(toPoint(a)), b: index.toScene(toPoint(b)), color: accent, widthMul });
  switch (analysis.kind) {
    case 'squash': {
      const { vertex, hinge_direction: hinge, wedge, share } = analysis;
      const along = (direction: FoldModelPoint, color: Rgba, widthMul: number) => {
        const [a, b] = ray(index, vertex, direction);
        strokes.push({ a, b, color, widthMul });
      };
      along(analysis.spine_direction, withAlpha(accent, FAINT), CREASE_WIDTH);
      // Each layer's crease, and where the spine lands, `share` of the wedge from the hinge.
      along(rotate(hinge, ((1 + share) * wedge) / 2), accent, CREASE_WIDTH);
      along(rotate(hinge, ((1 - share) * wedge) / 2), accent, CREASE_WIDTH);
      along(rotate(hinge, share * wedge), accent, CHOSEN_WIDTH);
      if (input.aimed) along(input.aimed, withAlpha(accent, FAINT), CHOSEN_WIDTH);
      dot(vertex);
      break;
    }
    case 'petal': {
      const [left, right] = analysis.ends;
      segment(left, right, CHOSEN_WIDTH);
      segment(left, analysis.corner, CREASE_WIDTH);
      segment(right, analysis.corner, CREASE_WIDTH);
      for (const p of [left, right, analysis.corner]) dot(p);
      break;
    }
    case 'rabbit-ear':
    case 'swivel':
      strokes.push(...fanStrokes(index, analysis, input, accent));
      dot(analysis.center);
      break;
  }
  return { dots, strokes };
}
