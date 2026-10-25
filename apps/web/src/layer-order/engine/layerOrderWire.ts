/**
 * What the Fold bridge's Layer order calls take and answer
 * (`crates/oristudio-fold-wasm/src/steer`, `implementation-plans/layer-order-dialog.md`
 * row E7): the `layer_*` methods of `FoldEngine`, which only the dialog's own
 * workers call. Types only; the shapes mirror `steer/wire.rs`.
 *
 * Conventions, as for the bridge's other calls: inputs camelCase, outputs
 * snake_case; large data as typed arrays (copied out of the wasm heap), small
 * results as plain objects; refusals as values with a stable `code` and no
 * sentence. Only a caller's mistake or a defect throws, as `{ code, message }`
 * with a {@link LayerCallErrorCode}.
 *
 * Faces are the host's: face *k* is the CP kernel's face *k* of the source.
 */
import type {
  OristudioCpFoldSource,
  OristudioCpFoldedFigureModel,
  OristudioCpFoldedPaperScene,
} from '../../engine/oristudioCpTypes';

/**
 * What a call that searches (open, restore, preview, commit) may spend. Every
 * field may be left out.
 *
 * `deadlineMs` is relative: that many milliseconds after the call starts, by
 * the worker's own clock, read inside the search (building the source runs
 * to its end first). A call that runs out answers `timed_out` (or, for an
 * open, `session_timed_out`) and changes nothing, so **keep trying is the
 * same call again with a larger `deadlineMs`**.
 */
export interface LayerLimits {
  /** Nodes for the open's first order and a check's exhaustive search; default 200,000. */
  maxNodes?: number;
  /** Nodes for each quick attempt steered by the order on screen; default 128. */
  fastNodes?: number;
  /** Milliseconds from the call's start; no deadline when left out. */
  deadlineMs?: number;
}

export type LayerSide = 'front' | 'back';

/**
 * Constraints, three numbers each: `[subject, object, sign, …]`, `sign` FOLD's
 * (`1` when the subject lies on the object's front side, `-1` on its back), as
 * the saved record writes them. Relative to the paper, so turning the view
 * over never changes one. From a sentence read from `side`:
 *
 * ```ts
 * const nearerTheFront = (verb === 'in_front_of') === (side === 'front');
 * const sign = nearerTheFront === (front_up[object] === 1) ? 1 : -1;
 * ```
 */
export type LayerConstraintTriples = Int32Array;

/** Per spot (the paper scene's subfaces, in its order), its faces top first: `faces[offsets[i]..offsets[i + 1]]`. */
export interface LayerStacks {
  offsets: Uint32Array;
  faces: Uint32Array;
}

/** The spots whose top face changed, per side, ascending. */
export interface LayerChangedSpots {
  front: Uint32Array;
  back: Uint32Array;
}

export type LayerBudgetLimit = 'nodes' | 'deadline';
export type LayerCheckStage = 'unchanged' | 'seeds_first' | 'open_order' | 'exhaustive';

/** A session the engine now holds. */
export interface LayerOpened {
  status: 'ok';
  /** The handle every other call takes. */
  session: number;
  /** How many faces. */
  faces: number;
  /** Per face, 1 when it shows its front from the front side. */
  front_up: Uint8Array;
  /** The pairs deduction leaves open, `[lo, hi, …]`, ascending: the pickable subjects and their objects. */
  open_pairs: Uint32Array;
  /** How many spots the stacks list. */
  spots: number;
}

export type LayerToleranceCause =
  | { kind: 'collapsed_face'; face: number }
  | { kind: 'thin_face'; face: number }
  | { kind: 'short_crease'; line: number }
  | { kind: 'crease_off_face'; line: number; face: number }
  | { kind: 'crease_sides'; line: number }
  | { kind: 'overlap_disagrees'; faces: [number, number] };

/** Why there is no session, or no record: an answer to show, by code. */
export type LayerRefusal =
  | { code: 'source_no_faces' }
  | { code: 'source_kernel'; kernel_code: string }
  | { code: 'source_digest_mismatch'; expected: string; actual: string }
  | { code: 'source_same_parity'; line: number; faces: [number, number] }
  | { code: 'source_non_convex_face'; face: number }
  | { code: 'source_too_many_faces'; face_count: number; limit: number }
  | { code: 'source_stacked_too_deep'; deepest: number; triples: number; limit: number }
  | { code: 'source_ambiguous_overlap'; ambiguities: { pair: { lo: number; hi: number }; cause: unknown }[] }
  | { code: 'source_tolerance'; cause: LayerToleranceCause }
  | { code: 'session_no_order'; faces: number[] }
  /** Keep trying: the same call with a larger `deadlineMs`. */
  | { code: 'session_timed_out'; limit: LayerBudgetLimit; nodes: number }
  | { code: 'session_bad_record'; part: 'record' | 'faces' | 'constraints' | 'order' | 'attention' }
  /** A later build's record: carried, never read. */
  | { code: 'record_newer' }
  /** `damage` is the TypeScript codec's word (`not-json`, `version`, `faces`, …). */
  | { code: 'record_damaged'; damage: string }
  | { code: 'record_over_budget'; bytes: number; budget: number };

