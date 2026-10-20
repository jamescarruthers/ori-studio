import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldRefused, trackFoldStepAdded } from '../../analytics';
import { trackFoldRepeatRebuilt } from '../../analytics/trackFold';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { visibleMarks } from '../document/foldStepTree';
import { markPoints } from '../document/foldSequenceDocument';
import type { FoldRepeatOp } from '../document/foldSequenceDocument';
import type { FoldScene } from '../engine/foldEngineWire';
import { currentFoldPath } from '../sequence/foldCommands';
import { registerFoldCancel, registerFoldKeyHandler } from '../sequence/foldKeys';
import { useFoldSessionState } from '../session/useFoldSession';
import { canonicalJson } from '../document/foldDigest';
import { foldSearchTicket, type FoldSearchTicket } from '../engine/foldSearch';
import type { RepeatPrepared, RepeatRequest, RepeatSourceStep } from './repeatPreparation';
import type { RepeatSymmetry } from './repeatGeometry';
import { useFoldRepeatUi, type FoldRepeatOpening } from './foldRepeatUi';
import type { RepeatStop } from './repeatWords';

/** The source changed, or the worker failed: not a refusal, and not counted as one. */
const UNAVAILABLE: RepeatStop = { code: 'repeat_unavailable' };

export function useFoldRepeat(opening: FoldRepeatOpening, locating = false) {
  const session = foldSession();
  const snapshot = useFoldSessionState((s) => s);
  const path = currentFoldPath(snapshot);
  const candidates = path.entries.slice(1, path.cursor + 1);
  const first = useFoldRepeatUi((s) => s.first ?? opening.parent);
  const [individual, setIndividual] = useState(false);
  const [axes, setAxes] = useState<RepeatSymmetry[]>([]);
  const [axis, setAxis] = useState(-1);
  const [baseline, setBaseline] = useState<FoldScene | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RepeatStop | null>(null);
  const [result, setResult] = useState<RepeatPrepared | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  /** The preparation the worker is running, until it answers: what Stop and Escape cancel there. */
  const [searching, setSearching] = useState<FoldSearchTicket | null>(null);
  const [stopped, setStopped] = useState(false);
  const ticket = useRef(0);
  const search = useRef<FoldSearchTicket | null>(null);
  /** Stop the preparation in the worker: it lets go of every state it landed, and its answer is dropped. */
  const stopSearch = () => {
    if (search.current) session.cancelSearch(search.current);
    search.current = null;
    setSearching(null);
  };
  const start = path.entries.findIndex((e) => e.id === first);
  const base = path.entries[start - 1]?.session.state;
  const baselineId = path.entries[start - 1]?.id ?? null;
  const axisMarks = useMemo(
    () =>
      snapshot.sequence
        ? visibleMarks(snapshot.sequence, baselineId).flatMap((mark) =>
            markPoints(mark).map((at) => ({ at, mark: mark.id })),
          )
        : [],
    [snapshot.sequence, baselineId],
  );
  const parent = snapshot.nodes.get(opening.parent);
  const valid =
    snapshot.loadId === opening.loadId &&
    snapshot.sequence?.id === opening.sequenceId &&
    snapshot.cursor === opening.parent &&
    parent?.path === opening.path &&
    parent.fingerprint === opening.fingerprint &&
    !snapshot.readOnly;

  const close = () => {
    ticket.current++;
    stopSearch();
    session.cancel();
    useFoldRepeatUi.getState().close();
    if (opening.rebuild && session.store.getState().loadId === opening.loadId)
      useWorkspaceStore.getState().moveFoldCursor(opening.rebuild.id);
  };
  const invalidate = () => {
    ticket.current++;
    stopSearch();
    session.cancel();
    setResult(null);
    setChoice(null);
    setError(null);
    setStopped(false);
    setBusy(false);
    setSelections({});
  };
  /** Stop the preparation under way and keep the setup: nothing was prepared, nothing is added. */
  const stop = () => {
    if (!search.current) return false;
    invalidate();
    setStopped(true);
    return true;
  };
  useEffect(() => {
    if (!valid) {
      useFoldRepeatUi.getState().close();
      return;
    }
    if (!base) return;
    // Timeline clicks can change the range as well as the setup control.
    ticket.current++;
    if (search.current) session.cancelSearch(search.current);
    search.current = null;
    setSearching(null);
    session.cancel();
    setResult(null);
    setChoice(null);
    setSelections({});
    setStopped(false);
    setBusy(false);
    let active = true;
    setAxes([]);
    setAxis(-1);
    setBaseline(null);
    setError(null);
    void session
      .withState(base, async (engine, state) => ({
        axes: await engine.repeatAxes(state),
        scene: await engine.scene(state),
      }))
      .then((answer) => {
        if (!active) return;
        if (answer.status !== 'answered') {
          setError(UNAVAILABLE);
          return;
        }
        setAxes(answer.value.axes);
        // No matching pair of sides: the bar says so for this range, which is Repeat refused.
        if (!answer.value.axes.length) trackFoldRefused('repeat_axis', 'repeat');
        setBaseline(answer.value.scene);
        const existing = opening.rebuild?.expected.axis;
        const old = existing
          ? answer.value.axes.findIndex((a) => canonicalJson(a.sheet) === canonicalJson(existing))
          : -1;
        setAxis(old >= 0 ? old : answer.value.axes.length === 1 ? 0 : -1);
      })
      .catch(() => {
        if (active) setError(UNAVAILABLE);
      });
    return () => {
      active = false;
    };
  }, [base, first, valid, opening, session]);
  useEffect(
    () => () => {
      ticket.current++;
      if (search.current) session.cancelSearch(search.current);
      search.current = null;
      session.cancel();
    },
    [session],
  );

  const show = async (op: FoldRepeatOp) => {
    const preview = await session.preview(op);
    if (preview.status === 'refused') {
      setError({ code: preview.refused.refusal.code, refusal: preview.refused.refusal });
      trackFoldRefused(preview.refused.refusal.code, 'repeat');
    } else if (preview.status !== 'landed' && preview.status !== 'superseded') setError(UNAVAILABLE);
  };
  const prepare = async (accepted = selections) => {
    if (!valid || !parent?.state || !axes[axis] || start < 1) return;
    const sequence = path.entries.slice(start, path.cursor + 1);
    const steps: RepeatSourceStep[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const entry = sequence[i]!,
        before = path.entries[start + i - 1]?.session.state;
      if (
        !entry.node?.op ||
        !entry.session.state ||
        !before ||
        before.generation !== parent.state.generation ||
        entry.session.state.generation !== parent.state.generation
      ) {
        setError(UNAVAILABLE);
        return;
      }
      steps.push({
        id: entry.id!,
        op: entry.node.op,
        choices: entry.node.choices,
        before: before.id,
        after: entry.session.state.id,
      });
    }
    const run = ++ticket.current;
    setBusy(true);
    setError(null);
    setStopped(false);
    setChoice(null);
    session.cancel();
    stopSearch();
    const searched = foldSearchTicket();
    search.current = searched;
    setSearching(searched);
    try {
      const answer = await session.withState(parent.state, (engine, state) =>
        engine.prepareRepeat({
          parent: state,
          source: { first, last: opening.parent, revision: opening.path },
          steps,
          axis: axes[axis]!.sheet,
          selections: accepted,
          baseline: baselineId,
        } satisfies RepeatRequest, searched),
      );
      if (search.current === searched) {
        search.current = null;
        setSearching(null);
      }
      if (ticket.current !== run) return;
      if (answer.status !== 'answered') {
        setError(UNAVAILABLE);
        return;
      }
      setResult(answer.value);
      // Refusals are counted by their closed code; `repeat_unavailable` is the source changing or the worker failing, not one.
      if (answer.value.status === 'blocked') trackFoldRefused(answer.value.code, 'repeat');
      if (answer.value.status === 'ready') await show(answer.value.op);
      else if (answer.value.prefix?.steps.length) await show(answer.value.prefix);
    } catch {
      // A preparation stopped here (`stop`, `close`) rejects as cancelled, its run already superseded.
      if (ticket.current === run) setError(UNAVAILABLE);
    } finally {
      if (search.current === searched) {
        search.current = null;
        setSearching(null);
      }
      if (ticket.current === run) setBusy(false);
    }
  };
  const cycle = async (index: number) => {
    if (result?.status !== 'choice') return;
    const run = ++ticket.current;
    setBusy(true);
    setError(null);
    const selected = (index + result.candidates.length) % result.candidates.length;
    setChoice(selected);
    try {
      await show({ ...result.prefix, steps: [...result.prefix.steps, result.candidates[selected]!] });
    } catch {
      if (ticket.current === run) setError(UNAVAILABLE);
    } finally {
      if (ticket.current === run) setBusy(false);
    }
  };
  const acceptChoice = () => {
    if (result?.status !== 'choice' || choice === null || busy || error) return;
    const next = { ...selections, [result.step]: result.candidates[choice]!.expect };
    setSelections(next);
    void prepare(next);
  };
  const commit = async () => {
    if (!valid || busy || error || result?.status !== 'ready') return;
    const op = result.op;
    if (op.source.first !== first) return;
    const now = session.store.getState();
    if (
      now.cursor !== opening.parent ||
      now.loadId !== opening.loadId ||
      now.nodes.get(opening.parent)?.path !== opening.path
    )
      return;
    const pending = now.pending;
    if (pending.status !== 'landed' || canonicalJson(pending.request.op) !== canonicalJson(op)) return;
    setBusy(true);
    let done: boolean;
    if (opening.rebuild)
      done = useWorkspaceStore
        .getState()
        .updateFoldRepeat(
          opening.rebuild.id,
          opening.rebuild.expected,
          op,
          op.steps.at(-1)!.expect,
          opening.loadId,
        );
    else if (individual)
      done = useWorkspaceStore.getState().commitFoldSteps(opening.parent, op.steps, opening.loadId) !== null;
    else done = (await session.commitStep(op)).status === 'committed';
    if (done) {
      // An update in place is no step added, as an Unfold's rebuild is not.
      if (opening.rebuild) trackFoldRepeatRebuilt();
      else
        trackFoldStepAdded('repeat', {
          repeat: { mode: individual ? 'individual' : 'grouped', count: op.steps.length },
        });
      close();
    } else setError(UNAVAILABLE);
    setBusy(false);
  };
  // Escape stops a preparation under way and keeps the setup; otherwise it closes Repeat.
  useEffect(() =>
    registerFoldCancel(() => {
      if (!stop()) close();
      return true;
    }),
  );
  useEffect(() =>
    registerFoldKeyHandler((id) => {
      if (locating) return false;
      if (choice !== null && result?.status === 'choice') {
        if (
          ['fold.previousStep', 'fold.nextStep', 'fold.previousCandidate', 'fold.nextCandidate'].includes(id)
        ) {
          if (!busy) void cycle(choice + (id === 'fold.nextStep' || id === 'fold.nextCandidate' ? 1 : -1));
          return true;
        }
      }
      if (id === 'fold.commit') {
        if (choice !== null) acceptChoice();
        else if (result?.status === 'ready') void commit();
        else if (result?.status === 'choice') void cycle(0);
        else void prepare();
        return true;
      }
      // The preview owns navigation until canceled or saved.
      return id.startsWith('fold.');
    }),
  );
  return {
    candidates,
    first,
    setFirst: (id: string) => {
      invalidate();
      useFoldRepeatUi.getState().setFirst(id);
    },
    individual,
    setIndividual,
    axes,
    axis,
    setAxis: (value: number) => {
      invalidate();
      setAxis(value);
    },
    baseline,
    base,
    axisMarks,
    busy,
    /** The worker is preparing the repeat: Stop (and Escape) cancels it there. */
    preparing: searching !== null,
    /** The last preparation was stopped before it answered. */
    stopped,
    stop,
    error,
    result,
    choice,
    cycle,
    acceptChoice,
    prepare,
    commit,
    close,
    backFromChoice: () => {
      session.cancel();
      setChoice(null);
    },
    count: path.cursor - start + 1,
    canPreview: valid && axis >= 0 && !busy && start > 0,
  };
}
