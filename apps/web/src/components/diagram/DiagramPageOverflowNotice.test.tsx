import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FontSubsetter } from '../../diagram/fonts/fontSubset';
import { FIXTURE_FONTS, fixtureSubsetter } from '../../diagram/fonts/diagramFonts.fixtures';
import { preparedPages, type PreparedDiagramPages } from '../../diagram/pages/diagramPages';
import { overflowingDiagram, pastItsBox } from '../../diagram/pages/pageOverflow.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramPageOverflowNotice } from './DiagramPageOverflowNotice';

/**
 * The Pages view's notice about the current page: only that it cannot hold
 * its steps even at the smallest size (`diagram-flow-packing.md`, Decision
 * 3), the automatic layout failing. A step whose own new caption or picture
 * runs past its place is not said: the page shows it (Zach, 2026-10-12).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let subsetter: FontSubsetter;
beforeAll(async () => {
  subsetter = await fixtureSubsetter();
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const state = () => useWorkspaceStore.getState();
const render = (pages: PreparedDiagramPages | null) =>
  act(() =>
    root.render(
      <TooltipProvider>
        <DiagramPageOverflowNotice pages={pages} />
      </TooltipProvider>
    )
  );

/** `pages` with their first page laid out as no plan fits, even at the least scale. */
const unfit = (pages: PreparedDiagramPages): PreparedDiagramPages => ({
  ...pages,
  layout: {
    ...pages.layout,
    pages: pages.layout.pages.map((page, index) => (index === 0 ? { ...page, packing: { ...page.packing!, fits: false } } : page)),
  },
});

describe('DiagramPageOverflowNotice', () => {
  it('says nothing of a step past its place, which the page shows, and offers no Re-pack Page for it', () => {
    const { overflowing, pages } = overflowingDiagram(subsetter);
    // Step 3's caption prints past its box, drawn whole.
    expect(pastItsBox(pages.layout.pages[0]!.cells.find((cell) => cell.stepId === 's2')!)).toBe('caption');
    act(() => state().installDiagram({ document: overflowing, readOnly: false, raw: {} }));
    render(pages);
    expect(host.textContent).toBe('');
    expect(host.querySelector('button')).toBeNull();
  });

  it('says a page that can’t hold its steps even at the smallest size, and what to do, with nothing to press', () => {
    const { held } = overflowingDiagram(subsetter);
    act(() => state().installDiagram({ document: held, readOnly: false, raw: {} }));
    render(unfit(preparedPages(held, FIXTURE_FONTS, subsetter)));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      'Page 1 can’t hold its steps, even at the smallest size. Give it fewer steps.'
    );
    expect(host.querySelector('button')).toBeNull();
  });

  it('says nothing on a page that holds its steps, nor before the pages are laid out', () => {
    const { held } = overflowingDiagram(subsetter);
    act(() => state().installDiagram({ document: held, readOnly: false, raw: {} }));
    render(preparedPages(held, FIXTURE_FONTS, subsetter));
    expect(host.textContent).toBe('');
    render(null);
    expect(host.textContent).toBe('');
  });
});
