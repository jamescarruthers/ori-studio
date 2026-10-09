/**
 * The Fold session: the one place the document, the replay and the engine
 * meet (plan D6, D7, D14). Every Fold surface reads it.
 *
 * - **Replay follows the document.** While a surface holds the session, every
 *   change to the shown sequence — a commit, a delete, a note, marks, the
 *   paper, an undo, a redo, a load — replays it through `foldReplay`: the
 *   active path first, reporting progress; every path cached by `fh1`, so an
 *   undo or a note edit asks the engine nothing; a run for a document since
 *   replaced dropped by the load id.
 * - **Handles die with their engine.** A worker that is terminated or crashes
 *   takes every state with it, and its successor numbers states from 1 again
 *   (the generation rule, `foldEnginePort`). The session forgets every handle
 *   and everything folded from one, and replays. A crash that keeps
 *   recurring stops that after {@link MAX_RESTARTS} tries, until the next
 *   change or a retry.
 * - **The step a tool is folding** (D14 tier 3) is folded from the step on
 *   screen, latest request wins: `preview` lands it or says why not, with the
 *   engine's fixes; `commitStep` appends it through the store with `expect`
 *   the state's `fs1`, and hands the landed state to the replay that follows,
 *   so committing folds nothing twice. Committing anywhere but a tip makes a
 *   branch (the slice's append-only rule).
 * - **Queries** on any landed state go through {@link FoldSession.withState}:
 *   one line per call the bridge offers, and a handle that outlived its engine
 *   comes back unavailable rather than naming some other state.
 *
 * The document and the engine are injected (`FoldSessionDocumentSource`,
 * `FoldSessionRuntime`): the store and the worker in the app
 * (`store/workspaceStore/foldSession.ts`), fakes or the in-process bridge in
 * tests. No React.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WasmErrorEnvelope } from '../../engine/types';
import type { FoldPreviewResult, FoldSequenceClientLossReason } from '../../store/workspaceStore/foldSequenceRuntime';
import type { FoldSequenceWorkerApi } from '../../workers/foldSequenceWorker';
import type { FoldStateFingerprint } from '../document/foldDigest';
import { foldReaderActivePath, type FoldReaderState } from '../document/foldReaderState';
import { createFoldReplayer, type FoldReplayer, type FoldReplayProgress } from '../document/foldReplay';
import type { FoldChoices, FoldOp, FoldPaperShape } from '../document/foldSequenceDocument';
import type { HeldFoldSequence } from '../document/foldSequenceFile';
import type { FoldStepDraft } from '../document/foldSequenceEdits';
import { foldStateLostError, type FoldEngineSource, type FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldEngineOp, FoldEngineRefused, FoldStateSummary } from '../engine/foldEngineWire';
import { createFoldSessionEngine, foldStepInputKey, type FoldSessionEngine } from './foldSessionEngine';
import {
  deriveFoldSessionNodes,
  FOLD_BLANK_SEQUENCE,
  FOLD_IDLE,
  foldSessionProgress,
  sameFoldState,
  sameIds,
  sameProgress,
  selectFoldCursorNode,
  selectFoldNode,
  type FoldPendingAnalysis,
  type FoldPendingStep,
  type FoldSessionSnapshot,
  type FoldStateDetails,
  type FoldStepRequest,
} from './foldSessionState';

// ---------------------------------------------------------------------------
// What the session is given

/** The engine's calls, as the worker exposes them: what a query is written against. */
export type FoldSessionWorker = FoldSequenceWorkerApi;

/** The shown sequence as the store holds it. */
export interface FoldSessionDocument {
  /** The slice's `foldLoadId`: a replacement of the sequences raises it. */
  loadId: number;
  /** The sequence shown; null for none, when the blank square is shown. */
  held: HeldFoldSequence | null;
  reader: FoldReaderState | null;
}

export interface FoldSessionDocumentSource {
  read(): FoldSessionDocument;
  /** Called after any change to what `read` returns. */
  subscribe(listener: () => void): () => void;
  /**
   * Commit a step under `draft.parent` of the shown sequence — creating it
   * for the first — and put the cursor on it: the slice's `commitFoldStep`.
   * Its id, or null when the parent is gone or locked, the sequence is a
   * newer build's, or `loadId` is no longer the current one.
   */
  commit(draft: FoldStepDraft, loadId: number): string | null;
}

