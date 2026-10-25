/**
 * The Layer order dialog's inspector state, the actions that change it and
 * the effects it asks its hook to run (`implementation-plans/layer-order-dialog.md`,
 * U9; the reducer is `layerOrderReducer.ts`).
 *
 * **Effects are data.** The reducer never calls the engine, a timer or the
 * analytics layer: each step returns the effects to run, and the hook
 * (`useLayerOrderDialog`, U10) runs them and dispatches what they answer.
 * Every call that answers carries the `request` it was asked with; an answer
 * for a request the state no longer waits on is dropped, which is how a
 * superseded preview, a commit after Cancel or a stale count goes nowhere.
 *
 * Pure: no React, no store, no engine calls.
 */
import type { LayerOrderOutcome, LayerOrderFact, LayerOrderSurface } from './layerOrderAnalytics';
import type { LayerOrderBaseline } from './layerOrderDecisions';
import type {
  LayerCarriedFacts,
  LayerChangedSpots,
  LayerCommitFacts,
  LayerConstraint,
  LayerExplainFacts,
  LayerFace,
  LayerOpenedOn,
  LayerOpenFacts,
  LayerOrderLimits,
  LayerPosition,
  LayerPreviewFacts,
  LayerRefusal,
  LayerSide,
  LayerSidesStacks,
  LayerSolutionCount,
  LayerStepBy,
  LayerStepFacts,
  LayerVerb,
} from './layerOrderEngineFacts';
import type { LayerHistory } from './layerOrderHistory';
import type { LayerLetterRanks, LayerOpenIndex, LayerPickOrigin, LayerSentence, LayerSlot } from './layerOrderSentence';

// ---------------------------------------------------------------------------
// Rows

/** A constraint the session holds, as built. */
export interface LayerCommittedRow {
  readonly kind: 'committed';
  readonly id: number;
  /** `[subject, object, sign]`: the row reads subject first, its verb from the side shown. */
  readonly constraint: LayerConstraint;
}

/** A saved constraint a restore did not apply (E5's carried rows): shown by its status, written back unless removed. */
export interface LayerCarriedRow {
  readonly kind: 'carried';
  readonly id: number;
  readonly facts: LayerCarriedFacts;
}

export type LayerRow = LayerCommittedRow | LayerCarriedRow;

/** The constraints list: the committed rows, then the carried ones, as `layer_save` writes them. */
export interface LayerRows {
  readonly committed: readonly LayerCommittedRow[];
  readonly carried: readonly LayerCarriedRow[];
}

// ---------------------------------------------------------------------------
// The figure and the phase

export interface LayerFigure {
  readonly faces: number;
  /** Per face, 1 when it shows its front from the front side. */
  readonly frontUp: Uint8Array;
  /** Per face, 1 when it shares a spot with another face: "everything it overlaps is settled" or "it overlaps no other face". */
  readonly overlapping: Uint8Array;
  /** Per face, its place in letter order: a sentence's and a row's objects read in it (D21). */
  readonly letterRank: LayerLetterRanks;
}

/** How the session opens: on the host's order, or by restoring its saved record. */
export type LayerOpenHow = 'showing' | 'restore';

export type LayerPhase =
  /** Working out the layer orders; Cancel stops it. */
  | { readonly kind: 'opening'; readonly request: number; readonly limits: LayerOrderLimits }
  | { readonly kind: 'open' }
  /** No session: the refusal says why, by code. `session_timed_out` offers Keep trying. */
  | { readonly kind: 'refused'; readonly refusal: LayerRefusal; readonly limits: LayerOrderLimits }
  /** The engine went away (a rejected call): Try again reopens. */
  | { readonly kind: 'failed'; readonly limits: LayerOrderLimits }
  | { readonly kind: 'closed'; readonly outcome: LayerOrderOutcome };

// ---------------------------------------------------------------------------
// The preview of a complete sentence

/**
 * The smallest clashing set, once explained: indices into the list checked,
 * the committed constraints first, then the sentence's candidates in their
 * order (so an index past the committed ones names one of the objects).
 */
export interface LayerClash {
  readonly constraints: readonly number[];
  readonly faces: readonly LayerFace[];
  readonly minimal: boolean;
}

export type LayerExplainState = { readonly kind: 'pending'; readonly request: number } | ({ readonly kind: 'done' } & LayerClash);

/**
 * One sentence's preview against the order on screen: the committed list plus
 * its `candidates`, one constraint per object in letter order, less any the
 * list holds already (D21). Each is kept until the order on screen changes.
 */
