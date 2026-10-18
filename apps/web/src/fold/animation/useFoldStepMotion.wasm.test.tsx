import { DEFAULT_LAYER_SPREAD } from '../../cp-workspace/folded/layerSpreadSettings';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { sequenceOf, step } from '../document/foldSequence.fixtures';
import type { FoldOp, FoldStepNode } from '../document/foldSequenceDocument';
import { setFoldMarks, setFoldStepNote, setFoldStepSpread } from '../document/foldSequenceEdits';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCrimpTuckCalls } from '../engine/foldEngineCrimpTuckCalls';
import type { FoldEngineOutcome, FoldReport } from '../engine/foldEngineWire';
import type { FoldSession, FoldSessionWorker } from '../session/foldSession';
import {
  FOLD_IDLE,
  FOLD_PENDING_NODE,
  type FoldSessionNode,
  type FoldSessionSnapshot,
} from '../session/foldSessionState';
import { foldStepPaneAt, foldStepProgramme, type FoldStepMotion, type FoldStepPane } from './foldStepMotion';
import { useFoldStepMotion } from './useFoldStepMotion';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from './useFoldStepPlayback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The step motion as the folded pane gets it from the session: the session's
 * snapshot and queries over the real engine's states, in-process. Skipped
 * when the bridge has not been built.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(WASM);

const app = vi.hoisted(() => ({ session: null as FoldSession | null }));
vi.mock('../../store/workspaceStore/foldSession', () => ({
  foldSession: () => {
    if (!app.session) throw new Error('no session');
    return app.session;
  },
}));

const BOOK: FoldOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0.5, 0], [0.5, 1]] },
  moving: [0.75, 0.5],
  seed: { scope: 'all' },
};
const TURN: FoldOp = { kind: 'turn', axis: 'vertical' };

const PANE = foldStepPaneAt({
  markHidden: true,
  toScenePx: (p) => [p.x * 100, -p.y * 100],
  scale: 100,
});

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

const node = (id: number, report: FoldReport | null): FoldSessionNode => ({
  ...FOLD_PENDING_NODE,
  status: 'ok',
  state: { generation: 0, id },
  report,
});

/** A session over `calls`, its snapshot the given steps landed as `states`. */
function sessionOver(
  calls: FoldEngineCalls,
  steps: readonly FoldStepNode[],
  sheet: number,
  nodes: Map<string, FoldSessionNode>
): { session: FoldSession; store: StoreApi<FoldSessionSnapshot> } {
  // The two calls the hook asks; the session's others are not needed here.
  const worker = {
    scene: async (state: number) => calls.scene(state),
    stepAction: async (state: number) => calls.stepAction(state),
  } as unknown as FoldSessionWorker;
  const document = sequenceOf(steps);
  const store = createStore<FoldSessionSnapshot>(() => ({
    live: true,
    loadId: 1,
    sequence: document,
    paper: document.paper,
    readOnly: false,
    cursor: null,
    activePath: steps.map((s) => s.id),
    sheet: node(sheet, null),
    nodes,
    progress: { replaying: false, activeSettled: 0, activeTotal: 0, settled: 0, total: 0, done: true },
    pending: FOLD_IDLE,
    analysis: FOLD_IDLE,
    error: null,
  }));
  // The hook's queries are pure: asked through `query`, with nothing held beforehand.
  const session = {
    store,
    query: async (state: { id: number }, call: (engine: FoldSessionWorker, state: number) => Promise<unknown>) => ({
      status: 'answered',
      value: await call(worker, state.id),
    }),
    peek: () => null,
  } as unknown as FoldSession;
  return { session, store };
}

