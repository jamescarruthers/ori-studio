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
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { DiagramStepPlacement } from './DiagramStepPlacement';

/**
 * Whether the pages put the step shown past the margin, as the Diagram panel
 * publishes its layout; and the diagram they are laid out from, when it is
 * not the one in the store — a layout of a newer one under way.
 */
const printed = vi.hoisted(() => ({ outsideMargin: false, of: undefined as DiagramDocument | undefined }));
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
              ...(printed.outsideMargin ? { outsideMargin: true } : {}),
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
 * The selected step's placement under the Layers list: its size, offsets and
 * caption width, and the one notice a placement gets — a part past the
 * margin. No overlap, symbol or path notice, and no offer of a new page
 * (Zach, 2026-10-12).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();
const offer = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.endsWith('on a new page')
  );

/** Ten steps on flow pages of 4. */
function install() {
  const steps = Array.from({ length: 10 }, (_, index): DiagramStep => cpStep(`s${index}`));
  const diagram = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 4,
  });
  state().installDiagram({ document: diagram, readOnly: false, raw: {} });
}

function show(stepId: string, outsideMargin = false) {
  printed.outsideMargin = outsideMargin;
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

describe('DiagramStepPlacement › what it says of the placement (Zach, 2026-10-12)', () => {
  it('says a part past the margin — or past the paper’s edge, which the pages mark the same — and nothing else', () => {
    show('s1', true);
    const notices = [...host!.querySelectorAll('[data-placement-notice]')];
    expect(notices.map((notice) => notice.textContent)).toEqual(['Part of this step crosses the margin.']);
    expect(notices[0]!.closest('[role="status"]')).not.toBeNull();
    // No offer of a new page: Start a New Page Here is in the step's menu.
    expect(offer()).toBeUndefined();
  });

  it('says nothing of a step inside the margin, whatever it lies over: the page shows that as it prints', () => {
    for (const id of ['s0', 's1', 's5']) {
      show(id, false);
      expect(host!.querySelector('[data-placement-notice]'), id).toBeNull();
      expect(host!.querySelector('[role="status"]'), id).toBeNull();
      expect(host!.textContent, id).not.toMatch(/overlap|path|new page|paper/i);
      expect(offer(), id).toBeUndefined();
    }
  });
});

describe('DiagramStepPlacement › the part selected', () => {
  const field = (label: string) => host!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const button = (name: string) =>
    [...host!.querySelectorAll<HTMLButtonElement>('button')].find((each) => each.textContent === name);
  /** A row's reset, by its name: there only while it has something to reset. */
  const reset = (name: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

  it('offers X and Y of the frame with the step selected alone, and of a part once one is, and resets that part', () => {
    act(() => {
      state().setDiagramView('pages');
      state().selectDiagramStep('s1');
      state().setDiagramStepPlace('s1', { picture: [2, 3] });
    });
    show('s1');
    expect([field('X (mm)').value, field('Y (mm)').value]).toEqual(['0', '0']);
    expect(reset('Reset Frame')).toBeNull();
    expect(reset('Reset Picture')).toBeNull();
    // No Select buttons: the Layers list's rows select the part.
    expect(button('Select')).toBeUndefined();
    act(() => state().selectDiagramPagesPart('picture'));
    show('s1');
    expect([field('X (mm)').value, field('Y (mm)').value]).toEqual(['2', '3']);
    // Its reset sits before X and Y, so neither moves as it comes and goes.
    const position = reset('Reset Picture')!.closest('[data-field-row]')!;
    expect(position.querySelector('[data-field-value] > :first-child')).toBe(reset('Reset Picture'));
    act(() => reset('Reset Picture')!.click());
    expect(stepById(state().diagram!, 's1')!.place).toBeUndefined();
    show('s1');
    expect(reset('Reset Picture')).toBeNull();
  });
});

describe('DiagramStepPlacement › the text’s width (`diagram-caption-resize.md`)', () => {
  const LONG = 'Valley fold the flaps inward. Note that the top of each crease does not line up with the top corner of the paper';
  const width = () => host!.querySelector<HTMLInputElement>('input[aria-label="Text width (mm)"]');
  const reset = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Reset Width to default"]');
  /** The text's own reset, its offset and its width: on the Position row. */
  const resetText = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Reset Text"]');
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
    show('s1');
    expect(width()).toBeNull();
    act(() => state().selectDiagramPagesPart('text'));
    show('s1');
    expect(width()!.value).toBe('36');
    expect(host!.textContent).toContain('Auto: 36.0 mm');
    expect(reset()).toBeNull();
    expect(resetText()).toBeNull();
    // Typed: pinned, and counted as the pane's; Reset Text now has something to take back.
    type(width()!, '62.5');
    expect(placeOf()).toEqual({ textWidth: 62.5 });
    show('s1');
    expect(width()!.value).toBe('62.5');
    expect(host!.textContent).toContain('Auto: 36.0 mm');
    expect(reset()).not.toBeNull();
    expect(resetText()?.disabled).toBe(false);
    // Typed as the automatic width, the pin goes; so does its reset.
    type(width()!, '36');
    expect(placeOf()).toBeUndefined();
    show('s1');
    expect(reset()).toBeNull();
    // Pinned again, the row's reset lets the width go and keeps the caption's offset.
    act(() => state().setDiagramStepPlace('s1', { textWidth: 50, text: [2, 0] }));
    show('s1');
    act(() => reset()!.click());
    expect(placeOf()).toEqual({ text: [2, 0] });
    // Reset Text takes both.
    act(() => state().setDiagramStepPlace('s1', { textWidth: 50 }));
    show('s1');
    act(() => resetText()!.click());
    expect(placeOf()).toBeUndefined();
  });

  it('holds a typed width to the caption’s widest word and the page’s width', () => {
    act(() => {
      state().setDiagramView('pages');
      state().setDiagramStepText('s1', LONG);
      state().selectDiagramStep('s1');
      state().selectDiagramPagesPart('text');
    });
    show('s1');
    type(width()!, '1');
    expect(placeOf()!.textWidth).toBeGreaterThan(9);
    show('s1');
    type(width()!, '5000');
    expect(placeOf()!.textWidth).toBe(210 - 2 * state().diagram!.page.marginMm);
  });

  it('shows no width for a caption with no text', () => {
    act(() => {
      state().setDiagramView('pages');
      state().selectDiagramStep('s1');
      state().selectDiagramPagesPart('text');
    });
    show('s1');
    expect(width()).toBeNull();
  });
});

describe('DiagramStepPlacement › while the pages lay out (review finding U8)', () => {
  const size = () => host!.querySelector<HTMLInputElement>('input[aria-label="Size (mm)"]')!;
  const offsetX = () => host!.querySelector<HTMLInputElement>('input[aria-label="X (mm)"]')!;

  it('keeps the step’s last cell while a layout of a newer diagram is under way', () => {
    show('s1');
    const laidOut = size().value;
    expect(laidOut).not.toBe('');
    expect(laidOut).not.toBe('0');
    // An edit: the pages are still the last diagram's.
    printed.of = state().diagram!;
    act(() => state().setDiagramStepText('s1', 'Fold in half.'));
    show('s1');
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
    show(added);
    expect(size().value).toBe('');
    expect(size().disabled).toBe(true);
  });
});
