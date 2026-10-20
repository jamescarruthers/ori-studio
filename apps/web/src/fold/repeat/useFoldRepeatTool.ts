import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldRefused, trackFoldStepAdded } from '../../analytics';
import { trackFoldRepeatRebuilt } from '../../analytics/trackFold';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { canonicalJson } from '../document/foldDigest';
import type { FoldRepeatOp } from '../document/foldSequenceDocument';
import { foldSearchTicket, type FoldSearchTicket } from '../engine/foldSearch';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { useFoldSessionState } from '../session/useFoldSession';
import { useFoldPath } from '../sequence/useFoldPath';
import { foldTools, type FoldToolState } from '../tools/foldToolState';
import type { RepeatSymmetry } from './repeatGeometry';
import type { RepeatPrepared, RepeatRequest, RepeatSourceStep } from './repeatPreparation';
import {
  drawnRepeatAxis,
  nearestRepeatAxis,
  repeatAxisIndex,
  repeatDrawnLine,
  repeatRange,
  type RepeatDrawnLine,
} from './repeatRange';
import type { FoldRepeatPhase, FoldRepeatWindowVerbs, FoldRepeatWindowView } from './repeatToolWindow';
import type { RepeatStop } from './repeatWords';

/** The source changed, or the worker failed: not a refusal, and not counted as one. */
const UNAVAILABLE: RepeatStop = { code: 'repeat_unavailable' };

/** What the canvas lights on the range's starting state while the axis is chosen or drawn. */
export interface FoldRepeatMarks {
  /** Every verified axis of the range's starting state. */
  axes: readonly RepeatSymmetry[];
  /** The one taken; -1 for none. */
  axis: number;
  /** A line drawn that is none of them, while it is shown refused. */
  drawn: RepeatDrawnLine | null;
}

/** Repeat while it is in hand: its window, what the canvas lights, and what Enter and Escape do. */
export interface FoldRepeatTool {
  view: FoldRepeatWindowView;
  verbs: FoldRepeatWindowVerbs;
  /** Null while the canvas shows a preview, or there are no axes to light. */
  marks: FoldRepeatMarks | null;
  /** Enter, and the window's commit: preview the repeat, take the layer order shown, or save. Whether it did anything. */
  primary: () => boolean;
  /**
   * Escape's rung, and the window's Cancel: stop a preparation under way; go
   * back from a preview to choosing; let go of a line being drawn; else put
   * Repeat down. Always true while it is in hand.
   */
  cancel: () => boolean;
  /** Step through a source operation's matching layer orders, while one is being chosen. Whether there was one. */
  stepChoice: (delta: number) => boolean;
  /** A source operation's layer order is being chosen: the arrows step it. */
  choosing: boolean;
}

