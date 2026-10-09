/**
 * What crosses the Fold engine's bridge (`crates/oristudio-fold-wasm`), as
 * TypeScript sees it. Mirrors `src/wire.rs`; the Rust side is the truth.
 *
 * - **Inputs** are the Fold document's own shapes — its paper, ops and
 *   choices — so a replay hands a stored step over unchanged, and every sheet
 *   anchor is resolved in Rust, never here. The tools have three additions the
 *   document never writes: a line already in the parent's model frame
 *   (`via: 'model'`) with a `side` of it, a tuck's `placement`, and the
 *   `closure` policy.
 * - **Outputs** are the engine's own serde types, snake_case like every
 *   bridge's, in an envelope tagged by `status`: `ok`, or `refused` with a
 *   stable `code`, the fixes the engine offers and the faces and vertices the
 *   refusal names. A refusal never carries a sentence; the UI words it from
 *   the code.
 * - **Handles.** A landed state stays in the worker under a numeric handle
 *   until it is released; nothing but the handle crosses back.
 *
 * Pure types and constants: no React, no store, no wasm.
 */

import type { TurnOverAxis, TurnRotation } from '../../lib/steps/turn';
import { FOLD_IMPORT_REFUSAL_CODES } from './foldEngineIoWire';

/** A point in sheet coordinates: the unit sheet frame, y-up, longer side 1. */
export type FoldSheetPoint = readonly [number, number];

/** A line `n · p = d` with a unit normal, in a state's model frame: the engine's `Line`. */
export interface FoldModelLine {
  n: readonly [number, number];
  d: number;
}

export type FoldDirection = 'valley' | 'mountain';

/** A side of a line: `positive` is where `n · p > d`. */
export type FoldSide = 'positive' | 'negative';

export type FoldLetter = 'mountain' | 'valley';

// ---------------------------------------------------------------------------
// Inputs

export type FoldEnginePaperShape =
  | { kind: 'square' }
  | { kind: 'rectangle'; aspect: readonly [number, number] }
  | { kind: 'polygon'; points: readonly FoldSheetPoint[] };

export interface FoldEnginePaper {
  shape: FoldEnginePaperShape;
  /** `front` when absent. */
  startSide?: 'front' | 'back';
}

/**
 * Where the fold line comes from:
 *
 * - `free`: through the images of two sheet points;
 * - `crease`: along the crease whose sheet segment holds the point;
 * - `model`: a line already in the parent's model frame (the tools');
 * - `axiom`: refused as `unsupported_op` until the engine's axioms land.
 */
export type FoldEngineLine =
  | { via: 'free'; through: readonly [FoldSheetPoint, FoldSheetPoint] }
  | { via: 'crease'; at: FoldSheetPoint }
  | { via: 'model'; line: FoldModelLine }
  | { via: 'axiom'; axiom: number; inputs: readonly unknown[] };

export type FoldEngineSeed =
  | { scope: 'all' }
  /** The top `layers` layers at the point (the bottom ones for a mountain). */
  | { scope: 'depth'; at: FoldSheetPoint; layers: number }
  | { scope: 'flaps'; at: readonly FoldSheetPoint[] };

/** Where the moving block lands: the engine's `Placement`. */
export type FoldEnginePlacement =
  | { placement: 'on_top' }
  | { placement: 'over'; at: FoldSheetPoint }
  | { placement: 'under'; at: FoldSheetPoint };

/** Which side moves, and what goes with it. */
export interface FoldEngineMotion {
  /** A sheet point whose image lies on the moving side; optional when the seed names a point. */
  moving?: FoldSheetPoint;
  /** The tools' alternative to `moving`: a side of the line, against its normal as given. Never both. */
  side?: FoldSide;
  seed: FoldEngineSeed;
  placement?: FoldEnginePlacement;
  /** `include` (the default) moves the flaps the closure adds; `refuse` refuses, offering them. */
  closure?: 'include' | 'refuse';
}

export type FoldEngineOp =
  | ({ kind: 'valley' | 'mountain'; line: FoldEngineLine } & FoldEngineMotion)
  | ({ kind: 'precrease'; direction: FoldDirection; line: FoldEngineLine } & FoldEngineMotion)
  /**
   * Along an existing crease, by a sheet point inside its sheet segment:
   * unfold a folded one, refold a flat one.
   */
  | ({ kind: 'unfold' | 'refold'; crease: FoldSheetPoint; direction: FoldDirection } & FoldEngineMotion)
  | { kind: 'turn'; axis: TurnOverAxis }
  | { kind: 'rotate'; rotate: TurnRotation }
  /**
   * Import CP's stored step: landed after its parent, or refused with an
   * `import_*` code (`foldEngineIoWire.ts`). An `origin` outside the
   * document's `FoldCpOrigin` is the caller's mistake and throws.
   */
  | { kind: 'cp-jump'; cpJson: string; orderJson: string; origin: string };

/**
 * A step's stored choices. No op this build folds takes one, so any choice
 * present refuses the step as `unexpected_choice`; an empty list is none.
 */