export type LayerPreviewEntry =
  /** The check is running: Add waits. */
  | {
      readonly kind: 'pending';
      readonly request: number;
      readonly candidates: readonly LayerConstraint[];
      readonly limits: LayerOrderLimits;
    }
  /** The fitting order closest to the one on screen, and the spots that would change. */
  | {
      readonly kind: 'fits';
      readonly candidates: readonly LayerConstraint[];
      readonly token: number;
      readonly changed: LayerChangedSpots;
      readonly stacks: LayerSidesStacks;
    }
  /** No order fits: the check's set, refined by explain into the smallest clashing set. */
  | {
      readonly kind: 'cant_fit';
      readonly candidates: readonly LayerConstraint[];
      readonly constraints: readonly number[];
      readonly explain: LayerExplainState;
      /** Whether `layer constraint blocked` went out for it. */
      readonly reported: boolean;
    }
  /** "Couldn't check in time" (D8): Keep trying runs it again, later. */
  | { readonly kind: 'timed_out'; readonly candidates: readonly LayerConstraint[]; readonly limits: LayerOrderLimits };

// ---------------------------------------------------------------------------
// Commits

/** What a commit is for. `settle` applies a restore's remaining rows together after a removal (D10). */
export type LayerCommitVia = 'add' | 'remove' | 'undo' | 'redo' | 'clear_all' | 'settle';

/** A commit asked for, and what lands with it. */
export interface LayerCommitAsk {
  readonly via: LayerCommitVia;
  /** The list sent: the committed rows' constraints once it lands. */
  readonly constraints: readonly LayerConstraint[];
  /** For Add: the preview's token, adopted with no search while it is the session's last preview. */
  readonly token: number | null;
  readonly limits: LayerOrderLimits;
  /** The rows once it lands. */
  readonly rows: LayerRows;
  /** The history once it lands. */
  readonly history: LayerHistory<LayerRows>;
  /** For Add: the sentence it came from. */
  readonly sentence: LayerSentence | null;
  /** The row each constraint of the list came from, by id. */
  readonly listRows: readonly number[];
}

export type LayerCommitState =
  | { readonly kind: 'idle' }
  | ({ readonly kind: 'pending'; readonly request: number } & LayerCommitAsk)
  /** It ran out; nothing changed. Keep trying sends it again, later. */
  | ({ readonly kind: 'timed_out' } & LayerCommitAsk);

// ---------------------------------------------------------------------------
// A restored record's rows (D10)

export type LayerSettle =
  /** Every row that can apply is applied: the builder and Apply work as usual. */
  | { readonly kind: 'settled' }
  /**
   * The rows that can apply clash: none is committed, the builder is inert and
   * Apply waits until one is removed. `explain` refines the set after a re-check.
   */
  | {
      readonly kind: 'clash';
      /** The clashing rows, by id. */
      readonly rows: readonly number[];
      readonly explain: { readonly request: number; readonly listRows: readonly number[] } | null;
    }
  /** The restore ran out of time: none is committed. Keep trying restores again, later. */
  | { readonly kind: 'timed_out'; readonly limits: LayerOrderLimits }
  | { readonly kind: 'restoring'; readonly request: number; readonly limits: LayerOrderLimits };

// ---------------------------------------------------------------------------
// Solutions

export type LayerStepDirection = 'next' | 'previous';

export type LayerStepState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly request: number; readonly direction: LayerStepDirection; readonly by: LayerStepBy }
  /** No solution lies that way among those counted. */
  | { readonly kind: 'end'; readonly direction: LayerStepDirection }
  | { readonly kind: 'timed_out'; readonly direction: LayerStepDirection };

export interface LayerSolutionsState {
  /** Whether the background count runs (D7), by the open pairs at the open and after each commit; the stepper steps either way. */
  readonly runs: boolean;
  /** Bumped by every open and commit: a count or a position for another generation is dropped. */
  readonly generation: number;
  readonly count: LayerSolutionCount | null;
  /** Where the order on screen lies in the stepper's order, for {@link positionBy}. */
  readonly position: LayerPosition | null;
  readonly positionBy: string | null;
  readonly step: LayerStepState;
}

// ---------------------------------------------------------------------------
// What the pointer is on, and the view

export interface LayerHover {
  /** The face under the pointer on either pane (on the folded pane, the face on top there). */
  readonly face: LayerFace | null;
  /** A builder slot under the pointer: its face wins over the panes. */
  readonly slot: LayerSlot | null;
  /** A constraint row under the pointer, pressed or focused (D6), by id. */
  readonly row: number | null;
  /** Pointing at the can't-fit reason strengthens the clash's tints. */
  readonly reason: boolean;
}

export interface LayerView {
  /** Front/Back is a lens: constraints are paper-relative, and Apply never turns the host over. */
  readonly side: LayerSide;
  readonly xray: boolean;
  readonly openSpots: boolean;
}

/** The changed spots' one fade, after a commit or a step. `n` tells one flash from the next. */
export interface LayerFlash {
  readonly changed: LayerChangedSpots;
  readonly n: number;
}

