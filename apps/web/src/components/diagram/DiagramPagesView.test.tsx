import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { act, useEffect, useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { handleShortcutRuntimeKeyDown } from '../../keyboard/shortcutRuntime';
import { useDiagramShortcuts } from '../../diagram/useDiagramShortcuts';
import {
  createDiagram,
  createStep,
  createTurn,
  insertSteps,
  type DiagramDocument,
  type KnownDiagramAnnotation,
} from '../../diagram/document/diagramDocument';
import { cpStep, stepsIn } from '../../diagram/document/diagramSteps.fixtures';
import { DIAGRAM_FONT_FAMILY, type DiagramFontKey, type DiagramFontWeight } from '../../diagram/fonts/diagramFontFaces';
import type { DiagramFonts } from '../../diagram/fonts/diagramFonts';
import { readFontMetrics } from '../../diagram/fonts/fontMetrics';
import { createFontSubsetter, type FontSubsetter } from '../../diagram/fonts/fontSubset';
import { bandPath } from '../../diagram/pages/composeDiagramPage';
import { preparedPages, type PreparedDiagramPages } from '../../diagram/pages/diagramPages';
import { overflowingDiagram } from '../../diagram/pages/pageOverflow.fixtures';
import { usePageInView, type PagesInView } from '../../diagram/pages/pageInView';
import { PAGES_PX_PER_MM as PX_PER_MM } from '../../diagram/pages/usePagesView';
import { clearPathColorPick, publishPathColorPick } from '../../diagram/pages/pathColorPick';
import { TooltipProvider } from '../ui/Tooltip';
import { focusLeavesEnterToSteps, focusOwnsArrowKeys } from '../../diagram/actions/diagramShortcuts';
import { DiagramPagesView } from './DiagramPagesView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FONT_DIR = resolve(process.cwd(), 'src/diagram/fonts');
const FONTS: DiagramFonts = {
  font(key: DiagramFontKey, weight: DiagramFontWeight) {
    if (key !== 'latin') return null;
    const bytes = new Uint8Array(readFileSync(resolve(FONT_DIR, weight === 700 ? 'NotoSans-Bold.ttf' : 'NotoSans-Regular.ttf')));
    return { key, weight, family: DIAGRAM_FONT_FAMILY.latin, tier: 'bundled', bytes, metrics: readFontMetrics(bytes) };
  },
  unavailable: [],
};

let subsetter: FontSubsetter;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  subsetter = await createFontSubsetter(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')));
});

const LONG = 'Fold the corner up and crease it firmly. '.repeat(12);

function diagram(): DiagramDocument {
  return insertSteps(
    createDiagram({ title: 'Crane' }),
    [cpStep('step-a'), { ...createStep(() => 'step-empty'), text: 'Nothing yet.' }, { ...cpStep('step-long'), text: LONG }],
    0
  );
}

/**
 * The diagram on a grid, whose cells cut an instruction too long for them —
 * a flow page's box holds its caption whole (`diagram-flow-packing.md`).
 */
