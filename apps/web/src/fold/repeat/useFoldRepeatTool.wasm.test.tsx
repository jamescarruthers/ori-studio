/**
 * The Repeat tool over the real engine and the session (plan
 * `fold-sequence-tools`): its axis — chosen, remembered from one repeat to
 * the next, or drawn as a free line and accepted only when it is a verified
 * axis — and its preparation, which Escape stops in the engine, every trial
 * state let go, keeping the setup; nothing added to the sequence or to Undo;
 * a second Escape puts Repeat down.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { foldSessionDocumentSource } from '../../store/workspaceStore/foldSession';
import type { FoldPick } from '../canvas/foldPicking';
import { initialFoldReaderState, withFoldCursor } from '../document/foldReaderState';
import type { FoldModelLine, FoldOp, FoldSequenceDocument } from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import { createFoldSearchRunner, type FoldSearchTicket } from '../engine/foldSearch';
import { createFoldSession, type FoldSession } from '../session/foldSession';
import { inProcessFoldRuntime, settle } from '../session/foldSession.fixtures';
import { selectFoldCursorNode } from '../session/foldSessionState';
import { useFoldSession } from '../session/useFoldSession';
import { foldTools, useFoldTools } from '../tools/foldToolState';
import { repeatSymmetries } from './repeatGeometry';
import { prepareRepeatSearch, REPEAT_PREPARATION_MS, type RepeatRequest } from './repeatPreparation';
import { useFoldRepeatTool } from './useFoldRepeatTool';

let session: FoldSession;
vi.mock('../../store/workspaceStore/foldSession', async (original) => ({
  ...(await original<typeof import('../../store/workspaceStore/foldSession')>()),
  foldSession: () => session,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');

/** A precrease then a corner fold on the right half: what Repeat mirrors across x = 1/2. */
const ops: FoldOp[] = [
  { kind: 'precrease', direction: 'valley', line: { via: 'free', through: [[0.75, 0], [0.75, 1]] }, moving: [0.9, 0.5], seed: { scope: 'all' } },
  { kind: 'valley', line: { via: 'free', through: [[0.6, 1], [1, 0.6]] }, moving: [0.95, 0.95], seed: { scope: 'all' } },
];
const document: FoldSequenceDocument = {
  formatVersion: 1,
  id: 'repeat-stop',
  title: '',
  paper: { shape: { kind: 'square' }, startSide: 'front' },
  steps: ops.map((op, i) => ({ id: `s${i}`, parent: i ? `s${i - 1}` : null, op })),
};

/**
 * The worker's calls in-process, its searches run by a runner that pauses
 * between slices while `paused`, for the test to stop one in the middle.
 */
async function bridge() {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  const raw = new wasm.FoldEngine();
  let paused = false;
  let resume: (() => void) | null = null;
  const runner = createFoldSearchRunner({
    sliceMs: 0,
    yieldTask: () => (paused ? new Promise<void>((done) => (resume = done)) : Promise.resolve()),
  });
  const calls = { ...createFoldEngineCalls(raw), ...createFoldEngineCompoundCalls(raw) };
  const worker = Object.assign(calls, {
    repeatAxes: (state: number) => repeatSymmetries(calls.scene(state), calls.summary(state).sheet),
    prepareRepeat: (request: RepeatRequest, ticket?: FoldSearchTicket) =>
      runner.run(prepareRepeatSearch(calls, request), REPEAT_PREPARATION_MS, ticket),
    cancelSearch: (id: number) => runner.cancel(id),
  });
  const runtime = inProcessFoldRuntime((): FoldEngineCalls => worker, wasm.fold_engine_version());
  return {
    runtime,
    live: () => raw.live(),
    pause: (on: boolean) => (paused = on),
    /** The search is waiting between two slices. */
    waiting: () => resume !== null,
    resume: () => {
      const go = resume;
      resume = null;
      go?.();
    },
  };
}

async function until<T>(ready: () => T | null | undefined | false, what: string): Promise<T> {
  for (let round = 0; round < 200; round += 1) {
    const value = ready();
    if (value) return value;
    await act(async () => settle(2));
  }
  throw new Error(`timed out waiting for ${what}`);
}

