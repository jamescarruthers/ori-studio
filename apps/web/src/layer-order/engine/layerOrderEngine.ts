/**
 * The Layer order dialog's engine, as TypeScript sees it: one constraint
 * session over a flat fold (`implementation-plans/layer-order-dialog.md`,
 * approach 1 and 5).
 *
 * It is E5's `oristudio_fold::steer::ConstraintSession` call for call, in the
 * shapes E7's bridge answers in (`crates/oristudio-fold-wasm/src/steer`, its
 * TypeScript in `layerOrderWire.ts`), so the worker's adapter over the
 * bridge (U6) is close to a pass-through. What the contract adds to the
 * bridge:
 *
 * - **One session per worker, and no handle.** The worker that hosts it
 *   (`workers/layerOrderWorker.ts`) holds at most one; {@link
 *   LayerOrderEngine.open} or {@link LayerOrderEngine.restore} replaces it.
 *   One worker file serves three roles: the dialog's session, its solution
 *   count, and the hosts' engine (H2), each in a worker of its own.
 * - **Limits are always given, deadline included** ({@link
 *   LayerOrderLimits}). The wasm has no cancel channel: a call runs until it
 *   answers, so the deadline bounds it and terminating the worker is the
 *   only stop (`layerOrderRuntime.ts`). "Keep trying" is the same call again
 *   with {@link keepTrying}'s limits.
 * - **Constraints as tuples** ({@link LayerConstraint}), and the record as
 *   the host's own `LayerOrderRecord` (`lib/layerOrder/`), where the bridge
 *   takes packed triples and JSON.
 * - **E6's calls** (explain, the solution count in slices, the stepper),
 *   typed so the dialog can be written against them. Until E6 lands, the
 *   worker rejects them as `layer_order_unsupported_operation`.
 *
 * As on the bridge: outputs are snake_case, large data typed arrays, small
 * results plain objects. **A refusal is an answer; a rejection is the call
 * failing.** What the engine can't do with the user's fold (a source it can't
 * order, an open that ran out of time) resolves as `{ status: 'refused' }`; a
 * check's verdict resolves as `fits`, `cant_fit` or `timed_out`. A rejection
 * is a `{ code, message }` envelope: a caller's mistake or a defect (the
 * bridge's {@link LayerCallErrorCode}s), the worker's own
 * ({@link LAYER_ORDER_CALL_FAILURES}), or the runtime's word that the worker
 * went away.
 *
 * Faces are the host kernel's own (`faceIndex.ts`): dialog face *k* is
 * Oriedita face *k*.
 *
 * Types and a few pure helpers. React-free, store-free and engine-free.
 */
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { WasmErrorEnvelope } from '../../engine/types';
import type { LayerOrderRecord, LayerOrderSign } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import type { LayerFace } from './faceIndex';

// ---------------------------------------------------------------------------
// The bridge's shapes, mirrored field for field from E7's `layerOrderWire.ts`
// (not yet on this branch): once both are, these become its re-exports.

export type LayerSide = 'front' | 'back';

/**
 * The faces stacked on every spot (a subface the paper scene draws, in its
 * order), top first from one side, packed: spot `i`'s faces are
 * `faces[offsets[i]..offsets[i + 1]]`. A pane that holds one scene restacks
 * it for another order without asking for a new scene.
 */
export interface LayerStacks {
  offsets: Uint32Array;
  faces: Uint32Array;
}

/** The spots whose top face changes, per side, ascending: what a preview marks and a commit flashes. */
export interface LayerChangedSpots {
  front: Uint32Array;
  back: Uint32Array;
}

/** Which limit stopped a search. */
export type LayerBudgetLimit = 'nodes' | 'deadline';

/** Which part of a check settled it. */
export type LayerCheckStage = 'unchanged' | 'seeds_first' | 'open_order' | 'exhaustive';

