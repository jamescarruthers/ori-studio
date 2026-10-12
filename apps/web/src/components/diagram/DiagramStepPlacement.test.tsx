import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  stepById,
  type DiagramDocument,
  type DiagramStep,
} from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import type { PlacementClash } from '../../diagram/pages/pagePlacement';
import { newPageHelps } from '../../diagram/pages/useStepPlacement';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramStepPlacement } from './DiagramStepPlacement';

/**
 * The clashes the pages give the step shown, as the Diagram panel publishes
 * its layout; and the diagram they are laid out from, when it is not the one
 * in the store — a layout of a newer one under way.
 */
const printed = vi.hoisted(() => ({ clashes: [] as PlacementClash[], of: undefined as DiagramDocument | undefined }));
/** The measure the mocked layout sets a caption with no pin at, mm. */
const AUTO_TEXT_MM = vi.hoisted(() => 36);
vi.mock('../../diagram/pages/printedFrames', async (importOriginal) => {
  const { useWorkspaceStore: store } = await import('../../store/workspaceStore');
  const { stepsOf } = await import('../../diagram/document/diagramDocument');
  const { estimateTextSetter: setter } = await import('../../diagram/pages/estimateTextSetter');
  const { printPaper } = await import('../../diagram/pages/printPaper');
  return {
    ...(await importOriginal<typeof import('../../diagram/pages/printedFrames')>()),
    // One page holding every step, laid out from the diagram as it is: each caption at its pin, else 36 mm.
    usePrintedLayout: () => {
      const document = printed.of ?? store.getState().diagram;
      const cells = document
        ? stepsOf(document).map((step, index) => {
            const widthMm = step.place?.textWidth ?? AUTO_TEXT_MM;
            return {
              stepId: step.id,
              number: index + 1,
              frameMm: 40,
              mmPerUnit: null,
              pictureMm: { x: 0, y: 0, size: 40 },
              clashes: printed.clashes,
              text: { x: 0, firstBaseline: 50, widthMm, lines: setter.paragraph(step.text, widthMm, 3.2, 99).lines },
              ...(step.place?.textWidth !== undefined
                ? {
                    placed: {
                      offsets: step.place,
                      pin: null,
                      auto: { mmPerUnit: null, frameMm: 40, drawMm: { x: 0, y: 0, w: 40, h: 40 }, textWidthMm: AUTO_TEXT_MM },
                    },
                  }
                : {}),
            };
          })
        : [];
      return { pages: { setter, layout: { paper: printPaper(document!.page), pages: [{ cells }] } }, document };
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
  printed.of = undefined;
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

describe('DiagramStepPlacement › the part selected', () => {
  const field = (label: string) => host!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const button = (name: string) =>
    [...host!.querySelectorAll<HTMLButtonElement>('button')].find((each) => each.textContent === name);

  it('offers X and Y of the frame with the step selected alone, and of a part once one is, and resets that part', () => {
    act(() => {
      state().setDiagramView('pages');
      state().selectDiagramStep('s1');
      state().setDiagramStepPlace('s1', { picture: [2, 3] });
    });
    show('s1', []);
    expect([field('X (mm)').value, field('Y (mm)').value]).toEqual(['0', '0']);
    expect(button('Reset Frame')?.disabled).toBe(true);
    expect(button('Reset Picture')).toBeUndefined();
    // No Select buttons: the Layers list's rows select the part.
    expect(button('Select')).toBeUndefined();
    act(() => state().selectDiagramPagesPart('picture'));
    show('s1', []);
    expect([field('X (mm)').value, field('Y (mm)').value]).toEqual(['2', '3']);
    act(() => button('Reset Picture')!.click());
    expect(stepById(state().diagram!, 's1')!.place).toBeUndefined();
    show('s1', []);
    expect(button('Reset Picture')?.disabled).toBe(true);
    expect(button('Reset Layout')?.disabled).toBe(true);
  });
});

describe('DiagramStepPlacement › the text’s width (`diagram-caption-resize.md`)', () => {
  const LONG = 'Valley fold the flaps inward. Note that the top of each crease does not line up with the top corner of the paper';
  const width = () => host!.querySelector<HTMLInputElement>('input[aria-label="Text width (mm)"]');
  const reset = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Reset Text width (mm) to default"]');
  const button = (name: string) => [...host!.querySelectorAll<HTMLButtonElement>('button')].find((each) => each.textContent === name);
  const type = (input: HTMLInputElement, value: string) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      input.focus();
      set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.blur());
  };
  const placeOf = () => stepById(state().diagram!, 's1')!.place;

  it('offers the caption’s width with its text selected, Auto beside it, a reset only while pinned, and sets and lets it go', () => {
    act(() => {
      state().setDiagramView('pages');
      state().setDiagramStepText('s1', LONG);
      state().selectDiagramStep('s1');
      state().selectDiagramPagesPart('picture');
    });
    show('s1', []);
    expect(width()).toBeNull();
    act(() => state().selectDiagramPagesPart('text'));
    show('s1', []);
    expect(width()!.value).toBe('36');
    expect(host!.textContent).toContain('Auto: 36.0 mm');
    expect(reset()).toBeNull();
    expect(button('Reset Text')?.disabled).toBe(true);
    // Typed: pinned, and counted as the pane's; Reset Text now has something to take back.
    type(width()!, '62.5');
    expect(placeOf()).toEqual({ textWidth: 62.5 });
    show('s1', []);
    expect(width()!.value).toBe('62.5');
    expect(host!.textContent).toContain('Auto: 36.0 mm');
    expect(reset()).not.toBeNull();
    expect(button('Reset Text')?.disabled).toBe(false);
    // Typed as the automatic width, the pin goes; so does its reset.
    type(width()!, '36');
    expect(placeOf()).toBeUndefined();
    show('s1', []);
    expect(reset()).toBeNull();
    // Pinned again, the row's reset lets the width go and keeps the caption's offset.
    act(() => state().setDiagramStepPlace('s1', { textWidth: 50, text: [2, 0] }));
    show('s1', []);
    act(() => reset()!.click());
    expect(placeOf()).toEqual({ text: [2, 0] });
    // Reset Text takes both.
    act(() => state().setDiagramStepPlace('s1', { textWidth: 50 }));
    show('s1', []);
    act(() => button('Reset Text')!.click());
    expect(placeOf()).toBeUndefined();
  });

  it('holds a typed width to the caption’s widest word and the page’s width', () => {
    act(() => {
      state().setDiagramView('pages');
      state().setDiagramStepText('s1', LONG);
      state().selectDiagramStep('s1');
      state().selectDiagramPagesPart('text');
    });
    show('s1', []);
    type(width()!, '1');
    expect(placeOf()!.textWidth).toBeGreaterThan(9);
    show('s1', []);
    type(width()!, '5000');
    expect(placeOf()!.textWidth).toBe(210 - 2 * state().diagram!.page.marginMm);
  });

  it('shows no width for a caption with no text', () => {
    act(() => {
      state().setDiagramView('pages');
      state().selectDiagramStep('s1');
      state().selectDiagramPagesPart('text');
    });
    show('s1', []);
    expect(width()).toBeNull();
  });
});

describe('DiagramStepPlacement › while the pages lay out (review finding U8)', () => {
  const size = () => host!.querySelector<HTMLInputElement>('input[aria-label="Size (mm)"]')!;
  const offsetX = () => host!.querySelector<HTMLInputElement>('input[aria-label="X (mm)"]')!;

  it('keeps the step’s last cell while a layout of a newer diagram is under way', () => {
    show('s1', []);
    const laidOut = size().value;
    expect(laidOut).not.toBe('');
    expect(laidOut).not.toBe('0');
    // An edit: the pages are still the last diagram's.
    printed.of = state().diagram!;
    act(() => state().setDiagramStepText('s1', 'Fold in half.'));
    show('s1', []);
    expect(size().value).toBe(laidOut);
    expect(size().disabled).toBe(false);
    expect(offsetX().disabled).toBe(false);
  });

  it('shows a step the pages have not laid out yet with an empty size, not 0', () => {
    printed.of = state().diagram!;
    let added = '';
    act(() => {
      added = state().addDiagramStep()!;
    });
    show(added, []);
    expect(size().value).toBe('');
    expect(size().disabled).toBe(true);
  });
});
