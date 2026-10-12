import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FontSubsetter } from '../../diagram/fonts/fontSubset';
import { FIXTURE_FONTS, fixtureSubsetter } from '../../diagram/fonts/diagramFonts.fixtures';
import { preparedPages } from '../../diagram/pages/diagramPages';
import { overflowingDiagram } from '../../diagram/pages/pageOverflow.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramPageOverflowNotice } from './DiagramPageOverflowNotice';

const analytics = vi.hoisted(() => ({ trackDiagramPagesRepacked: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

/**
 * The Pages view's notice when a step no longer fits the place its flow page
 * keeps for it (`diagram-flow-packing.md`, Decision 3): which step, and
 * Re-pack Page — nothing moves until it is pressed.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let subsetter: FontSubsetter;
beforeAll(async () => {
  subsetter = await fixtureSubsetter();
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
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
const render = (pages: Parameters<typeof DiagramPageOverflowNotice>[0]['pages']) =>
  act(() =>
    root.render(
      <TooltipProvider>
        <DiagramPageOverflowNotice pages={pages} />
      </TooltipProvider>
    )
  );
const repack = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Re-pack Page');

describe('DiagramPageOverflowNotice', () => {
  it('names the step past its place on the current page, and Re-pack Page packs that page afresh: one undo step, one count', () => {
    const { overflowing, pages } = overflowingDiagram(subsetter);
    expect(pages.layout.pages[0]!.cells.find((cell) => cell.stepId === 's2')?.overflow).toBe('caption');
    act(() => state().installDiagram({ document: overflowing, readOnly: false, raw: {} }));
    render(pages);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Step 3 on page 1 no longer fits its place.');
    expect(repack()?.disabled).toBe(false);
    act(() => repack()!.click());
    expect(state().diagram?.pageArrangements).toBeUndefined();
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Re-pack page');
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenCalledExactlyOnceWith('page', 'notice');
  });

  it('says nothing on a page whose steps all fit, nor before the pages are laid out', () => {
    const { held } = overflowingDiagram(subsetter);
    act(() => state().installDiagram({ document: held, readOnly: false, raw: {} }));
    render(preparedPages(held, FIXTURE_FONTS, subsetter));
    expect(host.textContent).toBe('');
    render(null);
    expect(host.textContent).toBe('');
  });

  it('offers no Re-pack Page that would change a read-only diagram', () => {
    const { overflowing, pages } = overflowingDiagram(subsetter);
    act(() => state().installDiagram({ document: overflowing, readOnly: true, raw: {} }));
    render(pages);
    expect(host.textContent).toContain('no longer fits its place');
    expect(repack()?.disabled).toBe(true);
  });
});
