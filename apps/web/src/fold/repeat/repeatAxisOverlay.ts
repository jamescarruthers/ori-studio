/**
 * Repeat's axes on the panes while its axis is chosen or drawn (plan
 * `fold-sequence-tools`): every verified axis of the range's starting state
 * lit across the paper, so the folder sees what a drawn line may be; the one
 * taken in the pick accent; and a line drawn that is none of them, fainter,
 * while its refusal is shown. On the folded pane in the scene's frame (an
 * axis's `display` line), on the crease pattern on the sheet (its `sheet`
 * line). Tool feedback in the theme's accent, never a crease's pen.
 *
 * Pure.
 */
import type { Point } from '../../lib/geometry';
import { chordOfConvex, pointOnLine, toPoint } from '../canvas/foldCanvasGeometry';
import type { FoldOverlayInks, FoldOverlayMarks, FoldOverlayStroke } from '../canvas/foldPaneOverlays';
import type { FoldPickIndex } from '../canvas/foldPicking';
import type { FoldModelLine, SheetPoint } from '../document/foldSequenceDocument';
import { lineAcrossPaper } from '../tools/foldStepBuilder';
import type { FoldRepeatMarks } from './useFoldRepeatTool';

/** An axis offered, and the one taken, as multiples of the frame's stroke width, and how bright. */
const OFFERED = { widthMul: 1.4, alpha: 0.4 };
const TAKEN = { widthMul: 2.1, alpha: 1 };
const DRAWN = { widthMul: 1.6, alpha: 0.55 };

const withAlpha = ([r, g, b, a]: FoldOverlayInks['accent'], alpha: number): FoldOverlayInks['accent'] => [r, g, b, a * alpha];

/** A line's stretch across a convex outline, or null when it misses it. */
function across(outline: readonly Point[], line: FoldModelLine): [Point, Point] | null {
  const chord = chordOfConvex(outline, line);
  return chord ? [pointOnLine(line, chord[0]), pointOnLine(line, chord[1])] : null;
}

export interface FoldRepeatAxisOverlay {
  folded: FoldOverlayMarks;
  creasePattern: FoldOverlayMarks;
}

export function repeatAxisOverlay(
  index: FoldPickIndex | null,
  sheet: readonly SheetPoint[] | null,
  marks: FoldRepeatMarks,
  inks: FoldOverlayInks
): FoldRepeatAxisOverlay {
  const outline = (sheet ?? []).map(toPoint);
  const folded: FoldOverlayStroke[] = [];
  const creasePattern: FoldOverlayStroke[] = [];
  const add = (strokes: FoldOverlayStroke[], ends: [Point, Point] | null, look: { widthMul: number; alpha: number }) => {
    if (ends) strokes.push({ a: ends[0], b: ends[1], color: withAlpha(inks.accent, look.alpha), widthMul: look.widthMul });
  };
  // The ones offered first, so the one taken is drawn over them.
  const order = marks.axes.map((_, k) => k).sort((a, b) => Number(a === marks.axis) - Number(b === marks.axis));
  for (const k of order) {
    const axis = marks.axes[k]!;
    const look = k === marks.axis ? TAKEN : OFFERED;
    add(folded, index ? lineAcrossPaper(index, axis.display) : null, look);
    add(creasePattern, outline.length > 2 ? across(outline, axis.sheet) : null, look);
  }
  const drawn = marks.drawn;
  if (drawn) {
    if (drawn.frame === 'scene') add(folded, index ? lineAcrossPaper(index, drawn.line) : null, DRAWN);
    else add(creasePattern, outline.length > 2 ? across(outline, drawn.line) : null, DRAWN);
  }
  return { folded: { dots: [], strokes: folded }, creasePattern: { dots: [], strokes: creasePattern } };
}
