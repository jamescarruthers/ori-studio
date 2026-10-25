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
/**
 * How far a check had to search. `unchanged` means no search was needed, not
 * that the order is unchanged: read `changed` for what a pane flashes.
 */
export type LayerCheckStage = 'unchanged' | 'seeds_first' | 'open_order' | 'exhaustive';

/** Where the order a session shows came from, at open or at its last restore. Commits do not change it. */
export type LayerOpenedOn =
  /** The solver's first order (`layer_open`), or what is left when holding an order and the search toward it both ran out. */
  | { kind: 'first'; timed_out: { limit: LayerBudgetLimit; nodes: number } | null }
  /** The order given, held whole: the host's relations, or a record's saved pairs that still resolve. */
  | { kind: 'held'; ignored: number }
  /** The order given did not all fit: the fitting order closest to it, `moved` of its relations the other way. */
  | { kind: 'closest'; moved: number; ignored: number };

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
  /** Where the order on screen came from. */
  opened_on: LayerOpenedOn;
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

/**
 * A saved constraint a restore did not apply: a row the dialog shows by its
 * status, which `layer_save` writes back as saved, after the committed
 * constraints, until it is removed or a commit whose list holds its
 * `constraint` applies it.
 */
export type LayerCarriedRow = LayerSavedConstraintStatus & {
  /** Its index among the record's constraints. */
  index: number;
  /** Its faces as the record saved them, in the crease pattern's coordinates. */
  subject: { at: [number, number]; area: number };
  object: { at: [number, number]; area: number };
  sign: 1 | -1;
  /** `[subject, object, sign]` on today's faces when both are intact and overlap; null otherwise. */
  constraint: [number, number, 1 | -1] | null;
};

/** A record restored onto a source: the session it opened, and each part of the record found again. */
export interface LayerRestored extends LayerOpened {
  /** The constraints committed: the intact ones when applied, none otherwise. */
  constraints: LayerConstraintTriples;
  outcome: LayerRestoreOutcomeKind;
  /** Per record face: its `SAVED_FACE_*`, the face it is in now (-1 when gone) and that face's area (NaN unless ambiguous). */
  saved_faces: { status: Uint8Array; face: Int32Array; area: Float64Array };
  /** Per record constraint. */
  saved_constraints: LayerSavedConstraintStatus[];
  /** Per record order pair, its `SAVED_PAIR_*` (all unresolved when the restore timed out). */
  saved_order: Uint8Array;
  /** Every saved constraint not applied, in record order. */
  carried: LayerCarriedRow[];
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
      /**
       * What `layer_commit_preview` adopts this preview by: the session keeps
       * its last preview that fit until the next preview, commit or restore.
       * Never 0.
       */
      token: number;
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
      /** A commit that adopted its preview reports the preview's. */
      stage: LayerCheckStage;
      nodes: number;
      /** Whether it adopted a stored preview with no search (`layer_commit_preview`); false for every other commit. */
      adopted: boolean;
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
  /** On the solver's first order. */
  layer_open(source: OristudioCpFoldSource, limits?: LayerLimits): LayerOpenOutcome;
  /**
   * On the order the host shows: `relations`, `[upper, lower, …]` in
   * Oriedita's frame, as `layerOrderSceneRelations` reads them off the
   * host's paper scene. A pair naming no overlapping faces, or both orders
   * of one, is ignored and counted (`opened_on.ignored`).
   */
  layer_open_showing(source: OristudioCpFoldSource, relations: Uint32Array, limits?: LayerLimits): LayerOpenOutcome;
  layer_restore(source: OristudioCpFoldSource, record: string, limits?: LayerLimits): LayerRestoreOutcome;
  /** A record restored again on an open session (a retry, the host engine's next try), under the same handle. */
  layer_restore_record(session: number, record: string, limits?: LayerLimits): LayerRestoreOutcome;
  layer_opened_on(session: number): LayerOpenedOn;
  layer_open_pairs(session: number): Uint32Array;
  layer_constraints(session: number): LayerConstraintTriples;
  /** The committed list plus one. Never commits. */
  layer_preview(session: number, candidate: Int32Array, limits?: LayerLimits): LayerPreviewed;
  /** Any list, whatever is committed (the dialog's rows after a clash, plus one). Never commits; `cant_fit.constraints` index it. */
  layer_preview_list(session: number, constraints: LayerConstraintTriples, limits?: LayerLimits): LayerPreviewed;
  /** Add, remove, undo, redo and Clear all are each a whole new list. */
  layer_commit(session: number, constraints: LayerConstraintTriples, limits?: LayerLimits): LayerCommitted;
  /**
   * Add by a preview: its `token` and the list it checked. Adopted with no
   * search (so it cannot time out) while it is the session's last preview;
   * otherwise the list is committed by a search within `limits`.
   */
  layer_commit_preview(
    session: number,
    token: number,
    constraints: LayerConstraintTriples,
    limits?: LayerLimits
  ): LayerCommitted;
  /** The saved constraints the last restore did not apply, in record order. */
  layer_carried(session: number): LayerCarriedRow[];
  /** A carried row's trash button; whether there was one at `index`. */
  layer_remove_carried(session: number, index: number): boolean;
  layer_clear_carried(session: number): void;
  layer_stacks(session: number, side: LayerSide): LayerStacks;
  /** The CP kernel's paper scene of the order on screen; null with no subfaces. */
  layer_scene(session: number, side: LayerSide, model?: OristudioCpFoldedFigureModel): OristudioCpFoldedPaperScene | null;
  /** `[upper, lower, …]`, for the CP bridge's `folded_figure_fold_with_order`. */
  layer_oriedita_relations(session: number): Uint32Array;
  /** The committed constraints, then the carried rows as saved, as one record. */
  layer_save(session: number): LayerSaveOutcome;
  layer_close(session: number): boolean;
  layer_live(): number;
}
