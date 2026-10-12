import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoldOp } from '../document/foldSequenceDocument';
import type { FoldSessionSurface } from '../session/useFoldSession';
import {
  createFoldTools,
  FOLD_COMPOUND_CHOICES_INITIAL,
  FOLD_TOOL_INITIAL,
  type FoldTools,
} from '../tools/foldToolState';
import { buildReverseStep } from '../tools/reverse/reverseStep';
import { flatSquareLandmarks, flatSquareScene } from './foldCanvas.fixtures';
import { foldAlongLine } from './foldAlongLine';
import { foldPickIndex } from './foldPicking';
import {
  compoundListed,
  foldCanvasChoice,
  queuedCommit,
  useFoldCanvasVerbs,
  type FoldCanvasVerbBinding,
} from './useFoldCanvasVerbs';
import type { FoldStateView } from './useFoldStateView';
import type { FoldToolPreview } from './useFoldToolPreview';
import type { FoldVertexAnalysed } from '../engine/foldEngineSquashWire';
import type { FoldVertexPreview } from './vertex/useFoldVertexStep';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOOK: FoldOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0.5, 0], [0.5, 1]] },
  moving: [0.75, 0.5],
  seed: { scope: 'all' },
};

function preview(extra: Partial<FoldToolPreview> = {}): FoldToolPreview {
  return {
    candidates: null,
    build: { status: 'unlocated' },
    step: { op: BOOK, key: 'book' },
    analysis: null,
    section: null,
    action: null,
    landed: null,
    refused: null,
    landing: false,
    reverse: null,
    crimp: null,
    tuck: null,
    vertex: null,
    sink: null,
    extent: null,
    ...extra,
  };
}

function session(commitStep: FoldSessionSurface['commitStep']): FoldSessionSurface {
  return {
    cursor: { status: 'ok', path: null, state: null, fingerprint: null, summary: null, report: null, refusal: null },
    cursorId: null,
    readOnly: false,
    pending: { status: 'idle' },
    analysis: { status: 'idle' },
    error: null,
    analyse: vi.fn(),
    preview: vi.fn(),
    commitStep,
    cancel: vi.fn(),
    withState: vi.fn(),
    withNode: vi.fn(),
    withCursor: vi.fn(),
    query: vi.fn(),
    retry: vi.fn(),
  } as unknown as FoldSessionSurface;
}

let host: HTMLDivElement;
let root: Root;
let bound: FoldCanvasVerbBinding | null;

