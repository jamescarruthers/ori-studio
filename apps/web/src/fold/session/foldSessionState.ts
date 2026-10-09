/**
 * What the Fold session tells its surfaces (plan D6, D14): every node's
 * status and state, the step on screen, how far the replay has come, and the
 * step a tool is folding before it is committed.
 *
 * A snapshot is derived, never stored: from the document the store holds, the
 * newest replay progress for it (`foldReplay`), and what the engine said of
 * each landed state. The derivation keeps a node's object while nothing about
 * it changed, so a selector on one node re-renders only when that node does.
 *
 * Pure: no React, no store, no worker.
 */

import type { WasmErrorEnvelope } from '../../engine/types';
import { foldPathDigest, type FoldPathDigest, type FoldStateFingerprint } from '../document/foldDigest';
import type {
  FoldNodeReplay,
  FoldReplayProgress,
  FoldReplayRefusal,
  FoldStepStatus,
} from '../document/foldReplay';
import {
  createFoldSequence,
  SQUARE_PAPER,
  type FoldPaper,
  type FoldSequenceDocument,
} from '../document/foldSequenceDocument';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type {
  FoldAnalysis,
  FoldEngineChoices,
  FoldEngineOp,
  FoldEngineRefused,
  FoldReport,
  FoldStateSummary,
} from '../engine/foldEngineWire';

/**
 * What a project with no sequence shows: the flat square its first edit
 * creates (the slice's `base`), so a tool can fold it before anything is
 * saved. Never written; its id names nothing in a file.
 */
export const FOLD_BLANK_SEQUENCE: FoldSequenceDocument = createFoldSequence(SQUARE_PAPER, '', () => 'fold-blank');

/** What the engine said of a landed state, beside its handle. */
export interface FoldStateDetails {
  readonly summary: FoldStateSummary;
  /** What the step did; null for the sheet, a turn and a rotation. */
  readonly report: FoldReport | null;
}

/** A node of the shown sequence, or its sheet, as the surfaces read it. */
export interface FoldSessionNode {
  readonly status: FoldStepStatus;
  /** Its path's identity (`fh1`) once replayed; null while pending. */
  readonly path: FoldPathDigest | null;
  /** Its landed state while ok or changed: a handle of the engine that landed it. */
  readonly state: FoldEngineStateHandle | null;
  readonly fingerprint: FoldStateFingerprint | null;
  /** The state at a glance, once landed. */
  readonly summary: FoldStateSummary | null;
  /** What the step did, once landed; null for the sheet, a turn and a rotation. */
  readonly report: FoldReport | null;
  /** Set when broken: the node that refused (null for the sheet) and the engine's code. */
  readonly refusal: FoldReplayRefusal | null;
}

export const FOLD_PENDING_NODE: FoldSessionNode = Object.freeze({
  status: 'pending',
  path: null,
  state: null,
  fingerprint: null,
  summary: null,
  report: null,
  refusal: null,
});

/** How far the replay of the shown sequence has come. */
export interface FoldSessionProgress {
  /** A replay is under way. */
  readonly replaying: boolean;
  /** Steps of the active path with their status, and how many it has: what the step on screen waits for. */
  readonly activeSettled: number;
  readonly activeTotal: number;
  /** Every step with its status, and how many there are. */
  readonly settled: number;
  readonly total: number;
  /** The sheet and every step have their status. */
  readonly done: boolean;
}

/** A step a tool asks about: an op and its choices, folded from the step on screen. */
export interface FoldStepRequest {
  readonly op: FoldEngineOp;
  readonly choices?: FoldEngineChoices;
}

/**
 * The step a tool is folding before it is committed (plan D14 tier 3): the
 * landed state, with what it did, or the refusal and its fixes. Always from
 * the step on screen (`parent`); a new cursor, load or engine lets it go.
 */
export type FoldPendingStep =
  | { readonly status: 'idle' }
  | { readonly status: 'working'; readonly request: FoldStepRequest; readonly parent: FoldEngineStateHandle }
  | {
      readonly status: 'landed';
      readonly request: FoldStepRequest;
      readonly parent: FoldEngineStateHandle;
      readonly state: FoldEngineStateHandle;
      readonly summary: FoldStateSummary;
      readonly report: FoldReport | null;
    }
  | {
      readonly status: 'refused';
      readonly request: FoldStepRequest;
      readonly parent: FoldEngineStateHandle;
      readonly refused: FoldEngineRefused;
    }
  | {
      readonly status: 'failed';
      readonly request: FoldStepRequest;
      readonly parent: FoldEngineStateHandle;
      readonly error: WasmErrorEnvelope;
    };