/** Which test of the solver's view the folded geometry fails (E4's `ToleranceCause`). */
export type LayerToleranceCause =
  | { kind: 'collapsed_face'; face: number }
  | { kind: 'thin_face'; face: number }
  | { kind: 'short_crease'; line: number }
  | { kind: 'crease_off_face'; line: number; face: number }
  | { kind: 'crease_sides'; line: number }
  | { kind: 'overlap_disagrees'; faces: [number, number] };

/**
 * Why there is no session, or no record: an answer to show, by code (E4's
 * `SourceRefusal`, E5's `SessionRefusal` and the record codec's). Lines are
 * the source's segments, by index.
 */
export type LayerRefusal =
  | { code: 'source_no_faces' }
  | { code: 'source_kernel'; kernel_code: string }
  /** The creases trace other faces than the digest the host sent: an order would name the wrong faces. */
  | { code: 'source_digest_mismatch'; expected: string; actual: string }
  | { code: 'source_same_parity'; line: number; faces: [number, number] }
  /** A face with a reflex corner: refused in v1 (D4), naming the face. */
  | { code: 'source_non_convex_face'; face: number }
  | { code: 'source_too_many_faces'; face_count: number; limit: number }
  | { code: 'source_stacked_too_deep'; deepest: number; triples: number; limit: number }
  | { code: 'source_ambiguous_overlap'; ambiguities: { pair: { lo: number; hi: number }; cause: unknown }[] }
  | { code: 'source_tolerance'; cause: LayerToleranceCause }
  /** The creases alone admit no order: Edit could not have folded them flat. */
  | { code: 'session_no_order'; faces: number[] }
  /** The open ran out of nodes or time before it had a first order: keep trying. */
  | { code: 'session_timed_out'; limit: LayerBudgetLimit; nodes: number }
  | { code: 'session_bad_record'; part: 'record' | 'faces' | 'constraints' | 'order' | 'attention' }
  /** A later build's record: carried, never read. */
  | { code: 'record_newer' }
  /** `damage` is the TypeScript codec's word (`not-json`, `version`, `faces`, …). */
  | { code: 'record_damaged'; damage: string }
  /** Past the record budget (`LAYER_ORDER_RECORD_MAX_BYTES`): Apply refuses, with the reason. */
  | { code: 'record_over_budget'; bytes: number; budget: number };

export interface LayerRefused {
  status: 'refused';
  refusal: LayerRefusal;
}

/** Per saved face, one of these (`LayerOrderRestored.saved_faces.status`). */
export const SAVED_FACE_INTACT = 0;
/** Its point lies in a face whose area is not the saved one: split or merged. Never guessed. */
export const SAVED_FACE_AMBIGUOUS = 1;
/** Its point lies on a crease or off the paper. */
export const SAVED_FACE_GONE = 2;

/** Per saved order pair, one of these (`LayerOrderRestored.saved_order`). */
export const SAVED_PAIR_KEPT = 0;
export const SAVED_PAIR_MOVED = 1;
export const SAVED_PAIR_UNRESOLVED = 2;

/** A saved constraint, found again on the creases as they are now. */
export type LayerSavedConstraintStatus =
  | { status: 'intact' }
  | { status: 'ambiguous' }
  /** Intact, but the intact constraints clash and the proof names this one. */
  | { status: 'clashing' }
  | { status: 'gone'; cause: 'face_gone' | 'same_face' | 'no_overlap' };

/** What a restore applied. */
export type LayerRestoreOutcomeKind =
  /** Every intact constraint is committed; the order shown is the fitting one closest to the saved one. */
  | { kind: 'applied' }
  /** The record's indices of the clashing constraints; none is committed. */
  | { kind: 'clash'; constraints: number[] }
  /** None is committed, and the order shown is the open's first. Keep trying. */
  | { kind: 'timed_out'; limit: LayerBudgetLimit; nodes: number };

