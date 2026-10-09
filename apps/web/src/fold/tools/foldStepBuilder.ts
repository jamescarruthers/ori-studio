/**
 * From what the tools picked to the step a document stores (plan D6): the op,
 * in the document's own form, and its choices — the same op the preview folds
 * and the commit appends, so the commit finds the preview's state and folds
 * nothing twice (`foldStepInputKey`).
 *
 * Everything an op stores is a sheet anchor, never a face or an index:
 *
 * - an **axiom**'s inputs are the picks' sheet points and edges, in the
 *   axiom's own slot order (`foldToolRegistry`), and the root chosen is the
 *   line it gave (`choices.root`);
 * - a **free line** is two sheet points on it, each the preimage of a point
 *   of the line inside the silhouette — found here, from the scene's
 *   subfaces and each top face's transform, since the line was clicked in the
 *   folded pane and may run off the paper at both ends;
 * - an **existing crease** is a sheet point inside its sheet segment: a fold
 *   to unfold, a precrease to refold;
 * - the **moving side**, when nothing else says it, is one sheet point whose
 *   image lies on it.
 *
 * Which side moves when nothing says: the side with less paper on it, as a
 * folder takes the smaller part to the larger — except along a fold being
 * unfolded, where the flap lies on the side with more. An equal split moves
 * the side to the right of the line as it was drawn, the book fold's half.
 * An axiom that carries a point says the side itself, and Swap turns any of
 * them round.
 *
 * Pure: no React, no store, no engine.
 */
import type { Point } from '../../lib/geometry';
import type {
  FoldChoices,
  FoldDirection,
  FoldLineInput,
  FoldLineVia,
  FoldModelLine,
  FoldOp,
  FoldSeed,
  FoldSeedScope,
  SheetPoint,
} from '../document/foldSequenceDocument';
import type { FoldAxiomCandidate, FoldEngineRefused, FoldScene } from '../engine/foldEngineWire';
import {
  applyIsometry,
  chordOfConvex,
  clipConvex,
  invertIsometry,
  lineThrough,
  pointOnLine,
  polygonArea,
  polygonCentroid,
  toPair,
  transformLine,
} from '../canvas/foldCanvasGeometry';
import { pickRef, type FoldPick, type FoldPickIndex, type FoldPointPick, type FoldSegmentPick } from '../canvas/foldPicking';
import { lineModeAxiom, type FoldKind, type FoldLineModeId } from './foldToolCatalog';
import { inSlotOrder, lineModeInput } from './foldToolRegistry';
import type { FoldToolSeed } from './foldToolState';

/** What the tools have picked, and every choice made since. */
export interface FoldStepIntent {
  kind: FoldKind;
  lineMode: FoldLineModeId;
  picks: readonly FoldPick[];
  /** The axiom root chosen; null until the engine has named the roots, or for another line mode. */
  candidate: FoldAxiomCandidate | null;
  swapped: boolean;
  seed: FoldToolSeed;
  precreaseDirection: FoldDirection;
}

/** A step ready to preview and commit, with what the canvas draws and analytics names of it. */
export interface FoldBuiltStep {
  status: 'built';
  op: FoldOp;
  choices?: FoldChoices;
  /** The fold line in the scene frame, as located (before the engine snaps it). */
  sceneLine: FoldModelLine;
  /** The side that moves, against `sceneLine`'s normal. */
  movingSign: 1 | -1;
  via: FoldLineVia;
  scope: FoldSeedScope;
}

export type FoldStepBuild =
  | FoldBuiltStep
  /** Not every click is in, or an axiom's roots are still being asked for. */
  | { status: 'unlocated' }
  /** Refused before the engine is asked: no paper lies on the side that would move. */
  | { status: 'refused'; refused: FoldEngineRefused };

/**
 * A refusal the tools can tell without the engine, under the engine's own
 * code: no paper on the side that would move, or an axiom with no root here.
 */
export function clientRefusal(code: 'no_moving_side' | 'no_root'): FoldEngineRefused {
  return { status: 'refused', refusal: { code }, fixes: [], faces: [], vertices: [] };
}

// ---------------------------------------------------------------------------
// The paper on each side of a line

interface PaperPiece {
  /** The piece of a subface on one side, in the scene frame. */
  polygon: Point[];
  area: number;
  /** The subface's top face: whose transform takes a point of the piece to the sheet. */
  top: number;
}

