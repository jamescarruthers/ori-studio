import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tracked = vi.hoisted(() => ({ offered: vi.fn(), refused: vi.fn() }));
vi.mock('../../analytics', () => ({
  trackFoldChoiceOffered: tracked.offered,
  trackFoldRefused: tracked.refused,
}));

import i18n from '../../i18n';
import type { FoldAnalysis, FoldCrossSection, FoldFlap } from '../engine/foldEngineWire';
import { foldToolWindow } from '../tools/foldToolWindow';
import { foldTuckWindowView } from './foldCanvasModel';
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

/** The compound question, of a tip whose flaps cannot open: what the reverse fold's tests ask. */
const tipCannotOpen = async (): Promise<unknown> => ({
  status: 'refused',
  refusal: { code: 'reverse_no_opening', faces: [0], cause: 'no_spine' },
  fixes: [],
});

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
  compoundAnalysis: vi.fn(tipCannotOpen),
  // A crimp's and a tuck's own calls, which list the orders they leave.
  crimp: vi.fn(async (): Promise<unknown> => ({ status: 'ok', outcome: 'landed', state: 40, stored: {} })),
  tuck: vi.fn(async (): Promise<unknown> => ({ status: 'ok', outcome: 'landed', state: 41, stored: {} })),
  release: vi.fn(async () => 1),
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