/** How a check proved that no order fits. */
export type LayerCantFitProof =
  /** Two constraints of the list order one pair both ways. */
  | { kind: 'opposed' }
  /** A constraint asks the opposite of what the creases alone force. */
  | { kind: 'forced' }
  /** The constraints, propagated with the creases, break a constraint of the fold. */
  | { kind: 'conflict'; family: 'taco_taco' | 'taco_tortilla' | 'tortilla_tortilla' | 'transitivity' }
  /** A search proved that these faces have no order. */
  | { kind: 'no_order'; faces: Uint32Array };

/**
 * A proof that no order fits, never a timeout. `constraints` are indices into
 * the list checked (for a preview: the committed list, then the candidate,
 * last), a set that already has no order with the creases; the smallest such
 * set lies within it ({@link LayerOrderEngine.explain}).
 */
export interface LayerCantFit {
  verdict: 'cant_fit';
  proof: LayerCantFitProof;
  /** Every face the proof traces back to, the creases' included. */
  faces: Uint32Array;
  constraints: Uint32Array;
}

/** No verdict: "couldn't check in time". Nothing changed. */
export interface LayerTimedOut {
  verdict: 'timed_out';
  limit: LayerBudgetLimit;
  nodes: number;
}

/** What a preview found. It never changes the session. */
export type LayerPreviewed =
  | {
      /** Fits: the fitting order closest to the one on screen. */
      verdict: 'fits';
      changed: LayerChangedSpots;
      stacks: { front: LayerStacks; back: LayerStacks };
      stage: LayerCheckStage;
      nodes: number;
    }
  | LayerCantFit
  | LayerTimedOut;

/** What a commit did. Only `committed` changed the session; the others leave it as it was. */
export type LayerCommitted =
  | {
      verdict: 'committed';
      changed: LayerChangedSpots;
      stacks: { front: LayerStacks; back: LayerStacks };
      /** The pairs still open under the new list. */
      open_pairs: Uint32Array;
      stage: LayerCheckStage;
      nodes: number;
    }
  | LayerCantFit
  | LayerTimedOut;

/** The codes a bridge call throws with: a caller's mistake or a defect, never an answer. */
export type LayerCallErrorCode =
  | 'invalid_input'
  | 'unknown_layer_session'
  | 'session_bad_constraint'
  | 'session_internal'
  | 'source_internal';

// ---------------------------------------------------------------------------
// Constraints

/**
 * One constraint: `subject` lies on `object`'s `sign` side wherever the two
 * overlap, by FOLD's `faceOrders` rule (1: the object's front side, -1: its
 * back), as the saved record writes them. Relative to the paper, so turning
 * the view over never changes it.
 */
export type LayerConstraint = readonly [subject: LayerFace, object: LayerFace, sign: LayerOrderSign];

/** The verb of a constraint, as the sentence reads it from the side shown. */
export type LayerVerb = 'in_front_of' | 'behind';

/**
 * "`subject` `verb` `object`" read from `side`, as a constraint: E5's
 * `Constraint::seen`. `objectFrontUp` is whether the object shows its front
 * from the front side ({@link LayerOrderOpened.front_up}).
 */
export function constraintSeen(
  subject: LayerFace,
  verb: LayerVerb,
  object: LayerFace,
  side: LayerSide,
  objectFrontUp: boolean
): LayerConstraint {
  // Nearer a viewer of the front: in front of from the front, behind from the back.
  const nearerTheFront = (verb === 'in_front_of') === (side === 'front');
  // FOLD's rule: the side above a face is its front side exactly when it shows its front.
  return [subject, object, nearerTheFront === objectFrontUp ? 1 : -1];
}

/** How a constraint reads from `side`: E5's `Constraint::verb`, the inverse of {@link constraintSeen}. */
export function constraintVerb(constraint: LayerConstraint, side: LayerSide, objectFrontUp: boolean): LayerVerb {
  const nearerTheFront = (constraint[2] === 1) === objectFrontUp;
  return nearerTheFront === (side === 'front') ? 'in_front_of' : 'behind';
}