/** The paper on the `sign` side of a scene line: each subface clipped to it. */
function paperOn(index: FoldPickIndex, line: FoldModelLine, sign: 1 | -1): PaperPiece[] {
  const pieces: PaperPiece[] = [];
  for (const subface of index.subfaces) {
    const top = subface.stack[0];
    if (top === undefined) continue;
    const polygon = clipConvex(subface.polygon, line, sign);
    if (polygon.length < 3) continue;
    const area = polygonArea(polygon);
    if (area > 1e-12) pieces.push({ polygon, area, top });
  }
  return pieces;
}

const areaOf = (pieces: readonly PaperPiece[]) => pieces.reduce((sum, piece) => sum + piece.area, 0);

/** A sheet point under a point of the scene that lies on face `top`. */
function sheetOf(scene: FoldScene, top: number, at: Point): SheetPoint | null {
  const transform = scene.face_transforms[top];
  return transform ? toPair(applyIsometry(invertIsometry(transform), at)) : null;
}

/** A sheet point inside the largest piece of paper on the `sign` side: its image is on that side. */
export function movingPoint(index: FoldPickIndex, line: FoldModelLine, sign: 1 | -1): { sheet: SheetPoint; scene: Point } | null {
  const pieces = paperOn(index, line, sign);
  const largest = pieces.reduce<PaperPiece | null>((best, piece) => (best && best.area >= piece.area ? best : piece), null);
  if (!largest) return null;
  const scene = polygonCentroid(largest.polygon);
  const sheet = sheetOf(index.scene, largest.top, scene);
  return sheet ? { sheet, scene } : null;
}

/**
 * How unequal two sides may be and still count as an even split, as a share
 * of the paper: a line drawn by hand through the middle is never exactly
 * through it, and a book fold should not swap sides on a pixel.
 */
const EVEN_SPLIT = 0.02;

/**
 * The side that moves when nothing says: less paper, or along a fold being
 * unfolded more; an even split, the right of the line as drawn (its
 * negative side, the normal pointing left).
 */
export function defaultMovingSign(index: FoldPickIndex, line: FoldModelLine, unfolding: boolean): 1 | -1 {
  const positive = areaOf(paperOn(index, line, 1));
  const negative = areaOf(paperOn(index, line, -1));
  if (Math.abs(positive - negative) <= EVEN_SPLIT * (positive + negative)) return -1;
  const smaller: 1 | -1 = positive < negative ? 1 : -1;
  return unfolding ? (-smaller as 1 | -1) : smaller;
}

/**
 * A free line through the scene line `line`: two sheet points on it, as far
 * apart along it as the paper reaches, each just inside the stretch of a
 * subface it crosses. Null when the line misses the paper.
 */
export function freeLineThrough(index: FoldPickIndex, line: FoldModelLine): [SheetPoint, SheetPoint] | null {
  let first: { from: number; to: number; top: number } | null = null;
  let last: { from: number; to: number; top: number } | null = null;
  for (const subface of index.subfaces) {
    const top = subface.stack[0];
    if (top === undefined) continue;
    const chord = chordOfConvex(subface.polygon, line);
    if (!chord) continue;
    const [from, to] = chord;
    if (!first || from < first.from) first = { from, to, top };
    if (!last || to > last.to) last = { from, to, top };
  }
  if (!first || !last) return null;
  // A tenth in from each end: inside the subface, clear of its corners.
  const a = sheetOf(index.scene, first.top, pointOnLine(line, first.from + (first.to - first.from) * 0.1));
  const b = sheetOf(index.scene, last.top, pointOnLine(line, last.to - (last.to - last.from) * 0.1));
  return a && b ? [a, b] : null;
}

// ---------------------------------------------------------------------------
// The step

function seedOf(seed: FoldToolSeed): FoldSeed {
  switch (seed.scope) {
    case 'all':
      return { scope: 'all' };
    case 'flaps':
      return { scope: 'flaps', at: seed.flaps.map((flap) => flap.witness) };
    case 'depth':
      return { scope: 'depth', at: seed.at, layers: seed.choice };
  }
}

const isReference = (pick: FoldPick): pick is FoldPointPick | FoldSegmentPick => pick.kind !== 'free';

