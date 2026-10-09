/**
 * A stored step as its sentence reads it (`fold/stepSentence`): the document's
 * op, with what only the engine knows decided from what it said.
 *
 * - **What moves.** An axiom names the input that swings first (`moverFirst`),
 *   so the sentence needs which inputs are on the moving side: each input's
 *   sheet point is taken through the parent state's faces to the screen, back
 *   to the model frame, and tested against the line and side the engine
 *   actually folded (its report).
 * - **In half.** A fold through every layer lays one half exactly onto the
 *   other when the folded silhouette has half the area it had: the union of
 *   the part that stays and the part that lands is at least the larger of the
 *   two, with equality only when they are equal and coincide.
 * - **Names.** The sheet's own corners, edges and diagonals are named by
 *   description only where a reader agrees they are those: on a silhouette
 *   that is an upright rectangle (the flat sheet, or one folded to a
 *   rectangle), at its corners and along whole sides, in the frame the step's
 *   picture is drawn in — the parent's scene. Anything else goes by its
 *   letter.
 *
 * The plan names the landmarks query for the positions (D14); the parent's
 * scene answers the same question for every input, marks included, from data
 * the strip already holds for its thumbnails, so no second query is asked.
 *
 * Pure: no React, no store, no engine.
 */
import type { SheetCorner, SheetDiagonal, SheetSide } from '../../lib/foldSentences';
import {
  isLockedStep,
  turnKindOf,
  type FoldLineInput,
  type FoldRef,
  type FoldSeed,
  type FoldStepNode,
  type SheetPoint,
} from '../document/foldSequenceDocument';
import type { FoldEngineLine, FoldEngineOp, FoldReport } from '../engine/foldEngineWire';
import type { FoldLayerScope, FoldSentenceLine, FoldSentenceReference, FoldSentenceStep } from '../stepSentence';
import { sceneToModel, sheetToScene, type FoldStateFrame } from './foldStateFrame';

/** What the engine said about the states either side of a step. Each is null while unknown. */
export interface FoldSentenceContext {
  /** The state the step folds from: its frame is the sentence's. */
  parent: FoldStateFrame | null;
  /** The state it lands. */
  child: FoldStateFrame | null;
  /** What the fold did: its line and moving side, in the parent's model frame. */
  report: FoldReport | null;
}

/** How close a point is to a corner or a side, in sheet units, to be named as one. */
const NAME_TOLERANCE = 1e-5;

/** How close the folded area is to half, relatively, for "in half". */
const HALF_TOLERANCE = 1e-4;

/** A stored step, or one this build cannot read (locked), as its sentence reads it. */
export function foldNodeSentenceStep(node: FoldStepNode, context: FoldSentenceContext): FoldSentenceStep {
  return isLockedStep(node) ? { op: 'unknown' } : foldSentenceStepOf(node.op, context);
}

/** An op — stored, or one a tool is previewing — as its sentence reads it. */
export function foldSentenceStepOf(op: FoldEngineOp, context: FoldSentenceContext): FoldSentenceStep {
  switch (op.kind) {
    case 'valley':
    case 'mountain':
      return { op: 'fold', direction: op.kind, line: sentenceLine(op.line, op.seed, context), scope: scopeOf(op.seed) };
    case 'precrease':
      return {
        op: 'precrease',
        direction: op.direction,
        line: sentenceLine(op.line, op.seed, context),
        scope: scopeOf(op.seed),
      };
    case 'refold':
      // A precrease folded again: a fold along a crease that is there.
      return { op: 'fold', direction: op.direction, line: { via: 'crease' }, scope: scopeOf(op.seed) };
    case 'unfold':
      return { op: 'unfold', direction: op.direction, scope: scopeOf(op.seed) };
    case 'turn':
    case 'rotate':
      return { op: 'turn', turn: turnKindOf(op) };
    case 'cp-jump':
      return { op: 'cp-jump' };
  }
}

/** Which layers a seed takes (plan D18's `layer_scope`). */
function scopeOf(seed: FoldSeed): FoldLayerScope {
  switch (seed.scope) {
    case 'all':
      return { kind: 'all' };
    case 'depth':
      return { kind: 'depth', layers: seed.layers };
    case 'flaps':
      return { kind: 'flaps', flaps: seed.at.length };
  }
}

