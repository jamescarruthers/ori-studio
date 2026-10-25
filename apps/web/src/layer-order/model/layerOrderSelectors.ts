/**
 * What the panes and the inspector draw from the inspector state
 * (`layerOrderState.ts`): faces to tint and label, the hint line, Add's and
 * Apply's state, the status and stepper, and the constraint rows. Text comes
 * out as a key with its values (faces by number, counts, sentences as
 * subject–verb–object); the component turns faces into letters and keys into
 * translated strings, so word order stays each locale's.
 *
 * The rules are the approved artboard's (Round3 `renderVals`) and the Round 4
 * states board's (`Round4-States.dc.html`, the current proposal for the
 * waiting, timed-out, attention and refusal states).
 *
 * Pure: no React, no store, no engine calls.
 */
import { objectsPastLabelCap, hostOrderNotice, ADD_AFTER_PREVIEW_TIMEOUT, type LayerOpenNotice } from './layerOrderDecisions';
import {
  constraintVerb,
  type LayerChangedSpots,
  type LayerConstraint,
  type LayerFace,
  type LayerRefusal,
  type LayerSide,
  type LayerSidesStacks,
  type LayerStacks,
  type LayerTally,
  type LayerVerb,
} from './layerOrderEngineFacts';
import { canRedo, canUndo } from './layerOrderHistory';
import {
  applyBlocker,
  builderLive,
  chosenPreview,
  currentStepBy,
  displayedPreview,
  sentenceCandidate,
  stepByKey,
} from './layerOrderReducer';
import { facesWithChoices, hasChoices, openPartners, slotNow, subjectStuck, type LayerSlot } from './layerOrderSentence';
import type {
  LayerCarriedRow,
  LayerCommitVia,
  LayerOrderDialogState,
  LayerPreviewEntry,
  LayerRow,
} from './layerOrderState';

// ---------------------------------------------------------------------------
// Sentences

/** A constraint as a row or a reason reads it, from the side shown. A face that no longer exists is null, and has no letter. */
export interface LayerSentenceView {
  readonly subject: LayerFace | null;
  /** Null when the object no longer exists, so its side can't be read. */
  readonly verb: LayerVerb | null;
  readonly object: LayerFace | null;
}

function frontUpOf(state: LayerOrderDialogState, face: LayerFace): boolean {
  return state.figure?.frontUp[face] === 1;
}

export function constraintSentence(state: LayerOrderDialogState, constraint: LayerConstraint): LayerSentenceView {
  const [subject, object] = constraint;
  return { subject, verb: constraintVerb(constraint, state.view.side, frontUpOf(state, object)), object };
}

/** A row, read the way it was built, subject first (spec §6.5). */
export function rowSentence(state: LayerOrderDialogState, row: LayerRow): LayerSentenceView {
  if (row.kind === 'committed') return constraintSentence(state, row.constraint);
  const { subject, object, sign } = row.facts;
  const verb = object === null ? null : constraintVerb([subject ?? 0, object, sign], state.view.side, frontUpOf(state, object));
  return { subject, verb, object };
}

function rowFaces(row: LayerRow): LayerFace[] {
  if (row.kind === 'committed') return [row.constraint[0], row.constraint[1]];
  return [row.facts.subject, row.facts.object].filter((face): face is LayerFace => face !== null);
}

