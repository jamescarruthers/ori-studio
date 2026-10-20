import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldRefused, trackFoldStepAdded } from '../../analytics';
import { trackFoldRepeatRebuilt } from '../../analytics/trackFold';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import type { FoldToolStep } from '../canvas/useFoldToolPreview';
import { canonicalJson } from '../document/foldDigest';
import type { FoldRepeatOp } from '../document/foldSequenceDocument';
import type { FoldIsometry } from '../engine/foldEngineWire';
import { foldSearchTicket, type FoldSearchTicket } from '../engine/foldSearch';
import { foldStepInputKey } from '../session/foldSessionEngine';
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

/** The range's starting state has no verified axis: Repeat's own refusal, counted as the axes come back. */
const NO_AXIS: RepeatStop = { code: 'repeat_axis' };

/**
 * How long Repeat waits, after its range or axis changes, before it prepares
 * the repeat: a run of changes — the axis stepped through, a range picked —
 * prepares once, for the last.
 */
export const REPEAT_PREPARE_DELAY_MS = 250;

/** Repeat while it is in hand: its window, what the canvas previews, and what Enter and Escape do. */
export interface FoldRepeatTool {
  view: FoldRepeatWindowView;
  verbs: FoldRepeatWindowVerbs;
  /**
   * The repeat the session previews for the tool, keyed as any tool's step:
   * what the canvas shows, and the creases it adds. Null while none is.
   */
  step: FoldToolStep | null;
  /** A drawn line that is no verified axis, while its refusal is shown: the canvas draws it. */
  drawn: RepeatDrawnLine | null;
  /**
   * Enter, and the window's commit: add the repeat previewed, take the layer
   * order shown, or — once a preparation was stopped — prepare it again.
   * Whether it did anything.
   */
  primary: () => boolean;
  /**
   * Escape's rung, and the window's Cancel: stop a preparation under way; go
   * back from a layer order being chosen; let go of a line being drawn; else
   * put Repeat down. Always true while it is in hand.
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
 * range has it (`repeatAxisIndex`), else the first.
 *
 * It previews as every tool does, from the moment it is in hand: once the
 * range and the axis settle (`REPEAT_PREPARE_DELAY_MS`) it prepares the
 * repeat in the worker — a search with its time limit
 * (`REPEAT_PREPARATION_MS`), which Escape stops — and previews it, its step
 * (`step`) the canvas's to show. Whatever changes the range or the axis lets
 * go of it and prepares anew. A source operation with several matching layer
 * orders is chosen with the order chooser; Enter adds the repeat: one
 * numbered step, an entry per operation, or a saved repeat updated in place.
 *
 * A free line drawn on the canvas (the tools' picks, `viewTransform` the
 * view of the state they were drawn on) is taken when it is one of the
 * verified axes, and refused when it is not, the nearest axis offered in its
 * place. Null while another tool is in hand.
 */
export function useFoldRepeatTool(
  session: FoldSessionSurface,
  tools: FoldToolState,
  viewTransform: FoldIsometry | null
): FoldRepeatTool | null {
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

  // --- A line drawn on the canvas: taken when it is an axis, shown refused when not.
  // The view is read through its key: the preview landing shows another scene with the same view,
  // which reads the line the same, and must not refuse it again.
  const viewKey = viewTransform ? viewTransform.join(',') : null;
  const drawn = useMemo(
    () => (active ? repeatDrawnLine(tools.picks, viewTransform) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, tools.picks, viewKey]
  );
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
  /** Stopped, or backed out of an order choice: nothing is prepared again until something changes, or Enter asks. */
  const [stopped, setStopped] = useState(false);
  /** The repeat last handed to the session to preview. */
  const [previewed, setPreviewed] = useState<FoldRepeatOp | null>(null);
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
    setPreviewed(null);
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

  /** Nothing prepared, nothing previewed: the step on screen on the canvas again. */
  const reset = () => {
    letGo();
    setResult(null);
    setBusy(false);
    setError(null);
    setChoice(null);
    setSelections({});
    setSearching(null);
    setStopped(false);
    setPreviewed(null);
  };

  const show = async (op: FoldRepeatOp, run: number) => {
    owns.current = true;
    setPreviewed(op);
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
    setPreviewed(null);
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

  /** Back from a layer order being chosen: nothing prepared, and nothing prepared again until something changes. */
  const backFromOrder = () => {
    reset();
    setStopped(true);
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

  // --- Prepared as soon as the range and the axis settle, as every tool previews from its first choice.
  const settled = active && range !== null && (axes?.length ?? 0) > 0 && axis >= 0 && !readOnly;
  const due = settled && result === null && error === null && !stopped && searching === null && !busy;
  const prepareNow = useRef(prepare);
  useEffect(() => {
    prepareNow.current = prepare;
  });
  useEffect(() => {
    if (!due || context === null) return undefined;
    const timer = setTimeout(() => void prepareNow.current(), REPEAT_PREPARE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, context]);

  const step = useMemo<FoldToolStep | null>(
    () => (previewed ? { op: previewed, key: foldStepInputKey({ op: previewed }) } : null),
    [previewed]
  );

  if (!active) return null;

  const choosing = result?.status === 'choice' && choice !== null;
  let phase: FoldRepeatPhase;
  if (!range) phase = { kind: 'unavailable', why: cursor < 1 ? 'sheet' : 'waiting' };
  else if (axes === undefined) phase = { kind: 'loading' };
  else if (axes === null) phase = { kind: 'failed', stop: UNAVAILABLE };
  else if (axes.length === 0) phase = { kind: 'failed', stop: NO_AXIS };
  else if (searching || due) phase = { kind: 'preparing' };
  else if (result?.status === 'choice') {
    phase = { kind: 'choosing', step: result.step, count: result.candidates.length, index: choice, waiting: busy, failed: error !== null };
  } else if (error) phase = { kind: 'failed', stop: error };
  else if (result?.status === 'blocked') phase = { kind: 'blocked', step: result.step, stop: result };
  else if (result?.status === 'ready') phase = { kind: 'ready', busy };
  else if (stopped) phase = { kind: 'stopped' };
  else phase = { kind: 'preparing' };
  // A line may be drawn on whatever the canvas shows, but not while an order is chosen or a repeat is added.
  const drawing = !readOnly && (axes?.length ?? 0) > 0 && !choosing && !(phase.kind === 'ready' && phase.busy);

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
      backFromOrder,
    },
    step,
    drawn: refusedLine,
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
      // Stopped: Enter, as the window's Repeat, asks for the repeat again.
      if (!stopped || !settled || busy) return false;
      void prepare();
      return true;
    },
    cancel: () => {
      // A preparation under way, or about to start (`due`, shown as preparing): stopped, the setup kept.
      if (search.current || due) {
        reset();
        setStopped(true);
        return true;
      }
      if (choosing) {
        backFromOrder();
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