describe('the crimp and the tuck', () => {
  afterEach(() => {
    engine.compoundAnalysis.mockImplementation(tipCannotOpen);
  });

  const ORDER = (k: number) => ({ faces: [[0.1 * k, 0.1] as [number, number]], orders: [[0, 1, 1] as [number, number, 1]] });
  const target = (face: number, feasible: boolean | null) => ({ face, at: [face / 10, 0.2] as [number, number], feasible });
  /** A tuck's listing; `turnedOver`, as the engine answers a valley tuck on a view turned over: in the model frame. */
  const tuckListing =
    (targets: ReturnType<typeof target>[], turnedOver = false) =>
    async (): Promise<unknown> => ({
      status: 'ok',
      family: 'tuck',
      analysis: {
        line: { n: [0, 1], d: 0.5 },
        side: 'positive',
        snap: { clusters: 0, angle: 0, max_shift: 0 },
        direction: turnedOver ? 'mountain' : 'valley',
        placement: turnedOver ? 'over' : 'under',
        moving: [0],
        targets,
      },
    });
  const TUCK: FoldToolState = { ...FREE_LINE, tool: 'tuck' };

  it('builds a crimp once its tip, its kinds and its orders are in, the first order taken and the choice counted', async () => {
    engine.compoundAnalysis.mockImplementation(async () => ({
      status: 'ok',
      family: 'crimp',
      analysis: {
        tip: { line: { n: [0, 1], d: 0.5 }, side: 'positive', snap: {}, tip: [0, 1], flaps: [{ index: 0, flap: FLAPS[0], openings: [], truncated: false }] },
        second: { n: [0, 1], d: 0.8 },
        second_side: 'positive',
        second_snap: {},
        beyond: [0, 1],
      },
      kinds: ['inside', 'outside'],
    }));
    engine.crimp.mockImplementationOnce(async () => ({
      status: 'ok',
      outcome: 'choose_order',
      orders: 2,
      exact: true,
      candidates: [
        { state: 50, stored: { completion: ORDER(1) } },
        { state: 51, stored: { completion: ORDER(2) } },
      ],
    }));
    const crimp: FoldToolState = { ...FREE_LINE, tool: 'crimp', picks: [...FREE_LINE.picks, free(0, 0.8), free(1, 0.8)] };
    await render(crimp);
    // Its orders asked of its own call with the kind taken, every state that call landed let go.
    expect(engine.crimp).toHaveBeenCalledWith(PARENT, expect.objectContaining({ kind: 'crimp', crimp: 'inside' }), undefined);
    expect(engine.release).toHaveBeenCalledWith([50, 51]);
    expect(seen?.crimp).toMatchObject({ kind: 'inside', kinds: ['inside', 'outside'], orders: [ORDER(1), ORDER(2)] });
    expect(seen?.step?.op).toMatchObject({ kind: 'crimp', crimp: 'inside', second: { via: 'free' } });
    expect(seen?.step?.choices).toEqual({ completion: ORDER(1) });
    expect(tracked.offered).toHaveBeenCalledWith('order', 2);
    // Both lines across the paper, for the folded pane.
    expect(seen?.crimp?.lines.second).not.toBeNull();

    // The outside kind chosen: its orders asked again, and the step folds it.
    const outside = { ...crimp, compound: { ...crimp.compound, reverseKind: 'outside' as const } };
    await render(outside);
    expect(engine.crimp).toHaveBeenLastCalledWith(PARENT, expect.objectContaining({ crimp: 'outside' }), undefined);
    expect(seen?.step?.op).toMatchObject({ crimp: 'outside' });
    expect(seen?.step?.choices).toBeUndefined();
  });

  it('builds a tuck against the first layer listed as taking it, and steps to another by its face', async () => {
    engine.compoundAnalysis.mockImplementation(tuckListing([target(2, false), target(3, true), target(4, null)]));
    await render(TUCK);
    expect(engine.compoundAnalysis).toHaveBeenCalledWith(PARENT, expect.objectContaining({ kind: 'tuck' }), undefined);
    // Only the layers that take it, never the one that does not.
    expect(seen?.tuck?.targets.map((each) => each.face)).toEqual([3, 4]);
    expect(tracked.offered).toHaveBeenCalledWith('tuck_target', 2);
    expect(engine.tuck).toHaveBeenCalledWith(PARENT, expect.objectContaining({ target: [0.3, 0.2] }), undefined);
    expect(engine.release).toHaveBeenCalledWith([41]);
    expect(seen?.step?.op).toMatchObject({ kind: 'tuck', direction: 'valley', target: [0.3, 0.2] });
    expect(seen?.refused).toBeNull();

    await render({ ...TUCK, compound: { ...TUCK.compound, tuckTarget: 4 } });
    expect(seen?.tuck?.target?.face).toBe(4);
    expect(seen?.step?.op).toMatchObject({ target: [0.4, 0.2] });
  });

  it('refuses a tuck no layer takes, with no step, its layers asked of the plain fold along its line', async () => {
    engine.compoundAnalysis.mockImplementation(tuckListing([target(2, false)]));
    await render(TUCK);
    expect(seen?.step).toBeNull();
    expect(seen?.refused?.refusal).toEqual({ code: 'tuck_infeasible', target: null, placement: 'under', faces: [] });
    // No flap is offered before the layers are in.
    expect(seen?.refused?.fixes).toEqual([]);
    expect(engine.tuck).not.toHaveBeenCalled();
    expect(verbs.preview).not.toHaveBeenCalled();
    // The picker's layers: the plain valley fold along the same line, side and seed, asked for its analysis alone.
    expect(analyse).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'valley', line: expect.anything() }), undefined);
    answer('analysed');
    await render(TUCK);
    expect(seen?.section).toBe(SECTION);
    expect(seen?.analysis).not.toBeNull();
    expect(seen?.refused?.refusal.code).toBe('tuck_infeasible');
    // Its layers in, the plain fold's two flaps are offered one at a time, as the engine offers them when nothing stays.
    expect(seen?.refused?.fixes).toEqual([{ fix: 'pick_flap', flaps: FLAPS }]);
  });

  it('words a valley tuck on a view turned over as going under, though the engine places it over in its frame', async () => {
    const window = () =>
      foldToolWindow(
        i18n.t.bind(i18n),
        {
          tool: 'tuck',
          lineMode: 'free',
          readOnly: null,
          picks: 2,
          preview: { section: null, interval: null, seed: 'all', added: [], refused: seen?.refused ?? null, landing: false },
          tuck: foldTuckWindowView(TUCK, seen!),
        },
        {
          selectTool: vi.fn(),
          selectLineMode: vi.fn(),
          includeFlaps: vi.fn(),
          foldOtherWay: vi.fn(),
          pickFlap: vi.fn(),
          useLine: vi.fn(),
          swapSide: vi.fn(),
          toggleFlap: vi.fn(),
          cancel: vi.fn(),
          commit: vi.fn(),
          stepTuckTarget: vi.fn(),
        },
        { coarse: false, alt: 'Alt' }
      );
    engine.compoundAnalysis.mockImplementation(tuckListing([target(3, true), target(4, true)], true));
    await render(TUCK);
    expect(window()?.tuck?.target?.label).toBe('Tuck under');
    expect(window()?.tuck?.note).toBe('2 layers here take the tuck under them: the folded paper lights each.');

    // None takes it: refused here, under as the viewer sees it.
    engine.compoundAnalysis.mockImplementation(tuckListing([target(3, false)], true));
    await render({ ...TUCK, picks: [free(0, 0.4), free(1, 0.4)] });
    expect(seen?.refused?.refusal.code).toBe('tuck_infeasible');
    expect(window()?.refusal?.text).toBe(
      'No layer that stays can take the flap under it here. Fold it the other way, swap the moving side, or locate another line.'
    );
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
  });
  const SWIVEL: FoldToolState = {
    ...FOLD_TOOL_INITIAL,
    tool: 'swivel',
    picks: [point(0.5, 0.3), point(1, 0.6), point(0, 0.6), point(0.5, 0), free(0.3, 0.9)],
  };

  const reverseTip = engine.compoundAnalysis.getMockImplementation();
  const unpictured = engine.action.getMockImplementation();
  afterEach(() => {
    if (reverseTip) engine.compoundAnalysis.mockImplementation(reverseTip);
    if (unpictured) engine.action.mockImplementation(unpictured);
  });

  it('asks the compound question, again for the fourth ray that lands, and previews the step with its picture but no line to analyse', async () => {
    engine.compoundAnalysis.mockImplementation((async (_at: unknown, op: { emergent: [number, number] }) =>
      swivelAnswer(op)) as never);
    const PICTURE = {
      kind: 'fold',
      direction: 'valley',
      line: [
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 1 },
      ],
      spans: [],
      moving: [0],
      grip: null,
    };
    engine.action.mockImplementation((async () => ({ status: 'ok', action: PICTURE })) as never);
    await render(SWIVEL);
    for (let k = 0; k < 3; k += 1) await render(SWIVEL);
    // The placeholder ray first, then the first candidate that lands.
    expect(engine.compoundAnalysis).toHaveBeenCalledTimes(2);
    const asked = engine.compoundAnalysis.mock.calls.map((call) => (call as unknown as [unknown, { emergent: unknown }])[1].emergent);
    expect(asked).toEqual([[1, 0], CANDIDATES[1]]);
    expect(seen?.step?.op).toMatchObject({ kind: 'swivel', emergent: CANDIDATES[1], seed: { scope: 'all' } });
    // Only the two that land are offered.
    expect(seen?.vertex).toMatchObject({ emergent: 1, fourths: [1, 2], layers: 1, orders: [] });
    // Previewed through the session and pictured; a vertex fold has no line to analyse.
    expect(verbs.preview).toHaveBeenCalledWith(seen?.step?.op, undefined);
    expect(analyse).not.toHaveBeenCalled();
    expect(engine.action).toHaveBeenLastCalledWith(PARENT, seen?.step?.op, undefined);
    expect(seen?.action).toEqual(PICTURE);
    expect(tracked.offered).toHaveBeenCalledWith('emergent', 2);
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

  it('counts a refusal with no step each time it is shown anew, and once while it stays', async () => {
    const squash: FoldToolState = { ...FOLD_TOOL_INITIAL, tool: 'squash', picks: [free(1.5, 0.5)] };
    await render(squash);
    await render({ ...squash, hoveredFlap: 1 });
    expect(tracked.refused).toHaveBeenCalledTimes(1);
    // Escape lets it go; the same click shows it again, and another click off the paper is another refusal.
    await render({ ...squash, picks: [] });
    await render(squash);
    expect(tracked.refused).toHaveBeenCalledTimes(2);
    await render({ ...squash, picks: [free(1.6, 0.5)] });
    expect(tracked.refused).toHaveBeenCalledTimes(3);
    expect(tracked.refused.mock.calls.every(([code]) => code === 'point_off_paper')).toBe(true);
  });
});