function findRow(state: LayerOrderDialogState, id: number | null): LayerRow | null {
  if (id === null) return null;
  return state.rows.committed.find((row) => row.id === id) ?? state.rows.carried.find((row) => row.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// The clash on screen

interface LayerClashView {
  /** The candidate's sentence, when the clash is a preview's. */
  readonly sentence: LayerSentenceView | null;
  /** The rows in the clash, by id. */
  readonly rows: readonly number[];
  readonly clashes: readonly LayerSentenceView[];
  readonly faces: readonly LayerFace[];
  readonly explaining: boolean;
  readonly minimal: boolean;
}

/** A can't-fit preview's clash, or a restored record's (D10); null when nothing clashes. */
function clashOnScreen(state: LayerOrderDialogState): LayerClashView | null {
  if (state.settle.kind === 'clash') {
    const rows = state.settle.rows.map((id) => findRow(state, id)).filter((row): row is LayerRow => row !== null);
    return {
      sentence: null,
      rows: rows.map((row) => row.id),
      clashes: rows.map((row) => rowSentence(state, row)),
      faces: Array.from(new Set(rows.flatMap(rowFaces))),
      explaining: state.settle.explain !== null,
      minimal: state.settle.explain === null,
    };
  }
  const entry = displayedPreview(state);
  if (entry?.kind !== 'cant_fit') return null;
  const sentence = constraintSentence(state, entry.candidate);
  if (entry.explain.kind === 'pending') {
    // The sentence's own faces go danger at once; the clashing set follows (Round 4 "A clash being explained").
    return {
      sentence,
      rows: [],
      clashes: [],
      faces: [entry.candidate[0], entry.candidate[1]],
      explaining: true,
      minimal: false,
    };
  }
  const committed = state.rows.committed;
  const rows = entry.explain.constraints.filter((index) => index < committed.length).map((index) => committed[index]!);
  return {
    sentence,
    rows: rows.map((row) => row.id),
    clashes: rows.map((row) => rowSentence(state, row)),
    faces: entry.explain.faces,
    explaining: false,
    minimal: entry.explain.minimal,
  };
}

// ---------------------------------------------------------------------------
// The hint line (Round3:1384-1395; Round 4's states)

export type LayerHintTone = 'quiet' | 'danger' | 'busy' | 'busy_danger';

/** Why a face has nothing left to choose (Round3 `settledReason`). */
export type LayerSettledWhy = 'settled' | 'no_overlap';

/** Why a saved row is not applied, or what it clashes with. */
export type LayerRowReason =
  /** A new crease split (or a removed one merged) its face: it could mean either part. */
  | { readonly key: 'ambiguous'; readonly face: LayerFace }
  /** A face it names no longer exists: "the face in front of D no longer exists". */
  | { readonly key: 'face_gone'; readonly sentence: LayerSentenceView; readonly gone: 'subject' | 'object' | 'both' }
  /** Its two faces are one face now. */
  | { readonly key: 'same_face'; readonly sentence: LayerSentenceView }
  /** Its faces no longer overlap. */
  | { readonly key: 'no_overlap'; readonly sentence: LayerSentenceView }
  /** It is in the clash shown. */
  | { readonly key: 'clashes'; readonly clashes: readonly LayerSentenceView[] }
  /** Intact, waiting for the rows that clash to settle. */
  | { readonly key: 'waiting' };

export type LayerHintText =
  /** "Pick a face · N faces have choices". */
  | { readonly key: 'pick_face'; readonly choosers: number }
  /** "Pick a face to replace C · N faces have choices". */
  | { readonly key: 'replace_subject'; readonly subject: LayerFace; readonly choosers: number }
  /** "Nothing left to choose: every overlap is settled". */
  | { readonly key: 'all_settled' }
  /** Pointing at a face while choosing a subject: "C · 3 faces to choose from". */
  | { readonly key: 'face_choices'; readonly face: LayerFace; readonly choices: number }
  /** "C · nothing left to choose: everything it overlaps is settled". */
  | { readonly key: 'face_nothing_left'; readonly face: LayerFace; readonly why: LayerSettledWhy }
  /** "Nothing left to choose for C: everything it overlaps is settled. Pick another face." */
  | { readonly key: 'subject_stuck'; readonly subject: LayerFace; readonly why: LayerSettledWhy }
  /** "Pick one of the N labelled faces", or "tinted" past the label cap (D7). */
  | { readonly key: 'pick_object'; readonly objects: number; readonly tinted: boolean }
  /** "Pick another labelled face to replace D", or "D is the only face to choose" when `objects` is 1. */
  | { readonly key: 'replace_object'; readonly object: LayerFace; readonly objects: number }
  /** "Checking C behind D…". */
  | { readonly key: 'checking'; readonly sentence: LayerSentenceView }
  /** "Can't fit. Finding what it clashes with…". */
  | { readonly key: 'cant_fit_explaining'; readonly sentence: LayerSentenceView }
  /** "Can't fit: with the creases, C in front of F clashes with C behind E", or with no clashes, "the creases don't allow …". */
  | {
      readonly key: 'cant_fit';
      readonly sentence: LayerSentenceView;
      readonly clashes: readonly LayerSentenceView[];
      readonly minimal: boolean;
    }
  /** "Couldn't check C behind D in time." with Keep trying (D8). */
  | { readonly key: 'timed_out'; readonly sentence: LayerSentenceView }
  /** A change to the list ran out of time with Keep trying; nothing changed. */
  | { readonly key: 'commit_timed_out'; readonly via: LayerCommitVia }
  /** Pointing at a row that is not applied: its reason. */
  | { readonly key: 'row_not_applied'; readonly reason: LayerRowReason }
  /** "Can't fit: with the new creases, E in front of C clashes with C in front of F. Remove one to apply." */
  | { readonly key: 'attention_clash'; readonly clashes: readonly LayerSentenceView[]; readonly explaining: boolean }
  | { readonly key: 'attention_checking' }
  /** The restore ran out of time, with Keep trying. */
  | { readonly key: 'attention_timed_out' };

export interface LayerHint {
  readonly tone: LayerHintTone;
  /** A button inside the reserved line. */
  readonly action: 'keep_trying' | null;
  readonly text: LayerHintText;
}

const quietHint = (text: LayerHintText): LayerHint => ({ tone: 'quiet', action: null, text });

function settledWhy(state: LayerOrderDialogState, face: LayerFace): LayerSettledWhy {
  return state.figure?.overlapping[face] === 1 ? 'settled' : 'no_overlap';
}

/** A carried row's reason, when it is not applied. */
export function carriedReason(state: LayerOrderDialogState, row: LayerCarriedRow): LayerRowReason | null {
  const clash = clashOnScreen(state);
  if (clash?.rows.includes(row.id)) {
    return { key: 'clashes', clashes: clash.clashes.filter((_, i) => clash.rows[i] !== row.id) };
  }
  const { status, subjectState, objectState, subject, object } = row.facts;
  const sentence = rowSentence(state, row);
  switch (status.status) {
    case 'intact':
    case 'clashing':
      return state.settle.kind === 'settled' ? null : { key: 'waiting' };
    case 'ambiguous': {
      const face = subjectState === 'ambiguous' ? subject : object;
      return face !== null ? { key: 'ambiguous', face } : { key: 'face_gone', sentence, gone: 'subject' };
    }
    case 'gone':
      if (status.cause === 'same_face') return { key: 'same_face', sentence };
      if (status.cause === 'no_overlap') return { key: 'no_overlap', sentence };
      return {
        key: 'face_gone',
        sentence,
        gone: subjectState === 'gone' && objectState === 'gone' ? 'both' : subjectState === 'gone' ? 'subject' : 'object',
      };
  }
}

/** The one line under the sentence: its height is always reserved, and it holds text only when something blocks or guides. */
export function hintLine(state: LayerOrderDialogState): LayerHint | null {
  if (state.phase.kind !== 'open' || !state.figure) return null;
  const hovered = findRow(state, state.hover.row);
  const hoveredReason = hovered?.kind === 'carried' ? carriedReason(state, hovered) : null;

  // A restored record still settling (D10): the builder is inert, and the line speaks for the rows.
  if (state.settle.kind !== 'settled' || (state.commit.kind !== 'idle' && state.commit.via === 'settle')) {
    if (hoveredReason && hoveredReason.key !== 'clashes') return quietHint({ key: 'row_not_applied', reason: hoveredReason });
    if (state.commit.kind === 'pending' || state.settle.kind === 'restoring') {
      return { tone: 'busy', action: null, text: { key: 'attention_checking' } };
    }
    if (state.commit.kind === 'timed_out' || state.settle.kind === 'timed_out') {
      return { tone: 'quiet', action: 'keep_trying', text: { key: 'attention_timed_out' } };
    }
    const clash = clashOnScreen(state);
    return {
      tone: 'danger',
      action: null,
      text: { key: 'attention_clash', clashes: clash?.clashes ?? [], explaining: clash?.explaining ?? false },
    };
  }

  if (state.commit.kind === 'timed_out') {
    return { tone: 'quiet', action: 'keep_trying', text: { key: 'commit_timed_out', via: state.commit.via } };
  }
  if (hoveredReason) return quietHint({ key: 'row_not_applied', reason: hoveredReason });

  const preview = displayedPreview(state);
  if (preview) {
    const sentence = constraintSentence(state, preview.candidate);
    if (preview.kind === 'pending') return { tone: 'busy', action: null, text: { key: 'checking', sentence } };
    if (preview.kind === 'timed_out') return { tone: 'quiet', action: 'keep_trying', text: { key: 'timed_out', sentence } };
    if (preview.kind === 'cant_fit') {
      const clash = clashOnScreen(state)!;
      if (clash.explaining) return { tone: 'busy_danger', action: null, text: { key: 'cant_fit_explaining', sentence } };
      return { tone: 'danger', action: null, text: { key: 'cant_fit', sentence, clashes: clash.clashes, minimal: clash.minimal } };
    }
  }

  // Round3:1389-1395.
  const { sentence } = state;
  const active = slotNow(sentence, state.open);
  if (active === 'subject') {
    const face = state.hover.face;
    if (face !== null && state.hover.slot === null) {
      const choices = openPartners(state.open, face).length;
      return quietHint(
        choices > 0 ? { key: 'face_choices', face, choices } : { key: 'face_nothing_left', face, why: settledWhy(state, face) }
      );
    }
    if (subjectStuck(sentence, state.open)) {
      return quietHint({ key: 'subject_stuck', subject: sentence.subject!, why: settledWhy(state, sentence.subject!) });
    }
    const choosers = state.open.partners.size;
    if (choosers === 0) return quietHint({ key: 'all_settled' });
    return quietHint(
      sentence.subject === null
        ? { key: 'pick_face', choosers }
        : { key: 'replace_subject', subject: sentence.subject, choosers }
    );
  }
  const objects = openPartners(state.open, sentence.subject).length;
  if (sentence.object === null) return quietHint({ key: 'pick_object', objects, tinted: objectsPastLabelCap(objects) });
  return quietHint({ key: 'replace_object', object: sentence.object, objects });
}

// ---------------------------------------------------------------------------
// Add, Clear, the history, Apply

export type LayerAddState =
  | { readonly enabled: true; readonly sentence: LayerSentenceView }
  | {
      readonly enabled: false;
      readonly why:
        | 'inert'
        | 'busy'
        | 'pick_subject'
        | 'subject_stuck'
        | 'pick_object'
        | 'checking'
        | 'cant_fit'
        | 'timed_out';
      /** The face or sentence the reason names (Round3 `addTitle`). */
      readonly subject: LayerFace | null;
      readonly sentence: LayerSentenceView | null;
    };

/** Add constraint: enabled only for a sentence its preview fit (Round3 `addOk`; D8). */
export function addState(state: LayerOrderDialogState): LayerAddState {
  const off = (why: Extract<LayerAddState, { enabled: false }>['why'], sentence: LayerSentenceView | null = null) =>
    ({ enabled: false, why, subject: state.sentence.subject, sentence }) as const;
  if (!builderLive(state)) return off('inert');
  const { sentence, open } = state;
  if (sentence.subject === null) return off('pick_subject');
  if (!hasChoices(open, sentence.subject)) return off('subject_stuck');
  const candidate = sentenceCandidate(state);
  if (!candidate) return off('pick_object');
  const view = constraintSentence(state, candidate);
  if (state.commit.kind === 'pending' || state.solutions.step.kind === 'pending') return off('busy', view);
  const entry = chosenPreview(state);
  if (!entry || entry.kind === 'pending') return off('checking', view);
  if (entry.kind === 'cant_fit') return off('cant_fit', view);
  if (entry.kind === 'timed_out' && !ADD_AFTER_PREVIEW_TIMEOUT) return off('timed_out', view);
  return { enabled: true, sentence: view };
}

export interface LayerListControls {
  readonly undo: boolean;
  readonly redo: boolean;
  readonly clearAll: boolean;
  /** The sentence's Clear. */
  readonly clearSentence: boolean;
  /** Each row's trash. */
  readonly remove: boolean;
}

export function listControls(state: LayerOrderDialogState): LayerListControls {
  const open = state.phase.kind === 'open';
  const quietNow = state.commit.kind !== 'pending' && state.solutions.step.kind !== 'pending';
  const settled = open && state.settle.kind === 'settled' && quietNow;
  const rows = state.rows.committed.length + state.rows.carried.length;
  return {
    undo: settled && canUndo(state.history),
    redo: settled && canRedo(state.history),
    clearAll: settled && rows > 0,
    clearSentence: builderLive(state) && (state.sentence.subject !== null || state.sentence.object !== null),
    remove: open && quietNow && state.settle.kind !== 'restoring',
  };
}

export type LayerApplyState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly why: 'opening' | 'refused' | 'busy' | 'clash' | 'unsettled' };

/** Apply waits while opening, while anything is changing the order, and while saved rows clash or are unsettled (D10). */
export function applyState(state: LayerOrderDialogState): LayerApplyState {
  const why = applyBlocker(state);
  return why === null ? { enabled: true } : { enabled: false, why };
}

// ---------------------------------------------------------------------------
// The panes

export interface LayerPaneMarks {
  /** The slot a face click fills now. */
  readonly active: LayerSlot;
  readonly subject: LayerFace | null;
  readonly object: LayerFace | null;
  /**
   * The faces a click can take in the active slot, faintly tinted: every face
   * with choices for the subject, the subject's open faces for the object.
   * Every other face is inert. Empty while the builder is inert.
   */
  readonly pickable: readonly LayerFace[];
  /** The subject's open faces: the valid objects, labelled on both panes. */
  readonly objects: readonly LayerFace[];
  /** Every face that carries a letter: the subject, the object, the valid objects, the clash's faces, the hovered row's. */
  readonly labelled: readonly LayerFace[];
  /** The face that lights on both panes: a hovered slot's, else the hovered face when the active slot can take it. */
  readonly lit: LayerFace | null;
  /** The hovered row's faces that still exist. */
  readonly rowFaces: readonly LayerFace[];
  /** The clash's faces: danger tints and labels on both panes. */
  readonly danger: readonly LayerFace[];
  /** Pointing at the reason strengthens the danger tints (Round3:473, 883). */
  readonly dangerStrong: boolean;
  /** The rows the clash marks, by id. */
  readonly clashRows: readonly number[];
  /** The spots a fitting preview would change, per side. */
  readonly changed: LayerChangedSpots | null;
  /** The spots of the last commit or step, fading once. */
  readonly flash: { readonly changed: LayerChangedSpots; readonly n: number } | null;
}

const NO_FACES: readonly LayerFace[] = [];

export function paneMarks(state: LayerOrderDialogState): LayerPaneMarks {
  const { sentence, open, hover } = state;
  const live = builderLive(state);
  const active = slotNow(sentence, open);
  const objects = openPartners(open, sentence.subject);
  const pickable = !live ? NO_FACES : active === 'subject' ? facesWithChoices(open) : objects;
  const clash = clashOnScreen(state);
  const danger = clash?.faces ?? NO_FACES;
  const hoveredRow = findRow(state, hover.row);
  const rowFacesNow = hoveredRow ? rowFaces(hoveredRow) : NO_FACES;
  const slotFace = hover.slot === 'subject' ? sentence.subject : hover.slot === 'object' ? sentence.object : null;
  const paneFace = hover.face !== null && pickable.includes(hover.face) ? hover.face : null;
  const labelled = Array.from(
    new Set(
      [sentence.subject, sentence.object, ...objects, ...danger, ...rowFacesNow].filter(
        (face): face is LayerFace => face !== null
      )
    )
  );
  const preview = displayedPreview(state);
  return {
    active,
    subject: sentence.subject,
    object: sentence.object,
    pickable,
    objects,
    labelled,
    lit: slotFace ?? paneFace,
    rowFaces: rowFacesNow,
    danger,
    dangerStrong: hover.reason && danger.length > 0,
    clashRows: clash?.rows ?? [],
    changed: preview?.kind === 'fits' ? preview.changed : null,
    flash: state.flash,
  };
}

/** The order the folded pane draws: a fitting preview's, else the order on screen. */
export function displayedStacks(state: LayerOrderDialogState): LayerSidesStacks | null {
  const preview: LayerPreviewEntry | null = displayedPreview(state);
  return preview?.kind === 'fits' ? preview.stacks : state.shown;
}

/**
 * Open spots (the switch, spec §6.2): the spots whose face in front is not
 * decided, from `side`. With every pair the creases and constraints decide
 * already in the order on screen, the face on top can change only for a face
 * it still has an open pair with.
 */
export function openSpotsOf(state: LayerOrderDialogState, side: LayerSide = state.view.side): number[] {
  const stacks: LayerStacks | undefined = displayedStacks(state)?.[side];
  if (!stacks) return [];
  const out: number[] = [];
  for (let spot = 0; spot + 1 < stacks.offsets.length; spot += 1) {
    const from = stacks.offsets[spot]!;
    const to = stacks.offsets[spot + 1]!;
    if (to - from < 2) continue;
    const partners = openPartners(state.open, stacks.faces[from]!);
    if (partners.length === 0) continue;
    for (let i = from + 1; i < to; i += 1) {
      if (partners.includes(stacks.faces[i]!)) {
        out.push(spot);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The status and the stepper (spec §6.6; D5, D7)

export type LayerStatusText =
  /** "N solutions", or "at least N" when the tally is a lower bound. */
  | { readonly key: 'solutions'; readonly count: LayerTally }
  /** With X-ray on, the stepper steps through every layer order, and the status counts those (D5). */
  | { readonly key: 'layer_orders'; readonly count: LayerTally }
  /** The count is skipped (D7): the status names the solution shown, "Solution 3". */
  | { readonly key: 'solution_n'; readonly index: number }
  /** Nothing counted yet. */
  | { readonly key: 'none' };

export interface LayerStepperView {
  /** From 1. */
  readonly index: number;
  /** Null when there is no total to give (D7); "n of N+" when inexact. */
  readonly total: LayerTally | null;
  readonly previous: boolean;
  readonly next: boolean;
  readonly busy: boolean;
}

export interface LayerStatusView {
  /** The dot: success once a single layer order fits (Round3:200), danger while saved rows clash. */
  readonly dot: 'open' | 'decided' | 'danger';
  readonly text: LayerStatusText;
  /** "24 layer orders fit; 12 differ only in hidden layers": only when larger and exact. */
  readonly tooltip: { readonly orders: number; readonly hidden: number } | null;
  readonly stepper: LayerStepperView | null;
}

export function statusView(state: LayerOrderDialogState): LayerStatusView | null {
  if (state.phase.kind !== 'open') return null;
  if (state.settle.kind === 'clash') {
    // Round 4 "The clashing set, Apply waiting": none fits, and there is nothing to step through.
    return { dot: 'danger', text: { key: 'solutions', count: { n: 0, exact: true } }, tooltip: null, stepper: null };
  }
  const { solutions, view } = state;
  const { count } = solutions;
  const position = solutions.positionBy === stepByKey(currentStepBy(state)) ? solutions.position : null;

  let text: LayerStatusText = { key: 'none' };
  if (!solutions.runs) text = position ? { key: 'solution_n', index: position.index } : { key: 'none' };
  else if (count && view.xray) text = { key: 'layer_orders', count: count.orders };
  else if (count) text = { key: 'solutions', count: count[view.side] };

  const pictures = count?.[view.side];
  const tooltip =
    solutions.runs && count && pictures && !view.xray && count.orders.exact && pictures.exact && count.orders.n > pictures.n
      ? { orders: count.orders.n, hidden: count.orders.n - pictures.n }
      : null;

  const settledNow = state.settle.kind === 'settled' && state.commit.kind !== 'pending';
  const { step } = solutions;
  const stepper: LayerStepperView | null = position
    ? {
        index: position.index,
        total: solutions.runs && count ? position.total : null,
        previous: settledNow && position.index > 1 && !(step.kind === 'end' && step.direction === 'previous'),
        next:
          settledNow &&
          !(position.total.exact && position.index >= position.total.n) &&
          !(step.kind === 'end' && step.direction === 'next'),
        busy: step.kind === 'pending',
      }
    : null;

  const decided = solutions.runs && count !== null && count.orders.exact && count.orders.n === 1;
  return { dot: decided ? 'decided' : 'open', text, tooltip, stepper };
}

// ---------------------------------------------------------------------------
// The constraint rows (spec §6.5; D10, D14)

export interface LayerRowView {
  readonly id: number;
  /** A committed row is applied; a carried one is a saved row a restore did not apply. */
  readonly kind: LayerRow['kind'];
  readonly sentence: LayerSentenceView;
  /** The dot: the clash shown marks its rows (danger); a saved row not applied is dimmed (warning). */
  readonly mark: 'none' | 'not_applied' | 'clash';
  /** For a row not applied or in a clash: its reason, for its tooltip and the hint line. */
  readonly reason: LayerRowReason | null;
  readonly hot: boolean;
  /** "Review…" opened on it (D14). */
  readonly flagged: boolean;
}

export function rowsView(state: LayerOrderDialogState): LayerRowView[] {
  const clash = clashOnScreen(state);
  const clashing = new Set(clash?.rows ?? []);
  const flagged = new Set(state.reviewRows ?? []);
  const view = (row: LayerRow): LayerRowView => {
    let reason: LayerRowReason | null = null;
    if (row.kind === 'carried') reason = carriedReason(state, row);
    else if (clash && clashing.has(row.id)) reason = clashReason(clash, row.id);
    const notApplied = row.kind === 'carried' && reason !== null && reason.key !== 'waiting' && reason.key !== 'clashes';
    return {
      id: row.id,
      kind: row.kind,
      sentence: rowSentence(state, row),
      mark: clashing.has(row.id) ? 'clash' : notApplied ? 'not_applied' : 'none',
      reason,
      hot: state.hover.row === row.id,
      flagged: flagged.has(row.id),
    };
  };
  return [...state.rows.committed.map(view), ...state.rows.carried.map(view)];
}

function clashReason(clash: LayerClashView, id: number): LayerRowReason {
  const others = clash.clashes.filter((_, i) => clash.rows[i] !== id);
  return { key: 'clashes', clashes: clash.sentence ? [clash.sentence, ...others] : others };
}

/** How many saved rows are not applied: what a host's flag counts. */
export function notAppliedCount(state: LayerOrderDialogState): number {
  return state.rows.carried.length;
}

// ---------------------------------------------------------------------------
// Opening, refusals and the notice

/** What a refusal says, by code: the face it names, and whether Keep trying can help. */
export type LayerRefusalMessage =
  | { readonly key: 'non_convex_face'; readonly face: LayerFace; readonly retry: null }
  | { readonly key: 'digest_mismatch'; readonly retry: null }
  | { readonly key: 'open_timed_out'; readonly retry: 'keep_trying' }
  | { readonly key: 'no_order'; readonly retry: null }
  | { readonly key: 'too_large'; readonly retry: null }
  | { readonly key: 'record_newer'; readonly retry: null }
  | { readonly key: 'record_unreadable'; readonly retry: null }
  | { readonly key: 'source_unreadable'; readonly code: LayerRefusal['code']; readonly retry: null };

export function refusalMessage(refusal: LayerRefusal): LayerRefusalMessage {
  switch (refusal.code) {
    case 'source_non_convex_face':
      return { key: 'non_convex_face', face: refusal.face, retry: null };
    case 'source_digest_mismatch':
      return { key: 'digest_mismatch', retry: null };
    case 'session_timed_out':
      return { key: 'open_timed_out', retry: 'keep_trying' };
    case 'session_no_order':
      return { key: 'no_order', retry: null };
    case 'source_too_many_faces':
    case 'source_stacked_too_deep':
    case 'record_over_budget':
      return { key: 'too_large', retry: null };
    case 'record_newer':
      return { key: 'record_newer', retry: null };
    case 'record_damaged':
    case 'session_bad_record':
      return { key: 'record_unreadable', retry: null };
    case 'source_no_faces':
    case 'source_kernel':
    case 'source_same_parity':
    case 'source_ambiguous_overlap':
    case 'source_tolerance':
      return { key: 'source_unreadable', code: refusal.code, retry: null };
  }
}

export type LayerOpeningView =
  /** "Working out the layer orders…", with Cancel; Apply waits. */
  | { readonly kind: 'working' }
  | { readonly kind: 'refused'; readonly message: LayerRefusalMessage }
  /** The engine went away: Try again. */
  | { readonly kind: 'failed' };

/** What the folded pane's place shows until the dialog is interactive; null once it is. */
export function openingView(state: LayerOrderDialogState): LayerOpeningView | null {
  switch (state.phase.kind) {
    case 'opening':
      return { kind: 'working' };
    case 'refused':
      return { kind: 'refused', message: refusalMessage(state.phase.refusal) };
    case 'failed':
      return { kind: 'failed' };
    default:
      return null;
  }
}

/** The line about the order the dialog opened on (D19), when it is not the host's. */
export function openNotice(state: LayerOrderDialogState): LayerOpenNotice | null {
  if (state.phase.kind !== 'open' || !state.openedOn) return null;
  return hostOrderNotice(state.openedOn, state.how === 'showing');
}