interface Located {
  line: FoldLineInput;
  sceneLine: FoldModelLine;
  implied: 1 | -1 | null;
  choices?: FoldChoices;
  crease?: FoldSegmentPick;
}

/**
 * The line the picks locate, where it lies in the scene, and the side it says
 * moves, if it says one; null until it is located, or a refusal when it is
 * located and cannot be stored — a free line that misses the paper has no
 * sheet point to be stored by, and moves nothing or everything.
 */
function locate(intent: FoldStepIntent, index: FoldPickIndex): Located | FoldEngineRefused | null {
  const model = lineModeInput(intent.lineMode);
  if (intent.picks.length < model.steps.length) return null;
  const axiom = lineModeAxiom(intent.lineMode);
  if (axiom !== null) {
    const slots = inSlotOrder(model, intent.picks);
    if (!slots || !slots.every(isReference) || !intent.candidate) return null;
    const { candidate } = intent;
    return {
      line: { via: 'axiom', axiom, inputs: slots.map(pickRef) },
      // The engine's line and side are the model frame's; the view turns
      // both alike, so the side is the same sign against the scene's line.
      sceneLine: transformLine(index.scene.view_transform, candidate.line),
      implied: candidate.side === null ? null : candidate.side === 'positive' ? 1 : -1,
      choices: { root: candidate.line },
    };
  }
  if (intent.lineMode === 'free') {
    const [p, q] = intent.picks;
    if (p?.kind !== 'free' || q?.kind !== 'free') return null;
    const sceneLine = lineThrough(p.scene, q.scene);
    if (!sceneLine) return null;
    const through = freeLineThrough(index, sceneLine);
    if (!through) return clientRefusal('no_moving_side');
    return { line: { via: 'free', through }, sceneLine, implied: null };
  }
  const [crease] = intent.picks;
  if (crease?.kind !== 'segment') return null;
  const sceneLine = lineThrough(crease.scene[0], crease.scene[1]);
  if (!sceneLine) return null;
  const at: SheetPoint = [(crease.sheet[0][0] + crease.sheet[1][0]) / 2, (crease.sheet[0][1] + crease.sheet[1][1]) / 2];
  return { line: { via: 'crease', at }, sceneLine, implied: null, crease };
}

/**
 * The step the intent describes, from the state `index` was made for; or why
 * there is none yet. Pure, and cheap: the canvas asks it on every change of
 * the tools.
 */
export function buildFoldStep(intent: FoldStepIntent, index: FoldPickIndex): FoldStepBuild {
  const located = locate(intent, index);
  if (!located) return { status: 'unlocated' };
  if ('status' in located) return { status: 'refused', refused: located };
  const { line, sceneLine, implied, choices, crease } = located;
  const unfolding = crease?.segment === 'bend' && intent.kind !== 'precrease';
  const base = implied ?? defaultMovingSign(index, sceneLine, unfolding);
  const movingSign: 1 | -1 = intent.swapped ? (-base as 1 | -1) : base;

  // What moves. Unfolding takes the top flap on the moving side unless the
  // folder said otherwise (plan D3): the stack there, one layer deep.
  let seed = intent.seed;
  let moving: SheetPoint | undefined;
  if (seed.scope === 'all') {
    const needsPoint = implied === null || intent.swapped || unfolding;
    if (needsPoint) {
      const point = movingPoint(index, sceneLine, movingSign);
      if (!point) return { status: 'refused', refused: clientRefusal('no_moving_side') };
      if (unfolding) seed = { scope: 'depth', at: point.sheet, scene: point.scene, choice: 1 };
      else moving = point.sheet;
    }
  }
  const stored = seedOf(seed);
  const along = { ...(moving ? { moving } : {}), seed: stored };

  let op: FoldOp;
  if (line.via === 'crease' && intent.kind !== 'precrease') {
    op = { kind: unfolding ? 'unfold' : 'refold', crease: line.at, direction: intent.kind, ...along };
  } else if (intent.kind === 'precrease') {
    op = { kind: 'precrease', direction: intent.precreaseDirection, line, ...along };
  } else {
    op = { kind: intent.kind, line, ...along };
  }
  return {
    status: 'built',
    op,
    ...(choices ? { choices } : {}),
    sceneLine,
    movingSign,
    via: line.via,
    scope: stored.scope,
  };
}