let seen: (FoldStepMotion | null)[] = [];
/** Captured in an effect, which `act` flushes. */
function Probe({ id, pane }: { id: string | null; pane: FoldStepPane | null }) {
  const motion = useFoldStepMotion(id, pane);
  useEffect(() => {
    seen.push(motion);
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;
const render = async (id: string | null, pane: FoldStepPane | null = PANE) => {
  await act(async () => {
    root.render(<Probe id={id} pane={pane} />);
  });
  // Let the queries answer and their answers render.
  for (let i = 0; i < 4; i += 1) await act(async () => {});
};
const latest = () => seen[seen.length - 1] ?? null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  seen = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  app.session = null;
});

describe.skipIf(!available)('useFoldStepMotion', () => {
  async function bookAndTurn() {
    const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    const calls = createFoldEngineCalls(new wasm.FoldEngine());
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const book = landed(calls.step(sheet, BOOK));
    const turned = landed(calls.step(book.state, TURN));
    const nodes = new Map([
      ['a', node(book.state, book.report)],
      ['b', node(turned.state, turned.report)],
    ]);
    return sessionOver(calls, [step('a', null, BOOK), step('b', 'a', TURN)], sheet, nodes);
  }

  it('builds a step’s motion from its scenes, its parent’s and its picture', async () => {
    const over = await bookAndTurn();
    app.session = over.session;
    await render('a');
    const motion = latest();
    expect(motion?.step).toBe('valley');
    expect(motion?.motion.kind).toBe('hinge');
    // The same answers keep the same motion: one per step, not per render.
    await render('a');
    expect(latest()).toBe(motion);
  });

  it('keeps the motion, and a paused frame, through an edit that changes only how the step is shown', async () => {
    const over = await bookAndTurn();
    app.session = over.session;
    let playback: FoldStepPlaybackSurface | null = null;
    function Played({ id }: { id: string }) {
      const motion = useFoldStepMotion(id, PANE);
      const surface = useFoldStepPlayback({ motion });
      useEffect(() => {
        seen.push(motion);
        playback = surface;
      });
      return null;
    }
    await act(async () => {
      root.render(<Played id="a" />);
    });
    for (let i = 0; i < 4; i += 1) await act(async () => {});
    const motion = latest();
    expect(motion?.motion.kind).toBe('hinge');
    await act(async () => playback!.seek(0.5));
    expect(playback!.frames.current()).not.toBeNull();

    // The note, the spread and the marks each replace the step's node and keep its op.
    const edits = [
      (document: ReturnType<typeof sequenceOf>) => setFoldStepNote(document, 'a', 'Fold in half.'),
      (document: ReturnType<typeof sequenceOf>) => setFoldStepSpread(document, 'a', DEFAULT_LAYER_SPREAD),
      (document: ReturnType<typeof sequenceOf>) =>
        setFoldMarks(document, 'a', [{ id: 'fmark-1', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 2 } }]),
    ];
    for (const edit of edits) {
      const before = over.store.getState().sequence!;
      const after = edit(before);
      expect(after.steps[0]).not.toBe(before.steps[0]);
      await act(async () => over.store.setState({ sequence: after }));
      for (let i = 0; i < 4; i += 1) await act(async () => {});
      expect(latest()).toBe(motion);
      // Still paused half way, the frame on the pane.
      expect(playback!.position.current()).toBeCloseTo(0.5, 6);
      expect(playback!.frames.current()).not.toBeNull();
    }
  });

  it('turns a turn step as the view turns, its parent the step before', async () => {
    const over = await bookAndTurn();
    app.session = over.session;
    await render('b');
    expect(latest()?.step).toBe('turn');
    expect(latest()?.motion.kind).toBe('turn');
  });

  it('plays a compound step’s legs from what its node carries, and crossfades one whose legs are not in', async () => {
    const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    const engine = new wasm.FoldEngine();
    const calls = createFoldEngineCalls(engine);
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const DIAGONAL: FoldOp = {
      kind: 'valley',
      line: { via: 'free', through: [[1, 0], [0, 1]] },
      moving: [0.9, 0.9],
      seed: { scope: 'all' },
    };
    const tri = landed(calls.step(sheet, DIAGONAL));
    const angle = (36.87 * Math.PI) / 180;
    const CRIMP: FoldOp = {
      kind: 'crimp',
      line: { via: 'free', through: [[0.4, 0.6], [0.6, 0.8]] },
      second: {
        via: 'free',
        through: [
          [0.62, 0.38],
          [0.62 + 0.3 * Math.cos(angle), 0.38 + 0.3 * Math.sin(angle)],
        ],
      },
      crimp: 'inside',
      moving: [0.97, 0.06],
      seed: { scope: 'all' },
    };
    const folded = landed(createFoldEngineCrimpTuckCalls(engine).crimp(tri.state, CRIMP));
    if (folded.outcome !== 'landed') throw new Error(folded.outcome);
    const steps = [step('a', null, DIAGONAL), step('b', 'a', CRIMP)];
    const bare = new Map([
      ['a', node(tri.state, tri.report)],
      ['b', node(folded.state, null)],
    ]);
    // The session holds no report for it: no legs, so a crossfade, never an invented hinge.
    app.session = sessionOver(calls, steps, sheet, bare).session;
    await render('b');
    expect(latest()?.motion.kind).toBe('crossfade');
    // Its report on its node, as the session keeps it, where the accessor reads its legs: one swing.
    const carried = new Map(bare);
    carried.set('b', { ...node(folded.state, null), compound: folded.compound });
    app.session = sessionOver(calls, steps, sheet, carried).session;
    await render('b');
    const motion = latest();
    expect(motion?.step).toBe('crimp');
    expect(motion?.motion.kind).toBe('legs');
    expect(foldStepProgramme(motion!).legs).toHaveLength(1);
  });

  it('has none for the sheet, an unknown step, or without a pane', async () => {
    const over = await bookAndTurn();
    app.session = over.session;
    const asked = vi.spyOn(over.session, 'query');
    await render(null);
    expect(latest()).toBeNull();
    // The sheet has no motion, so nothing is asked of it.
    expect(asked).not.toHaveBeenCalled();
    await render('missing');
    expect(latest()).toBeNull();
    await render('a', null);
    expect(latest()).toBeNull();
  });
});
