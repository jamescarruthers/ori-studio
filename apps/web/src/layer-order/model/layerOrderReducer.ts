/**
 * The Layer order dialog's inspector reducer (`implementation-plans/layer-order-dialog.md`,
 * U9): every action in, the next state and the effects for the hook to run
 * out. The state, actions and effects are in `layerOrderState.ts`; what the
 * panes and the inspector draw from it is in `layerOrderSelectors.ts`.
 *
 * The rules follow the approved artboard (Round3), cited by its function:
 * the builder's in `layerOrderSentence.ts`; here `add`, `commit`, `undo`,
 * `redo`, `removeCons`, `clearAll` and `stepLook`. Every change to the list
 * re-solves for the fitting order closest to the one on screen and flashes
 * the spots that changed (Round3 `commit`); the engine does the solving, so
 * here a change is a `commit` effect, and it lands when its answer does.
 *
 * Pure: no React, no store, no engine calls.
 */
import {
  constraintAddedFact,
  constraintBlockedFact,
  dialogClosedFact,
  dialogOpenedFact,
  solutionsBucket,
  type LayerOrderFact,
} from './layerOrderAnalytics';
import {
  ADD_AFTER_PREVIEW_TIMEOUT,
  applyChangedNothing,
  keepTryingLimits,
  openedOnHostOrder,
  reviewRowsFor,
  solutionCountRuns,
  stepByFor,
} from './layerOrderDecisions';
import {
  LAYER_ORDER_MODEL_LIMITS,
  type LayerChangedSpots,
  type LayerConstraint,
  type LayerExplainFacts,
  type LayerFace,
  type LayerOpenFacts,
  type LayerOrderLimits,
  type LayerPreviewFacts,
  type LayerStacks,
  type LayerStepBy,
} from './layerOrderEngineFacts';
import { afterRedo, afterUndo, emptyHistory, recorded, redoTarget, undoTarget } from './layerOrderHistory';
import {
  EMPTY_SENTENCE,
  activateSlot,
  candidateOf,
  clearSentence,
  clearSlot,
  constraintKey,
  groundClick,
  keepOpenObject,
  openIndexOf,
  pickFace,
  revealSubject,
  setVerb,
} from './layerOrderSentence';
import type {
  LayerCarriedRow,
  LayerClash,
  LayerCommitAsk,
  LayerCommittedRow,
  LayerOrderAction,
  LayerOrderDialogInit,
  LayerOrderDialogState,
  LayerOrderEffect,
  LayerOrderStep,
  LayerPreviewEntry,
  LayerRows,
  LayerSettle,
} from './layerOrderState';

const NO_ROWS: LayerRows = { committed: [], carried: [] };

function openLimits(how: LayerOrderDialogState['how']): LayerOrderLimits {
  return how === 'restore' ? LAYER_ORDER_MODEL_LIMITS.restore : LAYER_ORDER_MODEL_LIMITS.open;
}

/** The dialog as it opens: working, with one effect, the open. */
export function initLayerOrderDialog(init: LayerOrderDialogInit): LayerOrderStep {
  const how = init.hasRecord ? 'restore' : 'showing';
  const limits = openLimits(how);
  const state: LayerOrderDialogState = {
    surface: init.surface,
    how,
    review: init.review,
    recordNeedsAttention: init.recordNeedsAttention,
    openedAt: init.at,
    reportedOpen: false,
    nextRequest: 2,
    nextRowId: 1,
    flashes: 0,
    phase: { kind: 'opening', request: 1, limits },
    figure: null,
    openedOn: null,
    open: openIndexOf(new Uint32Array()),
    shown: null,
    rows: NO_ROWS,
    history: emptyHistory(),
    commit: { kind: 'idle' },
    settle: { kind: 'settled' },
    reviewRows: null,
    sentence: EMPTY_SENTENCE,
    pointedVerb: null,
    previews: {},
    solutions: { runs: true, generation: 0, count: null, position: null, positionBy: null, step: { kind: 'idle' } },
    hover: { face: null, slot: null, row: null, reason: false },
    view: { side: 'front', xray: init.xray, openSpots: false },
    flash: null,
    baseline: null,
  };
  return { state, effects: [{ type: 'open', request: 1, how, limits }] };
}

/** One action: the next state, and the effects to run. */
export function layerOrderReducer(state: LayerOrderDialogState, action: LayerOrderAction): LayerOrderStep {
  if (state.phase.kind === 'closed') return { state, effects: [] };
  const effects: LayerOrderEffect[] = [];
  const next = reduce(state, action, effects);
  return reconcile(next, effects);
}

// ---------------------------------------------------------------------------
// Small reads

