/**
 * A Fold sequence: the sheet it starts from and the steps folded on it, as the
 * project file holds it (`workspace.foldSequences`, plan D6 and D7).
 *
 * The steps are an **append-only tree**, stored flat and parent-linked. A node
 * with `parent: null` folds from the flat sheet; there is no synthetic root.
 * A node's state is fixed by its path, so a node id is a complete link target,
 * and folding differently from an earlier step makes a branch rather than an
 * edit.
 *
 * What a step stores is chosen so it survives replay (research §10):
 *
 * - **Inputs are anchors in sheet coordinates** ({@link SheetPoint}), never
 *   face, flap or enumeration ids, which are renumbered on every step. Sheet
 *   points survive because every later face is a subset of an earlier one.
 * - **Choices are results** ({@link FoldChoices}): the line an axiom root
 *   gave, the free pair assignments a completion took. Replay finds them
 *   again, and a choice that no longer resolves to exactly one result breaks
 *   its step rather than picking another.
 * - **Lines and directions are in the parent's frames.** A stored line is in
 *   the parent node's model frame; a direction is valley or mountain as seen
 *   in the parent's view, which is part of the parent's state.
 *
 * Marks, notes and `expect` ride along beside the op and never change what a
 * step folds. Status — ok, changed, broken, locked — is derived on replay
 * (`foldReplay`), never stored.
 *
 * Pure: no React, no store, no engine.
 */

import { randomId, type IdFactory } from '../../lib/documentFile';
import type { FoldAxiom, ReferenceKind } from '../../lib/foldSentences';
import {
  evaluateOrieditaRatioExpression,
  type OristudioCpRatioExpression,
} from '../../lib/oristudioCpToolSettings';
import type { TurnKind, TurnOverAxis, TurnRotation } from '../../lib/steps/turn';

/** This build's `formatVersion`: one per sequence, so a newer sequence opens read-only on its own. */
export const FOLD_SEQUENCE_FORMAT_VERSION = 1;

/** Makes the ids of a sequence, its steps and its marks: `fold-…`, `fstep-…`, `fmark-…`. */
export type FoldIdFactory = IdFactory<'fold' | 'fstep' | 'fmark'>;

export const randomFoldId: FoldIdFactory = randomId;

/**
 * A point in sheet coordinates: the unit sheet frame, y-up, the outline's
 * bounding box at the origin, longer side 1 (the engine's frame, plan D2).
 */
export type SheetPoint = readonly [number, number];

/**
 * A line `n · p = d` with a unit normal, in the parent node's model frame:
 * the engine's `Line`, as it serializes.
 */
export interface FoldModelLine {
  n: readonly [number, number];
  d: number;
}

/**
 * The shortest normal a stored model line may have: the geometry crate's
 * `TOL`, below which the engine's `Line::new` names no line. The engine
 * normalises any longer one.
 */
export const FOLD_MODEL_LINE_MIN_NORMAL = 1e-6;

// ---------------------------------------------------------------------------
// Paper

/**
 * The sheet's outline (plan D7):
 *
 * - a rectangle's `aspect` is `[width, height]` normalised to longer side 1
 *   ({@link rectangleShape});
 * - a polygon is stored as its points in the unit frame — a regular polygon
 *   of 3 to 8 sides with its first vertex at −π/2 ({@link regularPolygonShape})
 *   — and its side count is derived from them.
 */
export type FoldPaperShape =
  | { kind: 'square' }
  | { kind: 'rectangle'; aspect: readonly [number, number] }
  | { kind: 'polygon'; points: readonly SheetPoint[] };

export type FoldPaperShapeKind = FoldPaperShape['kind'];

export const FOLD_PAPER_SHAPE_KINDS: readonly FoldPaperShapeKind[] = ['square', 'rectangle', 'polygon'];

/** The fewest and most sides a polygon sheet has (plan D7). */
export const FOLD_POLYGON_MIN_SIDES = 3;
export const FOLD_POLYGON_MAX_SIDES = 8;

/**
 * Which side of the sheet faces the viewer before the first step. It changes
 * what a valley the viewer makes stores (letters are front-relative, plan D2),
 * so it is the document's, not a display setting.
 */
export type FoldStartSide = 'front' | 'back';

export const FOLD_START_SIDES: readonly FoldStartSide[] = ['front', 'back'];

export interface FoldPaper {
  shape: FoldPaperShape;
  startSide: FoldStartSide;
}

export const SQUARE_PAPER: FoldPaper = { shape: { kind: 'square' }, startSide: 'front' };

/** A `width : height` rectangle, normalised to longer side 1; null unless both are positive and finite. */
export function rectangleShape(width: number, height: number): FoldPaperShape | null {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null;
  const longer = Math.max(width, height);
  return { kind: 'rectangle', aspect: [width / longer, height / longer] };
}