let seen: ReturnType<typeof useFoldRepeatTool> | null = null;
function Probe() {
  const surface = useFoldSession();
  const tools = useFoldTools((state) => state);
  const repeat = useFoldRepeatTool(surface, tools);
  useEffect(() => {
    seen = repeat;
  });
  return null;
}

let root: Root;
let engine: Awaited<ReturnType<typeof bridge>>;

beforeEach(async () => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  engine = await bridge();
  session = createFoldSession({ document: foldSessionDocumentSource(useWorkspaceStore), runtime: engine.runtime });
  session.retain();
  useWorkspaceStore
    .getState()
    .installFoldSequences([{ document, readOnlyRaw: null }], withFoldCursor(initialFoldReaderState(document.id), document, 's1'));
  await until(() => session.store.getState().cursor === 's1' && selectFoldCursorNode(session.store.getState()).status === 'ok', 'the replay');
  root = createRoot(window.document.createElement('div'));
  seen = null;
  act(() => foldTools().selectTool('valley'));
});

afterEach(() => {
  act(() => root.unmount());
  act(() => foldTools().selectTool('valley'));
  session.dispose();
});

/** The vertical axis through the middle of the sheet, as its sheet line. */
const isMiddle = (line: FoldModelLine) => Math.abs(Math.abs(line.n[0]) - 1) < 1e-9 && Math.abs(Math.abs(line.d) - 0.5) < 1e-9;

/** Repeat in hand on both steps, its axes found. */
async function taken() {
  act(() => foldTools().selectTool('repeat'));
  await act(async () => root.render(<Probe />));
  act(() => foldTools().setRepeatFirst('s0'));
  // The sheet before the range, whose axes are asked.
  return until(() => seen && seen.view.range?.first === 's0' && seen.view.phase.kind === 'picking' && seen.marks, 'the axes');
}

/** Repeat in hand on both steps, the vertical axis through the middle taken. */
async function opened() {
  const marks = await taken();
  const middle = marks.axes.findIndex((axis) => isMiddle(axis.sheet));
  expect(middle).toBeGreaterThanOrEqual(0);
  act(() => seen!.verbs.setAxis(middle));
  await until(() => seen?.view.axis === middle, 'the axis');
  return middle;
}

/** Let the paused preparation go from slice to slice until it holds a trial state: the middle of it. */
function untilHolding(live: number) {
  return until(() => {
    if (!engine.waiting()) return false;
    if (engine.live() > live) return true;
    engine.resume();
    return false;
  }, 'a preparation holding a trial state');
}

/** Enter, without waiting for the preparation: it may be stopped. */
function prepare() {
  act(() => {
    expect(seen!.primary()).toBe(true);
  });
}

/** A free line clicked on the folded pane through two scene points. */
function draw(a: { x: number; y: number }, b: { x: number; y: number }) {
  for (const scene of [a, b]) {
    const pick: FoldPick = { kind: 'free', pane: 'folded', scene, sheet: null };
    act(() => {
      foldTools().pick(pick);
    });
  }
}

/** Two points on a scene line, a little way either side of its foot. */
function along(line: FoldModelLine): [{ x: number; y: number }, { x: number; y: number }] {
  const foot = { x: line.n[0] * line.d, y: line.n[1] * line.d };
  const direction = { x: -line.n[1], y: line.n[0] };
  return [
    { x: foot.x - 0.3 * direction.x, y: foot.y - 0.3 * direction.y },
    { x: foot.x + 0.3 * direction.x, y: foot.y + 0.3 * direction.y },
  ];
}