// ---------------------------------------------------------------------------
// The state

export interface LayerOrderDialogState {
  readonly surface: LayerOrderSurface;
  readonly how: LayerOpenHow;
  /** Opened from the host's "Review…" (D14). */
  readonly review: boolean;
  /** Whether the record came flagged by its host, so even an untouched Apply writes (D16). */
  readonly recordNeedsAttention: boolean;
  /** When the dialog opened, by the hook's clock, for `elapsed_ms_bucket`. */
  readonly openedAt: number;
  readonly reportedOpen: boolean;
  readonly nextRequest: number;
  readonly nextRowId: number;
  readonly flashes: number;

  readonly phase: LayerPhase;
  readonly figure: LayerFigure | null;
  readonly openedOn: LayerOpenedOn | null;
  readonly open: LayerOpenIndex;
  /** The order on screen's stacks, top first, per side. */
  readonly shown: LayerSidesStacks | null;

  readonly rows: LayerRows;
  readonly history: LayerHistory<LayerRows>;
  readonly commit: LayerCommitState;
  readonly settle: LayerSettle;
  /** The rows "Review…" opened on (D14). */
  readonly reviewRows: readonly number[] | null;

  readonly sentence: LayerSentence;
  /** The verb under the pointer or focus in the open verb menu: previewed in place of the sentence's (Round3:457, 893). */
  readonly pointedVerb: LayerVerb | null;
  /** Each sentence's preview against the order on screen, by its candidates' key (`candidatesKey`); emptied when the order changes. */
  readonly previews: Readonly<Record<string, LayerPreviewEntry>>;

  readonly solutions: LayerSolutionsState;
  readonly hover: LayerHover;
  readonly view: LayerView;
  readonly flash: LayerFlash | null;
  /** What the dialog opened on, for an Apply that changed nothing (D16). */
  readonly baseline: LayerOrderBaseline | null;
}

// ---------------------------------------------------------------------------
// Effects

/** What Apply hands the hook: nothing to write (D16), or the session's order with these rows. */
export type LayerOrderApplyResult =
  | { readonly kind: 'no_change' }
  | {
      readonly kind: 'changed';
      /** The committed constraints, as built: what the session saves first. */
      readonly constraints: readonly LayerConstraint[];
      /**
       * The carried rows to write back, by record index. The hook removes every
       * other carried row from the session (`layer_remove_carried`) before it
       * saves, then reads the order on screen (`layer_oriedita_relations`) for
       * the host.
       */
      readonly keepCarried: readonly number[];
    };

export type LayerOrderEffect =
  /**
   * Open the session: on the host's order (`layer_open_showing`), or by
   * restoring the record (`layer_restore`, or `layer_restore_record` on a
   * session already open). Then read both sides' stacks, and answer `opened`
   * or `open_refused`.
   */
  | { readonly type: 'open'; readonly request: number; readonly how: LayerOpenHow; readonly limits: LayerOrderLimits }
  /**
   * Check `constraints` (`layer_preview_list`): the committed list, then the
   * sentence's candidates, one per object (D21). Answer `previewed`; a fit's
   * token adopts exactly this list (`commit` with the token).
   */
  | {
      readonly type: 'preview';
      readonly request: number;
      readonly constraints: readonly LayerConstraint[];
      readonly limits: LayerOrderLimits;
    }
  /**
   * Find the smallest clashing set of `constraints` (`layer_explain_list`): a
   * preview's list, or a restore's rows after a removal. Answer `explained`.
   */
  | {
      readonly type: 'explain';
      readonly request: number;
      readonly constraints: readonly LayerConstraint[];
      readonly limits: LayerOrderLimits;
    }
  /** Make `constraints` the committed list (`layer_commit`, or `layer_commit_preview` with a token): answer `committed`. */
  | {
      readonly type: 'commit';
      readonly request: number;
      readonly constraints: readonly LayerConstraint[];
      readonly token: number | null;
      readonly limits: LayerOrderLimits;
    }
  /**
   * Close any solutions cursor and start one for the committed list; read its
   * position by `by`, and with `count`, one slice of the count first. Answer
   * `solutions_counted`.
   */
  | { readonly type: 'solutions_restart'; readonly generation: number; readonly by: LayerStepBy; readonly count: boolean }
  /** One more slice of the count, then the position by `by`: answer `solutions_counted`. */
  | { readonly type: 'solutions_slice'; readonly generation: number; readonly by: LayerStepBy; readonly limits: LayerOrderLimits }
  /** The position by `by` (the side or X-ray changed): answer `solutions_positioned`. */
  | { readonly type: 'solutions_position'; readonly generation: number; readonly by: LayerStepBy }
  /** Show the next or previous solution (`layer_step`): answer `stepped`. */
  | {
      readonly type: 'step';
      readonly request: number;
      readonly generation: number;
      readonly by: LayerStepBy;
      readonly direction: LayerStepDirection;
      readonly limits: LayerOrderLimits;
    }
  /** Fade the changed spots once; answer `flash_ended` with `n` when the fade is over. */
  | { readonly type: 'flash'; readonly n: number }
  /** Apply: hand the host its result (or nothing to write), then close. */
  | { readonly type: 'apply'; readonly result: LayerOrderApplyResult }
  /** Cancel: close and leave the host untouched. */
  | { readonly type: 'close' }
  | { readonly type: 'track'; readonly fact: LayerOrderFact };