/**
 * A regular polygon of `sides` sides, its first vertex at −π/2 (the bottom),
 * counter-clockwise, placed in the unit frame: the engine's
 * `Sheet::regular`, stored as points. Null outside 3 to 8 sides.
 */
export function regularPolygonShape(sides: number): FoldPaperShape | null {
  if (!Number.isInteger(sides) || sides < FOLD_POLYGON_MIN_SIDES || sides > FOLD_POLYGON_MAX_SIDES) return null;
  const ring = Array.from({ length: sides }, (_, k): [number, number] => {
    const t = -Math.PI / 2 + (2 * Math.PI * k) / sides;
    return [Math.cos(t), Math.sin(t)];
  });
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const scale = 1 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  return { kind: 'polygon', points: ring.map(([x, y]): SheetPoint => [(x - x0) * scale, (y - y0) * scale]) };
}

// ---------------------------------------------------------------------------
// Ops

/** Valley or mountain, as the viewer sees it in the parent's view. */
export type FoldDirection = 'valley' | 'mountain';

export const FOLD_DIRECTIONS: readonly FoldDirection[] = ['valley', 'mountain'];

/**
 * An axiom input. Each is resolved through the parent state's isometries into
 * its model frame on replay; a mark's id rides along for the sentence and for
 * provenance only — replay reads `at`, so clearing the mark breaks nothing.
 */
export type FoldRef =
  | { kind: 'point'; at: SheetPoint }
  | { kind: 'mark'; at: SheetPoint; mark: string }
  /** A line through two sheet points: an edge or a crease, by its end points. */
  | { kind: 'edge'; a: SheetPoint; b: SheetPoint };

/**
 * What each axiom's inputs are, in the shared crate's order
 * (`oristudio-geometry`'s `Construction`): O4 is `[p, m]`, O5
 * `[pivot, p, m1]`, O6 `[p1, m1, p2, m2]`, O7 `[p, m1, m2]`. Click order maps
 * to these slots in the tool, never in the file.
 */
export const AXIOM_SLOTS: Readonly<Record<FoldAxiom, readonly ReferenceKind[]>> = {
  1: ['point', 'point'],
  2: ['point', 'point'],
  3: ['line', 'line'],
  4: ['point', 'line'],
  5: ['point', 'point', 'line'],
  6: ['point', 'line', 'point', 'line'],
  7: ['point', 'line', 'line'],
};

/**
 * Where a fold line comes from (plan D14's line modes, D18's `via`):
 *
 * - an axiom, its inputs in the crate's order; the root it gave is the step's
 *   choice ({@link FoldChoices.root});
 * - a free line through two sheet points on it, at least the minimum feature
 *   apart, each the preimage of a point of the line inside the silhouette;
 * - an existing crease or bend, by a sheet point inside its sheet segment.
 */
export type FoldLineInput =
  | { via: 'axiom'; axiom: FoldAxiom; inputs: readonly FoldRef[] }
  | { via: 'free'; through: readonly [SheetPoint, SheetPoint] }
  | { via: 'crease'; at: SheetPoint };

export type FoldLineVia = FoldLineInput['via'];

/**
 * What a fold takes along with the moving side (the engine's `Seed`):
 *
 * - every layer on the moving side;
 * - the top `layers` layers at a sheet point (the bottom ones for a
 *   mountain), counted from the side the direction implies;
 * - the flaps of the faces containing these sheet points.
 */
export type FoldSeed =
  | { scope: 'all' }
  | { scope: 'depth'; at: SheetPoint; layers: number }
  | { scope: 'flaps'; at: readonly SheetPoint[] };

export type FoldSeedScope = FoldSeed['scope'];

/** The most layers a depth seed can name: the engine's `usize` in the browser's 32-bit wasm. */
export const FOLD_SEED_MAX_LAYERS = 0xffff_ffff;

/**
 * The fields every fold along a line shares. `moving` is a sheet point whose
 * image lies on the moving side, stored only when the seed does not imply the
 * side — always for `all`, never needed for a depth or flaps seed.
 */
interface FoldAlongLine {
  line: FoldLineInput;
  moving?: SheetPoint;
  seed: FoldSeed;
}

/** A valley or mountain fold: the direction is the kind. */
export interface FoldPlainOp extends FoldAlongLine {
  kind: 'valley' | 'mountain';
}

/** Fold and unfold: the creases are left flat, remembering their letters. */
export interface FoldPrecreaseOp extends FoldAlongLine {
  kind: 'precrease';
  direction: FoldDirection;
}

