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
import { foldPickIndex } from './foldPicking';
import { foldCanvasChoice, queuedCommit, useFoldCanvasVerbs, type FoldCanvasVerbBinding } from './useFoldCanvasVerbs';
import type { FoldStateView } from './useFoldStateView';
import type { FoldToolPreview } from './useFoldToolPreview';

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
    vertex: null,
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
});
