/**
 * What Repeat draws over the canvas beside the paper (plan
 * `fold-sequence-tools`):
 *
 * - **the creases the repeat adds**, on the folded pane its preview shows:
 *   each in the diagram-crease pen of its letter as the viewer sees it, as
 *   every tool draws the fold it previews (`withPreviewCreases`). The crease
 *   pattern draws them as every previewed step's instruction already
 *   (`FoldLandedPreview.added`), so they are the folded pane's alone here;
 * - **a line drawn that is no symmetry axis**, while its refusal is shown:
 *   across the paper of the pane it was drawn on, fainter than a pick, in the
 *   theme's accent — tool feedback, never a crease's pen.
 *
 * Pure.
 */
import type { Point } from '../../lib/geometry';
import { chordOfConvex, pointOnLine, sceneLineOf, toPoint } from '../canvas/foldCanvasGeometry';
import type { FoldOverlayInks, FoldOverlayMarks, FoldOverlayStroke } from '../canvas/foldPaneOverlays';
import type { FoldPaneCreaseLine, FoldPendingCreases } from '../canvas/foldPaneScenes';
import { sheetFaceAt, sheetToScene, type FoldPickIndex } from '../canvas/foldPicking';
import type { FoldModelLine, SheetPoint } from '../document/foldSequenceDocument';
import type { FoldLetter, FoldScene } from '../engine/foldEngineWire';
import { lineAcrossPaper } from '../tools/foldStepBuilder';
import type { RepeatDrawnLine } from './repeatRange';

const OTHER: Readonly<Record<FoldLetter, FoldLetter>> = { mountain: 'valley', valley: 'mountain' };

/** Whether the paper at a sheet point shows its front, in a scene; null off its paper. */
function frontUpAt(scene: FoldScene, at: SheetPoint): boolean | null {
  const face = sheetFaceAt(scene, at);
  const transform = face === null ? undefined : scene.face_transforms[face];
  return transform ? transform[0] * transform[4] - transform[1] * transform[3] > 0 : null;
}

/**
 * The creases a previewed repeat adds (`added`, the landed state's own),
 * where its folded form puts them: each placed through the face its sheet
 * point lies on, and lettered as the folder sees the fold made — as the
 * step on screen (`before`) shows the paper there, its stored letter where
 * the front is up and the other where the back is, as a pending fold's line
 * is lettered on the paper it folds. A crease the folded form puts on a
 * folded edge lies on both the paper that stayed and the paper that turned
 * over; the step before tells them apart. Where it has no paper (or is not
 * in), as the result shows it.
 */
export function repeatPreviewCreases(scene: FoldScene, added: ReadonlySet<number>, before: FoldScene | null): FoldPendingCreases {
  const folded: FoldPaneCreaseLine[] = [];
  for (const crease of scene.creases) {
    if (!added.has(crease.id) || !crease.letter) continue;
    const from: SheetPoint = [crease.from.x, crease.from.y];
    const to: SheetPoint = [crease.to.x, crease.to.y];
    const a = sheetToScene(scene, from);
    const b = sheetToScene(scene, to);
    const middle: SheetPoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    const frontUp = (before ? frontUpAt(before, middle) : null) ?? frontUpAt(scene, middle);
    if (!a || !b || frontUp === null) continue;
    folded.push({ line: [a, b], letter: frontUp ? crease.letter : OTHER[crease.letter] });
  }
  return { folded, creasePattern: [] };
}

/** A drawn line that is no axis: a pick's accent, fainter, and a little narrower. */
const DRAWN = { widthMul: 1.6, alpha: 0.55 };

const withAlpha = ([r, g, b, a]: FoldOverlayInks['accent'], alpha: number): FoldOverlayInks['accent'] => [r, g, b, a * alpha];

/** A line's stretch across a convex outline, or null when it misses it. */
function across(outline: readonly Point[], line: FoldModelLine): [Point, Point] | null {
  const chord = chordOfConvex(outline, line);
  return chord ? [pointOnLine(line, chord[0]), pointOnLine(line, chord[1])] : null;
}

export interface FoldRepeatDrawnOverlay {
  folded: FoldOverlayMarks;
  creasePattern: FoldOverlayMarks;
}

/**
 * A refused drawn line on the pane it was drawn on: across the paper the
 * folded pane shows (`index`), or across the sheet (`sheet`).
 */
export function repeatDrawnOverlay(
  index: FoldPickIndex | null,
  sheet: readonly SheetPoint[] | null,
  drawn: RepeatDrawnLine,
  inks: FoldOverlayInks
): FoldRepeatDrawnOverlay {
  const stroke = (ends: [Point, Point] | null): FoldOverlayStroke[] =>
    ends ? [{ a: ends[0], b: ends[1], color: withAlpha(inks.accent, DRAWN.alpha), widthMul: DRAWN.widthMul }] : [];
  const outline = (sheet ?? []).map(toPoint);
  const folded =
    drawn.frame === 'model' && index ? stroke(lineAcrossPaper(index, sceneLineOf(index.scene.view_transform, drawn.line))) : [];
  const creasePattern = drawn.frame === 'sheet' && outline.length > 2 ? stroke(across(outline, drawn.line)) : [];
  return { folded: { dots: [], strokes: folded }, creasePattern: { dots: [], strokes: creasePattern } };
}
