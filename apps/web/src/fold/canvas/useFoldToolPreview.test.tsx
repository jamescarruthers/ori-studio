import { act, useEffect } from 'react';
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
  // The compound question, of a tip whose flaps cannot open.
  compoundAnalysis: vi.fn(async () => ({
    status: 'refused',
    refusal: { code: 'reverse_no_opening', faces: [0], cause: 'no_spine' },
    fixes: [],
  })),
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
/** Captured in an effect, which `act` flushes. */
function Probe({ tools }: { tools: FoldToolState }) {
  const preview = useFoldToolPreview(session(), view, tools);
  useEffect(() => {
    seen = preview;
  });
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

const free = (x: number, y: number): FoldPick => ({ kind: 'free', pane: 'folded', scene: { x, y }, sheet: [x, y] });
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

const point = (x: number, y: number): FoldPick => ({
  kind: 'point',
  provenance: 'vertex',
  sheet: [x, y],
  mark: null,
  scene: { x, y },
});

describe('the axiom’s roots', () => {
  it('are asked once per set of picks, and their choice counted once', async () => {
    let tools: FoldToolState = { ...FOLD_TOOL_INITIAL, lineMode: 'axiom-2', picks: [point(0, 0), point(1, 1)] };
    await render(tools);
    expect(engine.axiomCandidates).toHaveBeenCalledTimes(1);
    expect(tracked.offered).toHaveBeenCalledTimes(1);
    expect(tracked.offered).toHaveBeenCalledWith('axiom_root', 2);
    expect(seen?.candidates).toHaveLength(2);

    // Shift+→, a flap hovered and let go, Swap, the fold's kind: the same picks.
    for (const next of [{ root: 1 }, { hoveredFlap: 0 }, { hoveredFlap: null }, { swapped: true }, { tool: 'mountain' as const }]) {
      tools = { ...tools, ...next };
      await render(tools);
    }
    expect(engine.axiomCandidates).toHaveBeenCalledTimes(1);
    expect(tracked.offered).toHaveBeenCalledTimes(1);
    expect(seen?.candidates).toHaveLength(2);

    // Another pair of points is another line: asked, and offered, again.
    tools = { ...tools, picks: [point(1, 0), point(0, 1)] };
    await render(tools);
    expect(engine.axiomCandidates).toHaveBeenCalledTimes(2);
    expect(tracked.offered).toHaveBeenCalledTimes(2);
  });
});

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

  it('stay on show for a reverse fold’s tip the engine refused, so its flaps can be narrowed there', async () => {
    const reverse: FoldToolState = { ...FREE_LINE, tool: 'inside-reverse' };
    await render(reverse);
    expect(engine.compoundAnalysis).toHaveBeenCalledTimes(1);
    expect(seen?.refused?.refusal.code).toBe('reverse_no_opening');
    // Refused, the tip is still a step: analysed like any other, its layers shown.
    expect(analyse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'inside-reverse' }), undefined);
    answer('analysed');
    await render(reverse);
    expect(seen?.section).toBe(SECTION);
    expect(seen?.refused?.refusal.code).toBe('reverse_no_opening');
  });

  it('take a reverse fold along a fix’s line in place of the picks’, asked about and folded along it', async () => {
    const fixed = {
      kind: 'inside-reverse' as const,
      line: { via: 'free' as const, through: [[0.25, 0.5], [0.75, 0.5]] as [[number, number], [number, number]] },
      moving: [0.5, 0.75] as [number, number],
      seed: { scope: 'all' as const },
    };
    const reverse: FoldToolState = {
      ...FOLD_TOOL_INITIAL,
      tool: 'inside-reverse',
      lineMode: 'axiom-2',
      picks: [point(0, 0), point(0, 1)],
      override: { op: fixed },
    };
    await render(reverse);
    // Asked about along the fix's line, not the axiom's.
    expect(engine.compoundAnalysis).toHaveBeenLastCalledWith(
      PARENT,
      expect.objectContaining({ line: fixed.line }),
      undefined
    );
    // Folded along it, with no root: a free line has none.
    expect(seen?.step?.op).toMatchObject({ kind: 'inside-reverse', line: fixed.line });
    expect(seen?.step?.choices?.root).toBeUndefined();
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

describe('a vertex fold’s step', () => {
  const CANDIDATES: [number, number][] = [
    [1, 0],
    [-0.8824, -0.4706],
    [0.8824, -0.4706],
  ];
  /** The compound question of a swivel: three candidates, the first not landing, no orders. */
  const swivelAnswer = (op: { emergent: [number, number] }) => ({
    status: 'ok',
    family: 'vertex',
    analysis: {
      kind: 'swivel',
      center: [0.5, 0.3],
      given: [
        [0.86, 0.51],
        [-0.86, 0.51],
        [0, -1],
      ],
      candidates: CANDIDATES,
      // The engine names the candidate nearest the ray asked for.
      emergent: CANDIDATES.findIndex(([x, y]) => x === op.emergent[0] && y === op.emergent[1]) === 1 ? 1 : 0,
      layers: [0],
    },
    emergents: [false, true, true],
    orders: null,
    ridges: [],
  });
  const SWIVEL: FoldToolState = {
    ...FOLD_TOOL_INITIAL,
    tool: 'swivel',
    picks: [point(0.5, 0.3), point(1, 0.6), point(0, 0.6), point(0.5, 0), free(0.3, 0.9)],
  };

  const reverseTip = engine.compoundAnalysis.getMockImplementation();
  afterEach(() => {
    if (reverseTip) engine.compoundAnalysis.mockImplementation(reverseTip);
  });

  it('asks the compound question, again for the fourth ray that lands, and previews the step without a plain fold’s questions', async () => {
    engine.compoundAnalysis.mockImplementation((async (_at: unknown, op: { emergent: [number, number] }) =>
      swivelAnswer(op)) as never);
    await render(SWIVEL);
    for (let k = 0; k < 3; k += 1) await render(SWIVEL);
    // The placeholder ray first, then the first candidate that lands.
    expect(engine.compoundAnalysis).toHaveBeenCalledTimes(2);
    const asked = engine.compoundAnalysis.mock.calls.map((call) => (call as unknown as [unknown, { emergent: unknown }])[1].emergent);
    expect(asked).toEqual([[1, 0], CANDIDATES[1]]);
    expect(seen?.step?.op).toMatchObject({ kind: 'swivel', emergent: CANDIDATES[1], seed: { scope: 'all' } });
    expect(seen?.vertex).toMatchObject({ emergent: 1, layers: 1, ridges: [], orders: [] });
    // Previewed through the session; a vertex fold has no line to analyse or picture.
    expect(verbs.preview).toHaveBeenCalledWith(seen?.step?.op, undefined);
    expect(analyse).not.toHaveBeenCalled();
    expect(engine.action).not.toHaveBeenCalled();
    expect(tracked.offered).toHaveBeenCalledWith('emergent', 3);
    expect(seen?.refused).toBeNull();
  });

  it('says why before the engine is asked: a click that names no paper', async () => {
    const off: FoldToolState = { ...FOLD_TOOL_INITIAL, tool: 'squash', picks: [free(1.5, 0.5)] };
    await render(off);
    expect(engine.compoundAnalysis).not.toHaveBeenCalled();
    expect(seen?.step).toBeNull();
    expect(seen?.refused).toMatchObject({ refusal: { code: 'point_off_paper' } });
    expect(tracked.refused).toHaveBeenCalledWith('point_off_paper');
  });
});
