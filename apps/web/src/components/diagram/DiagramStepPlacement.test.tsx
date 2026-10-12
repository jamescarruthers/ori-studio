import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  stepById,
  type DiagramStep,
} from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import type { PlacementClash } from '../../diagram/pages/pagePlacement';
import { newPageHelps } from '../../diagram/pages/useStepPlacement';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramStepPlacement } from './DiagramStepPlacement';

/** The clashes the pages give the step shown, as the Diagram panel publishes its layout. */
const printed = vi.hoisted(() => ({ clashes: [] as PlacementClash[] }));
vi.mock('../../diagram/pages/printedFrames', async (importOriginal) => {
  const { useWorkspaceStore: store } = await import('../../store/workspaceStore');
  const { stepsOf } = await import('../../diagram/document/diagramDocument');
  return {
    ...(await importOriginal<typeof import('../../diagram/pages/printedFrames')>()),
    // One page holding every step, laid out from the diagram as it is.
    usePrintedLayout: () => {
      const document = store.getState().diagram;
      const cells = document
        ? stepsOf(document).map((step, index) => ({
            stepId: step.id,
            number: index + 1,
            frameMm: 40,
            mmPerUnit: null,
            pictureMm: { x: 0, y: 0, size: 40 },
            clashes: printed.clashes,
          }))
        : [];
      return { pages: { layout: { pages: [{ cells }] } }, document };
    },
  };
});

/**
 * The Step pane's clash notice (review finding U5): "Start step N on a new
 * page" only for a clash a new page clears, only on a step that does not
 * start a page already, and saying what it does to the frame.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();
const offer = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.endsWith('on a new page')
  );

/** Ten steps on flow pages of 4; s6 asks for a page, and s8 has its own count. */
function install(layout: 'flow' | 'grid' = 'flow') {
  const steps = Array.from({ length: 10 }, (_, index): DiagramStep => ({
    ...cpStep(`s${index}`),
    ...(index === 6 ? { breakBefore: true } : {}),
    ...(index === 8 ? { pageSteps: 2 } : {}),
  }));
  const diagram = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout,
    stepsPerPage: 4,
    columns: 2,
    rows: 2,
  });
  state().installDiagram({ document: diagram, readOnly: false, raw: {} });
}

function show(stepId: string, clashes: PlacementClash[]) {
  printed.clashes = clashes;
  act(() =>
    root?.render(
      <TooltipProvider>
        <DiagramStepPlacement step={stepById(state().diagram!, stepId)!} />
      </TooltipProvider>
    )
  );
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  install();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('newPageHelps', () => {
  it('is for a clash with another step or a glyph, on a step that does not start a page', () => {
    expect(newPageHelps([{ kind: 'step', steps: [3] }], false)).toBe(true);
    expect(newPageHelps([{ kind: 'glyph' }], false)).toBe(true);
    expect(newPageHelps([{ kind: 'margin' }, { kind: 'glyph' }], false)).toBe(true);
    expect(newPageHelps([{ kind: 'step', steps: [3] }], true)).toBe(false);
    for (const kind of ['margin', 'paper', 'path', 'parts'] as const) expect(newPageHelps([{ kind }], false)).toBe(false);
    expect(newPageHelps([], false)).toBe(false);
    expect(newPageHelps(undefined, false)).toBe(false);
  });
});

describe('DiagramStepPlacement › the offer of a new page', () => {
  it('offers it for an overlap with another step, says it sends the frame home, and starts the page', () => {
    // s1: second on page 1.
    show('s1', [{ kind: 'step', steps: [3] }]);
    expect(host?.textContent).toContain('This step overlaps step 3.');
    expect(host?.textContent).toContain('returns this step’s frame to automatic placement');
    expect(offer()?.textContent).toBe('Start step 2 on a new page');
    act(() => offer()!.click());
    expect(stepById(state().diagram!, 's1')!.breakBefore).toBe(true);
  });

  it('names the steps it overlaps as every Diagram notice lists them', () => {
    show('s1', [{ kind: 'step', steps: [3, 4] }]);
    expect(host?.textContent).toContain('This step overlaps steps 3 and 4.');
  });

  it('offers it for an overlap with a symbol, heading or page number', () => {
    show('s2', [{ kind: 'glyph' }]);
    expect(offer()).toBeDefined();
  });

  it('offers nothing for the margin, the paper, the path or the step’s own parts', () => {
    for (const kind of ['margin', 'paper', 'path', 'parts'] as const) {
      show('s1', [{ kind }]);
      expect(host?.querySelector('[role="status"]'), kind).not.toBeNull();
      expect(offer(), kind).toBeUndefined();
      expect(host?.textContent, kind).not.toContain('automatic placement');
    }
  });

  it('offers nothing on a step that starts a page: the first, a full page’s next, a break, its own count', () => {
    // s0 is the first; s4 follows a full page of 4; s6 has a break; s8 its own count.
    for (const id of ['s0', 's4', 's6', 's8']) {
      show(id, [{ kind: 'step', steps: [2] }]);
      expect(offer(), id).toBeUndefined();
    }
    show('s5', [{ kind: 'step', steps: [2] }]);
    expect(offer()).toBeDefined();
  });

  it('reads a grid’s pages, which ignore a count of their own', () => {
    install('grid');
    // Grid pages of 2 × 2: s4 still starts one, s6 has its break, and s8’s count says nothing there.
    show('s8', [{ kind: 'step', steps: [8] }]);
    expect(offer()?.textContent).toBe('Start step 9 on a new page');
    show('s4', [{ kind: 'step', steps: [6] }]);
    expect(offer()).toBeUndefined();
  });
});
