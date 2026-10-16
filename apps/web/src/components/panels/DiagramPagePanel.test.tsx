import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_SETTINGS, stepsOf, type DiagramDocument, type DiagramPageArrangement } from '../../diagram/document/diagramDocument';
import { usePublishPageInView } from '../../diagram/pages/pageInView';
import { firstPageCapacity, paginate } from '../../diagram/pages/pagePlan';
import { heldPageArrangements } from '../../diagram/pages/pageArrangements';
import { cellSlots } from '../../diagram/pages/stepPlaces';
import { PATH_COLOR_SETTLE_MS } from '../../diagram/pages/usePathColorPick';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramPagePanel } from './DiagramPagePanel';

const analytics = vi.hoisted(() => ({ trackDiagramPageSetupChanged: vi.fn(), trackDiagramPagesRepacked: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

/** The Page pane through the store: each control one change, one undo step and one count. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useWorkspaceStore.getInitialState();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState(initialState, true);
  act(() => {
    for (let i = 0; i < 10; i += 1) useWorkspaceStore.getState().addDiagramStep();
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <TooltipProvider>
        <DiagramPagePanel />
      </TooltipProvider>
    )
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const state = () => useWorkspaceStore.getState();
const radio = (name: string) =>
  [...(host?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].find((element) =>
    element.textContent?.startsWith(name)
  )!;
/** An option of the segmented control named `group`, by its label. */
const segment = (group: string, name: string) =>
  [...(host?.querySelectorAll<HTMLElement>(`[role="group"][aria-label="${group}"] button`) ?? [])].find(
    (element) => element.textContent === name
  )!;
const toggle = (name: string) =>
  [...(host?.querySelectorAll<HTMLElement>('[role="switch"]') ?? [])].find(
    (element) => element.getAttribute('aria-label') === name || element.closest('.control-row')?.textContent?.includes(name)
  )!;

const swatch = () => host!.querySelector<HTMLInputElement>('input[type="color"]')!;
/** One move of the colour picker: it sets the swatch's value and reports it. */
const move = (color: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(swatch(), color);
  swatch().dispatchEvent(new Event('input', { bubbles: true }));
};
/** How many times the diagram itself changes from here on. */
const diagramChanges = () => {
  const changes = { count: 0, stop: () => {} };
  changes.stop = useWorkspaceStore.subscribe((next, previous) => {
    if (next.diagram !== previous.diagram) changes.count += 1;
  });
  return changes;
};

describe('DiagramPagePanel', () => {
  it('offers Flow first, and a new diagram starts in it, with its path', () => {
    const layouts = [...(host?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])].map(
      (element) => element.textContent
    );
    expect(layouts[0]).toMatch(/^Flow/);
    expect(layouts[1]).toMatch(/^Grid/);
    expect(state().diagram?.page.layout).toBe('flow');
    expect(radio('Flow').getAttribute('aria-checked')).toBe('true');
    expect(host?.textContent).toContain('Show path');
    // The flow takes a number of steps, not columns and rows.
    expect(host?.querySelector('input[aria-label="Steps per page"]')).not.toBeNull();
    expect(host?.querySelector('input[aria-label="Columns"]')).toBeNull();
    expect(host?.querySelector('input[aria-label="Rows"]')).toBeNull();
  });

  it('lays the steps out in a grid, one undo step and one count, and takes the path away', () => {
    const past = state().diagramHistory.past.length;
    act(() => radio('Grid').click());
    expect(state().diagram?.page.layout).toBe('grid');
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledWith('layout');
    expect(host?.textContent).not.toContain('Show path');
    expect(host?.querySelector('input[aria-label="Columns"]')).not.toBeNull();
    expect(host?.querySelector('input[aria-label="Rows"]')).not.toBeNull();
    expect(host?.querySelector('input[aria-label="Steps per page"]')).toBeNull();
    act(() => radio('Flow').click());
    expect(state().diagram?.page.layout).toBe('flow');
    expect(host?.textContent).toContain('Show path');
  });

  it('sets the flow path’s width, one undo step and one count, and resets it to 20 mm', () => {
    const field = () => host!.querySelector<HTMLInputElement>('input[aria-label="Path width (mm)"]')!;
    const reset = () => host!.querySelector<HTMLButtonElement>('[aria-label="Reset Path width (mm) to default"]');
    // The default, whatever the size of the steps; nothing to reset.
    expect(field().value).toBe('20');
    expect(reset()).toBeNull();
    const past = state().diagramHistory.past.length;
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Increase Path width (mm)"]')!.click());
    expect(state().diagram?.page.pathWidthMm).toBe(21);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledWith('path_width');
    act(() => reset()!.click());
    expect(state().diagram?.page.pathWidthMm).toBe(20);
    expect(state().diagramHistory.past).toHaveLength(past + 2);
    expect(field().value).toBe('20');
    expect(reset()).toBeNull();
  });

  it('shows the path’s colour as it is picked and writes it once: one store change, one undo step, one count', () => {
    expect(swatch().value).toBe('#ecece8');
    const before = state().diagram;
    const past = state().diagramHistory.past.length;
    const changes = diagramChanges();
    // The picker reports every move; the swatch follows it, and the document does not.
    for (const color of ['#d0e0f0', '#c0d8f0', '#b0d0f0']) {
      act(() => move(color));
      expect(swatch().value).toBe(color);
    }
    expect(state().diagram).toBe(before);
    expect(changes.count).toBe(0);
    expect(state().diagramHistory.past).toHaveLength(past);
    expect(analytics.trackDiagramPageSetupChanged).not.toHaveBeenCalledWith('path_color');
    // Letting go of focus writes the pick: once.
    act(() => swatch().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(changes.count).toBe(1);
    expect(state().diagram?.page.pathColor).toBe('#b0d0f0');
    expect(swatch().value).toBe('#b0d0f0');
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('path_color');
    // One undo takes the whole pick back; the reset is one change of its own.
    act(() => useWorkspaceStore.getState().undoDiagram());
    expect(state().diagram?.page.pathColor).toBe('#ecece8');
    act(() => useWorkspaceStore.getState().redoDiagram());
    act(() => host!.querySelector<HTMLButtonElement>('[aria-label="Reset Path color to default"]')!.click());
    expect(state().diagram?.page.pathColor).toBe('#ecece8');
    expect(state().diagramHistory.past).toHaveLength(past + 2);
    changes.stop();
  });

  it('writes a pick that goes quiet before the picker lets go, and one that carries on is still one undo step', () => {
    vi.useFakeTimers();
    try {
      const past = state().diagramHistory.past.length;
      act(() => move('#d0e0f0'));
      act(() => move('#c0d8f0'));
      act(() => vi.advanceTimersByTime(PATH_COLOR_SETTLE_MS - 1));
      expect(state().diagram?.page.pathColor).toBe('#ecece8');
      act(() => vi.advanceTimersByTime(1));
      expect(state().diagram?.page.pathColor).toBe('#c0d8f0');
      expect(state().diagramHistory.past).toHaveLength(past + 1);
      // The same pick, on after the pause.
      act(() => move('#b0d0f0'));
      expect(state().diagram?.page.pathColor).toBe('#c0d8f0');
      act(() => vi.advanceTimersByTime(PATH_COLOR_SETTLE_MS));
      expect(state().diagram?.page.pathColor).toBe('#b0d0f0');
      act(() => swatch().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
      expect(state().diagramHistory.past).toHaveLength(past + 1);
      expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('path_color');
      act(() => useWorkspaceStore.getState().undoDiagram());
      expect(state().diagram?.page.pathColor).toBe('#ecece8');
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes a pick still under way when its row goes', () => {
    act(() => move('#d0e0f0'));
    expect(state().diagram?.page.pathColor).toBe('#ecece8');
    act(() => toggle('Show path').click());
    expect(host?.textContent).not.toContain('Path color');
    expect(state().diagram?.page.pathColor).toBe('#d0e0f0');
  });

  it('offers the path’s width and colour only while the flow shows its path', () => {
    expect(host?.textContent).toContain('Path width (mm)');
    expect(host?.textContent).toContain('Path color');
    act(() => toggle('Show path').click());
    expect(host?.textContent).not.toContain('Path width (mm)');
    expect(host?.textContent).not.toContain('Path color');
    act(() => toggle('Show path').click());
    act(() => radio('Grid').click());
    expect(host?.textContent).not.toContain('Path width (mm)');
  });

  it('puts the first page on the right, one undo step and one count, in either layout', () => {
    expect(state().diagram?.page.firstPageSide).toBe('left');
    const past = state().diagramHistory.past.length;
    act(() => segment('First page', 'Right').click());
    expect(state().diagram?.page.firstPageSide).toBe('right');
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledWith('first_page_side');
    act(() => radio('Grid').click());
    expect(segment('First page', 'Right').getAttribute('aria-pressed')).toBe('true');
    act(() => segment('First page', 'Left').click());
    expect(state().diagram?.page.firstPageSide).toBe('left');
  });

  it('offers no choice of scale: every diagram fits each, in either layout', () => {
    for (const layout of ['Flow', 'Grid']) {
      act(() => radio(layout).click());
      expect(host?.querySelector('[role="group"][aria-label="Scale"]'), layout).toBeNull();
      expect(host?.textContent, layout).not.toMatch(/One scale|Fit each/);
    }
  });

  it('sets a flow page’s steps per page, one undo step and one count, and the pages follow', () => {
    const field = () => host!.querySelector<HTMLInputElement>('input[aria-label="Steps per page"]')!;
    expect(field().value).toBe('9');
    const past = state().diagramHistory.past.length;
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Decrease Steps per page"]')!.click());
    expect(state().diagram?.page.stepsPerPage).toBe(8);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('steps_per_page');
    // Ten steps, eight a page: two pages. The grid's columns and rows are left as they were.
    expect(paginate(stepsOf(state().diagram!), state().diagram!.page)).toHaveLength(2);
    expect(state().diagram?.page).toMatchObject({ columns: 3, rows: 3 });
    act(() => useWorkspaceStore.getState().undoDiagram());
    expect(state().diagram?.page.stepsPerPage).toBe(9);
    expect(field().value).toBe('9');
  });

  it('says nothing about how many pages there are, in either layout (Zach, 12 Oct: not useful)', () => {
    expect(host?.textContent).not.toContain('2 pages');
    act(() => radio('Grid').click());
    expect(host?.textContent).not.toContain('2 pages');
    expect(host?.textContent).not.toContain('steps per page ·');
  });

  it('shows the first page number only while numbers are on', () => {
    expect(host?.textContent).toContain('First number');
    act(() => toggle('Page numbers').click());
    expect(state().diagram?.page.pageNumbers.enabled).toBe(false);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledWith('page_numbers');
    expect(host?.textContent).not.toContain('First number');
  });

  it('changes nothing on a read-only diagram', () => {
    act(() => useWorkspaceStore.setState({ diagramReadOnly: true }));
    act(() => radio('Grid').click());
    expect(state().diagram?.page.layout).toBe('flow');
    expect(analytics.trackDiagramPageSetupChanged).not.toHaveBeenCalled();
  });

  /**
   * The pane's sections in order, by the names they carry: an open section's
   * group, a closed one's disclosure. Once each: the Style section's cards are
   * a group of the same name.
   */
  const sectionOrder = () => {
    const names = ['Paper', 'Layout', 'Packing', 'On the page', 'Path', 'Header & footer', 'Style'];
    const found = [...host!.querySelectorAll('[role="group"][aria-label], button[aria-expanded]')]
      .map((element) => element.getAttribute('aria-label') ?? element.textContent ?? '')
      .filter((name) => names.includes(name));
    return [...new Set(found)];
  };

  it('puts Packing right under the counts, the path in a section of its own, and the title block in Header & footer (H-15 A, H-16 A)', () => {
    expect(sectionOrder()).toEqual(['Paper', 'Layout', 'Packing', 'Path', 'Header & footer', 'Style']);
    // Layout ends on the current page's count, which Packing follows.
    const layout = host!.querySelector('[role="group"][aria-label="Layout"]')!;
    const rows = [...layout.querySelectorAll('[data-field-label]')].map((label) => label.textContent);
    expect(rows).toEqual(['First page', 'Steps per page', expect.stringMatching(/^Steps on page \d/)]);
    // The path's rows are its section's, and the title block opens Header & footer, before the title's tab.
    const path = host!.querySelector('[role="group"][aria-label="Path"]')!;
    expect([...path.querySelectorAll('[data-field-label]')].map((label) => label.textContent)).toEqual([
      'Show path',
      'Path width (mm)',
      'Path color',
    ]);
    // Found by its name, not a selector: jsdom's selector engine trips on the ampersand.
    const header = [...host!.querySelectorAll('[role="group"]')].find(
      (group) => group.getAttribute('aria-label') === 'Header & footer'
    )!;
    const switches = [...header.querySelectorAll('[role="switch"]')].map((each) => each.getAttribute('aria-label'));
    expect(switches).toEqual(['Title block', 'Title tab', 'Page numbers']);
  });

  it('has no Packing and no Path in a grid, whose layout ends on its columns and rows', () => {
    act(() => radio('Grid').click());
    expect(sectionOrder()).toEqual(['Paper', 'Layout', 'Header & footer', 'Style']);
    const layout = host!.querySelector('[role="group"][aria-label="Layout"]')!;
    expect([...layout.querySelectorAll('[data-field-label]')].map((label) => label.textContent)).toEqual([
      'First page',
      'Columns',
      'Rows',
    ]);
  });

  it('says the title’s tab leaves the first page to the title block while the block is on (T-5 A)', () => {
    const titleHelp = () =>
      [...host!.querySelectorAll('[data-field-help]')]
        .map((mark) => mark.getAttribute('aria-label'))
        .find((help) => help?.startsWith('The diagram’s title'));
    act(() => state().setDiagramPage({ titleBlock: { ...state().diagram!.page.titleBlock, enabled: false } }));
    expect(titleHelp()).toBe('The diagram’s title, in a tab at the top of every page.');
    act(() => state().setDiagramPage({ titleBlock: { ...state().diagram!.page.titleBlock, enabled: true } }));
    expect(titleHelp()).toBe(
      'The diagram’s title, in a tab at the top of every page. On the first page the title block carries it instead.'
    );
  });
});

describe('DiagramPagePanel › the diagram’s title (Zach, 2026-10-15: out of the Diagram’s header)', () => {
  /** Header & footer, found by its name: jsdom's selector engine trips on the ampersand. */
  const headerFooter = () =>
    [...host!.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Header & footer')!;
  /** Its rows' labels in order: a stacked row's `<label>`, and a field row's. */
  const rows = () =>
    [...headerFooter().querySelectorAll('label, [data-field-label]')].map((label) => label.textContent);
  /** The Title field, by its label. */
  const titleField = () => {
    const label = [...host!.querySelectorAll('label')].find((each) => each.textContent === 'Title');
    return label ? (document.getElementById(label.htmlFor) as HTMLTextAreaElement | null) : null;
  };
  function typeInto(text: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(titleField(), text);
      titleField()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('opens Header & footer, above the title block, with the title the block and the title tab print', () => {
    expect(rows().slice(0, 3)).toEqual(['Title', 'Title block', 'Subtitle']);
    expect(titleField()!.value).toBe('Add a title');
    act(() => state().setDiagramTitle('Crane'));
    expect(titleField()!.value).toBe('Crane');
  });

  it('takes a sitting at the field, committed at each pause, as one undo step', () => {
    vi.useFakeTimers();
    try {
      const past = state().diagramHistory.past.length;
      act(() => titleField()!.focus());
      typeInto('Cr');
      act(() => vi.advanceTimersByTime(1000));
      expect(state().diagram?.title).toBe('Cr');
      typeInto('Crane');
      act(() => titleField()!.blur());
      expect(state().diagram?.title).toBe('Crane');
      expect(state().diagramHistory.past).toHaveLength(past + 1);
      expect(state().diagramHistory.past.at(-1)?.label).toBe('Rename diagram');
      // A second sitting is a second step; undo takes each back whole.
      act(() => titleField()!.focus());
      typeInto('Crane, revised');
      act(() => titleField()!.blur());
      expect(state().diagramHistory.past).toHaveLength(past + 2);
      act(() => state().undoDiagram());
      expect(state().diagram?.title).toBe('Crane');
      expect(titleField()!.value).toBe('Crane');
      act(() => state().undoDiagram());
      expect(state().diagram?.title).toBe('Add a title');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the title a new diagram starts with before there is one, and makes the diagram with what is typed', () => {
    act(() => useWorkspaceStore.setState(initialState, true));
    expect(titleField()!.value).toBe('Add a title');
    expect(state().diagram).toBeNull();
    act(() => titleField()!.focus());
    typeInto('Crane');
    act(() => titleField()!.blur());
    expect(state().diagram?.title).toBe('Crane');
  });

  it('is there with the title block off, since the title tab and the exports use the title too', () => {
    act(() => state().setDiagramTitleBlockShown(false));
    expect(rows().slice(0, 3)).toEqual(['Title', 'Title block', 'Title tab']);
    expect(titleField()!.disabled).toBe(false);
  });

  it('changes nothing on a read-only diagram', () => {
    act(() => useWorkspaceStore.setState({ diagramReadOnly: true }));
    expect(titleField()!.disabled).toBe(true);
  });
});

describe('DiagramPagePanel › the current page’s own count', () => {
  /** The Pages view, as far as the pane sees it: the one page it has on screen. */
  function PagesView({ page }: { page: number }) {
    usePublishPageInView({ middle: page, first: page, last: page, pressed: null });
    return null;
  }
  const showPage = (page: number) => {
    act(() => useWorkspaceStore.setState({ diagramView: 'pages' }));
    act(() =>
      root?.render(
        <TooltipProvider>
          <PagesView page={page} />
          <DiagramPagePanel />
        </TooltipProvider>
      )
    );
  };
  const field = () => host!.querySelector<HTMLInputElement>('input[aria-label^="Steps on page"]');
  const useDefault = () =>
    [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Use default');
  const firstSteps = () => {
    const steps = stepsOf(state().diagram!);
    return paginate(steps, state().diagram!.page).map((page) => ({
      size: page.steps.length,
      own: steps[page.steps[0]!]!.pageSteps ?? null,
    }));
  };
  /** Types `value` into the field and leaves it, as a commit. */
  const type = (value: string) => {
    const input = field()!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  };

  // “Add step” selects the step it adds: the last, on page 2. No title block unless a case asks for one.
  beforeEach(() =>
    act(() => {
      state().selectDiagramStep(null);
      state().setDiagramPage({ titleBlock: PAGE_SETTINGS.titleBlock.legacy });
    })
  );

  it('shows page 1 with nothing selected: what it is cut for, and that it is the default', () => {
    // Ten steps, nine a page by default.
    expect(field()?.getAttribute('aria-label')).toBe('Steps on page 1');
    expect(field()?.value).toBe('9');
    expect(host?.textContent).toContain('Default');
    expect(useDefault()).toBeUndefined();
  });

  it('gives the page its own count, one undo step and one count, and Use default takes it away', () => {
    const past = state().diagramHistory.past.length;
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Decrease Steps on page 1"]')!.click());
    expect(firstSteps()).toEqual([
      { size: 8, own: 8 },
      { size: 2, own: null },
    ]);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('page_steps');
    expect(field()?.value).toBe('8');
    expect(useDefault()).toBeDefined();
    // The default stays the diagram's.
    expect(state().diagram?.page.stepsPerPage).toBe(9);
    act(() => useDefault()!.click());
    expect(firstSteps()).toEqual([
      { size: 9, own: null },
      { size: 1, own: null },
    ]);
    expect(state().diagramHistory.past).toHaveLength(past + 2);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenLastCalledWith('page_steps_reset');
    expect(field()?.value).toBe('9');
    expect(useDefault()).toBeUndefined();
  });

  it('acts on the page in view in the Pages view while the selected step’s page is off screen', () => {
    act(() => state().selectDiagramStep(stepsOf(state().diagram!)[0]!.id));
    showPage(1);
    // The last page holds one step, laid out for the default's nine: typing 1 gives it the page to itself.
    expect(field()?.getAttribute('aria-label')).toBe('Steps on page 2');
    expect(field()?.value).toBe('9');
    type('1');
    // The page before keeps its size, as its own count.
    expect(firstSteps()).toEqual([
      { size: 9, own: 9 },
      { size: 1, own: 1 },
    ]);
    expect(field()?.value).toBe('1');
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('page_steps');
  });

  it('shows what the page is laid out for, and lays the last page out for any count it is given', () => {
    // The last page holds one step, laid out for the default's nine.
    showPage(1);
    expect(field()?.value).toBe('9');
    // One more: a page of ten's cells, its one step in the first, the page before held at its nine.
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Increase Steps on page 2"]')!.click());
    expect(firstSteps()).toEqual([
      { size: 9, own: 9 },
      { size: 1, own: 10 },
    ]);
    expect(field()?.value).toBe('10');
    // Fewer than the default: a page of six's cells, the number it then shows.
    type('6');
    expect(firstSteps()).toEqual([
      { size: 9, own: 9 },
      { size: 1, own: 6 },
    ]);
    expect(field()?.value).toBe('6');
  });

  it('keeps a count that holds a later page still, and says so where Use default would be', () => {
    // Page 2 given its one step: page 1 holds its nine as its own, for page 2's sake.
    act(() => state().setDiagramPageSteps(1, 1));
    expect(field()?.getAttribute('aria-label')).toBe('Steps on page 1');
    expect(useDefault()).toBeUndefined();
    expect(host?.textContent).toContain('Keeps later pages in place');
    showPage(1);
    expect(useDefault()).toBeDefined();
    expect(host?.textContent).not.toContain('Keeps later pages in place');
  });

  it('says why page 1 holds fewer under the title block, or how many turning it off adds to its own count (Zach, 2026-10-15)', () => {
    const blockHelp = () => field()!.closest('[data-field-row]')!.querySelector('[data-field-help]')?.getAttribute('aria-label');
    const block = (enabled: boolean) =>
      act(() => state().setDiagramPage({ titleBlock: { ...state().diagram!.page.titleBlock, enabled } }));
    block(true);
    // The default under the block, fewer than Steps per page shows: the row says why.
    const underBlock = firstPageCapacity(state().diagram!.page);
    expect(underBlock).toBeLessThan(state().diagram!.page.stepsPerPage);
    expect(field()?.value).toBe(String(underBlock));
    expect(blockHelp()).toBe(`The title block takes room on this page, so it holds ${underBlock} by default.`);
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Decrease Steps on page 1"]')!.click());
    // Its own count, one under the default: turning the block off gives it back what the block takes.
    expect(field()?.value).toBe(String(underBlock - 1));
    const takes = state().diagram!.page.stepsPerPage - underBlock;
    expect(blockHelp()).toBe(`Turning the title block off adds ${takes} to this count; later pages keep theirs and shift.`);
    // At 1, where the block took nothing off, it says what off adds all the same.
    act(() => state().setDiagramPageSteps(0, 1));
    expect(field()?.value).toBe('1');
    expect(blockHelp()).toBe(`Turning the title block off adds ${takes} to this count; later pages keep theirs and shift.`);
    // Page 2 says nothing of it, and nor does page 1 with the block off.
    showPage(1);
    expect(blockHelp()).toBeUndefined();
    showPage(0);
    block(false);
    expect(blockHelp()).toBeUndefined();
  });

  it('acts on the selected step’s page while no Pages view shows one', () => {
    act(() => state().selectDiagramStep(stepsOf(state().diagram!)[9]!.id));
    expect(field()?.getAttribute('aria-label')).toBe('Steps on page 2');
  });

  it('names the page by the number it prints', () => {
    act(() => state().setDiagramPage({ pageNumbers: { enabled: true, first: 5 } }));
    expect(field()?.getAttribute('aria-label')).toBe('Steps on page 5');
  });

  it('is the flow’s alone', () => {
    act(() => radio('Grid').click());
    expect(field()).toBeNull();
    expect(useDefault()).toBeUndefined();
  });

  it('changes nothing on a read-only diagram', () => {
    act(() => state().setDiagramPageSteps(0, 6));
    act(() => useWorkspaceStore.setState({ diagramReadOnly: true }));
    expect(field()?.disabled).toBe(true);
    expect(useDefault()?.disabled).toBe(true);
  });
});

describe('DiagramPagePanel › Packing', () => {
  /** The row whose label reads `label`. */
  const row = (label: string) =>
    [...host!.querySelectorAll<HTMLElement>('[data-field-row]')].find(
      (element) => element.querySelector('[data-field-label]')?.textContent === label
    );
  const readout = (label: string) => row(label)?.querySelector('[data-field-readout]')?.textContent;
  const slider = (label: string) => host!.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
  /** A drag of slider `label` through `values`, let go at the last. */
  const drag = (label: string, values: readonly string[]) => {
    const input = slider(label);
    for (const value of values) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };
  const button = (name: string) =>
    [...host!.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === name);
  /** The pages that hold their arrangements: one let go is kept, no longer held, until its page is packed again. */
  const stored = () => Object.keys(heldPageArrangements(state().diagram!));
  /** What a layout might have packed for each of the diagram's pages, as the Pages view adopts it. */
  const adoptPacking = () => {
    const document = state().diagram!;
    const slots = cellSlots(document);
    const packed: Record<string, DiagramPageArrangement> = Object.fromEntries(
      slots.pages.map((ids, page) => [
        ids[0]!,
        {
          signature: slots.signatures[page]!,
          k: 0.9,
          steps: Object.fromEntries(
            ids.map((id, at) => [id, { box: [12 + 30 * at, 30, 28, 50], scale: { frameMm: 24 }, band: 0 }] as const)
          ),
        },
      ])
    );
    act(() => {
      expect(state().adoptDiagramPageArrangements(packed, document as DiagramDocument)).toBe(true);
    });
  };

  // “Add step” selects the step it adds, on page 2: with none selected, the current page is page 1.
  beforeEach(() => act(() => state().selectDiagramStep(null)));

  // Closed until opened, as Edit's More foldability settings is (Zach, 12 Oct).
  beforeEach(() => {
    const disclosure = button('Packing')!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(row('Bands')).toBeUndefined();
    act(() => disclosure.click());
  });

  it('offers only the band counts every page can take: Auto, 3 and 5', () => {
    const labels = [...(host?.querySelectorAll<HTMLElement>('[role="group"][aria-label="Bands"] button') ?? [])].map(
      (element) => element.textContent
    );
    expect(labels).toEqual(['Auto', '3', '5']);
  });

  it('is the flow’s alone', () => {
    expect(host?.textContent).toContain('Packing');
    expect(row('Bands')).toBeDefined();
    act(() => radio('Grid').click());
    expect(host?.textContent).not.toContain('Packing');
    expect(row('Bands')).toBeUndefined();
    expect(button('Re-pack All Pages')).toBeUndefined();
  });

  it('shows Zach’s defaults: Auto preferring three bands at 0.5, steps in bends, nesting 0.8, steadiness 0.5', () => {
    expect(segment('Bands', 'Auto').getAttribute('aria-pressed')).toBe('true');
    expect(readout('Prefer three bands')).toBe('0.5');
    expect(toggle('Steps in bends').getAttribute('aria-checked')).toBe('true');
    expect(readout('Nesting')).toBe('0.8');
    expect(readout('Scale steadiness')).toBe('0.5');
    // Nothing to reset at a default.
    expect(host!.querySelector('[aria-label^="Reset Nesting"]')).toBeNull();
  });

  it('sets a band count, one undo step and one count, and offers Prefer three bands only while Bands is Auto', () => {
    const past = state().diagramHistory.past.length;
    act(() => segment('Bands', '3').click());
    expect(state().diagram?.page.flowBands).toBe(3);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('flow_bands');
    expect(row('Prefer three bands')).toBeUndefined();
    act(() => segment('Bands', 'Auto').click());
    expect(state().diagram?.page.flowBands).toBe('auto');
    expect(row('Prefer three bands')).toBeDefined();
  });

  it('writes a slider once, where it is let go: one store change, one undo step and one count', () => {
    const past = state().diagramHistory.past.length;
    const changes = diagramChanges();
    drag('Nesting', ['0.75', '0.6', '0.45']);
    expect(changes.count).toBe(1);
    expect(state().diagram?.page.flowNesting).toBe(0.45);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('flow_nesting');
    expect(readout('Nesting')).toBe('0.45');
    // Its reset puts the default back, as one more change.
    act(() => host!.querySelector<HTMLButtonElement>('[aria-label="Reset Nesting to default"]')!.click());
    expect(state().diagram?.page.flowNesting).toBe(0.8);
    expect(state().diagramHistory.past).toHaveLength(past + 2);
    changes.stop();
  });

  it('sets each of the other settings, one undo step and one count each', () => {
    const past = state().diagramHistory.past.length;
    drag('Prefer three bands', ['0.2']);
    expect(state().diagram?.page.flowPreferBands).toBe(0.2);
    drag('Scale steadiness', ['0.85']);
    expect(state().diagram?.page.flowSteadiness).toBe(0.85);
    act(() => toggle('Steps in bends').click());
    expect(state().diagram?.page.flowBendSteps).toBe(false);
    expect(state().diagramHistory.past).toHaveLength(past + 3);
    expect(analytics.trackDiagramPageSetupChanged.mock.calls).toEqual([
      ['flow_prefer_bands'],
      ['flow_steadiness'],
      ['flow_bend_steps'],
    ]);
  });

  it('re-packs the current page, or every page, each one undo step and one count', () => {
    // Before the pages are packed and taken in, offered all the same: there is nothing to let go, and nothing happens.
    expect(button('Re-pack Page')?.disabled).toBe(false);
    expect(button('Re-pack All Pages')?.disabled).toBe(false);
    const unpacked = state().diagramHistory.past.length;
    act(() => button('Re-pack Page')!.click());
    act(() => button('Re-pack All Pages')!.click());
    expect(state().diagramHistory.past).toHaveLength(unpacked);
    expect(analytics.trackDiagramPagesRepacked).not.toHaveBeenCalled();
    adoptPacking();
    const [first, second] = stored();
    expect(stored()).toHaveLength(2);
    const past = state().diagramHistory.past.length;
    act(() => button('Re-pack Page')!.click());
    expect(stored()).toEqual([second]);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenCalledExactlyOnceWith('page', 'page_pane');
    // The page lets its arrangement go, and the button stays as it was, keeping focus: pressed again before the pages
    // are laid out, it has nothing more to let go.
    expect(button('Re-pack Page')?.disabled).toBe(false);
    act(() => button('Re-pack Page')!.click());
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    act(() => button('Re-pack All Pages')!.click());
    expect(stored()).toEqual([]);
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenLastCalledWith('all', 'page_pane');
    // Undo brings each back.
    act(() => state().undoDiagram());
    expect(stored()).toEqual([second]);
    act(() => state().undoDiagram());
    expect(stored()).toEqual([first, second]);
  });

  it('changes nothing on a read-only diagram', () => {
    adoptPacking();
    act(() => useWorkspaceStore.setState({ diagramReadOnly: true }));
    expect(slider('Nesting').disabled).toBe(true);
    expect(button('Re-pack Page')?.disabled).toBe(true);
    expect(button('Re-pack All Pages')?.disabled).toBe(true);
    act(() => segment('Bands', '5').click());
    expect(state().diagram?.page.flowBands).toBe('auto');
    expect(analytics.trackDiagramPageSetupChanged).not.toHaveBeenCalled();
  });
});
