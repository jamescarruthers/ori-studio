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
import { usePublishPageInView, type PagesInView } from '../../diagram/pages/pageInView';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramPagePlacements } from './DiagramPagePlacements';

const tracked = vi.hoisted(() => ({ trackDiagramPlacementReset: vi.fn() }));
vi.mock('../../analytics/trackDiagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/trackDiagram')>()),
  ...tracked,
}));

/**
 * The Page pane's Reset This Page (review findings U4, R2-U1): the page the
 * user last acted on — in the Pages view the page pressed, else the selected
 * step's while it is on screen, else the page in view — else the selected
 * step's page.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();
const placedIds = () =>
  Array.from({ length: 10 }, (_, index) => `s${index}`).filter((id) => stepById(state().diagram!, id)!.place);
const resetPage = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Reset This Page')!;

function PagesView({ view }: { view: PagesInView }) {
  usePublishPageInView(view);
  return null;
}
/** Renders the button, with the Pages view standing on one page, or where `inView` says. */
const render = (inView?: number | PagesInView) =>
  act(() =>
    root?.render(
      <TooltipProvider>
        {inView !== undefined && (
          <PagesView
            view={typeof inView === 'number' ? { middle: inView, first: inView, last: inView, pressed: null } : inView}
          />
        )}
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

  it('resets the page in view once the selected step’s page is off screen', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    act(() => state().selectDiagramStep('s1'));
    render(1);
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s1']);
  });

  it('resets the selected step’s page while it is on screen, though the middle of the view is on the next', () => {
    // Two pages on screen, page 2 under the middle; s1, on page 1, selected: its page, and no step off screen.
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    act(() => state().selectDiagramStep('s1'));
    render({ middle: 1, first: 0, last: 1, pressed: null });
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s5', 's6']);
  });

  it('resets the page last pressed while it is on screen', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    act(() => state().selectDiagramStep('s1'));
    render({ middle: 0, first: 0, last: 1, pressed: 1 });
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

  it('counts a step placed only by its caption’s width as placed by hand, and resets it with its page', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    render(2);
    expect(host!.textContent).toContain('Steps placed by hand: 3');
    act(() => state().setDiagramStepPlace('s9', { textWidth: 64 }));
    render(2);
    expect(host!.textContent).toContain('Steps placed by hand: 4');
    expect(resetPage().disabled).toBe(false);
    act(() => resetPage().click());
    expect(placedIds()).toEqual(['s1', 's5', 's6']);
  });
});