export interface LayerRefused {
  status: 'refused';
  refusal: LayerRefusal;
}

export type LayerOpenOutcome = LayerOpened | LayerRefused;

/** Per saved face, one of these. */
export const SAVED_FACE_INTACT = 0;
export const SAVED_FACE_AMBIGUOUS = 1;
export const SAVED_FACE_GONE = 2;

/** Per saved order pair, one of these. */
export const SAVED_PAIR_KEPT = 0;
export const SAVED_PAIR_MOVED = 1;
export const SAVED_PAIR_UNRESOLVED = 2;

export type LayerSavedConstraintStatus =
  | { status: 'intact' }
  | { status: 'ambiguous' }
  | { status: 'clashing' }
  | { status: 'gone'; cause: 'face_gone' | 'same_face' | 'no_overlap' };

export type LayerRestoreOutcomeKind =
  | { kind: 'applied' }
  /** The record's indices of the clashing constraints; none is committed. */
  | { kind: 'clash'; constraints: number[] }
  /** None is committed. Keep trying: the same restore with a larger `deadlineMs`. */
  | { kind: 'timed_out'; limit: LayerBudgetLimit; nodes: number };

/** A record restored onto a source: the session it opened, and each part of the record found again. */
export interface LayerRestored extends LayerOpened {
  /** The constraints committed: the intact ones when applied, none otherwise. */
  constraints: LayerConstraintTriples;
  outcome: LayerRestoreOutcomeKind;
  /** Per record face: its `SAVED_FACE_*`, the face it is in now (-1 when gone) and that face's area (NaN unless ambiguous). */
  saved_faces: { status: Uint8Array; face: Int32Array; area: Float64Array };
  /** Per record constraint. */
  saved_constraints: LayerSavedConstraintStatus[];
  /** Per record order pair, its `SAVED_PAIR_*`. */
  saved_order: Uint8Array;
}

export type LayerRestoreOutcome = LayerRestored | LayerRefused;

export type LayerCantFitProof =
  | { kind: 'opposed' }
  | { kind: 'forced' }
  | { kind: 'conflict'; family: 'taco_taco' | 'taco_tortilla' | 'tortilla_tortilla' | 'transitivity' }
  | { kind: 'no_order'; faces: Uint32Array };

/**
 * A proof that no order fits, never a timeout. `constraints` are indices into
 * the list checked (for a preview: the committed list, then the candidate,
 * last), a set that already has no order with the creases.
 */
export interface LayerCantFit {
  verdict: 'cant_fit';
  proof: LayerCantFitProof;
  /** Every face the proof traces back to. */
  faces: Uint32Array;
  constraints: Uint32Array;
}

/** No verdict: "couldn't check in time". Nothing changed. */
export interface LayerTimedOut {
  verdict: 'timed_out';
  limit: LayerBudgetLimit;
  nodes: number;
}

export type LayerPreviewed =
  | {
      verdict: 'fits';
      changed: LayerChangedSpots;
      stacks: { front: LayerStacks; back: LayerStacks };
      stage: LayerCheckStage;
      nodes: number;
    }
  | LayerCantFit
  | LayerTimedOut;

export type LayerCommitted =
  | {
      verdict: 'committed';
      changed: LayerChangedSpots;
      stacks: { front: LayerStacks; back: LayerStacks };
      open_pairs: Uint32Array;
      stage: LayerCheckStage;
      nodes: number;
    }
  | LayerCantFit
  | LayerTimedOut;

/** The record as one compact JSON string, byte for byte `encodeLayerOrderRecord`'s. */
export type LayerSaveOutcome = { status: 'ok'; json: string } | LayerRefused;

/** The codes a layer call throws with: a caller's mistake or a defect, never an answer. */
export type LayerCallErrorCode =
  | 'invalid_input'
  | 'unknown_layer_session'
  | 'session_bad_constraint'
  | 'session_internal'
  | 'source_internal';

/** The `layer_*` methods of the Fold bridge's `FoldEngine`, as the wasm glue exposes them. */
export interface LayerOrderBridge {
  layer_open(source: OristudioCpFoldSource, limits?: LayerLimits): LayerOpenOutcome;
  layer_restore(source: OristudioCpFoldSource, record: string, limits?: LayerLimits): LayerRestoreOutcome;
  layer_open_pairs(session: number): Uint32Array;
  layer_constraints(session: number): LayerConstraintTriples;
  /** Never commits. */
  layer_preview(session: number, candidate: Int32Array, limits?: LayerLimits): LayerPreviewed;
  /** Add, remove, undo, redo and Clear all are each a whole new list. */
  layer_commit(session: number, constraints: LayerConstraintTriples, limits?: LayerLimits): LayerCommitted;
  layer_stacks(session: number, side: LayerSide): LayerStacks;
  /** The CP kernel's paper scene of the order on screen; null with no subfaces. */
  layer_scene(session: number, side: LayerSide, model?: OristudioCpFoldedFigureModel): OristudioCpFoldedPaperScene | null;
  /** `[upper, lower, …]`, for the CP bridge's `folded_figure_fold_with_order`. */
  layer_oriedita_relations(session: number): Uint32Array;
  layer_save(session: number): LayerSaveOutcome;
  layer_close(session: number): boolean;
  layer_live(): number;
}