function Harness(props: { session: FoldSessionSurface; tools: FoldTools; preview: FoldToolPreview; view?: FoldStateView }) {
  const binding = useFoldCanvasVerbs(props.session, props.tools, props.view ?? ({} as FoldStateView), props.preview);
  useEffect(() => {
    bound = binding;
  });
  return null;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  bound = null;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the Fold canvas’s commit', () => {
  it('queues Enter pressed while the preview lands, says so, and commits once it has landed', async () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const surface = session(commitStep);
    const tools = createFoldTools();
    const render = (shown: FoldToolPreview) => act(() => root.render(<Harness session={surface} tools={tools} preview={shown} />));
    render(preview({ landing: true }));
    // Claimed, never silently dropped: the commit waits.
    let claimed = false;
    act(() => {
      claimed = bound!.verbs.commit();
    });
    expect(claimed).toBe(true);
    expect(bound!.queued).toBe(true);
    expect(commitStep).not.toHaveBeenCalled();
    render(preview({ landing: false }));
    expect(commitStep).toHaveBeenCalledWith(BOOK, undefined);
    expect(bound!.queued).toBe(false);
  });

  it('lets a queued commit go when the preview is refused, or the tools are asked for another fold', () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const surface = session(commitStep);
    const tools = createFoldTools();
    const render = (shown: FoldToolPreview) => act(() => root.render(<Harness session={surface} tools={tools} preview={shown} />));
    render(preview({ landing: true }));
    act(() => void bound!.verbs.commit());
    render(preview({ landing: false, refused: { status: 'refused', refusal: { code: 'layer_order' }, fixes: [], faces: [], vertices: [] } }));
    expect(bound!.queued).toBe(false);
    render(preview({ landing: true }));
    act(() => void bound!.verbs.commit());
    act(() => tools.selectTool('mountain'));
    render(preview({ landing: false, step: { op: BOOK, key: 'another' } }));
    expect(commitStep).not.toHaveBeenCalled();
  });

  it('steps a tuck’s listed layers, takes a fix’s layer, and folds it the other way', () => {
    const surface = session(vi.fn());
    const tools = createFoldTools();
    const target = (face: number) => ({ face, at: [0.1, 0.1] as [number, number], feasible: true });
    const tuck = {
      asked: null,
      direction: 'valley' as const,
      targets: [target(3), target(7)],
      target: target(3),
      orders: [],
      order: null,
    };
    act(() => root.render(<Harness session={surface} tools={tools} preview={preview({ tuck })} />));
    act(() => tools.selectTool('tuck'));
    act(() => bound!.verbs.stepTuckTarget(1));
    expect(tools.store.getState().compound.tuckTarget).toBe(7);
    // The canvas's chooser and Shift+arrows step the same list.
    act(() => void bound!.verbs.stepChoice(1));
    expect(tools.store.getState().compound.tuckTarget).toBe(7);
    act(() => bound!.verbs.tuckTarget(3));
    expect(tools.store.getState().compound.tuckTarget).toBe(3);
    act(() => bound!.verbs.foldOtherWay());
    expect(tools.store.getState().tuckDirection).toBe('mountain');
    act(() => bound!.verbs.setSecondLineMode('crease'));
    expect(tools.store.getState().secondLineMode).toBe('crease');
  });

  it('decides a queued commit from the tools’ input it was asked for', () => {
    const shown = preview({ landing: true });
    const refused = { status: 'refused' as const, refusal: { code: 'layer_order' as const }, fixes: [], faces: [], vertices: [] };
    expect(queuedCommit(null, shown, false, 'in')).toBe('idle');
    expect(queuedCommit('in', shown, false, 'in')).toBe('wait');
    expect(queuedCommit('in', { ...shown, landing: false }, false, 'in')).toBe('commit');
    expect(queuedCommit('in', { ...shown, landing: false }, true, 'in')).toBe('drop');
    expect(queuedCommit('in', shown, false, 'another')).toBe('drop');
    expect(queuedCommit('in', { ...shown, refused }, false, 'in')).toBe('drop');
    // Its step still being built: it waits for it.
    expect(queuedCommit('in', { ...shown, step: null, landing: false }, false, 'in')).toBe('wait');
  });

  /** The reverse tool with a free line located (after mount, which starts the tools over). */
  function locatedReverse(surface: FoldSessionSurface) {
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'inside-reverse', lineMode: 'free' });
    const render = (shown: FoldToolPreview) => act(() => root.render(<Harness session={surface} tools={tools} preview={shown} />));
    // The tip still being asked about: no step yet.
    render(preview({ step: null, landing: false }));
    const free = (x: number, y: number) => ({ kind: 'free' as const, pane: 'folded' as const, scene: { x, y }, sheet: [x, y] as [number, number] });
    act(() => {
      tools.pick(free(0.5, 0));
      tools.pick(free(0.5, 1));
    });
    render(preview({ step: null, landing: false }));
    return { tools, render };
  }

  it('queues Enter pressed before a located fold’s step is built, and commits it once it is in and landed', () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const surface = session(commitStep);
    const { render } = locatedReverse(surface);
    let claimed = false;
    act(() => {
      claimed = bound!.verbs.commit();
    });
    expect(claimed).toBe(true);
    expect(bound!.queued).toBe(true);
    render(preview({ landing: true }));
    expect(commitStep).not.toHaveBeenCalled();
    render(preview({ landing: false }));
    expect(commitStep).toHaveBeenCalledWith(BOOK, undefined);
    expect(bound!.queued).toBe(false);
  });

  it('lets a commit queued before its step go when the tools are asked for another fold', () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const surface = session(commitStep);
    const { tools, render } = locatedReverse(surface);
    act(() => void bound!.verbs.commit());
    expect(bound!.queued).toBe(true);
    act(() => void tools.swapSide());
    render(preview({ landing: false }));
    expect(commitStep).not.toHaveBeenCalled();
    expect(bound!.queued).toBe(false);
  });

  it('does not claim Enter while nothing is located', () => {
    const surface = session(vi.fn());
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'inside-reverse', lineMode: 'free' });
    act(() => root.render(<Harness session={surface} tools={tools} preview={preview({ step: null })} />));
    let claimed = true;
    act(() => {
      claimed = bound!.verbs.commit();
    });
    expect(claimed).toBe(false);
    expect(bound!.queued).toBe(false);
  });
});

