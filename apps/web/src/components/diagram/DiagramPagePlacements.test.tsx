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
import { usePublishPageInView } from '../../diagram/pages/pageInView';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramPagePlacements } from './DiagramPagePlacements';

const tracked = vi.hoisted(() => ({ trackDiagramPlacementReset: vi.fn() }));
vi.mock('../../analytics/trackDiagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/trackDiagram')>()),
  ...tracked,
}));

/**
 * The Page pane's Reset This Page (review finding U4): the page in view in the
 * Pages view, whatever is selected or not, else the selected step's page.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();
const placedIds = () =>
  Array.from({ length: 10 }, (_, index) => `s${index}`).filter((id) => stepById(state().diagram!, id)!.place);
const resetPage = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Reset This Page')!;

function PagesView({ page }: { page: number | null }) {
  usePublishPageInView(page);
  return null;
}
const render = (inView?: number) =>
  act(() =>
    root?.render(
      <TooltipProvider>
        {inView !== undefined && <PagesView page={inView} />}
        <DiagramPagePlacements />
      </TooltipProvider>
    )
  );

beforeEach(() => {
  tracked.trackDiagramPlacementReset.mockClear();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  // Ten steps, four a page; s1 placed on page 1, s5 and s6 on page 2, none on page 3.
  const steps = Array.from({ length: 10 }, (_, index): DiagramStep => ({
    ...cpStep(`s${index}`),
    ...([1, 5, 6].includes(index) ? { place: { frame: [2, 1] as [number, number] } } : {}),
  }));
  const diagram = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 4,
  });
  state().installDiagram({ document: diagram, readOnly: false, raw: {} });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('DiagramPagePlacements', () => {
  it('resets the page in view, with nothing selected', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    render(1);
    expect(state().diagramSelectedStepId).toBeNull();
    expect(resetPage().disabled).toBe(false);
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s1']);
    expect(tracked.trackDiagramPlacementReset).toHaveBeenCalledExactlyOnceWith('step', 'page', 'pane');
  });

  it('resets the page in view rather than the selected step’s', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    act(() => state().selectDiagramStep('s1'));
    render(1);
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s1']);
  });

  it('resets the selected step’s page while no Pages view shows one, and page 1 with nothing selected', () => {
    render();
    act(() => state().selectDiagramStep('s6'));
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s1']);
    act(() => state().selectDiagramStep(null));
    act(() => resetPage().click());
    expect(placedIds()).toEqual([]);
  });

  it('has nothing to reset on a page with no step placed by hand', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    render(2);
    expect(resetPage().disabled).toBe(true);
    render(0);
    expect(resetPage().disabled).toBe(false);
  });
});
