import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tracked = vi.hoisted(() => ({ offered: vi.fn(), refused: vi.fn() }));
vi.mock('../../analytics', () => ({
  trackFoldChoiceOffered: tracked.offered,
  trackFoldRefused: tracked.refused,
}));

import type { FoldAnalysis, FoldCrossSection, FoldFlap } from '../engine/foldEngineWire';
import type { FoldPendingAnalysis } from '../session/foldSessionState';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { FOLD_TOOL_INITIAL, type FoldToolState } from '../tools/foldToolState';
import { flatSquareLandmarks, flatSquareScene } from './foldCanvas.fixtures';
import { foldPickIndex, type FoldPick } from './foldPicking';
import type { FoldStateView } from './useFoldStateView';
import { useFoldToolPreview, type FoldToolPreview } from './useFoldToolPreview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PARENT = { generation: 1, id: 7 };
const FLAPS: FoldFlap[] = [
  { faces: [0], witness: [0.5, 0.75] },
  { faces: [1], witness: [0.5, 0.9] },
];
const SECTION = {
  line: { n: [0, 1], d: 0.5 },
  side: 'positive',
  from: { x: 0, y: 0.5 },
  to: { x: 1, y: 0.5 },
  intervals: [{ start: 0, end: 1, faces: [0, 1], rows: [0, 1] }],
  rows: [
    { faces: [0], spans: [[0, 1]], flap: 0 },
    { faces: [1], spans: [[0, 1]], flap: 1 },
  ],
  order: { kind: 'layered', unordered: [] },
  flaps: FLAPS,
  layers: 2,
  joins: [],
} as unknown as FoldCrossSection;

const analysisOf = (side: 'positive' | 'negative'): FoldAnalysis =>
  ({
    line: { n: [0, 1], d: 0.5 },
    side,
    snap: { kind: 'none' },
    direction: 'valley',
    flaps: FLAPS,
    picked: [0, 1],
    added: [],
    moving: [0, 1],
  }) as unknown as FoldAnalysis;

const engine = {
  axiomCandidates: vi.fn(async () => ({
    status: 'ok',
    candidates: [
      { root: 0, line: { n: [1, 0], d: 0.5 }, side: null },
      { root: 1, line: { n: [0, 1], d: 0.5 }, side: null },
    ],
  })),
  crossSection: vi.fn(async () => ({ status: 'ok', section: SECTION })),
  action: vi.fn(async () => ({ status: 'refused' })),
};

let analysis: FoldPendingAnalysis = { status: 'idle' };
const analyse = vi.fn(async () => undefined);
const verbs = {
  analyse,
  preview: vi.fn(async () => undefined),
  cancel: vi.fn(),
  withState: vi.fn(async () => ({ status: 'unavailable' })),
  withCursor: vi.fn(async (call: (e: unknown, at: unknown) => Promise<unknown>) => ({
    status: 'answered',
    value: await call(engine, PARENT),
  })),
};
/** The session as the hook reads it: stable verbs, a snapshot that is new each render. */
const session = (): FoldSessionSurface =>
  ({
    ...verbs,
    cursor: { state: PARENT },
    analysis,
    pending: { status: 'idle' },
  }) as unknown as FoldSessionSurface;

const view = { index: foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []) } as unknown as FoldStateView;

let seen: FoldToolPreview | null = null;
function Probe({ tools }: { tools: FoldToolState }) {
  seen = useFoldToolPreview(session(), view, tools);
  return null;
}

let root: Root | null = null;
beforeEach(() => {
  root = createRoot(document.createElement('div'));
  analysis = { status: 'idle' };
  seen = null;
  vi.clearAllMocks();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const render = async (tools: FoldToolState) => {
  await act(async () => root?.render(<Probe tools={tools} />));
  // The engine's answers, and the renders they make.
  for (let k = 0; k < 3; k += 1) await act(async () => {});
};

const free = (x: number, y: number): FoldPick => ({ kind: 'free', scene: { x, y } });
const FREE_LINE: FoldToolState = { ...FOLD_TOOL_INITIAL, lineMode: 'free', picks: [free(0, 0.5), free(1, 0.5)] };

/** The analysis slot answering the step the hook last asked about. */
function answer(status: 'working' | 'analysed', side: 'positive' | 'negative' = 'positive'): void {
  const op = (analyse.mock.calls.at(-1) as unknown as [never] | undefined)?.[0];
  if (!op) throw new Error('nothing asked');
  analysis =
    status === 'working'
      ? { status, op, parent: PARENT }
      : { status, op, parent: PARENT, analysis: analysisOf(side) };
}

describe('the layers at the line', () => {
  it('stay on show while a new seed of the same line is analysed', async () => {
    await render(FREE_LINE);
    answer('analysed');
    await render(FREE_LINE);
    expect(seen?.section).toBe(SECTION);

    // A flap left out: the same line and side, another step to analyse.
    const oneFlap: FoldToolState = { ...FREE_LINE, seed: { scope: 'flaps', flaps: [FLAPS[1]!] } };
    await render(oneFlap);
    expect(seen?.analysis).toBeNull();
    expect(seen?.section).toBe(SECTION);
    answer('working');
    await render(oneFlap);
    expect(seen?.section).toBe(SECTION);
    answer('analysed');
    await render(oneFlap);
    expect(seen?.section).toBe(SECTION);
    // The same line and side: nothing asked twice.
    expect(engine.crossSection).toHaveBeenCalledTimes(1);
  });

  it('let the other side’s section go until it is asked for', async () => {
    await render(FREE_LINE);
    answer('analysed');
    await render(FREE_LINE);
    expect(seen?.section).toBe(SECTION);

    const swapped: FoldToolState = { ...FREE_LINE, swapped: true };
    await render(swapped);
    expect(seen?.section).toBeNull();
  });
});