/** The builder takes picks: the session is open and every saved row that can apply is applied. */
export function builderLive(state: LayerOrderDialogState): boolean {
  return state.phase.kind === 'open' && state.figure !== null && state.settle.kind === 'settled';
}

/** Neither a commit nor a step is in flight: the list and the order on screen can change. */
function quiet(state: LayerOrderDialogState): boolean {
  return state.commit.kind !== 'pending' && state.solutions.step.kind !== 'pending';
}

export function stepByKey(by: LayerStepBy): string {
  return typeof by === 'string' ? by : `picture:${by.picture}`;
}

export function currentStepBy(state: LayerOrderDialogState): LayerStepBy {
  return stepByFor(state.view.side, state.view.xray);
}

/** The committed list. */
export function committedConstraints(rows: LayerRows): LayerConstraint[] {
  return rows.committed.map((row) => row.constraint);
}

/** The sentence as a constraint with `verb`, read from the side shown; null unless complete. */
export function sentenceCandidate(state: LayerOrderDialogState, verb = state.sentence.verb): LayerConstraint | null {
  if (!state.figure) return null;
  return candidateOf(state.sentence, state.open, verb, state.view.side, state.figure.frontUp);
}

/** The sentence's preview as the folded pane shows it: with the menu's pointed verb when there is one. */
export function displayedPreview(state: LayerOrderDialogState): LayerPreviewEntry | null {
  const candidate = sentenceCandidate(state, state.pointedVerb ?? state.sentence.verb);
  return candidate ? (state.previews[constraintKey(candidate)] ?? null) : null;
}

/** The preview Add stands on: the sentence's own verb. */
export function chosenPreview(state: LayerOrderDialogState): LayerPreviewEntry | null {
  const candidate = sentenceCandidate(state);
  return candidate ? (state.previews[constraintKey(candidate)] ?? null) : null;
}

/** Rows a restore can still apply: intact on today's faces, not yet committed (D10). */
function applicable(row: LayerCarriedRow): boolean {
  const { status } = row.facts.status;
  return row.facts.constraint !== null && (status === 'intact' || status === 'clashing');
}

function sameCommitted(a: readonly LayerCommittedRow[], b: readonly LayerCommittedRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.id === b[i]!.id);
}

function constraintFaces(constraints: readonly LayerConstraint[]): LayerFace[] {
  return Array.from(new Set(constraints.flatMap((c) => [c[0], c[1]])));
}

function hasChangedSpots(changed: LayerChangedSpots): boolean {
  return changed.front.length > 0 || changed.back.length > 0;
}

function overlappingFaces(faces: number, stacks: LayerStacks): Uint8Array {
  const out = new Uint8Array(faces);
  for (let spot = 0; spot + 1 < stacks.offsets.length; spot += 1) {
    const from = stacks.offsets[spot]!;
    const to = stacks.offsets[spot + 1]!;
    if (to - from < 2) continue;
    for (let i = from; i < to; i += 1) out[stacks.faces[i]!] = 1;
  }
  return out;
}

function request(state: LayerOrderDialogState): [number, LayerOrderDialogState] {
  return [state.nextRequest, { ...state, nextRequest: state.nextRequest + 1 }];
}

// ---------------------------------------------------------------------------
// The reducer

