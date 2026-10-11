import { useMemo } from 'react';
import type { FoldPaper, FoldSequenceDocument } from '../document/foldSequenceDocument';
import { compoundFoldLineOf } from '../engine/foldEngineCompoundWire';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldEngineOp, FoldReport } from '../engine/foldEngineWire';
import { useFoldSessionState } from '../session/useFoldSession';
import { FOLD_BLANK_SEQUENCE, FOLD_PENDING_NODE, type FoldSessionProgress } from '../session/foldSessionState';
import type { FoldSentenceStep } from '../stepSentence';
import { foldNodeSentenceStep, foldSentenceStepOf } from './foldSentenceStep';
import { cursorIndex, foldPathEntries, type FoldPathEntry } from './foldSequencePath';
import type { FoldStateFrame } from './foldStateFrame';
import { useFoldStateFrames } from './useFoldStateFrames';

/** The step a tool is folding, as the sequence chrome shows it. */
export interface FoldSequencePending {
  /** Landed and ready to commit, or refused; a step still folding or failed is not shown. */
  status: 'landed' | 'refused';
  op: FoldEngineOp;
  words: FoldSentenceStep;
  /** Its state, while landed. */
  state: FoldEngineStateHandle | null;
  frame: FoldStateFrame | null;
  report: FoldReport | null;
  /** It folds from a step that is not the path's tip: committing it starts a branch. */
  branch: boolean;
}

/** The sequence on screen as the strip, the Steps grid and the Step pane read it. */
export interface FoldSequenceView {
  /** The shown sequence, or the blank square before the first edit. */
  document: FoldSequenceDocument;
  /** There is a sequence in the project: the blank square is not one. */
  exists: boolean;
  paper: FoldPaper;
  readOnly: boolean;
  /** The sheet and the active path. */
  entries: readonly FoldPathEntry[];
  /** Each entry's state, once landed; aligned with `entries`. */
  frames: readonly (FoldStateFrame | null)[];
  /** Each entry's words; aligned with `entries` (the sheet's is unused). */
  words: readonly FoldSentenceStep[];
  /** The step on screen, by entry index. */
  cursor: number;
  pending: FoldSequencePending | null;
  progress: FoldSessionProgress;
  /** The replay stopped short, and a retry is offered. */
  failed: boolean;
}

/**
 * The shown sequence, its active path, each step's picture and words, and the
 * step a tool is folding (plan D14). Every Fold surface that lists steps reads
 * this, so a step is numbered, pictured and worded alike wherever it appears.
 */
export function useFoldSequenceView(): FoldSequenceView {
  const sequence = useFoldSessionState((snapshot) => snapshot.sequence);
  const readOnly = useFoldSessionState((snapshot) => snapshot.readOnly);
  const activePath = useFoldSessionState((snapshot) => snapshot.activePath);
  const sheet = useFoldSessionState((snapshot) => snapshot.sheet);
  const nodes = useFoldSessionState((snapshot) => snapshot.nodes);
  const cursorId = useFoldSessionState((snapshot) => snapshot.cursor);
  const pendingStep = useFoldSessionState((snapshot) => snapshot.pending);
  const progress = useFoldSessionState((snapshot) => snapshot.progress);
  const failed = useFoldSessionState((snapshot) => snapshot.error !== null);
  const document = sequence ?? FOLD_BLANK_SEQUENCE;

  const entries = useMemo(
    () => foldPathEntries(document, activePath, sheet, nodes, FOLD_PENDING_NODE),
    [document, activePath, sheet, nodes]
  );
  const cursor = cursorIndex(entries, cursorId);
  const pendingState = pendingStep.status === 'landed' ? pendingStep.state : null;
  const states = useMemo(
    () => [...entries.map((entry) => entry.session.state), pendingState],
    [entries, pendingState]
  );
  const allFrames = useFoldStateFrames(states);
  const frames = useMemo(() => allFrames.slice(0, entries.length), [allFrames, entries.length]);
  const pendingFrame = allFrames[entries.length] ?? null;

  const words = useMemo(
    () =>
      entries.map((entry, index): FoldSentenceStep =>
        entry.node
          ? foldNodeSentenceStep(entry.node, {
              parent: frames[index - 1] ?? null,
              child: frames[index] ?? null,
              report: entry.session.report ?? compoundFoldLineOf(entry.session.compound),
            })
          : { op: 'unknown' }
      ),
    [entries, frames]
  );

  const pending = useMemo((): FoldSequencePending | null => {
    if (pendingStep.status !== 'landed' && pendingStep.status !== 'refused') return null;
    const op = pendingStep.request.op;
    const report = pendingStep.status === 'landed' ? pendingStep.report : null;
    const folded = pendingStep.status === 'landed' ? (pendingStep.report ?? compoundFoldLineOf(pendingStep.compound)) : null;
    return {
      status: pendingStep.status,
      op,
      words: foldSentenceStepOf(op, { parent: frames[cursor] ?? null, child: pendingFrame, report: folded }),
      state: pendingStep.status === 'landed' ? pendingStep.state : null,
      frame: pendingFrame,
      report,
      branch: cursor !== entries.length - 1,
    };
  }, [pendingStep, frames, cursor, pendingFrame, entries.length]);

  return {
    document,
    exists: sequence !== null,
    paper: document.paper,
    readOnly,
    entries,
    frames,
    words,
    cursor,
    pending,
    progress,
    failed,
  };
}