/** A latest-request-wins stream to the engine (`createFoldPreviewChannel`). */
export interface FoldSessionChannel {
  request<T>(
    ask: (engine: FoldSessionWorker) => Promise<T>,
    discard?: (value: T) => void
  ): Promise<FoldPreviewResult<T>>;
  cancel(): void;
}

/** The engine's lifetime, as `foldSequenceRuntime` runs the worker. */
export interface FoldSessionRuntime {
  /** Take a reference to the engine, starting it if needed. */
  retain(): void;
  release(): void;
  /** Which engine handles belong to; it moves the moment one goes away. */
  generation(): number;
  /** Called when the engine goes away, before any call it took with it rejects. */
  onLost(listener: (reason: FoldSequenceClientLossReason) => void): () => void;
  /** One call, rejected as `fold_sequence_client_lost` if the engine goes away under it. */
  ask<T>(call: (engine: FoldSessionWorker) => Promise<T>): Promise<T>;
  createChannel(): FoldSessionChannel;
  /** The engine as replay's port reads it. */
  readonly source: FoldEngineSource;
}

export interface FoldSessionOptions {
  document: FoldSessionDocumentSource;
  runtime: FoldSessionRuntime;
  /** An error the user should hear of: the app's error toast. */
  reportError?: (error: WasmErrorEnvelope) => void;
  /** The replay cache's room beyond the states on screen (`createFoldReplayer`). */
  capacity?: number;
}

// ---------------------------------------------------------------------------
// What it answers

/**
 * Why nothing can be folded from the step on screen right now: no surface
 * holds the session, the sequence is a newer build's, the step has no state
 * (pending, broken or locked), or a commit is already under way.
 */
export type FoldUnavailableReason = 'not-live' | 'read-only' | 'no-state' | 'busy';

export interface FoldUnavailable {
  readonly status: 'unavailable';
  readonly reason: FoldUnavailableReason;
}

/** A newer request, a cancel, or a move of the cursor replaced this one. */
export interface FoldSuperseded {
  readonly status: 'superseded';
}

export type FoldPreviewOutcome =
  | Extract<FoldPendingStep, { status: 'landed' | 'refused' | 'failed' }>
  | FoldSuperseded
  | FoldUnavailable;

export type FoldAnalyseOutcome =
  | Extract<FoldPendingAnalysis, { status: 'analysed' | 'refused' | 'failed' }>
  | FoldSuperseded
  | FoldUnavailable;

export type FoldCommitOutcome =
  | { readonly status: 'committed'; readonly stepId: string; readonly fingerprint: FoldStateFingerprint }
  /** The engine refused the step; the refusal is also the pending step, for the notice. */
  | { readonly status: 'refused'; readonly refused: FoldEngineRefused }
  | { readonly status: 'failed'; readonly error: WasmErrorEnvelope }
  /** The document or the engine moved on while the step was folding: nothing was committed. */
  | { readonly status: 'stale' }
  | FoldUnavailable;

/**
 * A step the engine landed outside the session's own folds — an Import CP or
 * Edit's folded figure (plan D16) — to commit as it landed.
 */
export interface FoldLandedStep {
  /** The state it landed: a handle of the engine on now. */
  readonly state: FoldEngineStateHandle;
  /**
   * The state it was landed after: the step on screen when it was asked for.
   * Null for one that adopts a sheet, which lands from that sheet.
   */
  readonly parent: FoldEngineStateHandle | null;
  readonly op: FoldOp;
  readonly fingerprint: FoldStateFingerprint;
  readonly summary: FoldStateSummary;
  /** The sheet an empty sequence takes with it (`FoldStepDraft.adopt`). */
  readonly adopt?: FoldPaperShape;
}

/** A query on a state: its answer, or word that the state is not held (a re-replay brings a new handle). */
export type FoldStateQuery<T> = { readonly status: 'answered'; readonly value: T } | FoldUnavailable;

/** A query, given the engine and the state's number in it. */
export type FoldStateCall<T> = (engine: FoldSessionWorker, state: number) => Promise<T>;

