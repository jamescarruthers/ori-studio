/**
 * The crease-pattern pane's instruction — the step's own fold lines, or a
 * previewed fold's — in the paper style's diagram-crease pens: the
 * "Mountain diagram creases" and "Valley diagram creases" of Settings ▸
 * Paper, as the sequence's style holds them. The folded pane draws a located
 * fold's line in the same pens (`withPreviewCreases`), so a step's fold reads
 * the same on both panes, and as a diagram draws it.
 *
 * Over a canvas, as References' view draws a step's fold over its pattern:
 *
 * - **Width** is the pen's, never thinner than the view's floor for an
 *   instruction at the reader's line width (`withReferencesViewFloors`), so a
 *   print pen of 0.75 pt still stands out of the creases it is drawn among.
 * - **Dash** is the pen's, in multiples of its width, continuous along a
 *   crease split at every crossing (`dashRulerAlong`); a round cap's reach is
 *   folded into the runs, since the stroke program draws butt ends
 *   (`canvasDashRuns`).
 * - **Colour** is the pen's wherever it reads on the canvas's ground, and
 *   otherwise black or white (`referencesGroundInk`): the pane draws no paper
 *   under the pattern, and the Diagram style's ink is near black.
 *
 * Pure: no React, no store, no DOM.
 */
import { parseCssColor } from '../../cp-workspace/renderer/cssColor';
import type { Rgba, StrokeGeometry } from '../../cp-workspace/renderer/types';
import { PT_TO_CSS_PX, type Pen, type PaperStyle } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES, surfacePaperStyle } from '../../lib/paper/paperStyleResolve';
import {
  canvasDashRuns,
  canvasDiagramInk,
  canvasDiagramPens,
  withReferencesViewFloors,
  type DiagramStrokeInk,
} from '../../lib/stepDiagram/diagramInk';
import { dashRulerAlong } from '../../lib/stepDiagram/stepDiagramGeometry';
import { referencesGroundInk } from '../../themes/referencesInk';
import type { FoldLetter } from '../engine/foldEngineWire';
import type { FoldInstructionLine } from './foldCreasePatternLines';

/** One letter's pen on the canvas: its weight and dash in ink, and the colour it draws in there. */
export interface FoldInstructionPen {
  ink: DiagramStrokeInk;
  color: Rgba;
}

/** The instruction's pens, by letter, and how many CSS px an ink is. */
export interface FoldInstructionPens {
  mountain: FoldInstructionPen;
  valley: FoldInstructionPen;
  inkCss: number;
}

const FALLBACK: Rgba = [0, 0, 0, 1];

/**
 * The diagram-crease pens of `style` (through the Fold policy) as the pane
 * draws them at the reader's `lineWidth`, on `ground` (a CSS colour).
 */
export function foldInstructionPens(style: PaperStyle, lineWidth: number, ground: string): FoldInstructionPens {
  const seen = surfacePaperStyle(style, PAPER_STYLE_POLICIES.fold);
  const css = (pen: Pen) => ({ pen, css: pen.width * PT_TO_CSS_PX });
  const pens = withReferencesViewFloors(
    canvasDiagramPens(lineWidth, seen.arrows.width * PT_TO_CSS_PX, css(seen.auxCreases.pen), {
      edge: css(seen.edges),
      mountainFolds: css(seen.mountainFolds),
      valleyFolds: css(seen.valleyFolds),
      mountainDiagramCreases: css(seen.mountainDiagramCreases),
      valleyDiagramCreases: css(seen.valleyDiagramCreases),
    })
  );
  const inked = (pen: Pen) => parseCssColor(referencesGroundInk(pen.color, ground)) ?? FALLBACK;
  return {
    mountain: { ink: pens.mountain, color: inked(seen.mountainDiagramCreases) },
    valley: { ink: pens.valley, color: inked(seen.valleyDiagramCreases) },
    inkCss: canvasDiagramInk(lineWidth),
  };
}

/** Each letter's dash slot: valley 1, mountain 2; 0, solid, for a pen with no dash. */
const SLOT: Readonly<Record<FoldLetter, number>> = { valley: 1, mountain: 2 };

/**
 * The instruction's strokes for the preview channel, whose base width is
 * `widthCss` (the pane's crease width): each line in its letter's pen. Null
 * for no lines.
 */
export function foldInstructionStrokes(
  lines: readonly FoldInstructionLine[],
  pens: FoldInstructionPens,
  widthCss: number
): StrokeGeometry | null {
  const count = lines.length;
  if (count === 0) return null;
  const a = new Float32Array(count * 2);
  const b = new Float32Array(count * 2);
  const color = new Float32Array(count * 4);
  const widthMul = new Float32Array(count);
  const dashSlot = new Float32Array(count);
  const dashPhase = new Float32Array(count);
  const runs = {
    valley: canvasDashRuns(pens.valley.ink, pens.inkCss),
    mountain: canvasDashRuns(pens.mountain.ink, pens.inkCss),
  };
  const rulers = lines.map((line) => dashRulerAlong(line.a.x, line.a.y, line.b.x, line.b.y));
  // A crease's pieces dash as one line: measured from where its first piece
  // starts, found by the axis they share.
  const keyOf = (index: number): string | null => {
    const r = rulers[index]!;
    const length = Math.hypot(r.bx - r.ax, r.by - r.ay);
    if (length === 0) return null;
    const ux = (r.bx - r.ax) / length;
    const uy = (r.by - r.ay) / length;
    return `${ux.toFixed(6)},${uy.toFixed(6)},${(r.ax * -uy + r.ay * ux).toFixed(4)}`;
  };
  const starts = new Map<string, number>();
  rulers.forEach((ruler, index) => {
    const key = keyOf(index);
    if (key === null) return;
    const start = starts.get(key);
    if (start === undefined || ruler.phase < start) starts.set(key, ruler.phase);
  });
  lines.forEach((line, index) => {
    const ruler = rulers[index]!;
    const pen = pens[line.letter];
    a[index * 2] = ruler.ax;
    a[index * 2 + 1] = ruler.ay;
    b[index * 2] = ruler.bx;
    b[index * 2 + 1] = ruler.by;
    color.set(pen.color, index * 4);
    widthMul[index] = (pen.ink.width * pens.inkCss) / Math.max(widthCss, Number.EPSILON);
    dashSlot[index] = runs[line.letter].length > 0 ? SLOT[line.letter] : 0;
    const key = keyOf(index);
    dashPhase[index] = ruler.phase - (key === null ? 0 : (starts.get(key) ?? 0));
  });
  return { a, b, color, widthMul, count, dashPatterns: [runs.valley, runs.mountain], dashSlot, dashPhase };
}