/** Constraints as the bridge takes them: `[subject, object, sign, …]`. */
export function packConstraints(constraints: readonly LayerConstraint[]): Int32Array {
  const triples = new Int32Array(constraints.length * 3);
  constraints.forEach((constraint, i) => triples.set(constraint, i * 3));
  return triples;
}

/** The bridge's triples as constraints; a sign that is not ±1 reads as -1, which the bridge never writes. */
export function unpackConstraints(triples: Int32Array): LayerConstraint[] {
  const constraints: LayerConstraint[] = [];
  for (let i = 0; i + 2 < triples.length; i += 3) {
    constraints.push([triples[i]!, triples[i + 1]!, triples[i + 2] === 1 ? 1 : -1]);
  }
  return constraints;
}

/** How many spots a stack set covers. */
export function spotCount(stacks: LayerStacks): number {
  return Math.max(0, stacks.offsets.length - 1);
}

// ---------------------------------------------------------------------------
// Limits

/**
 * What one call may spend, for the open, a preview, a commit and a restore
 * alike: E5's `Limits`, every field given.
 */
export interface LayerOrderLimits {
  /** Search nodes for the open's first order and a check's exhaustive search. */
  readonly maxNodes: number;
  /** Nodes for each of a check's quick attempts, the ones steered by the order on screen. */
  readonly fastNodes: number;
  /**
   * How long the call may search, in milliseconds from the moment the engine
   * starts it, by the worker's own clock, so the two threads' clocks never
   * meet. Building the source runs to its end first.
   */
  readonly deadlineMs: number;
}

/** E5's defaults: 200,000 nodes, 128 quick nodes. */
const NODES = { maxNodes: 200_000, fastNodes: 128 } as const;

/**
 * The limits the dialog asks with. The deadlines are first guesses, from the
 * plan (a preview's about 3 s, approach 5) and #503's census (the iguana's
 * slowest check passed 30 s); phase gate 2 (E8) measures them in wasm and
 * replaces these.
 */
export const LAYER_ORDER_LIMITS = {
  open: { ...NODES, deadlineMs: 30_000 },
  preview: { ...NODES, deadlineMs: 3_000 },
  commit: { ...NODES, deadlineMs: 10_000 },
  restore: { ...NODES, deadlineMs: 30_000 },
} as const satisfies Record<string, LayerOrderLimits>;

/** How much further {@link keepTrying} lets a call go each time. */
export const KEEP_TRYING_FACTOR = 4;

/**
 * The limits for asking again after a call ran out ("Keep trying"): a later
 * deadline and more nodes. Both grow, because the search is deterministic: a
 * call that ran out of nodes would stop at the same node again however late
 * its deadline.
 */
export function keepTrying(limits: LayerOrderLimits, factor: number = KEEP_TRYING_FACTOR): LayerOrderLimits {
  return {
    maxNodes: Math.ceil(limits.maxNodes * factor),
    fastNodes: limits.fastNodes,
    deadlineMs: Math.ceil(limits.deadlineMs * factor),
  };
}

// ---------------------------------------------------------------------------
// The session's results

/** A session, opened: the bridge's `LayerOpened`, with no handle. */
export interface LayerOrderOpened {
  status: 'ok';
  /** How many faces: dialog faces are `0 … faces - 1`. */
  faces: number;
  /** Per face, 1 when it shows its front from the front side: what turns a sentence into a constraint and back. */
  front_up: Uint8Array;
  /**
   * The pairs deduction leaves open, `[lo, hi, …]` ascending; never a pair
   * only the solver's view overlaps. A subject can be picked when it is in
   * one; its objects are its partners in them.
   */
  open_pairs: Uint32Array;
  /** How many spots the stacks list. */
  spots: number;
}

export type LayerOrderOpenOutcome = LayerOrderOpened | LayerRefused;

