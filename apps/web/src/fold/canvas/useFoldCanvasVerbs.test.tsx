import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoldOp } from '../document/foldSequenceDocument';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { createFoldTools, FOLD_TOOL_INITIAL, type FoldTools } from '../tools/foldToolState';
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

function Harness(props: { session: FoldSessionSurface; tools: FoldTools; preview: FoldToolPreview }) {
  const binding = useFoldCanvasVerbs(props.session, props.tools, {} as FoldStateView, props.preview);
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

  it('lets a queued commit go when the preview is refused, or another step replaces it', () => {
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
    render(preview({ landing: false, step: { op: BOOK, key: 'another' } }));
    expect(commitStep).not.toHaveBeenCalled();
  });

  it('decides a queued commit from the step it was asked for', () => {
    const shown = preview({ landing: true });
    expect(queuedCommit(null, shown, false)).toBe('idle');
    expect(queuedCommit('book', shown, false)).toBe('wait');
    expect(queuedCommit('book', { ...shown, landing: false }, false)).toBe('commit');
    expect(queuedCommit('book', { ...shown, landing: false }, true)).toBe('drop');
    expect(queuedCommit('other', shown, false)).toBe('drop');
    expect(queuedCommit('book', { ...shown, step: null }, false)).toBe('drop');
  });
});

describe('the canvas’s chooser', () => {
  it('shows the deepest choice with more than one answer: the order, the opening, then the root', () => {
    const tools = { ...FOLD_TOOL_INITIAL, root: 1, compound: { reverseKind: null, opening: 5, order: 1 } };
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