describe('the Repeat tool', () => {
  it('prepares a small range to the end, previews it and saves one numbered step, then is put down', async () => {
    await opened();
    prepare();
    await until(() => seen?.view.phase.kind === 'ready' && session.store.getState().pending.status === 'landed', 'the prepared repeat');
    act(() => {
      expect(seen!.primary()).toBe(true);
    });
    await until(() => useWorkspaceStore.getState().foldSequences[0]!.document.steps.length === 3, 'the saved repeat');
    const saved = useWorkspaceStore.getState().foldSequences[0]!.document.steps[2]!;
    expect(saved.op?.kind).toBe('repeat');
    expect(foldTools().store.getState().tool).toBe('valley');
  });

  it('takes the axis last chosen from one repeat to the next', async () => {
    const marks = await taken();
    // Before any is chosen, the first verified axis.
    expect(seen!.view.axis).toBe(0);
    const other = marks.axes.length - 1;
    expect(other).toBeGreaterThan(0);
    act(() => seen!.verbs.setAxis(other));
    await until(() => seen?.view.axis === other, 'the axis chosen');
    const chosen = marks.axes[other]!.sheet;
    // Put down and taken up again: the axis chosen is taken again, the range back to the step on screen.
    act(() => {
      foldTools().putDown();
    });
    act(() => foldTools().selectTool('repeat'));
    await until(() => seen?.view.range?.first === 's1' && seen.view.axes !== null, 'the axes of the range of one');
    // Whether or not that range has the axis, it stays the one remembered.
    expect(foldTools().store.getState().repeatAxis).toEqual(chosen);
    act(() => foldTools().setRepeatFirst('s0'));
    await until(() => seen?.view.range?.first === 's0' && seen.marks, 'the axes again');
    expect(seen!.marks!.axes[seen!.view.axis]!.sheet).toEqual(chosen);
  });

  it('takes a line drawn along a verified axis, and refuses one that is none, offering the nearest', async () => {
    const marks = await taken();
    const middle = marks.axes.findIndex((axis) => isMiddle(axis.sheet));
    const other = marks.axes.findIndex((axis) => !isMiddle(axis.sheet));
    act(() => seen!.verbs.setAxis(other));
    await until(() => seen?.view.axis === other, 'another axis');
    // Along the middle axis, as the folded pane shows it: taken, and the line let go.
    draw(...along(marks.axes[middle]!.display));
    await until(() => seen?.view.axis === middle && foldTools().store.getState().picks.length === 0, 'the drawn axis');
    expect(seen!.view.drawn).toBeNull();
    // A degree off the middle: no axis, so refused, and the middle offered in its place.
    const display = marks.axes[middle]!.display;
    const tilt = Math.PI / 180;
    const tilted: FoldModelLine = {
      n: [display.n[0] * Math.cos(tilt) - display.n[1] * Math.sin(tilt), display.n[0] * Math.sin(tilt) + display.n[1] * Math.cos(tilt)],
      d: display.d,
    };
    draw(...along(tilted));
    await until(() => seen?.view.drawn, 'the refusal');
    expect(seen!.view.drawn).toEqual({ nearest: middle });
    expect(seen!.view.axis).toBe(middle);
    // Escape lets the refused line go, Repeat still in hand.
    act(() => {
      expect(seen!.cancel()).toBe(true);
    });
    expect(foldTools().store.getState()).toMatchObject({ tool: 'repeat', picks: [] });
  });

  it('stops in the engine on Escape, keeps the setup, adds nothing, and is put down on a second Escape', async () => {
    await opened();
    const live = engine.live();
    const history = useWorkspaceStore.getState().foldHistory.past.length;
    engine.pause(true);
    prepare();
    // In the middle of the preparation: paused between engine calls, holding a trial state.
    await untilHolding(live);
    expect(seen?.view.phase.kind).toBe('preparing');

    let stopped = false;
    act(() => {
      stopped = seen!.cancel();
    });
    expect(stopped).toBe(true);
    engine.pause(false);
    engine.resume();
    await until(() => seen?.view.phase.kind === 'stopped', 'the stop');

    expect(engine.live()).toBe(live);
    expect(foldTools().store.getState().tool).toBe('repeat');
    expect(useWorkspaceStore.getState().foldHistory.past).toHaveLength(history);
    expect(useWorkspaceStore.getState().foldSequences[0]!.document.steps).toHaveLength(2);
    expect(session.store.getState().pending.status).toBe('idle');

    // Nothing is under way now: Escape puts Repeat down.
    act(() => {
      seen!.cancel();
    });
    expect(foldTools().store.getState().tool).toBe('valley');
  });

  it('stops the preparation in the engine when Repeat is put down under it', async () => {
    await opened();
    const live = engine.live();
    engine.pause(true);
    prepare();
    await untilHolding(live);
    act(() => foldTools().selectTool('mountain'));
    engine.pause(false);
    engine.resume();
    await until(() => engine.live() === live, 'the trial states to go');
    expect(seen).toBeNull();
  });
});