/** What a fold along a line would move, before anything is folded (plan D14 tier 2). */
export type FoldPendingAnalysis =
  | { readonly status: 'idle' }
  | { readonly status: 'working'; readonly op: FoldEngineOp; readonly parent: FoldEngineStateHandle }
  | {
      readonly status: 'analysed';
      readonly op: FoldEngineOp;
      readonly parent: FoldEngineStateHandle;
      readonly analysis: FoldAnalysis;
    }
  | {
      readonly status: 'refused';
      readonly op: FoldEngineOp;
      readonly parent: FoldEngineStateHandle;
      readonly refused: FoldEngineRefused;
    }
  | {
      readonly status: 'failed';
      readonly op: FoldEngineOp;
      readonly parent: FoldEngineStateHandle;
      readonly error: WasmErrorEnvelope;
    };

export const FOLD_IDLE: { readonly status: 'idle' } = Object.freeze({ status: 'idle' });

export interface FoldSessionSnapshot {
  /** A surface holds the session, so the engine is running and replays. */
  readonly live: boolean;
  /** The load these describe: the slice's `foldLoadId`. */
  readonly loadId: number;
  /** The shown sequence; null before the first edit, when the flat square is shown. */
  readonly sequence: FoldSequenceDocument | null;
  /** The sheet the shown sequence starts from. */
  readonly paper: FoldPaper;
  /** The shown sequence is a newer build's: shown, replayed, never changed. */
  readonly readOnly: boolean;
  /** The step on screen; null for the sheet. */
  readonly cursor: string | null;
  /** The active path's step ids, the first step first. */
  readonly activePath: readonly string[];
  readonly sheet: FoldSessionNode;
  /** Every step of the shown sequence, by id. */
  readonly nodes: ReadonlyMap<string, FoldSessionNode>;
  readonly progress: FoldSessionProgress;
  readonly pending: FoldPendingStep;
  readonly analysis: FoldPendingAnalysis;
  /** Why the replay stopped short, when a re-replay cannot help; the next change or a retry tries again. */
  readonly error: WasmErrorEnvelope | null;
}

// ---------------------------------------------------------------------------
// Selectors

/** The node on screen: the cursor's step, or the sheet. */
export function selectFoldCursorNode(snapshot: FoldSessionSnapshot): FoldSessionNode {
  return snapshot.cursor === null ? snapshot.sheet : (snapshot.nodes.get(snapshot.cursor) ?? FOLD_PENDING_NODE);
}

/** A step of the shown sequence — the sheet for null — or null for none. */
export function selectFoldNode(snapshot: FoldSessionSnapshot, id: string | null): FoldSessionNode | null {
  return id === null ? snapshot.sheet : (snapshot.nodes.get(id) ?? null);
}

export function selectFoldReplayProgress(snapshot: FoldSessionSnapshot): FoldSessionProgress {
  return snapshot.progress;
}

export function selectFoldActivePath(snapshot: FoldSessionSnapshot): readonly string[] {
  return snapshot.activePath;
}

// ---------------------------------------------------------------------------
// Derivation

/** Whether two handles name one state. */
export function sameFoldState(a: FoldEngineStateHandle | null, b: FoldEngineStateHandle | null): boolean {
  return a === b || (a !== null && b !== null && a.generation === b.generation && a.id === b.id);
}

/**
 * A node's replay as a surface reads it, or `previous` when that says the
 * same. A run reports the nodes it has not reached yet as pending; one the
 * last run settled at the same path keeps what it had, since a path lands one
 * state, so a branch nobody is looking at does not flicker while the active
 * path replays.
 */