function onGrid(document: DiagramDocument): DiagramDocument {
  return { ...document, page: { ...document.page, layout: 'grid' } };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(
  pages: PreparedDiagramPages,
  handlers: Partial<Record<'onSelect' | 'onPageClick', () => void>> = {},
  pathColor = pages.layout.bandInk,
  document = diagram(),
  selectedStepId: string | null = 'step-a'
) {
  const props = { onSelect: vi.fn(), onPageClick: vi.fn(), ...handlers };
  act(() =>
    root.render(
      <TooltipProvider>
        <DiagramPagesView
          pages={pages}
          failed={false}
          steps={stepsIn(document)}
          selectedStepId={selectedStepId}
          pathColor={pathColor}
          fitKey="test"
          {...props}
        />
      </TooltipProvider>
    )
  );
  return props;
}

const cells = () => [...host.querySelectorAll<HTMLElement>('[role="option"][data-step-id]')];
/** The SVG an image shows, from its `data:` URL. */
const svgOf = (image: HTMLImageElement) => Buffer.from(image.src.split(',')[1]!, 'base64').toString('utf8');

describe('DiagramPagesView', () => {
  it('shows each page as its composed image, named and captioned, and says which page is in view', () => {
    render(preparedPages(diagram(), FONTS, subsetter));
    const page = host.querySelector<HTMLElement>('[role="group"][data-page="0"]')!;
    expect(page.getAttribute('aria-label')).toBe('Page 1');
    expect(page.querySelector('img')?.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(host.textContent).toContain('Page 1 of 1');
    // The pager: one page, so neither way goes anywhere.
    const turn = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    expect(turn('Previous Page')?.disabled).toBe(true);
    expect(turn('Next Page')?.disabled).toBe(true);
  });

  it('draws the flow band under the page’s image, which leaves it out, and a colour being picked repaints the band alone', () => {
    const pages = preparedPages(diagram(), FONTS, subsetter);
    const lane = pages.layout.pages[0]!.band!;
    // The file draws the band; the image on screen is the file without it.
    const file = pages.compose(0).svg;
    expect(file).toContain(`<path d="${bandPath(lane)}"`);
    const compose = vi.spyOn(pages, 'compose');
    render(pages, {}, '#ecece8');
    const page = host.querySelector<HTMLElement>('[data-page="0"]')!;
    const image = page.querySelector('img')!;
    const art = svgOf(image);
    expect(art).not.toContain(bandPath(lane));
    expect(art).toBe(pages.compose(0, { band: false }).svg);
    const band = page.querySelector('[data-page-band] path')!;
    expect(band.getAttribute('d')).toBe(bandPath(lane));
    expect(band.getAttribute('stroke')).toBe('#ecece8');
    // Under the image, as the file draws it first.
    expect(page.querySelector('[data-page-band]')!.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const composed = compose.mock.calls.length;
    const src = image.src;
    for (const color of ['#d0e0f0', '#c0d8f0', '#b0d0f0']) {
      act(() => publishPathColorPick(color));
      expect(band.getAttribute('stroke')).toBe(color);
    }
    expect(page.querySelector('img')!.src).toBe(src);
    expect(compose.mock.calls.length).toBe(composed);
    // Written and dropped: the diagram's colour, still no page composed.
    render(pages, {}, '#b0d0f0');
    act(() => clearPathColorPick());
    expect(band.getAttribute('stroke')).toBe('#b0d0f0');
    expect(page.querySelector('img')!.src).toBe(src);
    expect(compose.mock.calls.length).toBe(composed);
  });

  it('lays the steps over the page as one listbox, the selected one marked and the tab stop', () => {
    render(preparedPages(onGrid(diagram()), FONTS, subsetter));
    expect(host.querySelector('[role="listbox"]')?.hasAttribute('data-diagram-steps')).toBe(true);
    expect(
      cells().map((cell) => [cell.getAttribute('aria-label'), cell.getAttribute('aria-selected'), cell.tabIndex])
    ).toEqual([
      ['Step 1', 'true', 0],
      ['Step 2', 'false', -1],
      ['Step 3, text doesn’t fit', 'false', -1],
    ]);
  });

  it('lists a turn where it reads, named by what it is and where, its target the glyph’s own box (D22)', () => {
    const turned = insertSteps(
      insertSteps(diagram(), [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'turn-a')], 1),
      [createTurn({ kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } }, () => 'turn-z')],
      4
    );
    render(preparedPages(turned, FONTS, subsetter));
    // A flow page's box holds a long caption whole: nothing is cut. The rotation after the
    // last step has no step after it, so the page leaves it out (Zach, 12 Oct).
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Step 1',
      'Turn over, side to side, between steps 1 and 2',
      'Step 2',
      'Step 3',
    ]);
    expect(host.querySelector('[data-step-id="turn-z"]')).toBeNull();
    const target = host.querySelector<HTMLElement>('[data-step-id="turn-a"]')!;
    // Wider than tall, as the side-to-side turn-over prints.
    expect(parseFloat(target.style.width)).toBeGreaterThan(parseFloat(target.style.height));
  });

  it('leaves Enter and the arrows on a focused step to the Diagram’s keys, as a card does', () => {
    render(preparedPages(diagram(), FONTS, subsetter));
    const cell = cells()[1]!;
    expect(focusLeavesEnterToSteps(cell)).toBe(true);
    expect(focusOwnsArrowKeys(cell)).toBe(false);
  });

  it('names a page by its place when the pages print no numbers', () => {
    const document = diagram();
    const unnumbered = { ...document, page: { ...document.page, pageNumbers: { enabled: false, first: 12 } } };
    const pages = preparedPages(unnumbered, FONTS, subsetter);
    render(pages);
    expect(host.querySelector('[data-page="0"]')?.getAttribute('aria-label')).toBe('Page 1');
    // And by the number it prints when it prints one.
    const numbered = preparedPages({ ...unnumbered, page: { ...unnumbered.page, pageNumbers: { enabled: true, first: 12 } } }, FONTS, subsetter);
    render(numbered);
    expect(host.querySelector('[data-page="0"]')?.getAttribute('aria-label')).toBe('Page 12');
    expect(host.textContent).toContain('Page 1 of 1');
  });

  it('marks an empty step’s picture box and a cut instruction over the page, never in it', () => {
    const pages = preparedPages(onGrid(diagram()), FONTS, subsetter);
    render(pages);
    expect(host.textContent).toContain('No picture yet');
    expect(host.textContent).toContain('Text doesn’t fit');
    expect(pages.layout.pages[0]!.cells[2]!.textOverflow).toBe(true);
    const svg = pages.compose(0).svg;
    expect(svg).not.toContain('No picture yet');
    expect(svg).not.toContain('doesn’t fit');
    // On a flow page the empty step's box is marked the same, and the long caption, whole, is not cut.
    render(preparedPages(diagram(), FONTS, subsetter));
    expect(host.textContent).toContain('No picture yet');
    expect(host.textContent).not.toContain('Text doesn’t fit');
  });

  it('marks a flow step that no longer fits its place over the page, never in it, and names it so', () => {
    const { overflowing, pages } = overflowingDiagram(subsetter);
    render(pages, {}, pages.layout.bandInk, overflowing, null);
    const marks = [...host.querySelectorAll<HTMLElement>('[data-step-overflow]')];
    expect(marks.map((mark) => [mark.getAttribute('data-step-overflow'), mark.textContent])).toEqual([
      ['caption', 'No longer fits'],
    ]);
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Step 1',
      'Step 2',
      'Step 3, no longer fits its place',
      'Step 4',
      'Step 5',
      'Step 6',
    ]);
    // Round the place the page keeps for it: its box, where the step's own option is.
    const own = cells()[2]!;
    expect([marks[0]!.style.left, marks[0]!.style.top, marks[0]!.style.width]).toEqual([
      own.style.left,
      own.style.top,
      own.style.width,
    ]);
    expect(pages.compose(0).svg).not.toContain('No longer fits');
  });

  it('puts a target over an enlarge arrow where the page prints it: a press selects the enlarged step, a double press stays on the page', () => {
    const area: KnownDiagramAnnotation = { id: 'area-1', kind: 'zoom', from: [0.5, 0.4], to: [0.5, 0.4], radius: 0.2 };
    const document = insertSteps(
      createDiagram({ title: 'Crane' }),
      [
        { ...cpStep('step-area'), annotations: [area] },
        { ...cpStep('step-enlarged'), zoom: { from: 'area-1', shape: 'circle', frame: { centre: [0.5, 0.4], radius: 0.2 } } },
      ],
      0
    );
    const pages = preparedPages(document, FONTS, subsetter);
    const props = render(pages, {}, pages.layout.bandInk, document);
    // The arrow is no option of the listbox: the keyboard reaches its steps.
    expect(cells().map((cell) => cell.getAttribute('aria-label'))).toEqual(['Step 1', 'Step 2']);
    const target = host.querySelector<HTMLElement>('[data-zoom-arrow="step-enlarged"]')!;
    expect(target.getAttribute('aria-hidden')).toBe('true');
    const [arrow] = pages.zoomArrows(0);
    // Over the arrow where it prints, lifted to the area: its own box and the pad round it.
    const mm = 96 / 25.4;
    expect(parseFloat(target.style.top)).toBeCloseTo((arrow!.at.y - arrow!.box.h / 2 - 0.75) * mm, 3);
    expect(parseFloat(target.style.width)).toBeCloseTo((arrow!.box.w + 1.5) * mm, 3);
    act(() => target.click());
    expect(props.onSelect).toHaveBeenCalledWith('step-enlarged');
    act(() => {
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(useWorkspaceStore.getState().diagramDetail).toBeNull();
    expect(props.onPageClick).not.toHaveBeenCalled();
  });

  it('selects a step on a press, stays on the page on a double press, and elsewhere asks about the page and lets the selection go', () => {
    const props = render(preparedPages(diagram(), FONTS, subsetter));
    act(() => cells()[1]!.click());
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('step-empty');
    expect(props.onPageClick).not.toHaveBeenCalled();
    act(() => {
      cells()[2]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(useWorkspaceStore.getState().diagramDetail).toBeNull();
    act(() => host.querySelector<HTMLElement>('[data-page="0"]')!.click());
    expect(props.onPageClick).toHaveBeenCalledOnce();
    expect(props.onSelect).toHaveBeenLastCalledWith(null);
    expect(props.onSelect).toHaveBeenCalledTimes(2);
    // The space round the pages lets it go too, and asks nothing about a page.
    act(() => host.querySelector<HTMLElement>('[role="listbox"]')!.click());
    expect(props.onSelect).toHaveBeenCalledTimes(3);
    expect(props.onSelect).toHaveBeenLastCalledWith(null);
    expect(props.onPageClick).toHaveBeenCalledOnce();
  });

  it('makes the page last pressed the panes’ “this page”, while the selection is what the press left', () => {
    let seen: PagesInView | null = null;
    function Pane() {
      const view = usePageInView();
      useEffect(() => {
        seen = view;
      });
      return null;
    }
    const pane = createRoot(document.createElement('div'));
    act(() => pane.render(<Pane />));
    onTestFinished(() => act(() => pane.unmount()));
    const pages = preparedPages(diagram(), FONTS, subsetter);
    render(pages);
    expect(seen).toMatchObject({ middle: 0, first: 0, last: 0, pressed: null });
    // Its paper, which lets the selection go: it stands once nothing is selected.
    act(() => host.querySelector<HTMLElement>('[data-page="0"]')!.click());
    expect(seen).toMatchObject({ pressed: null });
    render(pages, {}, pages.layout.bandInk, diagram(), null);
    expect(seen).toMatchObject({ pressed: 0 });
    // A step on it: it stands once the step it selects is the selection.
    act(() => cells()[1]!.click());
    expect(seen).toMatchObject({ pressed: null });
    render(pages, {}, pages.layout.bandInk, diagram(), 'step-empty');
    expect(seen).toMatchObject({ pressed: 0 });
    // Another selection since, made elsewhere: the press no longer stands.
    render(pages, {}, pages.layout.bandInk, diagram(), 'step-long');
    expect(seen).toMatchObject({ pressed: null });
  });
});


function Keys() {
  useDiagramShortcuts({ openStepMenu: () => false });
  return null;
}

it('focuses the step a press lands on, so the arrows nudge its frame and Enter opens it, the nudge kept', () => {
  const doc = diagram();
  useWorkspaceStore.getState().installDiagram({ document: doc, readOnly: false, raw: {} });
  useWorkspaceStore.getState().setDiagramView('pages');
  const keys = createRoot(document.createElement('div'));
  act(() => keys.render(<Keys />));
  const capture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
  HTMLElement.prototype.setPointerCapture = vi.fn();
  // Focus where a click on the Pages tab leaves it.
  const tab = document.createElement('button');
  tab.setAttribute('role', 'tab');
  document.body.append(tab);
  onTestFinished(() => {
    act(() => keys.unmount());
    tab.remove();
    if (capture) Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', capture);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  });
  render(preparedPages(doc, FONTS, subsetter), {}, undefined, doc);
  act(() => tab.focus());
  const cell = cells()[0]!;
  const pointer = (type: string) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse' });
  const down = pointer('pointerdown');
  act(() => {
    cell.dispatchEvent(down);
    cell.dispatchEvent(pointer('pointerup'));
    cell.click();
  });
  // The press stays the browser's (it is no drag), and focus is on the step.
  expect(down.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(cell);
  expect(useWorkspaceStore.getState()).toMatchObject({ diagramSelectedStepId: 'step-a', diagramPagesPart: 'frame' });
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: document.activeElement });
    let claimed = false;
    act(() => {
      claimed = handleShortcutRuntimeKeyDown(event, { context: { activeEditingContext: 'diagram' }, menu: () => undefined });
    });
    return claimed;
  };
  // Decision 7: an arrow nudges the selected frame, on the Pages view still.
  expect(press('ArrowRight')).toBe(true);
  expect(useWorkspaceStore.getState().diagramView).toBe('pages');
  // The readout says it in words, its numbers and unit as the language writes them.
  expect(host.textContent).toContain('Frame · 0.5, 0.0 mm');
  expect(useWorkspaceStore.getState().diagram?.steps[0]).not.toHaveProperty('place');
  // Enter opens the step, after the nudge it showed has gone into the diagram.
  expect(press('Enter')).toBe(true);
  expect(useWorkspaceStore.getState()).toMatchObject({ diagramDetail: 'pose', diagramSelectedStepId: 'step-a' });
  expect(useWorkspaceStore.getState().diagram?.steps[0]).toMatchObject({ place: { frame: [0.5, 0] } });
});

it('lets a press on the paper go of a resized picture, so the next drag on its step moves the whole frame', () => {
  const doc = diagram();
  useWorkspaceStore.getState().installDiagram({ document: doc, readOnly: false, raw: {} });
  useWorkspaceStore.getState().setDiagramView('pages');
  useWorkspaceStore.getState().selectDiagramStep('step-a');
  useWorkspaceStore.getState().selectDiagramPagesPart('picture');
  const capture = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
  HTMLElement.prototype.setPointerCapture = vi.fn();
  onTestFinished(() => {
    if (capture) Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', capture);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  });
  /** The view bound to the store, its pages laid out again as each edit lands. */
  function Bound() {
    const document = useWorkspaceStore((state) => state.diagram!);
    const selected = useWorkspaceStore((state) => state.diagramSelectedStepId);
    const pages = useMemo(() => preparedPages(document, FONTS, subsetter), [document]);
    return (
      <DiagramPagesView
        pages={pages}
        failed={false}
        steps={stepsIn(document)}
        selectedStepId={selected}
        pathColor={pages.layout.bandInk}
        fitKey="test"
        onSelect={useWorkspaceStore.getState().selectDiagramStep}
        onPageClick={() => {}}
      />
    );
  }
  act(() =>
    root.render(
      <TooltipProvider>
        <Bound />
      </TooltipProvider>
    )
  );
  const page = host.querySelector<HTMLElement>('[data-page="0"]')!;
  // A pixel a millimetre: the page as wide on screen as its paper.
  const paper = preparedPages(doc, FONTS, subsetter).layout.paper;
  page.getBoundingClientRect = () => ({ left: 0, top: 0, width: paper.widthMm, height: paper.heightMm }) as DOMRect;
  const pointer = (element: Element, type: string, x: number, y: number) =>
    act(() => {
      element.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, altKey: true })
      );
    });
  const drag = (element: Element, x: number, y: number, dx: number) => {
    pointer(element, 'pointerdown', x, y);
    pointer(element, 'pointermove', x + dx, y);
    pointer(element, 'pointerup', x + dx, y);
  };
  const place = () => useWorkspaceStore.getState().diagram!.steps[0]!;
  // The picture resized through its grip.
  const grip = host.querySelector<HTMLElement>('[data-place-scale="right"]')!;
  drag(grip, parseFloat(grip.style.left) / PX_PER_MM, parseFloat(grip.style.top) / PX_PER_MM, 10);
  expect(place()).toMatchObject({ place: { scale: expect.anything() } });
  expect(useWorkspaceStore.getState()).toMatchObject({ diagramSelectedStepId: 'step-a', diagramPagesPart: 'picture' });
  // The paper round it: nothing selected, so no part lies over the step.
  act(() => page.click());
  expect(useWorkspaceStore.getState()).toMatchObject({ diagramSelectedStepId: null, diagramPagesPart: null });
  expect(host.querySelector('[data-place-part]')).toBeNull();
  // A drag from the middle of its picture, on what lies there: the whole frame moves.
  const picture = host.querySelector<HTMLElement>('[data-place-part="picture"]') ?? cells()[0]!;
  const { pictureMm } = preparedPages(useWorkspaceStore.getState().diagram!, FONTS, subsetter).layout.pages[0]!.cells[0]!;
  drag(picture, pictureMm.x + pictureMm.size / 2, pictureMm.y + pictureMm.size / 2, 8);
  expect(useWorkspaceStore.getState()).toMatchObject({ diagramSelectedStepId: 'step-a', diagramPagesPart: 'frame' });
  expect(place()).toMatchObject({ place: { frame: expect.anything(), scale: expect.anything() } });
  expect(place()).not.toMatchObject({ place: { picture: expect.anything() } });
});

it('lets the selected frame own its picture hit area until a part is chosen', () => {
  const doc = diagram();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  useWorkspaceStore.getState().installDiagram({document: doc, readOnly: false, raw: {}});
  useWorkspaceStore.getState().setDiagramView('pages');
  useWorkspaceStore.getState().selectDiagramStep('step-a');
  useWorkspaceStore.getState().selectDiagramPagesPart('frame');
  render(preparedPages(doc, FONTS, subsetter), {}, undefined, doc);
  expect(host.querySelector('[data-place-selection="frame"]')).not.toBeNull();
  expect(host.querySelector('[data-place-part]')).toBeNull();
  act(() => useWorkspaceStore.getState().selectDiagramPagesPart('picture'));
  expect(host.querySelector('[data-place-part="picture"]')).not.toBeNull();
  expect(host.querySelectorAll('[data-place-scale]')).toHaveLength(3);
});