export interface FoldSession {
  /** The snapshot, for `useStore` and plain subscribers. */
  readonly store: StoreApi<FoldSessionSnapshot>;
  /**
   * Hold the engine while a surface is open: the first hold starts it and
   * replays. Returns the release; the last one stops the engine and lets
   * every state go.
   */
  retain(): () => void;
  /**
   * What a fold along a line would move, from the step on screen (D14 tier 2).
   * `choices` carries an axiom's root, which its line does not resolve without.
   */
  analyse(op: FoldEngineOp, choices?: FoldChoices): Promise<FoldAnalyseOutcome>;
  /** Fold a step from the step on screen without committing it (D14 tier 3). */
  preview(op: FoldEngineOp, choices?: FoldChoices): Promise<FoldPreviewOutcome>;
  /** Fold a step from the step on screen and append it to the shown sequence, the cursor moved onto it. */
  commitStep(op: FoldOp, choices?: FoldChoices): Promise<FoldCommitOutcome>;
  /**
   * Append a step the engine already landed after the step on screen, as it
   * landed: nothing is folded twice. The state is handed to the replay that
   * follows, or let go. `stale` when the step on screen is no longer the one
   * it was landed after — or, for one that adopts a sheet, when the sequence
   * has a step by now — and the state is let go.
   */
  commitLanded(landed: FoldLandedStep): Promise<FoldCommitOutcome>;
  /** Let go of the pending step and the analysis. */
  cancel(): void;
  /** Ask the engine about a landed state. */
  withState<T>(state: FoldEngineStateHandle, call: FoldStateCall<T>): Promise<FoldStateQuery<T>>;
  /** Ask the engine about a step's state — the sheet's for null. */
  withNode<T>(id: string | null, call: FoldStateCall<T>): Promise<FoldStateQuery<T>>;
  /** Ask the engine about the state on screen. */
  withCursor<T>(call: FoldStateCall<T>): Promise<FoldStateQuery<T>>;
  /** Try again after the replay stopped short (the snapshot's `error`). */
  retry(): void;
  /** Stop listening to the document and the engine, releasing any hold. */
  dispose(): void;
}

/**
 * How many times in a row the engine may be lost — a crash, or a state it no
 * longer holds — before the session stops replaying: a step that crashes the
 * worker every time it is folded would otherwise restart it forever. A
 * replay that finishes resets the count; so does a retry.
 */
export const MAX_RESTARTS = 2;

/** The engine went away under a call, or a handle outlived it: a replay recovers. */
function isEngineLoss(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'fold_sequence_client_lost' || code === 'fold_state_lost';
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null;
}

/**
 * A plain envelope for the store and the toast. Not `engineError`: that lives
 * in the TreeMaker runtime, which a module with no store must not import.
 */
function envelopeOf(error: unknown): WasmErrorEnvelope {
  const code = errorCode(error);
  if (code !== null && error && typeof error === 'object' && 'message' in error) {
    return { code, message: String(error.message) };
  }
  return { code: code ?? 'fold_session', message: error instanceof Error ? error.message : String(error) };
}

const SUPERSEDED: FoldSuperseded = Object.freeze({ status: 'superseded' });

const unavailable = (reason: FoldUnavailableReason): FoldUnavailable => ({ status: 'unavailable', reason });

function requestOf(op: FoldEngineOp, choices: FoldChoices | undefined): FoldStepRequest {
  return choices ? { op, choices } : { op };
}

/** An analysis the engine answered, which a later ask of the same line from the same state can reuse. */
type FoldAnalysisAnswer = Extract<FoldPendingAnalysis, { status: 'analysed' | 'refused' }>;

/** How many analyses the session keeps. */
const ANALYSES_KEPT = 64;

/** The step on screen, as a step folds from it. */
interface FoldingFrom {
  parent: FoldEngineStateHandle;
  /** The step's id; null for the sheet. */
  parentId: string | null;
  loadId: number;
}