/**
 * A plain fold along an existing crease, named by a sheet point inside its
 * sheet segment in the parent: refolding a precrease, or unfolding a flap
 * along a bend (plan D3: the top flap, picked by the seed).
 */
export interface FoldCreaseOp {
  kind: 'unfold' | 'refold';
  crease: SheetPoint;
  direction: FoldDirection;
  moving?: SheetPoint;
  seed: FoldSeed;
}

/** Turn the model over about an axis: the view mirrors; no layer or letter changes. */
export interface FoldTurnOp {
  kind: 'turn';
  axis: TurnOverAxis;
}

/** Rotate the model by a part of a turn: the view only. */
export interface FoldRotateOp {
  kind: 'rotate';
  rotate: TurnRotation;
}

/** Where an imported crease pattern came from: a closed enum, never a file name (plan D16, D18). */
export type FoldCpOrigin = 'cp' | 'fold' | 'ori' | 'orh' | 'sample' | 'edit_folded_figure';

export const FOLD_CP_ORIGINS: readonly FoldCpOrigin[] = ['cp', 'fold', 'ori', 'orh', 'sample', 'edit_folded_figure'];

/**
 * Import CP (plan D16): a snapshot, not a link. The crease pattern and its
 * chosen layer order are compact JSON strings — about a third the size of
 * nested arrays in the pretty-printed project file — and the order names
 * faces by interior sheet-point witnesses, as {@link FoldChoices} does.
 */
export interface FoldCpJumpOp {
  kind: 'cp-jump';
  cpJson: string;
  orderJson: string;
  origin: FoldCpOrigin;
}

/**
 * A sink of a closed point (plan Phase 11, research §5.4) along `line`: the
 * point the seed names, its tip on the moving side. An open sink turns every
 * layer inside out against its own; a closed sink reverses the whole point
 * into a pocket (`choices.pocket` when it has several). An unsink turns a
 * sunk tip back out: its line is the ring's (an existing crease of it), and
 * its seed and `moving` name the tip and the side it lies on now.
 */
export interface FoldSinkOp extends FoldAlongLine {
  kind: 'open-sink' | 'closed-sink' | 'unsink';
}

/** What a step does. A kind this build does not know locks its node and subtree. */
export type FoldOp =
  | FoldPlainOp
  | FoldPrecreaseOp
  | FoldCreaseOp
  | FoldTurnOp
  | FoldRotateOp
  | FoldCpJumpOp
  | FoldSinkOp;

export type FoldOpKind = FoldOp['kind'];

export const FOLD_OP_KINDS: readonly FoldOpKind[] = [
  'valley',
  'mountain',
  'precrease',
  'unfold',
  'refold',
  'turn',
  'rotate',
  'cp-jump',
  // Sinks (plan Phase 11).
  'open-sink',
  'closed-sink',
  'unsink',
];

/** The turn a turn or rotate step makes, as the Diagram's turn entries spell it (`lib/steps/turn`). */
export function turnKindOf(op: FoldTurnOp | FoldRotateOp): TurnKind {
  return op.kind === 'turn' ? { kind: 'turn-over', axis: op.axis } : { kind: 'rotate', rotate: op.rotate };
}

// ---------------------------------------------------------------------------
// Choices

/**
 * The pairs a completion left free, as they were chosen: FOLD `faceOrders`
 * triples `[f, g, s]` over `faces`, each face named by an interior sheet-point
 * witness — face `f` lies on the side face `g`'s front faces (`s = 1`) or its
 * back (`s = −1`). Which side of a face another lies on does not depend on
 * which face is the root, as "above" would. It is the engine's
 * `WitnessOrder`, the shape `cp-jump`'s `orderJson` holds a whole order in.
 */
export interface FoldCompletionChoice {
  faces: readonly SheetPoint[];
  orders: readonly (readonly [number, number, 1 | -1])[];
}

/** One flap's opening of a reverse fold, crimp or tuck: the faces of its upper block, by witnesses. */
export interface FoldOpeningChoice {
  upper: readonly SheetPoint[];
}

/**
 * The choices a step resolved, stored as results, never as indices or
 * digests (plan D6). Faces are named by interior sheet-point witnesses; a
 * witness that lands in no face, or two in one face, breaks the step.
 */
export interface FoldChoices {
  /** The line the axiom's chosen root gave; replay takes the nearest root to it. */
  root?: FoldModelLine;
  /**
   * The assignments of the pair variables seeds and propagation left free.
   * Replay fixes them and completes: exactly one result resolves; a conflict
   * or more than one breaks the step.
   */
  completion?: FoldCompletionChoice;
  /** A sink's pocket: sheet points on the two faces that bound it. */
  pocket?: readonly [SheetPoint, SheetPoint];
  /** A reverse fold's, crimp's or tuck's opening, per flap. */
  opening?: readonly FoldOpeningChoice[];
}