function reduce(state: LayerOrderDialogState, action: LayerOrderAction, effects: LayerOrderEffect[]): LayerOrderDialogState {
  switch (action.type) {
    case 'opened':
      return opened(state, action.request, action.facts, effects);
    case 'open_refused': {
      const waiting =
        (state.phase.kind === 'opening' && state.phase.request === action.request) ||
        (state.settle.kind === 'restoring' && state.settle.request === action.request);
      if (!waiting) return state;
      const limits = state.phase.kind === 'opening' ? state.phase.limits : LAYER_ORDER_MODEL_LIMITS.restore;
      return { ...state, phase: { kind: 'refused', refusal: action.refusal, limits } };
    }
    case 'previewed':
      return previewed(state, action.request, action.facts, effects);
    case 'explained':
      return explained(state, action.request, action.facts);
    case 'committed':
      return committed(state, action, effects);
    case 'solutions_counted': {
      const { solutions } = state;
      if (action.generation !== solutions.generation) return state;
      const count = action.count ?? solutions.count;
      if (solutions.runs && count && !count.done) {
        effects.push({
          type: 'solutions_slice',
          generation: solutions.generation,
          by: currentStepBy(state),
          limits: LAYER_ORDER_MODEL_LIMITS.slice,
        });
      }
      return {
        ...state,
        solutions: { ...solutions, count, position: action.position, positionBy: stepByKey(action.by) },
      };
    }
    case 'solutions_positioned':
      if (action.generation !== state.solutions.generation) return state;
      return {
        ...state,
        solutions: { ...state.solutions, position: action.position, positionBy: stepByKey(action.by) },
      };
    case 'stepped':
      return stepped(state, action, effects);
    case 'engine_lost': {
      const limits = state.phase.kind === 'opening' ? state.phase.limits : openLimits(state.how);
      return { ...state, phase: { kind: 'failed', limits } };
    }

    case 'face_hovered':
      return state.hover.face === action.face ? state : { ...state, hover: { ...state.hover, face: action.face } };
    case 'face_picked':
      if (!builderLive(state)) return state;
      return withSentence(state, pickFace(state.sentence, state.open, action.face, action.origin));
    case 'ground_clicked':
      if (!builderLive(state)) return state;
      return withSentence(state, groundClick(state.sentence));
    case 'slot_activated':
      if (!builderLive(state)) return state;
      return withSentence(state, activateSlot(state.sentence, state.open, action.slot));
    case 'slot_cleared':
      if (!builderLive(state)) return state;
      return withSentence(state, clearSlot(state.sentence, action.slot));
    case 'slot_hovered':
      return state.hover.slot === action.slot ? state : { ...state, hover: { ...state.hover, slot: action.slot } };
    case 'sentence_cleared':
      if (!builderLive(state)) return state;
      return withSentence(state, clearSentence(state.sentence));
    case 'verb_pointed':
      return state.pointedVerb === action.verb ? state : { ...state, pointedVerb: action.verb };
    case 'verb_set':
      if (!builderLive(state)) return state;
      return { ...state, sentence: setVerb(state.sentence, action.verb), pointedVerb: null };
    case 'reason_hovered':
      return state.hover.reason === action.on ? state : { ...state, hover: { ...state.hover, reason: action.on } };
    case 'add':
      return add(state, effects);
    case 'keep_trying':
      return keepTryingAgain(state, effects);

    case 'row_hovered':
      return state.hover.row === action.id ? state : { ...state, hover: { ...state.hover, row: action.id } };
    case 'row_clicked':
      return rowClicked(state, action.id);
    case 'row_removed':
      return rowRemoved(state, action.id, effects);
    case 'undo':
      return travel(state, 'undo', effects);
    case 'redo':
      return travel(state, 'redo', effects);
    case 'clear_all':
      return clearAll(state, effects);

    case 'side_set': {
      if (state.view.side === action.side) return state;
      // Round3 `setSide`: the flash and the hovered spot go; the sentence stays, and reads from the new side.
      const next: LayerOrderDialogState = {
        ...state,
        view: { ...state.view, side: action.side },
        flash: null,
        pointedVerb: null,
        hover: { ...state.hover, face: null },
      };
      return repositioned(state, next, effects);
    }
    case 'xray_set':
      if (state.view.xray === action.on) return state;
      return repositioned(state, { ...state, view: { ...state.view, xray: action.on } }, effects);
    case 'open_spots_set':
      return state.view.openSpots === action.on ? state : { ...state, view: { ...state.view, openSpots: action.on } };
    case 'step':
      return step(state, action.direction, effects);
    case 'flash_ended':
      return state.flash?.n === action.n ? { ...state, flash: null } : state;
    case 'retry_open': {
      if (state.phase.kind !== 'failed') return state;
      return reopen(state, state.phase.limits, effects);
    }

    case 'apply':
      return apply(state, action.at, effects);
    case 'cancel': {
      if (state.reportedOpen) {
        effects.push({ type: 'track', fact: closedFact(state, 'cancelled', action.at) });
      }
      effects.push({ type: 'close' });
      return { ...state, phase: { kind: 'closed', outcome: 'cancelled' } };
    }
  }
}

function withSentence(state: LayerOrderDialogState, sentence: LayerOrderDialogState['sentence']): LayerOrderDialogState {
  if (sentence === state.sentence) return state;
  // A pick closes the verb menu and lets go of the reason (Round3 `setSubject`, `setObject`).
  return { ...state, sentence, pointedVerb: null, hover: { ...state.hover, reason: false } };
}

/** The side or X-ray changed: the stepper steps by something else now (D5), so its position is read again. */
function repositioned(
  before: LayerOrderDialogState,
  next: LayerOrderDialogState,
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  const by = currentStepBy(next);
  if (stepByKey(by) === stepByKey(currentStepBy(before)) || next.phase.kind !== 'open') return next;
  effects.push({ type: 'solutions_position', generation: next.solutions.generation, by });
  return { ...next, solutions: { ...next.solutions, position: null, positionBy: null, step: { kind: 'idle' } } };
}

// ---------------------------------------------------------------------------
// Opening

function reopen(state: LayerOrderDialogState, limits: LayerOrderLimits, effects: LayerOrderEffect[]): LayerOrderDialogState {
  const [id, next] = request(state);
  effects.push({ type: 'open', request: id, how: state.how, limits });
  return { ...next, phase: { kind: 'opening', request: id, limits } };
}

