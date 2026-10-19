import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldStepAdded } from '../../analytics';
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
import type { RepeatPrepared, RepeatRequest, RepeatSourceStep } from './repeatPreparation';
import type { RepeatSymmetry } from './repeatGeometry';
import { useFoldRepeatUi, type FoldRepeatOpening } from './foldRepeatUi';

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
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RepeatPrepared | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const ticket = useRef(0);
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
    session.cancel();
    useFoldRepeatUi.getState().close();
    if (opening.rebuild && session.store.getState().loadId === opening.loadId)
      useWorkspaceStore.getState().moveFoldCursor(opening.rebuild.id);
  };
  const invalidate = () => {
    ticket.current++;
    session.cancel();
    setResult(null);
    setChoice(null);
    setError(null);
    setBusy(false);
    setSelections({});
  };
  useEffect(() => {
    if (!valid) {
      useFoldRepeatUi.getState().close();
      return;
    }
    if (!base) return;
    // Timeline clicks can change the range as well as the setup control.
    ticket.current++;
    session.cancel();
    setResult(null);
    setChoice(null);
    setSelections({});
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
          setError('repeat_unavailable');
          return;
        }
        setAxes(answer.value.axes);
        setBaseline(answer.value.scene);
        const existing = opening.rebuild?.expected.axis;
        const old = existing
          ? answer.value.axes.findIndex((a) => canonicalJson(a.sheet) === canonicalJson(existing))
          : -1;
        setAxis(old >= 0 ? old : answer.value.axes.length === 1 ? 0 : -1);
      })
      .catch(() => {
        if (active) setError('repeat_unavailable');
      });
    return () => {
      active = false;
    };
  }, [base, first, valid, opening, session]);
  useEffect(
    () => () => {
      ticket.current++;
      session.cancel();
    },
    [session],
  );

  const show = async (op: FoldRepeatOp) => {
    const preview = await session.preview(op);
    if (preview.status === 'refused') setError(preview.refused.refusal.code);
    else if (preview.status !== 'landed' && preview.status !== 'superseded') setError('repeat_unavailable');
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
        setError('repeat_unavailable');
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
    setChoice(null);
    session.cancel();
    try {
      const answer = await session.withState(parent.state, (engine, state) =>
        engine.prepareRepeat({
          parent: state,
          source: { first, last: opening.parent, revision: opening.path },
          steps,
          axis: axes[axis]!.sheet,
          selections: accepted,
          baseline: baselineId,
        } satisfies RepeatRequest),
      );
      if (ticket.current !== run) return;
      if (answer.status !== 'answered') {
        setError('repeat_unavailable');
        return;
      }
      setResult(answer.value);
      if (answer.value.status === 'ready') await show(answer.value.op);
      else if (answer.value.prefix?.steps.length) await show(answer.value.prefix);
    } catch {
      if (ticket.current === run) setError('repeat_unavailable');
    } finally {
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
      if (ticket.current === run) setError('repeat_unavailable');
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
      trackFoldStepAdded('repeat', {
        repeat: { mode: individual ? 'individual' : 'grouped', count: op.steps.length },
      });
      close();
    } else setError('repeat_unavailable');
    setBusy(false);
  };
  useEffect(() =>
    registerFoldCancel(() => {
      close();
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
