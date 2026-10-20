/**
 * Stopping a Repeat preparation from the Repeat bar's hook, over the real
 * engine and the session: Escape stops the search in the engine — every trial
 * state let go — and keeps the setup open; nothing is added to the sequence
 * or to Undo; a second Escape closes Repeat.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { foldSessionDocumentSource } from '../../store/workspaceStore/foldSession';
import { initialFoldReaderState, withFoldCursor } from '../document/foldReaderState';
import type { FoldOp, FoldSequenceDocument } from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import { createFoldSearchRunner, type FoldSearchTicket } from '../engine/foldSearch';
import { runFoldCancel } from '../sequence/foldKeys';
import { createFoldSession, type FoldSession } from '../session/foldSession';
import { inProcessFoldRuntime, settle } from '../session/foldSession.fixtures';
import { selectFoldCursorNode } from '../session/foldSessionState';
import { openFoldRepeat, useFoldRepeatUi, type FoldRepeatOpening } from './foldRepeatUi';
import { repeatSymmetries } from './repeatGeometry';
import { prepareRepeatSearch, REPEAT_PREPARATION_MS, type RepeatRequest } from './repeatPreparation';
import { useFoldRepeat } from './useFoldRepeat';

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

let seen: ReturnType<typeof useFoldRepeat> | null = null;
function Probe({ opening }: { opening: FoldRepeatOpening }) {
  const repeat = useFoldRepeat(opening);
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
});

afterEach(() => {
  act(() => root.unmount());
  useFoldRepeatUi.getState().close();
  session.dispose();
});

/** Repeat open on both steps, the vertical axis through the middle chosen. */
async function opened() {
  act(() => openFoldRepeat());
  const opening = useFoldRepeatUi.getState().opening;
  if (!opening) throw new Error('Repeat did not open');
  await act(async () => root.render(<Probe opening={opening} />));
  await until(() => seen && seen.axes.length > 0, 'the axes');
  act(() => seen!.setFirst('s0'));
  // The sheet before the range, whose axes are asked again.
  await until(() => seen && seen.first === 's0' && seen.axes.length > 0, 'the range');
  const middle = seen!.axes.findIndex((axis) => Math.abs(Math.abs(axis.sheet.n[0]) - 1) < 1e-9 && Math.abs(Math.abs(axis.sheet.d) - 0.5) < 1e-9);
  expect(middle).toBeGreaterThanOrEqual(0);
  act(() => seen!.setAxis(middle));
  await until(() => seen?.canPreview, 'a preview to be possible');
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

/** Ask for the preparation without waiting for it: it may be stopped. */
function prepare() {
  act(() => {
    void seen!.prepare();
  });
}

describe('Stopping a Repeat preparation', () => {
  it('prepares a small range to the end when nothing stops it', async () => {
    await opened();
    prepare();
    await until(() => seen?.result?.status === 'ready' && !seen.busy, 'the prepared repeat');
    expect(seen).toMatchObject({ preparing: false, stopped: false, error: null });
  });

  it('stops in the engine on Escape, keeps the setup open, adds nothing, and closes on a second Escape', async () => {
    await opened();
    const live = engine.live();
    const history = useWorkspaceStore.getState().foldHistory.past.length;
    engine.pause(true);
    prepare();
    // In the middle of the preparation: paused between engine calls, holding a trial state.
    await untilHolding(live);
    expect(seen).toMatchObject({ busy: true, preparing: true });

    let stopped = false;
    act(() => {
      stopped = runFoldCancel();
    });
    expect(stopped).toBe(true);
    engine.pause(false);
    engine.resume();
    await until(() => seen && !seen.busy && seen.stopped, 'the stop');

    expect(seen).toMatchObject({ preparing: false, stopped: true, error: null, result: null });
    expect(engine.live()).toBe(live);
    expect(useFoldRepeatUi.getState().opening).not.toBeNull();
    expect(useWorkspaceStore.getState().foldHistory.past).toHaveLength(history);
    expect(useWorkspaceStore.getState().foldSequences[0]!.document.steps).toHaveLength(2);
    expect(session.store.getState().pending.status).toBe('idle');

    // Nothing is under way now: Escape closes Repeat.
    act(() => {
      runFoldCancel();
    });
    expect(useFoldRepeatUi.getState().opening).toBeNull();
  });

  it('stops the preparation in the engine when Repeat is closed under it', async () => {
    await opened();
    const live = engine.live();
    engine.pause(true);
    prepare();
    await untilHolding(live);
    act(() => seen!.close());
    engine.pause(false);
    engine.resume();
    await until(() => engine.live() === live, 'the trial states to go');
    expect(useFoldRepeatUi.getState().opening).toBeNull();
  });
});