export interface LayerOrderStep {
  readonly state: LayerOrderDialogState;
  readonly effects: readonly LayerOrderEffect[];
}

// ---------------------------------------------------------------------------
// Actions

export type LayerOrderAction =
  // The engine's answers, each with the request it answers.
  | { readonly type: 'opened'; readonly request: number; readonly facts: LayerOpenFacts }
  | { readonly type: 'open_refused'; readonly request: number; readonly refusal: LayerRefusal }
  | { readonly type: 'previewed'; readonly request: number; readonly facts: LayerPreviewFacts }
  | { readonly type: 'explained'; readonly request: number; readonly facts: LayerExplainFacts }
  | { readonly type: 'committed'; readonly request: number; readonly facts: LayerCommitFacts }
  | {
      readonly type: 'solutions_counted';
      readonly generation: number;
      readonly by: LayerStepBy;
      /** Null when the count does not run (D7): a cursor for the stepper only. */
      readonly count: LayerSolutionCount | null;
      readonly position: LayerPosition;
    }
  | { readonly type: 'solutions_positioned'; readonly generation: number; readonly by: LayerStepBy; readonly position: LayerPosition }
  | { readonly type: 'stepped'; readonly request: number; readonly facts: LayerStepFacts }
  /** A call rejected: the engine is gone, and so is its session. */
  | { readonly type: 'engine_lost' }
  // The panes.
  | { readonly type: 'face_hovered'; readonly face: LayerFace | null }
  | { readonly type: 'face_picked'; readonly face: LayerFace; readonly origin: LayerPickOrigin }
  | { readonly type: 'ground_clicked' }
  // The builder.
  | { readonly type: 'slot_activated'; readonly slot: LayerSlot }
  /** A slot's ×: the object slot's clears every object. */
  | { readonly type: 'slot_cleared'; readonly slot: LayerSlot }
  /** An object chip's ×: that one object goes, whichever slot is active; the subject stays (D21). */
  | { readonly type: 'object_removed'; readonly face: LayerFace }
  | { readonly type: 'slot_hovered'; readonly slot: LayerSlot | null }
  | { readonly type: 'sentence_cleared' }
  | { readonly type: 'verb_pointed'; readonly verb: LayerVerb | null }
  | { readonly type: 'verb_set'; readonly verb: LayerVerb }
  | { readonly type: 'reason_hovered'; readonly on: boolean }
  | { readonly type: 'add' }
  /** The hint line's Keep trying, or a refusal's: whatever ran out runs again, later. */
  | { readonly type: 'keep_trying' }
  // The constraints list.
  | { readonly type: 'row_hovered'; readonly id: number | null }
  | { readonly type: 'row_clicked'; readonly id: number }
  /** One constraint's removal: a row's trash, or one object's × in a grouped row (D21). One undo step. */
  | { readonly type: 'row_removed'; readonly id: number }
  /** A grouped row's trash: every constraint in it, by id, as one undo step (D21). */
  | { readonly type: 'rows_removed'; readonly ids: readonly number[] }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'clear_all' }
  // The view and the stepper.
  | { readonly type: 'side_set'; readonly side: LayerSide }
  | { readonly type: 'xray_set'; readonly on: boolean }
  | { readonly type: 'open_spots_set'; readonly on: boolean }
  | { readonly type: 'step'; readonly direction: LayerStepDirection }
  | { readonly type: 'flash_ended'; readonly n: number }
  /** The failed state's Try again. */
  | { readonly type: 'retry_open' }
  // The footer, with the hook's clock.
  | { readonly type: 'apply'; readonly at: number }
  | { readonly type: 'cancel'; readonly at: number };

/** What the host's opening request decides, and the hook's clock. */
export interface LayerOrderDialogInit {
  readonly surface: LayerOrderSurface;
  /** Whether the host hands a saved record: the session restores it, else opens on the host's order. */
  readonly hasRecord: boolean;
  /** Whether the record came with `attention` set. */
  readonly recordNeedsAttention: boolean;
  /** Opened from the host's "Review…" action (D14). */
  readonly review: boolean;
  /** The host's `look.xray`: X-ray on for an Edit figure in Transparent3. */
  readonly xray: boolean;
  readonly at: number;
}