export function createFoldSession({
  document: source,
  runtime,
  reportError,
  capacity,
}: FoldSessionOptions): FoldSession {
  let input = source.read();
  let holders = 0;
  let engine: FoldSessionEngine | null = null;
  let replayer: FoldReplayer<FoldEngineStateHandle> | null = null;
  /** Bumped to drop an engine-version answer that outlived the start that asked for it. */
  let startTicket = 0;
  let starting = false;
  /** The newest replay started: a run reports only while it is the newest. */
  let runTicket = 0;
  let replayScheduled = false;
  let replaying = false;
  let progress: FoldReplayProgress<FoldEngineStateHandle> | null = null;
  let restarts = 0;
  /** Replay stopped after too many restarts, until the next change or a retry. */
  let halted = false;
  let lastLoss: FoldSequenceClientLossReason | null = null;
  let error: WasmErrorEnvelope | null = null;
  let pending: FoldPendingStep = FOLD_IDLE;
  /** Bumped whenever the pending step is let go, so an answer for the one let go lands nothing. */
  let pendingTicket = 0;
  let pendingAnswer: Promise<FoldPreviewOutcome> | null = null;
  let analysis: FoldPendingAnalysis = FOLD_IDLE;
  let analysisTicket = 0;
  /**
   * What the engine said of each line, by the state it was asked of and the
   * op (D14 tier 2: once per line, side and direction). A pointer that snaps
   * keeps landing on the same few lines, and a state's analyses never change,
   * so the newest are kept until the states go.
   */
  const analyses = new Map<string, FoldAnalysisAnswer>();
  let committing = false;
  const previewChannel = runtime.createChannel();
  const analysisChannel = runtime.createChannel();

  const snapshotOf = (previous: FoldSessionSnapshot | null): FoldSessionSnapshot => {
    const { held, loadId } = input;
    const sequence = held?.document ?? null;
    const document = sequence ?? FOLD_BLANK_SEQUENCE;
    const reader = sequence && input.reader?.sequenceId === sequence.id ? input.reader : null;
    const path = sequence && reader ? foldReaderActivePath(sequence, reader).map((node) => node.id) : [];
    const activePath = previous ? sameIds(previous.activePath, path) : path;
    const { sheet, nodes } = deriveFoldSessionNodes(
      document,
      progress?.loadId === loadId ? progress : null,
      (state) => engine?.details(state),
      previous
    );
    const counts = foldSessionProgress(sheet, nodes, activePath, replaying);
    return {
      live: holders > 0,
      loadId,
      sequence,
      paper: document.paper,
      readOnly: held?.readOnlyRaw != null,
      cursor: reader?.cursor ?? null,
      activePath,
      sheet,
      nodes,
      progress: previous ? sameProgress(previous.progress, counts) : counts,
      pending,
      analysis,
      error,
    };
  };

  const store = createStore<FoldSessionSnapshot>(() => snapshotOf(null));

  /** Let go of the pending step: its answer, if still coming, lands nothing; a landed state is released. */
  const dropPending = () => {
    pendingTicket += 1;
    previewChannel.cancel();
    if (pending.status === 'landed') engine?.release(pending.state);
    pending = FOLD_IDLE;
    pendingAnswer = null;
  };

  const dropAnalysis = () => {
    analysisTicket += 1;
    analysisChannel.cancel();
    analysis = FOLD_IDLE;
  };

  /** Folded from a state that is no longer on screen. */
  const outgrown = (slot: FoldPendingStep | FoldPendingAnalysis, here: FoldEngineStateHandle | null) =>
    slot.status !== 'idle' && !sameFoldState(slot.parent, here);

  /**
   * Publish what the session knows. The pending step and the analysis belong
   * to the state they were folded from: when the cursor moves, the document
   * is replaced or the state is lost, they go.
   */
  const render = () => {
    const previous = store.getState();
    let next = snapshotOf(previous);
    const here = selectFoldCursorNode(next).state;
    if (outgrown(pending, here) || outgrown(analysis, here)) {
      if (outgrown(pending, here)) dropPending();
      if (outgrown(analysis, here)) dropAnalysis();
      next = { ...next, pending, analysis };
    }
    const changed = (Object.keys(next) as (keyof FoldSessionSnapshot)[]).some((key) => next[key] !== previous[key]);
    if (changed) store.setState(next, true);
  };

  const fail = (failure: unknown) => {
    error = envelopeOf(failure);
    render();
    reportError?.(error);
  };

  /** Forget every state, and everything folded from one: the engine lost them, or is being let go. */
  const forgetStates = () => {
    dropPending();
    dropAnalysis();
    analyses.clear();
    runTicket += 1;
    replaying = false;
    progress = null;
    startTicket += 1;
    starting = false;
  };

  const halt = (why: WasmErrorEnvelope) => {
    halted = true;
    error = why;
  };

  // -------------------------------------------------------------------------
  // Replay

  const replay = () => {
    const current = replayer;
    if (!current || holders === 0 || halted) return;
    const ticket = ++runTicket;
    const sequence = input.held?.document ?? FOLD_BLANK_SEQUENCE;
    const activeChild = input.reader?.sequenceId === sequence.id ? input.reader.activeChild : undefined;
    replaying = true;
    error = null;
    render();
    current
      .run({ loadId: input.loadId, sequence, activeChild }, (reported) => {
        if (ticket !== runTicket) return;
        progress = reported;
        render();
      })
      .then(
        (finished) => {
          if (ticket !== runTicket) return;
          replaying = false;
          if (finished) {
            progress = finished;
            restarts = 0;
            engine?.releaseUnadopted(ticket);
          }
          render();
        },
        (failure: unknown) => {
          if (ticket !== runTicket) return;
          replaying = false;
          // The loss listener has already forgotten the states and replays.
          if (isEngineLoss(failure)) render();
          else if (errorCode(failure) === 'unknown_state') reland(failure);
          else fail(failure);
        }
      );
  };

  /**
   * Replay once the current turn's changes are all in: a commit sets the
   * sequences and the reader one after the other.
   */
  const scheduleReplay = () => {
    if (replayScheduled || !replayer || holders === 0 || halted) return;
    replayScheduled = true;
    queueMicrotask(() => {
      replayScheduled = false;
      replay();
    });
  };

  /** Start the engine and replay: the engine's version first, once, since the cache is keyed by it. */
  const start = () => {
    if (holders === 0 || halted) return;
    if (replayer) {
      scheduleReplay();
      return;
    }
    if (starting) return;
    starting = true;
    const ticket = ++startTicket;
    runtime.ask((worker) => worker.engineVersion()).then(
      (version) => {
        if (ticket !== startTicket) return;
        starting = false;
        engine = createFoldSessionEngine(runtime.source, version);
        replayer = createFoldReplayer(engine.port, { capacity });
        scheduleReplay();
      },
      (failure: unknown) => {
        if (ticket !== startTicket) return;
        starting = false;
        // The loss listener starts again.
        if (!isEngineLoss(failure)) fail(failure);
      }
    );
  };

  /**
   * The engine no longer holds a state the session handed out — it was
   * released under a reader, which is a bug, but one a replay recovers from:
   * forget every state and land them again, as after a crash.
   */
  const reland = (failure: unknown) => {
    if (!replayer || holders === 0) return;
    forgetStates();
    replayer.clear();
    restarts += 1;
    if (restarts > MAX_RESTARTS) halt(envelopeOf(failure));
    else start();
    render();
  };

  const stop = () => {
    forgetStates();
    // Released through the port's batch, which an engine stopped meanwhile drops.
    replayer?.clear();
    engine?.releaseUnadopted(Number.POSITIVE_INFINITY);
    runtime.release();
    render();
  };

  const unsubscribeDocument = source.subscribe(() => {
    const before = input;
    input = source.read();
    const changed = input.loadId !== before.loadId || input.held !== before.held;
    // Another branch while a run is under way: put its path first.
    const rerouted = input.reader?.activeChild !== before.reader?.activeChild;
    // A change is worth another try after a halt or a start that failed —
    // one, since the restart count stays.
    if (changed) halted = false;
    render();
    if (changed) start();
    else if (rerouted && replaying) scheduleReplay();
  });

  const unsubscribeLoss = runtime.onLost((reason) => {
    lastLoss = reason;
    // Every state went with the engine. Nothing is released: there is no one to tell.
    forgetStates();
    replayer?.clear();
    engine?.clear();
    if (holders > 0 && reason !== 'released') {
      if (reason === 'crashed') restarts += 1;
      if (restarts <= MAX_RESTARTS) start();
      else halt({ code: 'fold_sequence_client_lost', message: 'The fold engine kept stopping.' });
    }
    render();
  });

  // -------------------------------------------------------------------------
  // Folding from the step on screen

  /** The state on screen, if a step can be folded from it now. */
  const foldingFrom = (): FoldingFrom | FoldUnavailable => {
    const snapshot = store.getState();
    if (!snapshot.live) return unavailable('not-live');
    if (snapshot.readOnly) return unavailable('read-only');
    const state = selectFoldCursorNode(snapshot).state;
    if (!state || state.generation !== runtime.generation()) return unavailable('no-state');
    return { parent: state, parentId: snapshot.cursor, loadId: snapshot.loadId };
  };

  /** The step on screen is pending, and a replay under way or about to start will land it. */
  const landing = () =>
    (replaying || replayScheduled || starting) && selectFoldCursorNode(store.getState()).status === 'pending';

  /**
   * The state on screen, waiting for it while a replay lands it: a commit
   * puts the cursor on a step the replay that follows has yet to land, and a
   * second commit, or the tool's next preview, folds from that step. Every
   * replay ends by publishing (`replaying` goes false, or the session stops),
   * so the wait always ends.
   */
  const foldableFrom = (): FoldingFrom | FoldUnavailable | Promise<FoldingFrom | FoldUnavailable> => {
    const ready = (from: FoldingFrom | FoldUnavailable) =>
      !('status' in from) || from.reason !== 'no-state' || !landing();
    const now = foldingFrom();
    if (ready(now)) return now;
    return new Promise((resolve) => {
      const unsubscribe = store.subscribe(() => {
        const next = foldingFrom();
        if (!ready(next)) return;
        unsubscribe();
        resolve(next);
      });
    });
  };

  /** `call`, unless `state` belongs to an engine that has since gone. */
  const guarded = <T>(state: FoldEngineStateHandle, call: () => Promise<T>): Promise<T> =>
    state.generation === runtime.generation() ? call() : Promise.reject(foldStateLostError(state));

  const preview = (op: FoldEngineOp, choices?: FoldChoices): Promise<FoldPreviewOutcome> => {
    const from = foldableFrom();
    if (!(from instanceof Promise)) return previewFrom(from, op, choices);
    // A newer request while this one waits supersedes it.
    dropPending();
    const ticket = pendingTicket;
    return from.then((ready) => (ticket === pendingTicket ? previewFrom(ready, op, choices) : SUPERSEDED));
  };

  const previewFrom = (
    from: FoldingFrom | FoldUnavailable,
    op: FoldEngineOp,
    choices: FoldChoices | undefined
  ): Promise<FoldPreviewOutcome> => {
    if ('status' in from) return Promise.resolve(from);
    dropPending();
    const ticket = pendingTicket;
    const { parent } = from;
    const request = requestOf(op, choices);
    pending = { status: 'working', request, parent };
    render();
    const answer = previewChannel
      .request(
        (worker) => guarded(parent, () => worker.apply(parent.id, op, choices)),
        // Superseded on its way back: nobody will see it.
        (late) => {
          if (late.status === 'ok') engine?.release({ generation: parent.generation, id: late.state });
        }
      )
      .then(
        (result): FoldPreviewOutcome => {
          if (result.status === 'superseded') return SUPERSEDED;
          const value = result.value;
          if (ticket !== pendingTicket) {
            if (value.status === 'ok') engine?.release({ generation: parent.generation, id: value.state });
            return SUPERSEDED;
          }
          const settled: FoldPreviewOutcome =
            value.status === 'ok'
              ? {
                  status: 'landed',
                  request,
                  parent,
                  state: { generation: parent.generation, id: value.state },
                  summary: value.summary,
                  report: value.report,
                }
              : { status: 'refused', request, parent, refused: value };
          pending = settled;
          pendingAnswer = null;
          render();
          return settled;
        },
        (failure: unknown): FoldPreviewOutcome => {
          if (ticket !== pendingTicket || isEngineLoss(failure)) return SUPERSEDED;
          const settled: FoldPreviewOutcome = { status: 'failed', request, parent, error: envelopeOf(failure) };
          pending = settled;
          pendingAnswer = null;
          render();
          return settled;
        }
      );
    pendingAnswer = answer;
    return answer;
  };

  const remember = (key: string, settled: FoldAnalysisAnswer) => {
    analyses.delete(key);
    analyses.set(key, settled);
    for (const oldest of analyses.keys()) {
      if (analyses.size <= ANALYSES_KEPT) break;
      analyses.delete(oldest);
    }
  };

  const analyse = (op: FoldEngineOp, choices?: FoldChoices): Promise<FoldAnalyseOutcome> => {
    const from = foldableFrom();
    if (!(from instanceof Promise)) return analyseFrom(from, op, choices);
    dropAnalysis();
    const ticket = analysisTicket;
    return from.then((ready) => (ticket === analysisTicket ? analyseFrom(ready, op, choices) : SUPERSEDED));
  };

  const analyseFrom = (
    from: FoldingFrom | FoldUnavailable,
    op: FoldEngineOp,
    choices: FoldChoices | undefined
  ): Promise<FoldAnalyseOutcome> => {
    if ('status' in from) return Promise.resolve(from);
    dropAnalysis();
    const ticket = analysisTicket;
    const { parent } = from;
    const key = `${parent.generation}:${parent.id}:${foldStepInputKey({ op, choices })}`;
    const known = analyses.get(key);
    if (known) {
      analysis = known;
      render();
      return Promise.resolve(known);
    }
    const asked = choices ? { op, choices } : { op };
    analysis = { status: 'working', ...asked, parent };
    render();
    return analysisChannel.request((worker) => guarded(parent, () => worker.analyse(parent.id, op, choices))).then(
      (result): FoldAnalyseOutcome => {
        if (result.status === 'superseded' || ticket !== analysisTicket) return SUPERSEDED;
        const value = result.value;
        const settled: FoldAnalysisAnswer =
          value.status === 'ok'
            ? { status: 'analysed', ...asked, parent, analysis: value.analysis }
            : { status: 'refused', ...asked, parent, refused: value };
        remember(key, settled);
        analysis = settled;
        render();
        return settled;
      },
      (failure: unknown): FoldAnalyseOutcome => {
        if (ticket !== analysisTicket || isEngineLoss(failure)) return SUPERSEDED;
        const settled: FoldAnalyseOutcome = { status: 'failed', ...asked, parent, error: envelopeOf(failure) };
        analysis = settled;
        render();
        return settled;
      }
    );
  };

  /** The pending step as it stands now; read through this after an await, when it may have changed. */
  const pendingNow = (): FoldPendingStep => pending;

  const commit = async (
    { parent, parentId, loadId }: FoldingFrom,
    op: FoldOp,
    choices: FoldChoices | undefined
  ): Promise<FoldCommitOutcome> => {
    const request = requestOf(op, choices);
    const key = foldStepInputKey(request);
    const isThis = (slot: FoldPendingStep) =>
      slot.status !== 'idle' && sameFoldState(slot.parent, parent) && foldStepInputKey(slot.request) === key;

    // The preview on screen, when it is this step: wait for it if it is still folding.
    if (pendingNow().status === 'working' && isThis(pendingNow())) await pendingAnswer;
    const shown = pendingNow();
    let landed: { state: FoldEngineStateHandle; details: FoldStateDetails } | null = null;
    if (shown.status === 'landed' && isThis(shown)) {
      // Taken, not released: the commit hands it to the replay.
      landed = { state: shown.state, details: { summary: shown.summary, report: shown.report } };
      pendingTicket += 1;
      pending = FOLD_IDLE;
      pendingAnswer = null;
      render();
    } else if (shown.status === 'refused' && isThis(shown)) {
      return { status: 'refused', refused: shown.refused };
    }

    let fingerprint: FoldStateFingerprint;
    try {
      if (!landed) {
        const answer = await runtime.ask((worker) => guarded(parent, () => worker.apply(parent.id, op, choices)));
        if (answer.status !== 'ok') {
          // Shown as a preview's refusal is, with its fixes.
          dropPending();
          pending = { status: 'refused', request, parent, refused: answer };
          render();
          return { status: 'refused', refused: answer };
        }
        landed = {
          state: { generation: parent.generation, id: answer.state },
          details: { summary: answer.summary, report: answer.report },
        };
      }
      const { state } = landed;
      fingerprint = await runtime.ask((worker) => guarded(state, () => worker.fingerprint(state.id)));
    } catch (failure) {
      if (landed) engine?.release(landed.state);
      const envelope = envelopeOf(failure);
      // A deliberate stop or teardown is no news; a crash under a commit is.
      if (!isEngineLoss(failure) || lastLoss === 'crashed') reportError?.(envelope);
      return { status: 'failed', error: envelope };
    }

    // The engine or the document may have moved on while it folded.
    if (!engine || input.loadId !== loadId || landed.state.generation !== runtime.generation()) {
      engine?.release(landed.state);
      return { status: 'stale' };
    }
    const withdraw = engine.adopt(parent, request, { ...landed, fingerprint }, runTicket);
    const draft: FoldStepDraft = { parent: parentId, op, ...(choices ? { choices } : {}), expect: fingerprint };
    const stepId = source.commit(draft, loadId);
    if (stepId === null) {
      withdraw();
      return { status: 'stale' };
    }
    return { status: 'committed', stepId, fingerprint };
  };

  /**
   * A landed import: offered to the replay under the state it was landed
   * after, as a preview is. One that adopts a sheet is offered under the
   * sheet on screen: the same sheet takes it, a new one lands the step again
   * and the offer is let go when that replay finishes.
   */
  const commitLandedFrom = (
    { parent, parentId, loadId }: FoldingFrom,
    landed: FoldLandedStep
  ): FoldCommitOutcome => {
    const empty = (store.getState().sequence?.steps.length ?? 0) === 0;
    const fits = landed.adopt ? parentId === null && empty : sameFoldState(landed.parent, parent);
    if (!engine || !fits || input.loadId !== loadId || landed.state.generation !== runtime.generation()) {
      engine?.release(landed.state);
      return { status: 'stale' };
    }
    const { op, fingerprint, summary, adopt } = landed;
    const withdraw = engine.adopt(parent, { op }, { state: landed.state, fingerprint, details: { summary, report: null } }, runTicket);
    const stepId = source.commit({ parent: parentId, op, expect: fingerprint, ...(adopt ? { adopt } : {}) }, loadId);
    if (stepId === null) {
      withdraw();
      return { status: 'stale' };
    }
    return { status: 'committed', stepId, fingerprint };
  };

  const withState = async <T>(state: FoldEngineStateHandle, call: FoldStateCall<T>): Promise<FoldStateQuery<T>> => {
    if (holders === 0) return unavailable('not-live');
    if (state.generation !== runtime.generation()) return unavailable('no-state');
    try {
      return { status: 'answered', value: await runtime.ask((worker) => guarded(state, () => call(worker, state.id))) };
    } catch (failure) {
      if (isEngineLoss(failure)) return unavailable('no-state');
      if (errorCode(failure) === 'unknown_state') {
        reland(failure);
        return unavailable('no-state');
      }
      throw failure;
    }
  };

  const withNode = <T>(id: string | null, call: FoldStateCall<T>): Promise<FoldStateQuery<T>> => {
    const state = selectFoldNode(store.getState(), id)?.state;
    return state ? withState(state, call) : Promise.resolve(unavailable('no-state'));
  };

  return {
    store,

    retain() {
      holders += 1;
      if (holders === 1) {
        runtime.retain();
        halted = false;
        restarts = 0;
        error = null;
        start();
        render();
      }
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holders -= 1;
        if (holders === 0) stop();
      };
    },

    analyse,
    preview,

    async commitStep(op, choices) {
      if (committing) return unavailable('busy');
      committing = true;
      try {
        const from = await foldableFrom();
        if ('status' in from) return from;
        return await commit(from, op, choices);
      } finally {
        committing = false;
      }
    },

    async commitLanded(landed) {
      if (committing) {
        engine?.release(landed.state);
        return unavailable('busy');
      }
      committing = true;
      try {
        const from = await foldableFrom();
        if (!('status' in from)) return commitLandedFrom(from, landed);
        engine?.release(landed.state);
        return from;
      } finally {
        committing = false;
      }
    },

    cancel() {
      dropPending();
      dropAnalysis();
      render();
    },

    withState,
    withNode,
    withCursor: (call) => withNode(store.getState().cursor, call),

    retry() {
      halted = false;
      restarts = 0;
      error = null;
      start();
      render();
    },

    dispose() {
      if (holders > 0) {
        holders = 0;
        stop();
      }
      unsubscribeDocument();
      unsubscribeLoss();
    },
  };
}