function sentenceLine(line: FoldEngineLine | FoldLineInput, seed: FoldSeed, context: FoldSentenceContext): FoldSentenceLine {
  switch (line.via) {
    // A line a tool gives in the model frame is one the user placed: free.
    case 'free':
    case 'model':
      return { via: 'free' };
    case 'crease':
      return { via: 'crease' };
    case 'axiom': {
      const moving = movingInputs(line.inputs, context);
      const inHalf = seed.scope === 'all' && (line.axiom === 2 || line.axiom === 3) && foldsInHalf(context);
      return {
        via: 'axiom',
        axiom: line.axiom,
        inputs: line.inputs.map((input) => referenceOf(input, context.parent)),
        ...(moving.length > 0 ? { moving } : {}),
        ...(inHalf ? { inHalf: true } : {}),
      };
    }
  }
}

/** The sheet point an input stands at: a point's own, a line's middle. */
function anchorOf(input: FoldRef): SheetPoint {
  return input.kind === 'edge' ? [(input.a[0] + input.b[0]) / 2, (input.a[1] + input.b[1]) / 2] : input.at;
}

/** The indices of the inputs on the side the fold moved; none while the engine has not said. */
export function movingInputs(inputs: readonly FoldRef[], { parent, report }: FoldSentenceContext): number[] {
  if (!parent || !report) return [];
  const { n, d } = report.line;
  const sign = report.side === 'positive' ? 1 : -1;
  const moving: number[] = [];
  inputs.forEach((input, index) => {
    const screen = sheetToScene(parent, anchorOf(input));
    const model = screen && sceneToModel(parent, screen);
    if (model && sign * (n[0] * model[0] + n[1] * model[1] - d) > NAME_TOLERANCE) moving.push(index);
  });
  return moving;
}

/** The folded silhouette is half the one folded. */
export function foldsInHalf({ parent, child }: FoldSentenceContext): boolean {
  if (!parent || !child || !(parent.area > 0)) return false;
  return Math.abs(child.area - parent.area / 2) <= HALF_TOLERANCE * parent.area;
}

/** An input as a sentence names it, in the parent's frame. */
export function referenceOf(input: FoldRef, parent: FoldStateFrame | null): FoldSentenceReference {
  const fallback: FoldSentenceReference = input.kind === 'edge' ? { kind: 'line' } : { kind: 'point' };
  // A mark is the author's, named by its letter wherever it lies.
  if (!parent?.rectangular || input.kind === 'mark') return fallback;
  if (input.kind === 'point') {
    const at = sheetToScene(parent, input.at);
    const corner = at && cornerAt(parent, at);
    return corner ? { kind: 'corner', corner } : fallback;
  }
  const a = sheetToScene(parent, input.a);
  const b = sheetToScene(parent, input.b);
  if (!a || !b) return fallback;
  const [ends, other] = [cornerAt(parent, a), cornerAt(parent, b)];
  if (!ends || !other) return fallback;
  const side = sideJoining(ends, other);
  if (side) return { kind: 'edge', side };
  const diagonal = diagonalJoining(ends, other);
  return diagonal ? { kind: 'diagonal', diagonal } : fallback;
}

/** The silhouette's corner at a scene point, by compass (y-up), if it is one. */
function cornerAt({ bounds }: FoldStateFrame, [x, y]: readonly [number, number]): SheetCorner | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= NAME_TOLERANCE;
  const column = near(x, bounds.minX) ? 'w' : near(x, bounds.maxX) ? 'e' : null;
  const row = near(y, bounds.minY) ? 's' : near(y, bounds.maxY) ? 'n' : null;
  return column && row ? (`${row}${column}` as SheetCorner) : null;
}

/** The side two corners make, when they share one. */
function sideJoining(a: SheetCorner, b: SheetCorner): SheetSide | null {
  if (a === b) return null;
  if (a[0] === b[0]) return a[0] === 's' ? 'bottom' : 'top';
  if (a[1] === b[1]) return a[1] === 'w' ? 'left' : 'right';
  return null;
}

/** The diagonal two opposite corners make. */
function diagonalJoining(a: SheetCorner, b: SheetCorner): SheetDiagonal | null {
  const pair = [a, b].sort().join('_');
  if (pair === 'ne_sw') return 'sw_ne';
  if (pair === 'nw_se') return 'nw_se';
  return null;
}