// ---------------------------------------------------------------------------
// Marks

/**
 * The most parts a Divide-line mark divides into: as many as the Diagram's
 * `divisions` annotation, which it maps onto (plan D17).
 */
export const FOLD_MARK_MAX_PARTS = 32;

/**
 * How a Divide-line mark divides its segment: into `parts` equal parts, or at
 * Edit's exact ratio `s : t`, `s` the part next to `from`.
 */
export type FoldDivide =
  | { mode: 'count'; parts: number }
  | { mode: 'ratio'; ratio: OristudioCpRatioExpression };

/**
 * A Divide-line mark (plan D6): a reference annotation, made on a node — or
 * on the flat sheet — and visible to that node and its descendants. It
 * divides the segment `from`–`to`, the end points of an edge or crease of the
 * layer it was made on (the top visible layer at the pick), in sheet
 * coordinates. Never part of a state: excluded from `fh1` and `fs1`.
 */
export interface FoldMark {
  id: string;
  from: SheetPoint;
  to: SheetPoint;
  divide: FoldDivide;
}

/** A newer build's mark: carried verbatim and written back unchanged, never shown. */
export interface FoldCarriedMark {
  id: string;
  unknown: Record<string, unknown>;
}

export type FoldMarkEntry = FoldMark | FoldCarriedMark;

export function isKnownMark(mark: FoldMarkEntry): mark is FoldMark {
  return !('unknown' in mark);
}

/** The points a mark makes, from `from`: `parts − 1` of them, or the one at the ratio. */
export function markPoints(mark: FoldMark): SheetPoint[] {
  const at = (share: number): SheetPoint => [
    mark.from[0] + (mark.to[0] - mark.from[0]) * share,
    mark.from[1] + (mark.to[1] - mark.from[1]) * share,
  ];
  if (mark.divide.mode === 'count') {
    const { parts } = mark.divide;
    return Array.from({ length: parts - 1 }, (_, k) => at((k + 1) / parts));
  }
  const { ratioS, ratioT } = evaluateOrieditaRatioExpression(mark.divide.ratio);
  return [at(ratioS / (ratioS + ratioT))];
}

// ---------------------------------------------------------------------------
// Steps and the sequence

/**
 * A step this build reads. `expect` holds the `fs1:` fingerprint of the state
 * it landed at commit (`foldDigest`), for drift only: a mismatch on replay is
 * *changed*, not broken.
 */
export interface FoldStep {
  id: string;
  /** The step it folds from; null for the flat sheet. */
  parent: string | null;
  op: FoldOp;
  choices?: FoldChoices;
  expect?: string;
  /** The author's words. The sentence itself is generated. */
  note?: string;
  marks?: readonly FoldMarkEntry[];
  unknown?: undefined;
}

/**
 * A step this build cannot read — an op of a kind it does not know, or one
 * that does not read — kept verbatim and written back unchanged. It locks
 * itself and its subtree: it can be deleted, never edited, and nothing below
 * it replays.
 */
export interface FoldLockedStep {
  id: string;
  parent: string | null;
  /** The node as it came. */
  unknown: Record<string, unknown>;
  /** Its note, when one reads: shown, never edited. */
  note?: string;
  op?: undefined;
}

export type FoldStepNode = FoldStep | FoldLockedStep;

export function isLockedStep(node: FoldStepNode): node is FoldLockedStep {
  return node.unknown !== undefined;
}

export interface FoldSequenceDocument {
  formatVersion: typeof FOLD_SEQUENCE_FORMAT_VERSION;
  /** `fold-<uuid>`. */
  id: string;
  title: string;
  paper: FoldPaper;
  /**
   * Reserved for per-sequence `PaperStyleOverrides` (plan D7, D11): never
   * written by this build, carried verbatim when a file holds one.
   */
  appearance?: Readonly<Record<string, unknown>>;
  /** Marks made on the flat sheet, visible to every step. */
  sheetMarks?: readonly FoldMarkEntry[];
  /** Flat and parent-linked; siblings in the order they were made. */
  steps: readonly FoldStepNode[];
  /** Sequence-level keys a newer build wrote, carried verbatim and written back after this build's own (plan D7). */
  carried?: Readonly<Record<string, unknown>>;
}

/** A new, empty sequence. */
export function createFoldSequence(
  paper: FoldPaper = SQUARE_PAPER,
  title = '',
  newId: FoldIdFactory = randomFoldId
): FoldSequenceDocument {
  return { formatVersion: FOLD_SEQUENCE_FORMAT_VERSION, id: newId('fold'), title, paper, steps: [] };
}