function sessionNode(
  replay: FoldNodeReplay<FoldEngineStateHandle>,
  details: (state: FoldEngineStateHandle) => FoldStateDetails | undefined,
  previous: FoldSessionNode | undefined
): FoldSessionNode {
  if (replay.status === 'pending') {
    return previous && previous.status !== 'pending' && previous.path === replay.path ? previous : FOLD_PENDING_NODE;
  }
  const known = replay.state ? details(replay.state) : undefined;
  const node: FoldSessionNode = {
    status: replay.status,
    path: replay.path,
    state: replay.state,
    fingerprint: replay.fingerprint,
    summary: known?.summary ?? null,
    report: known?.report ?? null,
    refusal: replay.refusal,
  };
  return previous && sameNode(previous, node) ? previous : node;
}

function sameNode(a: FoldSessionNode, b: FoldSessionNode): boolean {
  return (
    a.status === b.status &&
    a.path === b.path &&
    sameFoldState(a.state, b.state) &&
    a.fingerprint === b.fingerprint &&
    a.summary === b.summary &&
    a.report === b.report &&
    a.refusal?.at === b.refusal?.at &&
    a.refusal?.code === b.refusal?.code
  );
}

const SHEET_PATHS = new WeakMap<FoldPaper, FoldPathDigest>();

/** The flat sheet's path: the paper alone. Memoised on the paper, which a document never mutates. */
export function foldSheetPath(paper: FoldPaper): FoldPathDigest {
  let path = SHEET_PATHS.get(paper);
  if (path === undefined) {
    path = foldPathDigest(paper, []);
    SHEET_PATHS.set(paper, path);
  }
  return path;
}

/**
 * Every node of `document` from the newest replay progress of its load.
 *
 * A step's path never changes under its id — commits append, and only a new
 * load or a change of paper (which empties the steps) can bring different
 * steps — so a step the progress already holds keeps its status while a
 * replay of a newer edit runs, and a step it does not hold yet is pending.
 * The sheet is matched by its path, so it survives the first commit giving
 * the blank sequence an id.
 */
export function deriveFoldSessionNodes(
  document: FoldSequenceDocument,
  progress: FoldReplayProgress<FoldEngineStateHandle> | null,
  details: (state: FoldEngineStateHandle) => FoldStateDetails | undefined,
  previous: Pick<FoldSessionSnapshot, 'sheet' | 'nodes'> | null
): { sheet: FoldSessionNode; nodes: ReadonlyMap<string, FoldSessionNode> } {
  const sheetReplay = progress && progress.sheet.path === foldSheetPath(document.paper) ? progress.sheet : null;
  const sheet = sheetReplay ? sessionNode(sheetReplay, details, previous?.sheet) : FOLD_PENDING_NODE;
  const steps = progress?.sequenceId === document.id ? progress.steps : null;
  const nodes = new Map<string, FoldSessionNode>();
  let unchanged = previous !== null && previous.nodes.size === document.steps.length;
  for (const { id } of document.steps) {
    const replay = steps?.get(id);
    const before = previous?.nodes.get(id);
    const node = replay ? sessionNode(replay, details, before) : FOLD_PENDING_NODE;
    if (node !== before) unchanged = false;
    nodes.set(id, node);
  }
  return { sheet, nodes: unchanged && previous ? previous.nodes : nodes };
}

/** How far the replay has come, from the nodes as derived. */
export function foldSessionProgress(
  sheet: FoldSessionNode,
  nodes: ReadonlyMap<string, FoldSessionNode>,
  activePath: readonly string[],
  replaying: boolean
): FoldSessionProgress {
  const settledIn = (ids: Iterable<string>) => {
    let count = 0;
    for (const id of ids) if ((nodes.get(id)?.status ?? 'pending') !== 'pending') count += 1;
    return count;
  };
  const settled = settledIn(nodes.keys());
  return {
    replaying,
    activeSettled: settledIn(activePath),
    activeTotal: activePath.length,
    settled,
    total: nodes.size,
    done: sheet.status !== 'pending' && settled === nodes.size,
  };
}

/** `next`, or `previous` when it holds the same ids in the same order. */
export function sameIds(previous: readonly string[], next: readonly string[]): readonly string[] {
  return previous.length === next.length && previous.every((id, k) => id === next[k]) ? previous : next;
}

/** `next`, or `previous` when every field is the same. */
export function sameProgress(previous: FoldSessionProgress, next: FoldSessionProgress): FoldSessionProgress {
  return (Object.keys(next) as (keyof FoldSessionProgress)[]).every((key) => previous[key] === next[key])
    ? previous
    : next;
}
