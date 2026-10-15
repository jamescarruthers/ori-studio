import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import {
  PAGE_SETTINGS,
  createDiagram,
  createStep,
  insertSteps,
  setPageSetup,
  type DiagramPageSetup,
  type DiagramStep,
} from '../../diagram/document/diagramDocument';
import { cpSource, cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { TITLE_BLOCK_BYLINE_LINES } from '../../diagram/pages/titleBlockGeometry';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramTitleBlockSection } from './DiagramTitleBlockSection';

const analytics = vi.hoisted(() => ({ trackDiagramPageSetupChanged: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

/**
 * The Page pane's Title block section (`implementation-plans/diagram-title-block.md`,
 * section 7): the toggle a page setting, what the block shows set one part at a
 * time — each one undo step and one count — and only what the block can show
 * offered, each select naming what Auto finds.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ON = { enabled: true, heightShare: PAGE_SETTINGS.titleBlock.default.heightShare };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();
const undoSteps = () => state().diagramHistory.past.length;

const empty = (id: string) => createStep(() => id);
/** A step linked to another pattern than `cpStep`'s: a valley across it. */
function otherPattern(id: string): DiagramStep {
  const thumbnail: SheetThumbnail = { viewBox: '0 0 100 100', strokes: [{ x1: 0, y1: 0, x2: 100, y2: 100, role: 'valley' }] };
  return { ...cpStep(id), source: { ...cpSource(), thumbnail } };
}

/**
 * Steps 1 and 2 linked to one pattern, step 3 to another, step 4 empty: the
 * model offers 1–3, the pattern 2 and 3. Installed as a file would be.
 */
function install(
  page: Partial<DiagramPageSetup> = {},
  readOnly = false,
  steps = [cpStep('s1'), cpStep('s2'), otherPattern('s3'), empty('s4')]
) {
  const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    ...page,
  });
  act(() => state().installDiagram({ document, readOnly, raw: {} }));
}

const toggle = () => host!.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Title block"]')!;
const select = (label: string) => host!.querySelector<HTMLButtonElement>(`button[role="combobox"][aria-label="${label}"]`);
const byline = () => host!.querySelector<HTMLTextAreaElement>('textarea');

/** The options a select offers, opened from the keyboard as a reader would. */
function optionsOf(label: string): string[] {
  act(() => select(label)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((option) => option.textContent ?? '');
  act(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  return options;
}

function choose(label: string, option: string) {
  act(() => select(label)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const found = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((each) => each.textContent === option);
  if (!found) throw new Error(`no ${option} in ${label}`);
  act(() => found.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
}

const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
function type(text: string) {
  act(() => {
    setValue.call(byline()!, text);
    byline()!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

const render = () =>
  act(() =>
    root?.render(
      <TooltipProvider>
        <DiagramTitleBlockSection />
      </TooltipProvider>
    )
  );

describe('DiagramTitleBlockSection', () => {
  it('turns the block on as a page setting, one undo step and one count, and shows what it holds only then', () => {
    install();
    render();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(select('Model')).toBeNull();
    expect(byline()).toBeNull();
    act(() => toggle().click());
    expect(state().diagram!.page.titleBlock).toEqual(ON);
    expect(undoSteps()).toBe(1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('title_block');
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(select('Model')).not.toBeNull();
    expect(select('Crease pattern')).not.toBeNull();
    expect(byline()).not.toBeNull();
    act(() => toggle().click());
    expect(state().diagram!.page.titleBlock).toEqual({ ...ON, enabled: false });
    expect(select('Model')).toBeNull();
  });

  it('offers the steps with a picture for the model and each linked pattern once, each select naming what Auto finds', () => {
    install({ titleBlock: ON });
    render();
    expect(optionsOf('Model')).toEqual(['Auto (step 3)', 'Step 1', 'Step 2', 'Step 3', 'None']);
    // Steps 1 and 2 link one pattern: offered once, by the last of them.
    expect(optionsOf('Crease pattern')).toEqual(['Auto (step 3)', 'Step 2', 'Step 3', 'None']);
    expect(select('Model')!.textContent).toBe('Auto (step 3)');
  });

  it('says Auto finds nothing where no step has a picture or a link, and offers nothing else but None', () => {
    install({ titleBlock: ON }, false, [empty('s1'), empty('s2')]);
    render();
    expect(optionsOf('Model')).toEqual(['Auto (no pictures)', 'None']);
    expect(optionsOf('Crease pattern')).toEqual(['Auto (none linked)', 'None']);
  });

  it('sets where each part comes from, one undo step and one count of the kind each, never which step', () => {
    install({ titleBlock: ON });
    render();
    choose('Model', 'Step 1');
    expect(state().diagram!.titleBlockContent).toEqual({ model: { kind: 'step', stepId: 's1' } });
    expect(select('Model')!.textContent).toBe('Step 1');
    choose('Crease pattern', 'None');
    choose('Model', 'Auto (step 3)');
    expect(state().diagram!.titleBlockContent).toEqual({ pattern: { kind: 'none' } });
    expect(undoSteps()).toBe(3);
    expect(analytics.trackDiagramPageSetupChanged.mock.calls).toEqual([
      ['title_block_model', { titleBlockChoice: 'step' }],
      ['title_block_pattern', { titleBlockChoice: 'none' }],
      ['title_block_model', { titleBlockChoice: 'auto' }],
    ]);
  });

  it('names a chosen step that has lost its picture, as what the model is set to', () => {
    install({ titleBlock: ON });
    act(() => state().setDiagramTitleBlockContent({ model: { kind: 'step', stepId: 's1' } }));
    act(() => state().removeDiagramStepPicture('s1'));
    render();
    expect(select('Model')!.textContent).toBe('Step 1 (no picture)');
    expect(optionsOf('Model')).toEqual(['Auto (step 3)', 'Step 1 (no picture)', 'Step 2', 'Step 3', 'None']);
  });

  it('says how many of the byline’s lines print, as the page cuts them', () => {
    install({ titleBlock: ON });
    render();
    const help = byline()!.parentElement!.querySelector('[data-field-help]');
    expect(help?.getAttribute('aria-label')).toBe(
      `Credits under the title, as you write them. Up to ${TITLE_BLOCK_BYLINE_LINES} lines print; a long line wraps onto the next.`
    );
  });

  it('commits the byline as it is typed: a sitting at the field one undo step and one count', () => {
    vi.useFakeTimers();
    install({ titleBlock: ON });
    render();
    act(() => byline()!.focus());
    type('Design');
    // A pause in typing commits.
    act(() => vi.advanceTimersByTime(1000));
    expect(state().diagram!.titleBlockContent?.byline).toBe('Design');
    type('Design: Lang\nPaper: 35 cm');
    act(() => byline()!.blur());
    expect(state().diagram!.titleBlockContent?.byline).toBe('Design: Lang\nPaper: 35 cm');
    expect(undoSteps()).toBe(1);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledExactlyOnceWith('title_block_byline');
    // Another sitting counts again.
    act(() => byline()!.focus());
    type('Design: Robert Lang');
    act(() => byline()!.blur());
    expect(undoSteps()).toBe(2);
    expect(analytics.trackDiagramPageSetupChanged).toHaveBeenCalledTimes(2);
  });

  it('cannot be turned on in a grid of one row, and says why', () => {
    install({ layout: 'grid', rows: 1, titleBlock: ON });
    render();
    expect(toggle().disabled).toBe(true);
    // The setting is on, but the page has no block: the switch says what the page has.
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    const note = document.getElementById(toggle().getAttribute('aria-describedby')!);
    expect(note?.textContent).toBe('Needs two rows or more');
    expect(select('Model')).toBeNull();
    act(() => state().setDiagramPage({ rows: 2 }));
    expect(toggle().disabled).toBe(false);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toggle().hasAttribute('aria-describedby')).toBe(false);
  });

  it('takes nothing on a read-only diagram', () => {
    install({ titleBlock: ON }, true);
    render();
    expect(toggle().disabled).toBe(true);
    expect(select('Model')!.disabled).toBe(true);
    expect(select('Crease pattern')!.disabled).toBe(true);
    expect(byline()!.disabled).toBe(true);
  });
});