function opened(
  state: LayerOrderDialogState,
  id: number,
  facts: LayerOpenFacts,
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  const opening = state.phase.kind === 'opening' && state.phase.request === id;
  const restoring = state.settle.kind === 'restoring' && state.settle.request === id;
  if (!opening && !restoring) return state;
  const limits =
    state.phase.kind === 'opening'
      ? state.phase.limits
      : state.settle.kind === 'restoring'
        ? state.settle.limits
        : LAYER_ORDER_MODEL_LIMITS.restore;

  let nextRowId = state.nextRowId;
  const committed: LayerCommittedRow[] = facts.constraints.map((constraint) => ({
    kind: 'committed',
    id: nextRowId++,
    constraint,
  }));
  const carried: LayerCarriedRow[] = (facts.restore?.carried ?? []).map((row) => ({
    kind: 'carried',
    id: nextRowId++,
    facts: row,
  }));

  let settle: LayerSettle = { kind: 'settled' };
  const outcome = facts.restore?.outcome;
  if (outcome?.kind === 'clash') {
    const clashing = new Set(outcome.constraints);
    const rows = carried.filter((row) => clashing.has(row.facts.index)).map((row) => row.id);
    settle = { kind: 'clash', rows, explain: null };
  } else if (outcome?.kind === 'timed_out') {
    settle = { kind: 'timed_out', limits };
  }

  const runs = solutionCountRuns(facts.faces);
  const generation = state.solutions.generation + 1;
  const matchesHost =
    openedOnHostOrder(facts.openedOn) &&
    !state.recordNeedsAttention &&
    (facts.restore === null || (outcome?.kind === 'applied' && carried.length === 0));

  const next: LayerOrderDialogState = {
    ...state,
    nextRowId,
    phase: { kind: 'open' },
    figure: {
      faces: facts.faces,
      frontUp: facts.frontUp,
      overlapping: overlappingFaces(facts.faces, facts.stacks.front),
    },
    openedOn: facts.openedOn,
    open: openIndexOf(facts.openPairs),
    shown: facts.stacks,
    rows: { committed, carried },
    history: emptyHistory(),
    commit: { kind: 'idle' },
    settle,
    reviewRows: reviewRowsFor(state.review, carried.map((row) => row.id)),
    sentence: EMPTY_SENTENCE,
    pointedVerb: null,
    previews: {},
    solutions: { runs, generation, count: null, position: null, positionBy: null, step: { kind: 'idle' } },
    hover: { face: null, slot: null, row: null, reason: false },
    flash: null,
    baseline: {
      constraints: facts.constraints,
      carried: carried.map((row) => row.facts.index),
      stacks: facts.stacks,
      matchesHost,
    },
    reportedOpen: true,
  };
  effects.push({ type: 'solutions_restart', generation, by: currentStepBy(next), count: runs });
  if (!state.reportedOpen) {
    effects.push({
      type: 'track',
      fact: dialogOpenedFact(state.surface, facts.faces, solutionsBucket(null, runs)),
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Previews

/**
 * After every action: a complete sentence the order on screen has no preview
 * for gets one (the one the folded pane shows, with the menu's pointed verb),
 * and the sentence's own can't-fit is reported once.
 */
function reconcile(state: LayerOrderDialogState, effects: LayerOrderEffect[]): LayerOrderStep {
  let next = state;
  if (builderLive(next) && quiet(next)) {
    const candidate = sentenceCandidate(next, next.pointedVerb ?? next.sentence.verb);
    if (candidate && !next.previews[constraintKey(candidate)]) {
      const [id, asked] = request(next);
      const limits = LAYER_ORDER_MODEL_LIMITS.preview;
      effects.push({ type: 'preview', request: id, candidate, limits });
      next = {
        ...asked,
        previews: { ...asked.previews, [constraintKey(candidate)]: { kind: 'pending', request: id, candidate, limits } },
      };
    }
  }
  const chosen = chosenPreview(next);
  if (chosen?.kind === 'cant_fit' && !chosen.reported) {
    effects.push({ type: 'track', fact: constraintBlockedFact(next.rows.committed.length) });
    next = {
      ...next,
      previews: { ...next.previews, [constraintKey(chosen.candidate)]: { ...chosen, reported: true } },
    };
  }
  return { state: next, effects };
}

function previewKeyFor(state: LayerOrderDialogState, match: (entry: LayerPreviewEntry) => boolean): string | null {
  return Object.keys(state.previews).find((key) => match(state.previews[key]!)) ?? null;
}

function previewed(
  state: LayerOrderDialogState,
  id: number,
  facts: LayerPreviewFacts,
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  const key = previewKeyFor(state, (entry) => entry.kind === 'pending' && entry.request === id);
  if (key === null) return state;
  const entry = state.previews[key] as Extract<LayerPreviewEntry, { kind: 'pending' }>;
  const { candidate } = entry;
  let result: LayerPreviewEntry;
  let next = state;
  switch (facts.verdict) {
    case 'fits':
      result = { kind: 'fits', candidate, token: facts.token, changed: facts.changed, stacks: facts.stacks };
      break;
    case 'timed_out':
      result = { kind: 'timed_out', candidate, limits: entry.limits };
      break;
    case 'cant_fit': {
      const candidateIndex = state.rows.committed.length;
      const alone = facts.constraints.every((index) => index === candidateIndex);
      if (alone) {
        // The creases alone refuse it: nothing to explain.
        result = {
          kind: 'cant_fit',
          candidate,
          constraints: facts.constraints,
          explain: { kind: 'done', constraints: [candidateIndex], faces: [candidate[0], candidate[1]], minimal: true },
          reported: false,
        };
      } else {
        const [explainId, asked] = request(state);
        next = asked;
        effects.push({
          type: 'explain',
          request: explainId,
          target: { kind: 'candidate', candidate },
          limits: LAYER_ORDER_MODEL_LIMITS.explain,
        });
        result = {
          kind: 'cant_fit',
          candidate,
          constraints: facts.constraints,
          explain: { kind: 'pending', request: explainId },
          reported: false,
        };
      }
      break;
    }
  }
  return { ...next, previews: { ...next.previews, [key]: result } };
}

function explained(state: LayerOrderDialogState, id: number, facts: LayerExplainFacts): LayerOrderDialogState {
  const key = previewKeyFor(
    state,
    (entry) => entry.kind === 'cant_fit' && entry.explain.kind === 'pending' && entry.explain.request === id
  );
  if (key !== null) {
    const entry = state.previews[key] as Extract<LayerPreviewEntry, { kind: 'cant_fit' }>;
    const list = [...committedConstraints(state.rows), entry.candidate];
    const clash = clashOf(facts, entry.constraints, list);
    return { ...state, previews: { ...state.previews, [key]: { ...entry, explain: { kind: 'done', ...clash } } } };
  }
  const { settle } = state;
  if (settle.kind === 'clash' && settle.explain?.request === id) {
    // The list the settle commit sent, row for row: the rows did not move, since it did not land.
    const { listRows } = settle.explain;
    const live = new Set(state.rows.carried.map((row) => row.id));
    const clashing =
      facts.verdict === 'clash'
        ? facts.constraints.map((index) => listRows[index]).filter((rowId) => rowId !== undefined)
        : settle.rows;
    return { ...state, settle: { kind: 'clash', rows: clashing.filter((rowId) => live.has(rowId)), explain: null } };
  }
  return state;
}

/** The smallest clashing set explain found; when it couldn't (out of time, or no verdict), the check's own set, not minimal. */
function clashOf(facts: LayerExplainFacts, checked: readonly number[], list: readonly LayerConstraint[]): LayerClash {
  if (facts.verdict === 'clash') {
    return { constraints: facts.constraints, faces: facts.faces, minimal: facts.minimal };
  }
  const named = checked.map((index) => list[index]).filter((c): c is LayerConstraint => c !== undefined);
  return { constraints: checked, faces: constraintFaces(named), minimal: false };
}

// ---------------------------------------------------------------------------
// Commits: Add, remove, undo, redo, Clear all (Round3 `commit`)

function ask(state: LayerOrderDialogState, commitAsk: LayerCommitAsk, effects: LayerOrderEffect[]): LayerOrderDialogState {
  const [id, next] = request(state);
  effects.push({
    type: 'commit',
    request: id,
    constraints: commitAsk.constraints,
    token: commitAsk.token,
    limits: commitAsk.limits,
  });
  return { ...next, commit: { kind: 'pending', request: id, ...commitAsk } };
}

/** A change to the list only, with no new list to commit: carried rows, which the order never depends on. */
function landNow(state: LayerOrderDialogState, rows: LayerRows, history: LayerOrderDialogState['history']): LayerOrderDialogState {
  const hoverRow = state.hover.row;
  const stillThere = hoverRow === null || [...rows.committed, ...rows.carried].some((row) => row.id === hoverRow);
  return { ...state, rows, history, hover: stillThere ? state.hover : { ...state.hover, row: null } };
}

/** Round3 `add`: commit the sentence the preview fit, by its token; it lands (and the sentence clears) when the commit does. */
function add(state: LayerOrderDialogState, effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (!builderLive(state) || !quiet(state)) return state;
  const entry = chosenPreview(state);
  const searchAfterTimeout = entry?.kind === 'timed_out' && ADD_AFTER_PREVIEW_TIMEOUT;
  if (entry?.kind !== 'fits' && !searchAfterTimeout) return state;
  const row: LayerCommittedRow = { kind: 'committed', id: state.nextRowId, constraint: entry!.candidate };
  const rows = { ...state.rows, committed: [...state.rows.committed, row] };
  return ask(
    { ...state, nextRowId: state.nextRowId + 1 },
    {
      via: 'add',
      constraints: committedConstraints(rows),
      token: entry?.kind === 'fits' ? entry.token : null,
      limits: LAYER_ORDER_MODEL_LIMITS.commit,
      rows,
      history: recorded(state.history, state.rows),
      sentence: state.sentence,
      listRows: rows.committed.map((r) => r.id),
    },
    effects
  );
}

function committed(
  state: LayerOrderDialogState,
  action: Extract<LayerOrderAction, { type: 'committed' }>,
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  const { commit } = state;
  if (commit.kind !== 'pending' || commit.request !== action.request) return state;
  const { facts } = action;
  const { request: _request, kind: _kind, ...commitAsk } = commit;

  if (facts.verdict === 'timed_out') return { ...state, commit: { kind: 'timed_out', ...commitAsk } };
  if (facts.verdict === 'cant_fit') {
    if (commit.via !== 'settle') {
      // A list that fit once fits again with the creases unchanged; nothing to do but stay as we were.
      return { ...state, commit: { kind: 'idle' } };
    }
    // The rows still clash after a removal: mark the check's set, and find the smallest (D10).
    const [id, next] = request({ ...state, commit: { kind: 'idle' } });
    const rows = facts.constraints.map((index) => commit.listRows[index]).filter((rowId) => rowId !== undefined);
    effects.push({
      type: 'explain',
      request: id,
      target: { kind: 'list', constraints: commit.constraints },
      limits: LAYER_ORDER_MODEL_LIMITS.explain,
    });
    return { ...next, settle: { kind: 'clash', rows, explain: { request: id, listRows: commit.listRows } } };
  }

  const open = openIndexOf(facts.openPairs);
  let sentence = state.sentence;
  if (commit.via === 'add' && commit.sentence && sameSentence(commit.sentence, sentence)) {
    // Round3 `add`: the whole sentence clears; the flash is what remains of it.
    sentence = EMPTY_SENTENCE;
  } else {
    sentence = keepOpenObject(sentence, open);
  }
  const generation = state.solutions.generation + 1;
  let next: LayerOrderDialogState = landNow(
    {
      ...state,
      open,
      shown: facts.stacks,
      commit: { kind: 'idle' },
      settle: commit.via === 'settle' ? { kind: 'settled' } : state.settle,
      sentence,
      pointedVerb: commit.via === 'add' ? null : state.pointedVerb,
      previews: {},
      solutions: { ...state.solutions, generation, count: null, position: null, positionBy: null, step: { kind: 'idle' } },
    },
    commit.rows,
    commit.history
  );
  next = flashed(next, facts.changed, effects);
  effects.push({ type: 'solutions_restart', generation, by: currentStepBy(next), count: next.solutions.runs });
  if (commit.via === 'add' && commit.sentence) {
    const { verb, subjectOrigin, objectOrigin } = commit.sentence;
    const fact = constraintAddedFact(verb, subjectOrigin ?? 'pattern', objectOrigin ?? 'pattern');
    effects.push({ type: 'track', fact });
  }
  return next;
}

function sameSentence(a: LayerOrderDialogState['sentence'], b: LayerOrderDialogState['sentence']): boolean {
  return a.subject === b.subject && a.object === b.object && a.verb === b.verb;
}

function flashed(state: LayerOrderDialogState, changed: LayerChangedSpots, effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (!hasChangedSpots(changed)) return { ...state, flash: null };
  const n = state.flashes + 1;
  effects.push({ type: 'flash', n });
  return { ...state, flashes: n, flash: { changed, n } };
}

/** Round3 `removeCons`, and a carried row's trash (D10). */
function rowRemoved(state: LayerOrderDialogState, id: number, effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (state.phase.kind !== 'open' || !quiet(state) || state.settle.kind === 'restoring') return state;
  const { rows } = state;
  if (rows.committed.some((row) => row.id === id)) {
    if (state.settle.kind !== 'settled') return state;
    const target = { ...rows, committed: rows.committed.filter((row) => row.id !== id) };
    return ask(
      state,
      {
        via: 'remove',
        constraints: committedConstraints(target),
        token: null,
        limits: LAYER_ORDER_MODEL_LIMITS.commit,
        rows: target,
        history: recorded(state.history, rows),
        sentence: null,
        listRows: target.committed.map((row) => row.id),
      },
      effects
    );
  }
  if (!rows.carried.some((row) => row.id === id)) return state;
  const target = { ...rows, carried: rows.carried.filter((row) => row.id !== id) };
  if (state.settle.kind === 'settled') {
    // A carried row the order never depended on: no commit, but an entry, so undo puts it back.
    return landNow(state, target, recorded(state.history, rows));
  }
  return settleAfterRemoval(landNow(state, target, state.history), id, effects);
}

/**
 * A row removed while the saved rows are unsettled: the rows left that can
 * apply are committed together, or not at all (D10). With none left, they
 * are settled as they stand.
 */
function settleAfterRemoval(state: LayerOrderDialogState, removed: number, effects: LayerOrderEffect[]): LayerOrderDialogState {
  // A clashing set none of whose rows went still clashes: there is nothing to re-check.
  if (state.settle.kind === 'clash' && !state.settle.rows.includes(removed)) return state;
  const settle =
    state.settle.kind === 'clash'
      ? { ...state.settle, rows: state.settle.rows.filter((rowId) => rowId !== removed), explain: null }
      : state.settle;
  const listed = state.rows.carried.filter(applicable);
  if (listed.length === 0) return { ...state, settle: { kind: 'settled' } };
  const promoted: LayerCommittedRow[] = listed.map((row) => ({
    kind: 'committed',
    id: row.id,
    constraint: row.facts.constraint!,
  }));
  const listedIds = new Set(listed.map((row) => row.id));
  const rows: LayerRows = {
    committed: [...state.rows.committed, ...promoted],
    carried: state.rows.carried.filter((row) => !listedIds.has(row.id)),
  };
  return ask(
    { ...state, settle },
    {
      via: 'settle',
      constraints: committedConstraints(rows),
      token: null,
      limits: LAYER_ORDER_MODEL_LIMITS.commit,
      rows,
      history: state.history,
      sentence: null,
      listRows: rows.committed.map((row) => row.id),
    },
    effects
  );
}

/** Round3 `undo` and `redo`: commit the list stepped to, re-solved for the order closest to the one on screen. */
function travel(state: LayerOrderDialogState, way: 'undo' | 'redo', effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (state.phase.kind !== 'open' || state.settle.kind !== 'settled' || !quiet(state)) return state;
  const target = way === 'undo' ? undoTarget(state.history) : redoTarget(state.history);
  if (!target) return state;
  const history = way === 'undo' ? afterUndo(state.history, state.rows) : afterRedo(state.history, state.rows);
  if (sameCommitted(target.committed, state.rows.committed)) return landNow(state, target, history);
  return ask(
    state,
    {
      via: way,
      constraints: committedConstraints(target),
      token: null,
      limits: LAYER_ORDER_MODEL_LIMITS.commit,
      rows: target,
      history,
      sentence: null,
      listRows: target.committed.map((row) => row.id),
    },
    effects
  );
}

/** Round3 `clearAll`: every row goes, carried ones included, as one entry undo puts back. */
function clearAll(state: LayerOrderDialogState, effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (state.phase.kind !== 'open' || state.settle.kind !== 'settled' || !quiet(state)) return state;
  if (state.rows.committed.length === 0 && state.rows.carried.length === 0) return state;
  const history = recorded(state.history, state.rows);
  if (state.rows.committed.length === 0) return landNow(state, NO_ROWS, history);
  return ask(
    state,
    {
      via: 'clear_all',
      constraints: [],
      token: null,
      limits: LAYER_ORDER_MODEL_LIMITS.commit,
      rows: NO_ROWS,
      history,
      sentence: null,
      listRows: [],
    },
    effects
  );
}

/** Round3 `reveal`: a row's subject goes into the builder. A row whose subject no longer exists has none to give. */
function rowClicked(state: LayerOrderDialogState, id: number): LayerOrderDialogState {
  if (!builderLive(state)) return state;
  const committedRow = state.rows.committed.find((row) => row.id === id);
  const carriedRow = state.rows.carried.find((row) => row.id === id);
  const subject = committedRow ? committedRow.constraint[0] : (carriedRow?.facts.subject ?? null);
  if (subject === null) return state;
  return withSentence(state, revealSubject(state.sentence, subject));
}

// ---------------------------------------------------------------------------
// Keep trying (D8, D10)

function keepTryingAgain(state: LayerOrderDialogState, effects: LayerOrderEffect[]): LayerOrderDialogState {
  const { phase, settle, commit } = state;
  if (phase.kind === 'refused') {
    if (phase.refusal.code !== 'session_timed_out') return state;
    return reopen(state, keepTryingLimits(phase.limits), effects);
  }
  if (phase.kind !== 'open') return state;
  // A re-check that ran out comes before the restore it followed: restoring again would bring back the rows removed since.
  if (commit.kind === 'timed_out') {
    const { kind: _kind, ...commitAsk } = commit;
    // A token commit can't run out, so this is a search: send it again, later.
    return ask(state, { ...commitAsk, token: null, limits: keepTryingLimits(commit.limits) }, effects);
  }
  if (settle.kind === 'timed_out') {
    const [id, next] = request(state);
    const limits = keepTryingLimits(settle.limits);
    effects.push({ type: 'open', request: id, how: 'restore', limits });
    return { ...next, settle: { kind: 'restoring', request: id, limits } };
  }
  const entry = displayedPreview(state);
  if (entry?.kind === 'timed_out' && quiet(state)) {
    const [id, next] = request(state);
    const limits = keepTryingLimits(entry.limits);
    effects.push({ type: 'preview', request: id, candidate: entry.candidate, limits });
    return {
      ...next,
      previews: {
        ...next.previews,
        [constraintKey(entry.candidate)]: { kind: 'pending', request: id, candidate: entry.candidate, limits },
      },
    };
  }
  return state;
}

// ---------------------------------------------------------------------------
// The stepper (Round3 `stepLook`; D5, D7)

function step(
  state: LayerOrderDialogState,
  direction: 'next' | 'previous',
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  if (state.phase.kind !== 'open' || state.settle.kind !== 'settled' || !quiet(state)) return state;
  const [id, next] = request(state);
  const by = currentStepBy(state);
  effects.push({
    type: 'step',
    request: id,
    generation: state.solutions.generation,
    by,
    direction,
    limits: LAYER_ORDER_MODEL_LIMITS.step,
  });
  return { ...next, solutions: { ...next.solutions, step: { kind: 'pending', request: id, direction, by } } };
}

function stepped(
  state: LayerOrderDialogState,
  action: Extract<LayerOrderAction, { type: 'stepped' }>,
  effects: LayerOrderEffect[]
): LayerOrderDialogState {
  const pending = state.solutions.step;
  if (pending.kind !== 'pending' || pending.request !== action.request) return state;
  const { facts } = action;
  if (facts.verdict === 'end') {
    return { ...state, solutions: { ...state.solutions, step: { kind: 'end', direction: pending.direction } } };
  }
  if (facts.verdict === 'timed_out') {
    return { ...state, solutions: { ...state.solutions, step: { kind: 'timed_out', direction: pending.direction } } };
  }
  // The order on screen changed, and no constraint did: previews go, the flash shows what moved.
  const next: LayerOrderDialogState = {
    ...state,
    shown: facts.stacks,
    previews: {},
    solutions: {
      ...state.solutions,
      position: facts.position,
      positionBy: stepByKey(pending.by),
      step: { kind: 'idle' },
    },
  };
  return flashed(next, facts.changed, effects);
}

// ---------------------------------------------------------------------------
// Apply and Cancel (spec §6.8; D10, D16)

/** Why Apply waits, or null when it can apply. */
export function applyBlocker(
  state: LayerOrderDialogState
): 'opening' | 'refused' | 'busy' | 'clash' | 'unsettled' | null {
  const { phase, settle, commit } = state;
  if (phase.kind === 'opening') return 'opening';
  if (phase.kind !== 'open') return 'refused';
  // A re-check after a removal comes first: the rows that clashed may not, once it lands.
  if (commit.kind !== 'idle' && commit.via === 'settle') return 'unsettled';
  if (settle.kind === 'clash') return 'clash';
  if (settle.kind !== 'settled') return 'unsettled';
  if (!quiet(state)) return 'busy';
  return null;
}

function apply(state: LayerOrderDialogState, at: number, effects: LayerOrderEffect[]): LayerOrderDialogState {
  if (applyBlocker(state) !== null || !state.shown || !state.baseline) return state;
  const constraints = committedConstraints(state.rows);
  const keepCarried = state.rows.carried.map((row) => row.facts.index);
  const unchanged = applyChangedNothing(state.baseline, { constraints, carried: keepCarried, stacks: state.shown });
  effects.push({
    type: 'apply',
    result: unchanged ? { kind: 'no_change' } : { kind: 'changed', constraints, keepCarried },
  });
  effects.push({ type: 'track', fact: closedFact(state, 'applied', at) });
  return { ...state, phase: { kind: 'closed', outcome: 'applied' } };
}

function closedFact(state: LayerOrderDialogState, outcome: 'applied' | 'cancelled', at: number): LayerOrderFact {
  const { solutions, view } = state;
  const count = solutions.count ? (view.xray ? solutions.count.orders : solutions.count[view.side]) : null;
  return dialogClosedFact(outcome, state.rows.committed.length, solutionsBucket(count, solutions.runs), at - state.openedAt);
}
