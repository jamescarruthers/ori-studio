import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  createDiagram,
  createTurn,
  insertSteps,
  setPageSetup,
  type DiagramDocument,
  type DiagramEntry,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { usePublishPageInView, type PagesInView } from './pageInView';
import { currentDiagramPage, pageName, useCurrentDiagramPage, type CurrentDiagramPage } from './useCurrentDiagramPage';

/**
 * The page a pane's "this page" means (`implementation-plans/diagram-flow-pages.md`,
 * UI; review R2-U1): the page the user last acted on — in the Pages view the
 * page pressed while it is on screen, else the selected step's while its page
 * is on screen, else the middle of the view — else the selected step's, else
 * page 1.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Steps `s0`… on flow pages of 4, with a turn `t-…` before each step index in `turnsBefore`, and one at the end where asked. */
function diagram(size: number, turnsBefore: readonly number[] = [], trailingTurn = false): DiagramDocument {
  const entries: DiagramEntry[] = [];
  for (let index = 0; index < size; index += 1) {
    if (turnsBefore.includes(index)) entries.push(createTurn({ kind: 'turn-over', axis: 'vertical' }, () => `t-${index}`));
    entries.push(cpStep(`s${index}`));
  }
  if (trailingTurn) entries.push(createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 't-end'));
  return setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), entries, 0), {
    layout: 'flow',
    stepsPerPage: 4,
  });
}

/** Where the Pages view stands: its middle page, the pages on screen (just the middle's, unless said) and the page pressed. */
const at = (middle: number, first = middle, last = middle, pressed: number | null = null): PagesInView => ({
  middle,
  first,
  last,
  pressed,
});

describe('currentDiagramPage', () => {
  it('is page 1 with nothing selected and no page in view, and nothing without a diagram', () => {
    expect(currentDiagramPage(null, at(2), 's5')).toBeNull();
    const page = currentDiagramPage(diagram(10), null, null)!;
    expect(page.index).toBe(0);
    expect(page.name).toBe(1);
    expect(page.page.steps).toEqual([0, 1, 2, 3]);
  });

  it('is the selected step’s page', () => {
    expect(currentDiagramPage(diagram(10), null, 's5')!.index).toBe(1);
    expect(currentDiagramPage(diagram(10), null, 's9')!.page.steps).toEqual([8, 9]);
    // An id the diagram does not hold says nothing.
    expect(currentDiagramPage(diagram(10), null, 'gone')!.index).toBe(0);
  });

  it('is a selected turn’s page: the step after it prints it, or the last step one at the end', () => {
    const document = diagram(10, [4], true);
    expect(currentDiagramPage(document, null, 't-4')!.index).toBe(1);
    expect(currentDiagramPage(document, null, 't-end')!.index).toBe(2);
  });

  it('is the selected step’s page while that page is on screen, though the middle of the view is on another', () => {
    // s1 on page 1, the middle of the view on page 2, page 1 still on screen above it.
    expect(currentDiagramPage(diagram(10), at(1, 0, 1), 's1')!.index).toBe(0);
    // Zoomed out on every page: the selection's, wherever the middle is.
    expect(currentDiagramPage(diagram(10), at(0, 0, 2), 's9')!.index).toBe(2);
  });

  it('is the page in the middle of the view once the selected step’s page is off screen, or nothing is selected', () => {
    expect(currentDiagramPage(diagram(10), at(2, 1, 2), 's1')!.index).toBe(2);
    expect(currentDiagramPage(diagram(10), at(1, 0, 2), null)!.index).toBe(1);
    // A re-cut left fewer pages than the view last counted.
    expect(currentDiagramPage(diagram(10), at(7), null)!.index).toBe(2);
  });

  it('is the page last pressed while it is on screen, over the selection and the middle', () => {
    expect(currentDiagramPage(diagram(10), at(0, 0, 2, 2), 's1')!.index).toBe(2);
    expect(currentDiagramPage(diagram(10), at(1, 0, 1, 0), 's5')!.index).toBe(0);
  });

  it('is named as the Pages view captions it: the number it prints, else its place', () => {
    const numbered = setPageSetup(diagram(10), { pageNumbers: { enabled: true, first: 5 } });
    expect(currentDiagramPage(numbered, at(1), null)!.name).toBe(6);
    const unnumbered = setPageSetup(diagram(10), { pageNumbers: { enabled: false, first: 5 } });
    expect(currentDiagramPage(unnumbered, at(1), null)!.name).toBe(2);
    expect(pageName({ pageNumbers: { enabled: true, first: 1 } }, 0)).toBe(1);
  });
});

describe('useCurrentDiagramPage', () => {
  let host: HTMLDivElement;
  let root: Root;
  let seen: CurrentDiagramPage | null = null;
  const state = () => useWorkspaceStore.getState();

  function Pane() {
    const page = useCurrentDiagramPage();
    useEffect(() => {
      seen = page;
    });
    return null;
  }
  /** The Pages view, as far as the panes see it: the one page it has on screen. */
  function PagesView({ page }: { page: number | null }) {
    usePublishPageInView(page === null ? null : at(page));
    return null;
  }
  const render = (inView?: number | null) =>
    act(() =>
      root.render(
        <>
          <Pane />
          {inView !== undefined && <PagesView page={inView} />}
        </>
      )
    );

  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    state().installDiagram({ document: diagram(10), readOnly: false, raw: {} });
    host = document.createElement('div');
    root = createRoot(host);
    seen = null;
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it('follows the selection, then the page in view while the Pages view shows one, then the selection again', () => {
    render();
    expect(seen?.index).toBe(0);
    act(() => state().selectDiagramStep('s9'));
    expect(seen?.index).toBe(2);
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    render(1);
    expect(seen?.index).toBe(1);
    expect(seen?.page.steps).toEqual([4, 5, 6, 7]);
    // Still laying out: the view has no page in view yet.
    render(null);
    expect(seen?.index).toBe(2);
    render(0);
    expect(seen?.index).toBe(0);
    // The view gone, its page goes with it.
    render();
    expect(seen?.index).toBe(2);
  });

  it('reads no page in view while the Steps view is shown', () => {
    act(() => state().selectDiagramStep('s5'));
    act(() => useWorkspaceStore.setState({ diagramView: 'steps' }));
    render(2);
    expect(seen?.index).toBe(1);
  });

  it('cuts the pages again as the diagram changes', () => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    render(1);
    expect(seen?.page.ownCount).toBe(false);
    act(() => state().setDiagramPageSteps(1, 6));
    expect(seen?.index).toBe(1);
    expect(seen?.page).toMatchObject({ ownCount: true, capacity: 6, steps: [4, 5, 6, 7, 8, 9] });
  });
});
