import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createDiagram, insertSteps, setPageSetup, type DiagramDocument } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import type { PreparedDiagramPages } from './diagramPages';
import { cellSlots } from './stepPlaces';
import { useDiagramPages, type DiagramPagesState } from './useDiagramPages';

const prepare = vi.hoisted(() => vi.fn());
vi.mock('./diagramPages', () => ({ prepareDiagramPages: prepare }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let seen: DiagramPagesState | null = null;

function Pages({ document }: { document: DiagramDocument }) {
  const state = useDiagramPages(document);
  useEffect(() => {
    seen = state;
  });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  prepare.mockReset();
  prepare.mockImplementation(
    async (document: DiagramDocument) => ({ of: document, layout: { pages: [] } }) as unknown as PreparedDiagramPages
  );
  host = document.createElement('div');
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useDiagramPages', () => {
  it('lays out the last diagram of a burst of edits, not each', async () => {
    let document = createDiagram({ title: 'Heart' });
    act(() => root.render(<Pages document={document} />));
    // Arrow Up held in the path's width: a new diagram per repeat, each before the last laid out.
    const widths: DiagramDocument[] = [];
    for (const mm of [27, 28, 29, 30]) {
      document = setPageSetup(document, { pathWidthMm: mm });
      widths.push(document);
      act(() => root.render(<Pages document={document} />));
    }
    expect(prepare).not.toHaveBeenCalled();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]![0]).toBe(widths.at(-1));
    expect(seen?.of).toBe(widths.at(-1));
  });

  it('adopts the flow pages a layout packed into the diagram it laid out, and takes the same pages for it, laid out once', async () => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    const document = insertSteps(createDiagram({ title: 'Heart' }), [cpStep('s0'), cpStep('s1')], 0);
    useWorkspaceStore.getState().installDiagram({ document, readOnly: false, raw: {} });
    const installed = useWorkspaceStore.getState().diagram!;
    // What the layout packed: the one page, under the step it starts with, packed for it as it is.
    const packed = {
      s0: {
        signature: cellSlots(installed).signatures[0]!,
        k: 1,
        steps: {
          s0: { box: [12, 30, 40, 50] as [number, number, number, number], scale: { mmPerUnit: 0.2 }, band: 0 },
          s1: { box: [60, 30, 40, 50] as [number, number, number, number], scale: { mmPerUnit: 0.2 }, band: 0 },
        },
      },
    };
    const adoptedAs = vi.fn((of: DiagramDocument) => ({ of, layout: { pages: [] } }) as unknown as PreparedDiagramPages);
    prepare.mockImplementation(
      async (of: DiagramDocument) => ({ of, layout: { pages: [], packed }, adoptedAs }) as unknown as PreparedDiagramPages
    );
    act(() => root.render(<Pages document={installed} />));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // Taken in, with no edit: the store's diagram is the one laid out, its page held.
    const adopted = useWorkspaceStore.getState().diagram!;
    expect(adopted).not.toBe(installed);
    expect(Object.keys(adopted.pageArrangements!)).toEqual(['s0']);
    expect(useWorkspaceStore.getState().dirty).toBe(false);
    // The adopted diagram takes these pages: not laid out again.
    act(() => root.render(<Pages document={adopted} />));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(adoptedAs).toHaveBeenCalledWith(adopted);
    expect(seen?.of).toBe(adopted);
    expect(seen?.pages).toBe(adoptedAs.mock.results[0]!.value);
  });
});