describe('an include fix', () => {
  const flap = (face: number) => ({ faces: [face], witness: [0.1 * face, 0.5] as [number, number] });
  const FLAPS = [flap(0), flap(1), flap(2)];
  /** A reverse fold's tip, refused as not free: its analysis names the flaps the seed picked. */
  const analysed = (picked: number[]): Partial<FoldToolPreview> => ({
    analysis: { flaps: FLAPS, picked, added: [] } as unknown as FoldToolPreview['analysis'],
    section: { flaps: FLAPS } as unknown as FoldToolPreview['section'],
  });

  it('adds the flaps in the way to a stack picked by depth, keeping the flaps that stack grew into', () => {
    const tools = createFoldTools();
    act(() => root.render(<Harness session={session(vi.fn())} tools={tools} preview={preview(analysed([0]))} />));
    act(() => tools.setSeed({ scope: 'depth', at: [0.1, 0.5], scene: { x: 0.1, y: 0.5 }, choice: 2 }));
    act(() => bound!.verbs.includeFlaps([2]));
    expect(tools.store.getState().seed).toEqual({ scope: 'flaps', flaps: [FLAPS[0], FLAPS[2]] });
  });

  it('adds them to the flaps picked once each, and to every flap is every layer', () => {
    const tools = createFoldTools();
    act(() => root.render(<Harness session={session(vi.fn())} tools={tools} preview={preview(analysed([0]))} />));
    act(() => tools.setSeed({ scope: 'flaps', flaps: [FLAPS[0]!] }));
    act(() => bound!.verbs.includeFlaps([0, 1]));
    expect(tools.store.getState().seed).toEqual({ scope: 'flaps', flaps: [FLAPS[0], FLAPS[1]] });
    act(() => bound!.verbs.includeFlaps([2]));
    expect(tools.store.getState().seed).toEqual({ scope: 'all' });
  });
});

describe('a near miss’s fix', () => {
  it('puts the landmark line in place of a reverse fold’s line, as of a plain fold’s', () => {
    const surface = session(vi.fn());
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'inside-reverse' });
    const view = { index: foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []) } as unknown as FoldStateView;
    const reverse: FoldOp = {
      kind: 'inside-reverse',
      line: { via: 'free', through: [[0.501, 0], [0.499, 1]] },
      moving: [0.75, 0.5],
      seed: { scope: 'all' },
    };
    act(() => root.render(<Harness session={surface} tools={tools} preview={preview({ step: { op: reverse, key: 'near' } })} view={view} />));
    act(() => bound!.verbs.useLine({ fix: 'use_line', line: { n: [1, 0], d: 0.5 }, side: 'positive' }));
    const override = tools.store.getState().override?.op;
    expect(override).toMatchObject({ kind: 'inside-reverse', line: { via: 'free' }, seed: { scope: 'all' } });
    if (override?.kind !== 'inside-reverse' || override.line.via !== 'free') throw new Error('no landmark line');
    // On x = ½ exactly, the side x > ½ moving.
    for (const [x] of override.line.through) expect(x).toBeCloseTo(0.5, 9);
    expect(override.moving?.[0]).toBeGreaterThan(0.5);
  });

  it('locates the landmark line as a free line when an axiom’s roots were refused, and there is no step to put it in', () => {
    const surface = session(vi.fn());
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'inside-reverse', lineMode: 'axiom-1' });
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const view = { index } as unknown as FoldStateView;
    act(() => root.render(<Harness session={surface} tools={tools} preview={preview({ step: null })} view={view} />));
    act(() => bound!.verbs.useLine({ fix: 'use_line', line: { n: [1, 0], d: 0.5 }, side: 'positive' }));
    const state = tools.store.getState();
    expect(state.tool).toBe('inside-reverse');
    expect(state.lineMode).toBe('free');
    expect(state.picks).toHaveLength(2);
    for (const pick of state.picks) {
      if (pick.kind !== 'free') throw new Error('not a free pick');
      expect(pick.scene.x).toBeCloseTo(0.5, 9);
    }
    // The fix's side moves: x > ½, which an even split does not take unswapped.
    const built = buildReverseStep({ ...state, candidate: null, kind: 'inside', openings: [], completion: null }, index);
    if (built.status !== 'built' || built.op.kind !== 'inside-reverse') throw new Error('not built');
    expect(built.op.moving?.[0]).toBeGreaterThan(0.5);
  });
});

