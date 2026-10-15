import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_SETTINGS, setPageSetup, type DiagramPageSetup } from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { emptyStep, patternStep, titleBlockDiagram } from '../../diagram/pages/titleBlock.fixtures';
import { TITLE_BLOCK_BYLINE_LINES } from '../../diagram/pages/titleBlockGeometry';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramTitleBlockSection } from './DiagramTitleBlockSection';

const analytics = vi.hoisted(() => ({ trackDiagramPageSetupChanged: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));
/** What the selects offer, as built, watched for when it is worked out. */
const choices = vi.hoisted(() => ({ titleBlockChoices: vi.fn() }));
vi.mock('../../diagram/pages/titleBlockChoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../diagram/pages/titleBlockChoices')>();
  choices.titleBlockChoices.mockImplementation(actual.titleBlockChoices);
  return { ...actual, ...choices };
});

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

/**
 * Steps 1 and 2 linked to one pattern, step 3 to another, step 4 empty: the
 * model offers 1–3, the pattern 2 and 3. Installed as a file would be.
 */
function install(
  page: Partial<DiagramPageSetup> = {},
  readOnly = false,
  steps = [cpStep('s1'), cpStep('s2'), patternStep('s3'), emptyStep('s4')]
) {
  const document = setPageSetup(titleBlockDiagram(steps), {
    layout: 'flow',
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    ...page,
  });
  act(() => state().installDiagram({ document, readOnly, raw: {} }));
}

const toggle = () => host!.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Show on first page"]')!;
const select = (label: string) => host!.querySelector<HTMLButtonElement>(`button[role="combobox"][aria-label="${label}"]`);
const byline = () => host!.querySelector<HTMLTextAreaElement>('textarea');
/** The note a select is described by, and whether it is a reason; null with none. */
function noteOf(label: string) {
  const id = select(label)!.getAttribute('aria-describedby');
  const note = id ? document.getElementById(id) : null;
  return note ? { text: note.textContent, reason: note.dataset.fieldNote === 'reason' } : null;
}

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

  it('works out what the selects offer only while the first page has the block, as an old file has not', () => {
    install();
    render();
    act(() => state().setDiagramTitleBlockContent({ byline: 'Design: Lang' }));
    expect(choices.titleBlockChoices).not.toHaveBeenCalled();
    act(() => toggle().click());
    expect(choices.titleBlockChoices).toHaveBeenCalled();
  });

  it('names the switch by what it does, not again by its section, and says what each select’s Auto follows', () => {
    install({ titleBlock: ON });
    render();
    const group = host!.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Title block');
    expect(group?.querySelector('button[role="switch"]')?.getAttribute('aria-label')).toBe('Show on first page');
    const helpOf = (label: string) =>
      select(label)!.closest('[data-field-row]')!.querySelector('[data-field-help]')?.getAttribute('aria-label');
    expect(helpOf('Model')).toBe('The finished model, drawn from a step’s picture. Auto uses the last step with one.');
    expect(helpOf('Crease pattern')).toBe(
      'Drawn from the crease pattern a step links. Auto uses the last linked step; each pattern is listed once, by the last step that links it.'
    );
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
    install({ titleBlock: ON }, false, [emptyStep('s1'), emptyStep('s2')]);
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
    // The select names the step, whole; why it shows nothing is the row's note, read with it, as the Pages view says it.
    expect(select('Model')!.textContent).toBe('Step 1');
    expect(noteOf('Model')).toEqual({ text: 'Step 1 has no picture yet', reason: true });
    expect(optionsOf('Model')).toEqual(['Auto (step 3)', 'Step 1', 'Step 2', 'Step 3', 'None']);
    act(() => state().setDiagramTitleBlockContent({ model: { kind: 'step', stepId: 's2' } }));
    expect(noteOf('Model')).toBeNull();
  });

  it('says how many of the byline’s lines print, as the page cuts them', () => {
    install({ titleBlock: ON });
    render();
    const help = byline()!.parentElement!.querySelector('[data-field-help]');
    expect(help?.getAttribute('aria-label')).toBe(
      `Credits under the title, as you write them. Up to ${TITLE_BLOCK_BYLINE_LINES} lines print; a long line wraps onto the next.`
    );
  });

  it('offers no linked step whose pattern draws nothing, and names one chosen as the page’s overlay does', () => {
    const blank = patternStep('s2', []);
    install({ titleBlock: ON }, false, [cpStep('s1'), blank]);
    render();
    expect(optionsOf('Crease pattern')).toEqual(['Auto (step 1)', 'Step 1', 'None']);
    act(() => state().setDiagramTitleBlockContent({ pattern: { kind: 'step', stepId: 's2' } }));
    expect(select('Crease pattern')!.textContent).toBe('Step 2');
    expect(noteOf('Crease pattern')).toEqual({ text: 'Step 2 has no crease pattern', reason: true });
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