export interface FoldEngineChoices {
  root?: unknown;
  completion?: readonly unknown[];
  pocket?: unknown;
  opening?: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Outputs

/** Every refusal code: the engine's (`FoldRefusal::code`), then the bridge's (`BridgeRefusal::code`). */
export const FOLD_REFUSAL_CODES = [
  'sheet_too_few_points',
  'sheet_not_finite',
  'sheet_not_convex',
  'sheet_side_too_short',
  'sheet_not_in_unit_frame',
  'invalid_rectangle',
  'invalid_sides',
  'duplicate_id',
  'unknown_vertex',
  'crease_unknown_vertex',
  'unused_vertex',
  'face_too_small',
  'missing_crease',
  'crease_face_count',
  'non_convex_face',
  'area_mismatch',
  'unknown_root',
  'unreached_face',
  'residual',
  'hinge_orientation',
  'folded_image',
  'layer_order',
  'no_moving_side',
  'near_miss',
  'witness_not_in_face',
  'seed_not_on_moving_side',
  'empty_seed',
  'nothing_stays',
  'closure_adds_flaps',
  'tuck_target_moves',
  'degenerate_split',
  'short_crease',
  'thin_piece',
  'sliver',
  'prediction_mismatch',
  'precrease_unfold_moved_more',
  // The bridge's: an anchor that no longer resolves in the parent, or an op
  // this build cannot fold.
  'unsupported_op',
  'unexpected_choice',
  'point_off_paper',
  'degenerate_line',
  'crease_not_found',
  'crease_not_flat',
  'crease_not_folded',
  'moving_side_missing',
  'moving_side_on_line',
  // A stored cp-jump that no longer lands, under Import CP's own codes.
  ...FOLD_IMPORT_REFUSAL_CODES,
] as const;

export type FoldRefusalCode = (typeof FOLD_REFUSAL_CODES)[number];

/** A refusal: its code and the fields that code carries (see `FoldRefusal` in `oristudio-fold`). */
export interface FoldRefusalBody {
  code: FoldRefusalCode;
  readonly [field: string]: unknown;
}

/** A flap: a connected part of the moving side, named by an interior sheet point of one of its faces. */
export interface FoldFlap {
  faces: number[];
  witness: [number, number];
}

/** A remedy offered with a refusal (plan D14). */
export type FoldFix =
  | { fix: 'include_flaps'; flaps: number[] }
  | { fix: 'opposite_direction' }
  | { fix: 'pick_flap'; flaps: FoldFlap[] }
  /** Fold along this landmark line instead: send it back as `{ via: 'model', line }` with `side`. */
  | { fix: 'use_line'; line: FoldModelLine; side: FoldSide };

export interface FoldEngineRefused {
  status: 'refused';
  refusal: FoldRefusalBody;
  fixes: FoldFix[];
  /** Every face the refusal names, ascending. */
  faces: number[];
  /** Every vertex the refusal names. */
  vertices: number[];
}

/** An answer: `{ status: 'ok', …T }`, or a refusal. */
export type FoldEngineOutcome<T> = ({ status: 'ok' } & T) | FoldEngineRefused;

/** The snap actually applied to the fold line (plan D5). */
export interface FoldSnap {
  clusters: number;
  angle: number;
  max_shift: number;
}

/** What a fold would move (D14 tier 2), in the parent's model frame. */
export interface FoldAnalysis {
  /** The line actually folded along, after snapping, and its moving side. */
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** In the model frame: a turned-over view's valley is a mountain here. */
  direction: FoldDirection;
  flaps: FoldFlap[];
  /** The flaps the seed named, by index into `flaps`. */
  picked: number[];
  /** The flaps the closure added beyond those. */
  added: number[];
  /** The parent's faces that move. */
  moving: number[];
}

export interface FoldRefold {
  edge: number;
  remembered: FoldLetter;
  letter: FoldLetter;
}

/** What a fold did. */
export interface FoldReport extends FoldAnalysis {
  /** The landed state's faces that moved. */
  moving_faces: number[];
  /** The creases the fold made. */
  created: number[];
  /** Folded creases on the line that became flat. */
  unfolded: number[];
  /** Flat creases on the line that became folded. */
  refolded: FoldRefold[];
  /** How many faces were split. */
  split: number;
}

/** A state at a glance. */
export interface FoldStateSummary {
  /** How many steps led here; the flat sheet is 0. */
  step: number;
  faces: number;
  /** Ordered pairs of overlapping faces. */
  pairs: number;
  /** Front-relative, as stored and exported. */
  creases: { border: number; mountain: number; valley: number; flat: number };
  /** Turned over (seen from −z), and the display rotation in radians, counter-clockwise. */
  view: { flipped: boolean; rotation: number };
  /** The largest disagreement between two images of one vertex. */
  residual: number;
  /** The sheet's outline, counter-clockwise, in sheet coordinates. */
  sheet: [number, number][];
}

/** A state's `fs1` fingerprint (plan D17). */
export type FoldStateFingerprint = `fs1:${string}`;

export interface FoldSheetLanded {
  state: number;
  summary: FoldStateSummary;
  fingerprint: FoldStateFingerprint;
}

export interface FoldStepLanded {
  state: number;
  /** Null for a turn or a rotation. */
  report: FoldReport | null;
  summary: FoldStateSummary;
}

export interface FoldStepFingerprinted extends FoldStepLanded {
  fingerprint: FoldStateFingerprint;
}

export interface FoldAnalysed {
  analysis: FoldAnalysis;
}