describe('the canvas’s chooser', () => {
  it('shows the deepest choice with more than one answer: the order, the opening, then the root', () => {
    const tools = { ...FOLD_TOOL_INITIAL, root: 1, compound: { ...FOLD_COMPOUND_CHOICES_INITIAL, opening: 5, order: 1 } };
    const reverse = { asked: null, kind: 'inside' as const, kinds: [], ways: [], way: null, orders: [], order: null };
    const roots = [
      { root: 0, line: { n: [1, 0] as const, d: 0.5 }, side: null },
      { root: 1, line: { n: [0, 1] as const, d: 0.5 }, side: null },
    ];
    expect(foldCanvasChoice(preview(), tools)).toBeNull();
    expect(foldCanvasChoice(preview({ candidates: roots }), tools)).toEqual({ kind: 'root', index: 1, count: 2 });
    const way = { openings: [], stored: [] };
    const opening = { ...reverse, ways: [way, way, way] };
    expect(foldCanvasChoice(preview({ candidates: roots, reverse: opening }), tools)).toEqual({
      kind: 'opening',
      index: 2,
      count: 3,
    });
    const order = { faces: [], orders: [] };
    expect(foldCanvasChoice(preview({ candidates: roots, reverse: { ...opening, orders: [order, order] } }), tools)).toEqual({
      kind: 'order',
      index: 1,
      count: 2,
    });
  });

  it('steps a crimp’s opening and order as a reverse fold’s, and a tuck’s layer before its order', () => {
    const tools = { ...FOLD_TOOL_INITIAL, compound: { ...FOLD_COMPOUND_CHOICES_INITIAL, opening: 1, order: 0, tuckTarget: 7 } };
    const way = { openings: [], stored: [] };
    const lines = { first: null, second: null };
    const crimp = { asked: null, kind: 'inside' as const, kinds: [], ways: [way, way], way, orders: [], order: null, lines };
    expect(foldCanvasChoice(preview({ crimp }), tools)).toEqual({ kind: 'opening', index: 1, count: 2 });
    expect(compoundListed(preview({ crimp }))).toEqual({ ways: 2, orders: 0, targets: 0 });

    const target = (face: number) => ({ face, at: [0.1, 0.1] as [number, number], feasible: true });
    const tuck = {
      asked: null,
      direction: 'valley' as const,
      targets: [target(3), target(7), target(9)],
      target: target(7),
      orders: [],
      order: null,
    };
    expect(foldCanvasChoice(preview({ tuck }), tools)).toEqual({ kind: 'target', index: 1, count: 3 });
    const order = { faces: [], orders: [] };
    expect(foldCanvasChoice(preview({ tuck: { ...tuck, orders: [order, order] } }), tools)).toEqual({
      kind: 'order',
      index: 0,
      count: 2,
    });
    // One layer offered is no choice.
    expect(foldCanvasChoice(preview({ tuck: { ...tuck, targets: [target(7)] } }), tools)).toBeNull();
  });

  it('shows a closed sink’s pockets, then its orders, over the root', () => {
    const tools = { ...FOLD_TOOL_INITIAL, compound: { ...FOLD_COMPOUND_CHOICES_INITIAL, opening: 0, order: 4, pocket: 1 } };
    const pocket = { upper: [], lower: [], seams: [], stored: { above: [0, 0] as [number, number], below: [0, 0] as [number, number] } };
    const sink = { tool: 'closed-sink' as const, point: null, pockets: [pocket, pocket], pocket: 1, sunk: null, orders: 0, order: 0 };
    expect(foldCanvasChoice(preview({ sink }), tools)).toEqual({ kind: 'pocket', index: 1, count: 2 });
    expect(foldCanvasChoice(preview({ sink: { ...sink, orders: 3 } }), tools)).toEqual({ kind: 'order', index: 2, count: 3 });
  });
});

