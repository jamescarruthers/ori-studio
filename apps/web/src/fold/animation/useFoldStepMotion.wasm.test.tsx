import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import { sequenceOf, step } from '../document/foldSequence.fixtures';
import type { FoldOp, FoldStepNode } from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import type { FoldEngineOutcome, FoldReport } from '../engine/foldEngineWire';
import type { FoldSession, FoldSessionWorker } from '../session/foldSession';
import {
  FOLD_IDLE,
  FOLD_PENDING_NODE,
  type FoldSessionNode,
  type FoldSessionSnapshot,
} from '../session/foldSessionState';
import type { FoldStepMotion } from './foldStepMotion';
import { useFoldStepMotion } from './useFoldStepMotion';

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

const PLACE: FoldedFlatPaperSceneOptions = {
  markHidden: true,
  toScenePx: (p) => [p.x * 100, -p.y * 100],
  scale: 100,
};

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
function Probe({ id, place }: { id: string | null; place: FoldedFlatPaperSceneOptions | null }) {
  const motion = useFoldStepMotion(id, place);
  useEffect(() => {
    seen.push(motion);
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;
const render = async (id: string | null, place: FoldedFlatPaperSceneOptions | null = PLACE) => {
  await act(async () => {
    root.render(<Probe id={id} place={place} />);
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

  it('turns a turn step as the view turns, its parent the step before', async () => {
    const over = await bookAndTurn();
    app.session = over.session;
    await render('b');
    expect(latest()?.step).toBe('turn');
    expect(latest()?.motion.kind).toBe('turn');
  });

  it('has none for the sheet, an unknown step, or without a placement', async () => {
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