/** A record restored onto the creases as they are now (D10): the session it opened, and each part of the record found again. */
export interface LayerOrderRestored extends LayerOrderOpened {
  /** The constraints committed: the intact ones when applied, none otherwise. */
  constraints: LayerConstraint[];
  outcome: LayerRestoreOutcomeKind;
  /** Per record face: its `SAVED_FACE_*`, the face it is in now (-1 when gone) and that face's area (NaN unless ambiguous). */
  saved_faces: { status: Uint8Array; face: Int32Array; area: Float64Array };
  /** Per record constraint. */
  saved_constraints: LayerSavedConstraintStatus[];
  /** Per record order pair, its `SAVED_PAIR_*`. */
  saved_order: Uint8Array;
}

export type LayerOrderRestoreOutcome = LayerOrderRestored | LayerRefused;

/** The record to save, and its compact JSON, byte for byte `encodeLayerOrderRecord`'s. */
export type LayerOrderSaveOutcome = { status: 'ok'; record: LayerOrderRecord; json: string } | LayerRefused;

// ---------------------------------------------------------------------------
// E6's seams: typed now, answered once E6 lands

/** The smallest set of constraints that clashes with the creases, or word that the list fits. */
export type LayerOrderExplained =
  | {
      verdict: 'explained';
      /** Indices into the list explained (the committed constraints, then the candidate last), ascending. */
      constraints: Uint32Array;
      /** Whether no smaller set clashes; false when the limits ran out first. */
      minimal: boolean;
      faces: Uint32Array;
    }
  | { verdict: 'fits' }
  | LayerTimedOut;

/** A count, and whether it is exact ("at least N" when it is not). */
export interface LayerCount {
  /** Saturates at `Number.MAX_SAFE_INTEGER`, with `exact` false. */
  n: number;
  exact: boolean;
}

/**
 * The solutions that fit the committed constraints: distinct pictures per
 * side (what "N solutions" counts) and layer orders (the tooltip's), each in
 * a stable order, with where the order on screen falls in it.
 */
export interface LayerSolutionCount {
  pictures: { front: LayerCount; back: LayerCount };
  orders: LayerCount;
  /** The order on screen's place in each stable order, from 0; null until the count reaches it. */
  current: { pictures: { front: number | null; back: number | null }; order: number | null };
}

/**
 * One slice of the count, which resumes where the last stopped. A commit, a
 * restore or a step on the same session starts it again.
 */
export type LayerSolutionCountSlice =
  | { status: 'counting'; so_far: LayerSolutionCount }
  | { status: 'counted'; count: LayerSolutionCount };

/** Where the stepper goes: by picture from a side, or by layer order (X-ray steps through every order, D5). */
export type LayerSolutionStep =
  | { readonly by: 'picture'; readonly side: LayerSide; readonly to: number }
  | { readonly by: 'order'; readonly to: number };

/** The step taken: that solution is now the order on screen. */
export type LayerSolutionStepped =
  | {
      verdict: 'stepped';
      index: number;
      stacks: { front: LayerStacks; back: LayerStacks };
      changed: LayerChangedSpots;
    }
  | LayerTimedOut;

// ---------------------------------------------------------------------------
// The engine