describe('a vertex fold’s choices on the canvas', () => {
  const fan: FoldVertexAnalysed = {
    analysis: {
      kind: 'rabbit-ear',
      center: [0.3, 0.3],
      given: [
        [-1, -1],
        [1, 0],
        [0, 1],
      ],
      candidates: [
        [1, 1],
        [-1, 0],
        [0, -1],
      ],
      emergent: 0,
      layers: [1, 2],
    },
    emergents: [true, true, false],
    orders: null,
  };
  const vertex = (extra: Partial<FoldVertexPreview> = {}): FoldVertexPreview => ({
    base: fan,
    answer: fan,
    emergent: 1,
    // The third candidate does not land: never offered.
    fourths: [0, 1],
    elsewhere: null,
    direction: 'valley',
    orders: [],
    order: null,
    layers: 2,
    nearPrecrease: null,
    ...extra,
  });

  it('steps the order, then a fan’s fourth ray among those that land: the deepest with more than one', () => {
    const tools = FOLD_TOOL_INITIAL;
    expect(foldCanvasChoice(preview({ vertex: vertex() }), tools)).toEqual({ kind: 'emergent', index: 1, count: 2 });
    // One lands: nothing to step through on the canvas.
    expect(foldCanvasChoice(preview({ vertex: vertex({ fourths: [1] }) }), tools)).toBeNull();
    const order = { faces: [], orders: [] };
    const other = { faces: [], orders: [] };
    expect(foldCanvasChoice(preview({ vertex: vertex({ orders: [order, other], order: other }) }), tools)).toEqual({
      kind: 'order',
      index: 1,
      count: 2,
    });
  });

  it('steps a rabbit ear’s fourth ray, its only choice, through the ones that land: the fourth crease is its ridge', () => {
    const tools = createFoldTools();
    const shown = preview({ vertex: vertex() });
    act(() => root.render(<Harness session={session(vi.fn())} tools={tools} preview={shown} />));
    act(() => tools.selectTool('rabbit-ear'));
    // From the second of the two that land, round to the first: never the third, which does not.
    act(() => void bound!.verbs.stepChoice(1));
    expect(tools.store.getState().compound.emergent).toBe(0);
    act(() => void bound!.verbs.stepChoice(-1));
    expect(tools.store.getState().compound.emergent).toBe(0);
    expect(Object.keys(tools.store.getState().compound)).not.toContain('ridge');
  });

  it('commits nothing, and waits for nothing, while none of a fan’s fourth creases lands', () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const tools = createFoldTools();
    const stuck = { ...fan, emergents: [false, false, false] };
    const shown = preview({ step: null, vertex: vertex({ base: stuck, answer: stuck, emergent: null, fourths: [] }) });
    act(() => root.render(<Harness session={session(commitStep)} tools={tools} preview={shown} />));
    act(() => tools.selectTool('rabbit-ear'));
    let claimed = true;
    act(() => {
      claimed = bound!.verbs.commit();
    });
    expect(claimed).toBe(false);
    expect(bound!.queued).toBe(false);
    expect(commitStep).not.toHaveBeenCalled();
    // A commit queued before the answer came is let go once it says none lands.
    expect(queuedCommit('input', shown, false, 'input')).toBe('drop');
  });

  it('picks a fan’s paper that stays on the paper only, and again while previewed in another region, on either pane', () => {
    const tools = createFoldTools();
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const view = { index } as unknown as FoldStateView;
    act(() => root.render(<Harness session={session(vi.fn())} tools={tools} preview={preview({ step: null })} view={view} />));
    act(() => tools.selectTool('rabbit-ear'));
    const corner = (x: number, y: number) =>
      ({ kind: 'point', provenance: 'vertex', sheet: [x, y], mark: null, scene: { x, y } }) as const;
    for (const [x, y] of [
      [0, 1],
      [1, 1],
      [1, 0],
    ] as const) {
      act(() => void tools.pick(corner(x, y)));
    }
    const radii = { point: 0.02, line: 0.02 };
    // Off the paper, nothing a click would take; on it, the paper under the pointer.
    expect(bound!.verbs.hitTest('folded', { x: 1.3, y: 0.5 }, radii)?.pick).toBeNull();
    const below = bound!.verbs.hitTest('folded', { x: 0.3, y: 0.3 }, radii);
    expect(below?.pick).toMatchObject({ kind: 'free', sheet: [0.3, 0.3] });
    act(() => bound!.verbs.pick(below));
    expect(tools.store.getState().picks).toHaveLength(4);
    // Previewed: a click in the same region changes nothing, the choices made kept.
    act(() => tools.setEmergent(1));
    act(() => bound!.verbs.pick(bound!.verbs.hitTest('folded', { x: 0.2, y: 0.25 }, radii)));
    expect(tools.store.getState().picks[3]).toMatchObject({ scene: { x: 0.3, y: 0.3 } });
    expect(tools.store.getState().compound.emergent).toBe(1);
    // In another region — here on the crease pattern — it is the paper that stays now, its fourth creases listed anew.
    act(() => bound!.verbs.pick(bound!.verbs.hitTest('crease-pattern', { x: 0.75, y: 0.95 }, radii)));
    expect(tools.store.getState().picks).toHaveLength(4);
    expect(tools.store.getState().picks[3]).toMatchObject({ pane: 'crease-pattern', sheet: [0.75, 0.95] });
    expect(tools.store.getState().compound.emergent).toBeNull();
  });

  it('binds the chooser, the fixes and a click on the folded paper to the vertex tools', () => {
    const surface = session(vi.fn());
    const tools = createFoldTools();
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const squash: FoldVertexAnalysed = {
      analysis: {
        kind: 'squash',
        vertex: [0.5, 0.5],
        hinge: { n: [0.7071, -0.7071], d: 0 },
        spine: { n: [0.7071, 0.7071], d: 0.7071 },
        hinge_direction: [-0.7071, -0.7071],
        spine_direction: [-0.7071, 0.7071],
        upper: [1],
        lower: [2],
        upper_crease: { n: [0, 1], d: 0.5 },
        lower_crease: { n: [0, 1], d: 0.5 },
        wedge: -Math.PI / 2,
        share: 0,
      },
      emergents: [],
      orders: null,
    };
    const render = (shown: FoldToolPreview) =>
      act(() =>
        root.render(<Harness session={surface} tools={tools} preview={shown} view={{ index } as unknown as FoldStateView} />)
      );
    // A squash located: a click on the folded paper aims its spine from its vertex.
    render(preview({ vertex: vertex({ base: squash, answer: squash, emergent: null, layers: 0 }) }));
    act(() => tools.selectTool('squash'));
    act(() => void tools.pick({ kind: 'free', pane: 'folded', scene: { x: 0.2, y: 0.4 }, sheet: [0.2, 0.4] }));
    act(() => bound!.verbs.pick({ pane: 'folded', at: { x: 0.5, y: 1 }, pick: null }));
    expect(tools.store.getState().compound.squashTarget).toEqual([0, 1]);
    act(() => bound!.verbs.resetSquashTarget());
    expect(tools.store.getState().compound.squashTarget).toBeNull();
    // The other way: the direction turned, for a vertex fold as for a plain one.
    act(() => bound!.verbs.foldOtherWay());
    expect(tools.store.getState().vertexDirection).toBe('mountain');
    act(() => bound!.verbs.vertexOtherWay());
    expect(tools.store.getState().vertexDirection).toBe('valley');

    // A fan: its fourth ray stepped and taken by a fix's direction, its layers.
    render(preview({ vertex: vertex() }));
    act(() => bound!.verbs.stepEmergent(1));
    expect(tools.store.getState().compound.emergent).toBe(0);
    act(() => bound!.verbs.takeEmergent([-1, 0.1]));
    expect(tools.store.getState().compound.emergent).toBe(1);
    act(() => bound!.verbs.stepFanLayers(-1));
    expect(tools.store.getState().compound.fanLayers).toBe(1);
    act(() => bound!.verbs.stepFanLayers(-1));
    expect(tools.store.getState().compound.fanLayers).toBeNull();

    // A petal fold's H refused: the Precrease tool, on the same line, or on the edge-to-edge axiom.
    act(() => tools.selectTool('petal'));
    act(() => tools.selectLineMode('free'));
    for (const x of [0.2, 0.8]) act(() => void tools.pick({ kind: 'free', pane: 'folded', scene: { x, y: 0.5 }, sheet: [x, 0.5] }));
    act(() => bound!.verbs.precreaseLine());
    expect(tools.store.getState()).toMatchObject({ tool: 'precrease', lineMode: 'free' });
    expect(tools.store.getState().picks).toHaveLength(2);
    act(() => bound!.verbs.precreaseKite());
    expect(tools.store.getState()).toMatchObject({ tool: 'precrease', lineMode: 'axiom-3', picks: [] });
  });

  it('clicks a pinch along the located line, holds the commit until it is in, and steps back on Escape', () => {
    const commitStep = vi.fn<FoldSessionSurface['commitStep']>(() => Promise.resolve({ status: 'stale' as const }));
    const surface = session(commitStep);
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const view = { index } as FoldStateView;
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'precrease', lineMode: 'free', extent: 'pinch' });
    const across = { n: [0, 1] as [number, number], d: 0.5 };
    const along = { folded: foldAlongLine(index, across, 'folded'), creasePattern: foldAlongLine(index, across, 'crease-pattern') };
    const render = (shown: FoldToolPreview) =>
      act(() => root.render(<Harness session={surface} tools={tools} preview={shown} view={view} />));
    render(preview({ step: null }));
    for (const x of [0, 1]) act(() => void tools.pick({ kind: 'free', pane: 'folded', scene: { x, y: 0.5 }, sheet: [x, 0.5] }));
    render(preview({ step: null, extent: { state: { status: 'incomplete', mode: 'pinch', picked: 0, needed: 1 }, along } }));
    // Nothing to commit while the pinch is still to click, and nothing queued.
    let claimed = true;
    act(() => {
      claimed = bound!.verbs.commit();
    });
    expect(claimed).toBe(false);
    expect(bound!.queued).toBe(false);
    // Beside the line, a click picks nothing — no layer, no point.
    const radii = { point: 0.03, line: 0.03 };
    act(() => bound!.verbs.pick(bound!.verbs.hitTest('folded', { x: 0.3, y: 0.8 }, radii)));
    expect(tools.store.getState()).toMatchObject({ extentPicks: [], seed: { scope: 'all' } });
    // On it, the line's middle.
    const hit = bound!.verbs.hitTest('folded', { x: 0.51, y: 0.49 }, radii);
    expect(hit?.pick).toMatchObject({ kind: 'point', provenance: 'midpoint', sheet: [0.5, 0.5] });
    act(() => bound!.verbs.pick(hit));
    expect(tools.store.getState().extentPicks).toHaveLength(1);
    // Escape takes back the point first, then the line.
    act(() => void bound!.verbs.cancel());
    expect(tools.store.getState()).toMatchObject({ extentPicks: [], extent: 'pinch' });
    expect(tools.store.getState().picks).toHaveLength(2);
    act(() => void bound!.verbs.cancel());
    expect(tools.store.getState().picks).toHaveLength(0);
    // The extent key steps it with the Precrease tool in hand, and declines otherwise.
    let stepped = false;
    act(() => {
      stepped = bound!.verbs.cycleExtent();
    });
    expect(stepped).toBe(true);
    expect(tools.store.getState().extent).toBe('whole');
    act(() => tools.selectTool('valley'));
    expect(bound!.verbs.cycleExtent()).toBe(false);
    expect(commitStep).not.toHaveBeenCalled();
  });

  it('turns a too-short segment into a pinch at its first point, or the whole line, or every layer', () => {
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, tool: 'precrease', extent: 'segment' });
    act(() => root.render(<Harness session={session(vi.fn())} tools={tools} preview={preview()} />));
    const at = { kind: 'point' as const, provenance: 'crossing' as const, sheet: [0.5, 0.5] as [number, number], mark: null, scene: { x: 0.5, y: 0.5 } };
    act(() => {
      tools.pickAlong(at);
      tools.pickAlong(at);
      tools.setSeed({ scope: 'depth', at: [0.2, 0.2], scene: { x: 0.2, y: 0.2 }, choice: 1 });
    });
    act(() => bound!.verbs.pinchInstead());
    expect(tools.store.getState()).toMatchObject({ extent: 'pinch', extentPicks: [at] });
    act(() => bound!.verbs.throughAllLayers());
    expect(tools.store.getState().seed).toEqual({ scope: 'all' });
    act(() => bound!.verbs.useWholeLine());
    expect(tools.store.getState()).toMatchObject({ extent: 'whole', extentPicks: [] });
  });
});