/** The sheet's span, for how near a drawn line must be to an axis to offer it (`nearestRepeatAxis`). */
function spanOf(sheet: readonly (readonly [number, number])[] | undefined): number {
  if (!sheet || sheet.length === 0) return 1;
  const xs = sheet.map(([x]) => x);
  const ys = sheet.map(([, y]) => y);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/**
 * Repeat on the other side, the tool (plan `fold-sequence-tools`): the range
 * from the first step chosen through the step on screen (`repeatRange`), the
 * verified symmetry axes of the state before it — asked of the worker once
 * per state — and the one taken: the axis last chosen or drawn while the
 * range has it (`repeatAxisIndex`), else the first. A free line drawn on the
 * starting state (the tools' picks) is taken when it is one of those axes,
 * and refused when it is not, the nearest axis offered in its place.
 *
 * Enter prepares the repeat in the worker — a search with its time limit
 * (`REPEAT_PREPARATION_MS`), which Escape stops — previews what it prepared,
 * steps through a source operation's matching layer orders when it has
 * several, and saves: one numbered step, an entry per operation, or a saved
 * repeat updated in place. Whatever changes the range or the axis lets go of
 * what was prepared. Null while another tool is in hand.
 */
export function useFoldRepeatTool(session: FoldSessionSurface, tools: FoldToolState): FoldRepeatTool | null {
  const active = tools.tool === 'repeat';
  const { entries, cursor, cursorId } = useFoldPath(active);
  const loadId = useFoldSessionState((snapshot) => (active ? snapshot.loadId : 0));
  const sequenceId = useFoldSessionState((snapshot) => (active ? (snapshot.sequence?.id ?? null) : null));
  const readOnly = session.readOnly || session.cursor.status === 'locked';
  const range = useMemo(
    () => (active ? repeatRange(entries, cursor, tools.repeatFirst) : null),
    [active, entries, cursor, tools.repeatFirst]
  );
  const parent = active ? (entries[cursor]?.session ?? null) : null;
  const base = range?.baseline.session.state ?? null;
  const baseKey = base ? `${base.generation}:${base.id}` : null;
  // A rebuild runs from the saved repeat's parent: elsewhere it is let go, and the tool adds a step.
  const rebuild = tools.rebuild?.tool === 'repeat' ? tools.rebuild : null;
  const rebuilding = rebuild !== null && rebuild.parent === cursorId;
  useEffect(() => {
    if (active && rebuild && rebuild.parent !== cursorId) foldTools().dropRebuild();
  }, [active, rebuild, cursorId]);

  // --- The verified axes of the range's starting state: once per state.
  const [found, setFound] = useState<{ key: string; axes: readonly RepeatSymmetry[] | null } | null>(null);
  const { withState } = session;
  useEffect(() => {
    if (!active || !base || baseKey === null) return undefined;
    let current = true;
    void withState(base, (engine, state) => engine.repeatAxes(state)).then(
      (answer) => {
        if (!current) return;
        const axes = answer.status === 'answered' ? answer.value : null;
        setFound({ key: baseKey, axes });
        // No matching pair of sides: Repeat refused, for this range.
        if (axes?.length === 0) trackFoldRefused('repeat_axis', 'repeat');
      },
      () => {
        if (current) setFound({ key: baseKey, axes: null });
      }
    );
    return () => {
      current = false;
    };
    // The state is read through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, withState, baseKey]);
  /** Undefined while they are asked; null when they could not be. */
  const axes = found && found.key === baseKey ? found.axes : undefined;
  const axis = axes ? repeatAxisIndex(axes, tools.repeatAxis) : -1;
  const axisLine = axes && axis >= 0 ? axes[axis]!.sheet : null;

  // --- A line drawn on the starting state: taken when it is an axis, shown refused when not.
  const drawn = useMemo(() => (active ? repeatDrawnLine(tools.picks) : null), [active, tools.picks]);
  const drawnAxis = drawn && axes ? drawnRepeatAxis(axes, drawn) : -1;
  useEffect(() => {
    if (!drawn || !axes) return;
    if (drawnAxis >= 0) {
      foldTools().setRepeatAxis(axes[drawnAxis]!.sheet);
      foldTools().clear();
    } else {
      trackFoldRefused('repeat_axis_drawn', 'repeat');
    }
  }, [drawn, axes, drawnAxis]);
  const refusedLine = drawn && axes && drawnAxis < 0 ? drawn : null;

  // --- What was prepared, for the range and axis it was prepared for.
  const context =
    active && range && parent
      ? [loadId, sequenceId, cursorId, parent.path, range.first.id, baseKey, axisLine ? canonicalJson(axisLine) : '', rebuilding ? rebuild!.id : ''].join('|')
      : null;
  const [result, setResult] = useState<RepeatPrepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RepeatStop | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  /** The preparation the worker is running, until it answers: what Stop and Escape cancel there. */
  const [searching, setSearching] = useState<FoldSearchTicket | null>(null);
  const [stopped, setStopped] = useState(false);
  const [preparedFor, setPreparedFor] = useState(context);
  if (preparedFor !== context) {
    // Another range, axis or step on screen: nothing prepared for it yet.
    setPreparedFor(context);
    setResult(null);
    setBusy(false);
    setError(null);
    setChoice(null);
    setSelections({});
    setSearching(null);
    setStopped(false);
  }
  const ticket = useRef(0);
  const search = useRef<FoldSearchTicket | null>(null);
  /** The session's pending step is this tool's preview. */
  const owns = useRef(false);
  const { cancelSearch, cancel: cancelPreview } = session;
  /** Stop the preparation in the worker: it lets go of every state it landed, and its answer is dropped. */
  const stopSearch = useCallback(() => {
    if (search.current) cancelSearch(search.current);
    search.current = null;
  }, [cancelSearch]);
  const letGo = useCallback(() => {
    ticket.current += 1;
    stopSearch();
    if (owns.current) cancelPreview();
    owns.current = false;
  }, [stopSearch, cancelPreview]);
  // Whatever changes what is repeated — or puts Repeat down — lets go of what was prepared for it.
  useEffect(() => letGo, [context, letGo]);

  /** Back to choosing: nothing prepared, the starting state on the canvas again. */
  const reset = () => {
    letGo();
    setResult(null);
    setBusy(false);
    setError(null);
    setChoice(null);
    setSelections({});
    setSearching(null);
    setStopped(false);
  };

  const show = async (op: FoldRepeatOp, run: number) => {
    owns.current = true;
    const preview = await session.preview(op);
    if (ticket.current !== run) return;
    if (preview.status === 'refused') {
      setError({ code: preview.refused.refusal.code, refusal: preview.refused.refusal });
      trackFoldRefused(preview.refused.refusal.code, 'repeat');
    } else if (preview.status !== 'landed' && preview.status !== 'superseded') {
      setError(UNAVAILABLE);
    }
  };

  /** A source operation's matching layer order `index`, previewed after the operations before it. */
  const showCandidate = async (prepared: Extract<RepeatPrepared, { status: 'choice' }>, index: number) => {
    const run = ++ticket.current;
    setBusy(true);
    setError(null);
    const selected = (index + prepared.candidates.length) % prepared.candidates.length;
    setChoice(selected);
    try {
      await show({ ...prepared.prefix, steps: [...prepared.prefix.steps, prepared.candidates[selected]!] }, run);
    } catch {
      if (ticket.current === run) setError(UNAVAILABLE);
    } finally {
      if (ticket.current === run) setBusy(false);
    }
  };

  const prepare = async (accepted = selections) => {
    if (!range || !parent?.state || !parent.path || !cursorId || !axes || axis < 0 || readOnly) return;
    const generation = parent.state.generation;
    const steps: RepeatSourceStep[] = [];
    for (let at = range.start; at <= cursor; at++) {
      const entry = entries[at]!;
      const before = entries[at - 1]?.session.state;
      const after = entry.session.state;
      if (!entry.id || !entry.node?.op || !after || !before || before.generation !== generation || after.generation !== generation) {
        setError(UNAVAILABLE);
        return;
      }
      steps.push({ id: entry.id, op: entry.node.op, choices: entry.node.choices, before: before.id, after: after.id });
    }
    letGo();
    const run = ticket.current;
    setBusy(true);
    setError(null);
    setStopped(false);
    setChoice(null);
    const searched = foldSearchTicket();
    search.current = searched;
    setSearching(searched);
    const request: RepeatRequest = {
      parent: parent.state.id,
      source: { first: range.first.id!, last: cursorId, revision: parent.path },
      steps,
      axis: axes[axis]!.sheet,
      selections: accepted,
      baseline: range.baseline.id,
    };
    try {
      const answer = await withState(parent.state, (engine, state) => engine.prepareRepeat({ ...request, parent: state }, searched));
      if (search.current === searched) search.current = null;
      if (ticket.current !== run) return;
      setSearching(null);
      if (answer.status !== 'answered') {
        setError(UNAVAILABLE);
        return;
      }
      const prepared = answer.value;
      setResult(prepared);
      // Refusals are counted by their closed code; `repeat_unavailable` is the source changing or the worker failing, not one.
      if (prepared.status === 'blocked') trackFoldRefused(prepared.code, 'repeat');
      if (prepared.status === 'ready') await show(prepared.op, run);
      else if (prepared.status === 'choice') await showCandidate(prepared, 0);
      else if (prepared.prefix?.steps.length) await show(prepared.prefix, run);
    } catch {
      // A preparation stopped here (`stop`, `letGo`) rejects as cancelled, its run already superseded.
      if (ticket.current === run) setError(UNAVAILABLE);
    } finally {
      if (search.current === searched) search.current = null;
      if (ticket.current === run) {
        setSearching(null);
        setBusy(false);
      }
    }
  };

  /** Stop the preparation under way and keep the setup: nothing was prepared, nothing is added. */
  const stop = () => {
    if (!search.current) return false;
    reset();
    setStopped(true);
    return true;
  };

  const acceptChoice = () => {
    if (result?.status !== 'choice' || choice === null || busy || error) return;
    const next = { ...selections, [result.step]: result.candidates[choice]!.expect };
    setSelections(next);
    void prepare(next);
  };

  /** Put Repeat down, the tool it was taken up from back in hand: back to the saved repeat a rebuild began from. */
  const putDown = () => {
    const now = foldTools().store.getState().rebuild;
    letGo();
    foldTools().putDown();
    if (now?.tool === 'repeat' && foldSession().store.getState().cursor === now.parent) {
      useWorkspaceStore.getState().moveFoldCursor(now.id);
    }
  };

  const commit = async () => {
    if (busy || error || result?.status !== 'ready' || !range || !cursorId || !parent?.path) return;
    const op = result.op;
    if (op.source.first !== range.first.id) return;
    const now = foldSession().store.getState();
    if (now.cursor !== cursorId || now.loadId !== loadId || now.nodes.get(cursorId)?.path !== parent.path) return;
    const pending = now.pending;
    if (pending.status !== 'landed' || canonicalJson(pending.request.op) !== canonicalJson(op)) return;
    const individual = tools.repeatIndividual;
    setBusy(true);
    let done: boolean;
    if (rebuilding && rebuild) {
      done = useWorkspaceStore.getState().updateFoldRepeat(rebuild.id, rebuild.expected, op, op.steps.at(-1)!.expect, loadId);
    } else if (individual) {
      done = useWorkspaceStore.getState().commitFoldSteps(cursorId, op.steps, loadId) !== null;
    } else {
      done = (await session.commitStep(op)).status === 'committed';
    }
    setBusy(false);
    if (!done) {
      setError(UNAVAILABLE);
      return;
    }
    // An update in place is no step added, as an Unfold's rebuild is not.
    if (rebuilding) trackFoldRepeatRebuilt();
    else trackFoldStepAdded('repeat', { repeat: { mode: individual ? 'individual' : 'grouped', count: op.steps.length } });
    putDown();
  };

  // The canvas shows the starting state, with its axes, until a preview lands in its place.
  const previewing = session.pending.status === 'landed' && session.pending.request.op.kind === 'repeat';
  const marks = useMemo<FoldRepeatMarks | null>(
    () => (active && axes && axes.length > 0 && !previewing ? { axes, axis, drawn: refusedLine } : null),
    [active, axes, axis, refusedLine, previewing]
  );

  if (!active) return null;

  const choosing = result?.status === 'choice' && choice !== null;
  let phase: FoldRepeatPhase;
  if (!range) phase = { kind: 'unavailable', why: cursor < 1 ? 'sheet' : 'waiting' };
  else if (axes === undefined) phase = { kind: 'loading' };
  else if (axes === null) phase = { kind: 'failed', stop: UNAVAILABLE };
  else if (searching) phase = { kind: 'preparing' };
  else if (result?.status === 'choice') {
    phase = { kind: 'choosing', step: result.step, count: result.candidates.length, index: choice, waiting: busy, failed: error !== null };
  } else if (error) phase = { kind: 'failed', stop: error };
  else if (result?.status === 'blocked') phase = { kind: 'blocked', step: result.step, stop: result };
  else if (result?.status === 'ready') phase = { kind: 'ready', saving: busy };
  else if (stopped) phase = { kind: 'stopped' };
  else phase = { kind: 'picking' };
  const canPreview = !readOnly && axis >= 0 && (phase.kind === 'picking' || phase.kind === 'stopped' || phase.kind === 'failed') && !busy;
  // A refused or stopped repeat leaves the starting state on show: another axis may be drawn on it.
  const drawing =
    !readOnly &&
    !previewing &&
    (phase.kind === 'picking' || phase.kind === 'stopped' || phase.kind === 'failed' || phase.kind === 'blocked') &&
    (axes?.length ?? 0) > 0;

  const stepChoice = (delta: number): boolean => {
    if (result?.status !== 'choice' || choice === null) return false;
    if (!busy) void showCandidate(result, choice + delta);
    return true;
  };

  const setAxis = (index: number) => {
    const taken = axes?.[index];
    if (!taken) return;
    foldTools().setRepeatAxis(taken.sheet);
    // A refused line drawn gives way to the axis taken.
    if (tools.picks.length > 0) foldTools().clear();
  };

  return {
    view: {
      range: range ? { entries, starts: range.starts, first: range.first.id!, count: range.count } : null,
      axes: axes === undefined ? null : (axes ?? []).map((each) => each.display),
      axis,
      individual: tools.repeatIndividual,
      rebuilding,
      phase,
      drawing,
      drawn: refusedLine ? { nearest: nearestRepeatAxis(axes ?? [], refusedLine, spanOf(range?.baseline.session.summary?.sheet)) } : null,
    },
    verbs: {
      setFirst: (id) => foldTools().setRepeatFirst(id),
      setAxis,
      setIndividual: (individual) => foldTools().setRepeatIndividual(individual),
      stepOrder: (delta) => void stepChoice(delta),
      acceptOrder: acceptChoice,
      backFromOrder: reset,
    },
    marks,
    primary: () => {
      if (readOnly) return false;
      if (searching) return true;
      if (result?.status === 'choice') {
        if (choice !== null) acceptChoice();
        else void showCandidate(result, 0);
        return true;
      }
      if (result?.status === 'ready') {
        void commit();
        return true;
      }
      if (!canPreview) return false;
      void prepare();
      return true;
    },
    cancel: () => {
      if (stop()) return true;
      if (result) {
        reset();
        return true;
      }
      if (tools.picks.length > 0) {
        foldTools().clear();
        return true;
      }
      putDown();
      return true;
    },
    stepChoice,
    choosing,
  };
}