/** The calls E5 answers, through E7's bridge. */
export interface LayerOrderSessionCalls {
  /** Open a session over `source`: the letters' deduction and a first order. Replaces any session open. */
  open(source: LayerOrderSource, limits: LayerOrderLimits): Promise<LayerOrderOpenOutcome>;
  /**
   * Open a session over `source` and restore `record` onto it, its points in
   * the crease pattern's coordinates (`paperFrame.ts`). Replaces any session open.
   */
  restore(source: LayerOrderSource, record: LayerOrderRecord, limits: LayerOrderLimits): Promise<LayerOrderRestoreOutcome>;
  /** The pairs still open, as {@link LayerOrderOpened.open_pairs}. */
  openPairs(): Promise<Uint32Array>;
  /** The committed constraints, as built. */
  constraints(): Promise<LayerConstraint[]>;
  /** Whether the committed constraints and `candidate` leave an order. Never changes the session. */
  preview(candidate: LayerConstraint, limits: LayerOrderLimits): Promise<LayerPreviewed>;
  /**
   * Make `constraints` the committed list (Add, remove, undo, redo and Clear
   * all each send the whole list). A list the order on screen still fits, as
   * any list that only lost constraints does, keeps it exactly.
   */
  commit(constraints: readonly LayerConstraint[], limits: LayerOrderLimits): Promise<LayerCommitted>;
  /** The order on screen's stacks from `side`. */
  stacks(side: LayerSide): Promise<LayerStacks>;
  /**
   * The paper scene of the order on screen from `side`, drawn by the kernel's
   * own builder with the source's model, so the dialog draws what Apply's new
   * fold will; null when the figure has no subfaces.
   */
  scene(side: LayerSide): Promise<OristudioCpFoldedPaperScene | null>;
  /** The record to save: the faces it names, the constraints as built, the order's free pairs. */
  save(): Promise<LayerOrderSaveOutcome>;
  /**
   * The order on screen as Oriedita's relations, flat `[upper, lower, …]` over
   * the kernel's faces: what the host seeds its fold with
   * (`LayerOrderApplied.relations`).
   */
  relations(): Promise<Uint32Array>;
  /** Let the session go. The worker stays, for the next open. */
  close(): Promise<void>;
}

/** E6's calls. */
export interface LayerOrderSolutionCalls {
  /** The smallest clashing set among the committed constraints and `candidate` (or the committed alone, for null). */
  explain(candidate: LayerConstraint | null, limits: LayerOrderLimits): Promise<LayerOrderExplained>;
  /** One slice of the solution count, within `limits`. */
  countSolutions(limits: LayerOrderLimits): Promise<LayerSolutionCountSlice>;
  /** Show another solution that fits the committed constraints. */
  stepSolution(step: LayerSolutionStep, limits: LayerOrderLimits): Promise<LayerSolutionStepped>;
}

/** What the dialog's worker exposes, and what the runtime hands its owner, guarded. */
export interface LayerOrderEngine extends LayerOrderSessionCalls, LayerOrderSolutionCalls {}

// ---------------------------------------------------------------------------
// When a call fails

/**
 * The worker's own reasons a call rejects, beside the bridge's
 * {@link LayerCallErrorCode}s and the runtime's loss. Each is a
 * `{ code, message }` envelope; none is the user's doing.
 */
export const LAYER_ORDER_CALL_FAILURES = {
  /** A call that needs a session, before one is open or after close. */
  sessionNotOpen: 'layer_order_session_not_open',
  /** A call the engine does not have yet (E6's, until it lands). */
  unsupported: 'layer_order_unsupported_operation',
  /** The worker has no engine to ask: its backend is not wired (until U6), or would not start. */
  unavailable: 'layer_order_engine_unavailable',
  /** The engine failed halfway through a call and answers nothing more; the runtime replaces its worker. */
  trapped: 'layer_order_engine_trapped',
} as const;

/** How a call killed the engine, as `fold/engine/foldEngineTrap.ts` classifies the Fold bridge's failures. */
export type LayerOrderTrapKind = 'wasm_trap' | 'engine_poisoned' | 'unexpected_error';

/** What the worker throws for a trap, and for every call after it. */
export interface LayerOrderEngineTrapped extends WasmErrorEnvelope {
  readonly code: typeof LAYER_ORDER_CALL_FAILURES.trapped;
  readonly trap: LayerOrderTrapKind;
  /** The failure's own stack, from the worker: frames of our code and the module, nothing of the user's. */
  readonly stack?: string;
}

export function isLayerOrderEngineTrapped(error: unknown): error is LayerOrderEngineTrapped {
  return (
    !!error && typeof error === 'object' && (error as { code?: unknown }).code === LAYER_ORDER_CALL_FAILURES.trapped
  );
}

/** A call the engine does not have, by name. */
export interface LayerOrderUnsupported extends WasmErrorEnvelope {
  readonly code: typeof LAYER_ORDER_CALL_FAILURES.unsupported;
  readonly operation: keyof LayerOrderEngine;
}
