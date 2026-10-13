import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagram,
  createTurn,
  insertSteps,
  setPageSetup,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStep,
} from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { cellSlots } from '../../diagram/pages/stepPlaces';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DiagramLayersPanel } from '../panels/DiagramLayersPanel';
import { TooltipProvider } from '../ui/Tooltip';

/** The steps placed past the margin as the pages last laid them out, as the Diagram panel publishes its layout. */
const printed = vi.hoisted(() => ({ outsideMargin: {} as Record<string, true> }));
const analytics = vi.hoisted(() => ({ trackDiagramPagesRepacked: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));
vi.mock('../../diagram/pages/printedFrames', async (importOriginal) => {
  const { useWorkspaceStore: store } = await import('../../store/workspaceStore');
  const { stepsOf } = await import('../../diagram/document/diagramDocument');
  return {
    ...(await importOriginal<typeof import('../../diagram/pages/printedFrames')>()),
    usePrintedLayout: () => {
      const document: DiagramDocument | null = store.getState().diagram;
      const cells = document
        ? stepsOf(document).map((step, index) => ({
            stepId: step.id,
            number: index + 1,
            frameMm: 40,
            mmPerUnit: null,
            pictureMm: { x: 0, y: 0, size: 40 },
            outsideMargin: printed.outsideMargin[step.id],
            // Its caption as the layout sets it, a line a word: what the Step pane's Text width reads.
            text: { x: 0, firstBaseline: 50, widthMm: 36, lines: step.text.split(' ').filter(Boolean).map((text) => ({ text, widthMm: 8, runs: [], ellipsis: false })) },
          }))
        : [];
      return { pages: { layout: { pages: [{ cells }] } }, document };
    },
  };
});

/**
 * The Layers pane in the Pages view (Zach, 2026-10-12): the current page's
 * steps as Annotate lists its marks, each selecting as a press on the page
 * does, the selected one opening into its parts, and its placement under the
 * list.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const state = () => useWorkspaceStore.getState();

/** Eight steps on flow pages of 4, a turn between the second and third; s1 says what to do, s2 is placed by hand. */
function install() {
  const steps = Array.from({ length: 8 }, (_, index): DiagramStep => ({
    ...cpStep(`s${index}`),
    ...(index === 1 ? { text: 'Fold in half.' } : {}),
    ...(index === 2 ? { place: { frame: [2, 0] as [number, number] } } : {}),
  }));
  const document = insertSteps(
    setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
      layout: 'flow',
      stepsPerPage: 4,
    }),
    [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'turn-a')],
    2
  );
  state().installDiagram({ document, readOnly: false, raw: {} });
  state().setDiagramView('pages');
}

const list = () => host!.querySelector<HTMLUListElement>('ul[aria-label^="Steps on page"]');
const rows = () => [...(list()?.querySelectorAll<HTMLButtonElement>(':scope > li > button') ?? [])];
const row = (stepId: string) => host!.querySelector<HTMLButtonElement>(`button[data-layer-step="${stepId}"]`)!;
const parts = () => [...host!.querySelectorAll<HTMLButtonElement>('ul[aria-label^="Parts of step"] button')];
const part = (name: string) => host!.querySelector<HTMLButtonElement>(`button[data-layer-part="${name}"]`)!;

beforeEach(() => {
  vi.clearAllMocks();
  printed.outsideMargin = {};
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function render() {
  act(() =>
    root?.render(
      <TooltipProvider>
        <DiagramLayersPanel />
      </TooltipProvider>
    )
  );
}

describe('DiagramLayersPanel › in the Pages view', () => {
  it('lists the current page’s steps first painted first, by instruction or number, badged when moved and past the margin; no turn', () => {
    printed.outsideMargin = { s0: true };
    install();
    render();
    expect(list()?.getAttribute('aria-label')).toBe('Steps on page 1');
    expect(rows().map((each) => each.textContent)).toEqual([
      '1Step 1Outside margin',
      '2Fold in half.',
      '3Step 3Moved',
      '4Step 4',
    ]);
    expect(host!.querySelector('[data-layer-step="turn-a"]')).toBeNull();
    // Nothing selected: no row pressed, no parts and no placement.
    expect(rows().some((each) => each.getAttribute('aria-pressed') === 'true')).toBe(false);
    expect(parts()).toHaveLength(0);
    expect(host!.querySelector('input[aria-label="X (mm)"]')).toBeNull();
  });

  it('selects a step with its whole frame, opens it into its parts, and selects a part, as the presses on the page do', () => {
    install();
    render();
    act(() => row('s1').click());
    expect(state()).toMatchObject({ diagramSelectedStepId: 's1', diagramPagesPart: 'frame', diagramView: 'pages' });
    expect(row('s1').getAttribute('aria-pressed')).toBe('true');
    expect(parts().map((each) => [each.textContent, each.getAttribute('aria-pressed'), each.disabled])).toEqual([
      ['Number', 'false', false],
      ['Picture', 'false', false],
      ['Text', 'false', false],
    ]);
    // Its placement under the list: the frame's X and Y, and its Reset.
    expect(host!.querySelector('input[aria-label="X (mm)"]')).not.toBeNull();
    expect(host!.textContent).toContain('Reset Frame');
    act(() => part('picture').click());
    expect(state().diagramPagesPart).toBe('picture');
    expect(part('picture').getAttribute('aria-pressed')).toBe('true');
    expect(row('s1').getAttribute('aria-pressed')).toBe('false');
    expect(host!.textContent).toContain('Reset Picture');
    // The step's row again: its whole frame.
    act(() => row('s1').click());
    expect(state().diagramPagesPart).toBe('frame');
    // Another step: the parts follow it, and Text has nothing to select on a step with no instruction.
    act(() => row('s2').click());
    expect(state()).toMatchObject({ diagramSelectedStepId: 's2', diagramPagesPart: 'frame' });
    expect(part('text').disabled).toBe(true);
  });

  it('badges a part placed by hand', () => {
    install();
    act(() => state().setDiagramStepPlace('s1', { number: [1, 1] }));
    render();
    act(() => row('s1').click());
    expect(parts().map((each) => each.textContent)).toEqual(['NumberMoved', 'Picture', 'Text']);
    expect(row('s1').textContent).toBe('2Fold in half.Moved');
  });

  it('lists the page of the step selected elsewhere, a step selected by the keys pressed with no part', () => {
    install();
    render();
    act(() => state().selectDiagramStep('s5'));
    expect(list()?.getAttribute('aria-label')).toBe('Steps on page 2');
    expect(rows().map((each) => each.textContent)).toEqual(['5Step 5', '6Step 6', '7Step 7', '8Step 8']);
    expect(row('s5').getAttribute('aria-pressed')).toBe('true');
    expect(parts()).toHaveLength(3);
  });

  it('selects the step alone on a diagram that cannot change, with no parts to open', () => {
    install();
    act(() => useWorkspaceStore.setState({ diagramReadOnly: true }));
    render();
    act(() => row('s1').click());
    expect(state()).toMatchObject({ diagramSelectedStepId: 's1', diagramPagesPart: null });
    expect(parts()).toHaveLength(0);
  });

  it('says so with no steps on the page, and out of Pages and Annotate where its layers are', () => {
    act(() => state().setDiagramView('pages'));
    render();
    expect(host!.textContent).toBe('No steps on this page.');
    install();
    act(() => state().setDiagramView('steps'));
    expect(host!.textContent).toBe('Open a step in Annotate to see its layers.');
  });

  it('re-packs the page under the list: one undo step, one count', () => {
    install();
    render();
    // No badge says a step is past its place: the page shows it (Zach, 2026-10-12).
    expect(rows().map((each) => each.textContent)).toEqual(['1Step 1', '2Fold in half.', '3Step 3Moved', '4Step 4']);
    const repack = () =>
      [...host!.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Re-pack Page');
    // Nothing packed and taken in yet: offered all the same, and pressed it lets nothing go.
    expect(repack()?.disabled).toBe(false);
    act(() => repack()!.click());
    expect(state().diagramHistory.past).toHaveLength(0);
    expect(analytics.trackDiagramPagesRepacked).not.toHaveBeenCalled();
    const document = state().diagram!;
    const slots = cellSlots(document);
    const packed: Record<string, DiagramPageArrangement> = Object.fromEntries(
      slots.pages.map((ids, page) => [
        ids[0]!,
        {
          signature: slots.signatures[page]!,
          k: 1,
          steps: Object.fromEntries(
            ids.map((id, at) => [id, { box: [12 + 40 * at, 30, 38, 60], scale: { frameMm: 30 }, band: 0 }] as const)
          ),
        },
      ])
    );
    act(() => {
      state().adoptDiagramPageArrangements(packed, document);
    });
    const past = state().diagramHistory.past.length;
    const button = repack()!;
    act(() => button.focus());
    act(() => button.click());
    expect(Object.keys(state().diagram?.pageArrangements ?? {})).toEqual(['s4']);
    expect(state().diagramHistory.past).toHaveLength(past + 1);
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenCalledExactlyOnceWith('page', 'layers_pane');
    // Pressed from the keyboard, it keeps focus: letting its own arrangement go never turns it off.
    expect(repack()).toBe(button);
    expect(button.disabled).toBe(false);
    expect(window.document.activeElement).toBe(button);
  });

  it('offers no Re-pack Page on a grid', () => {
    install();
    act(() => state().setDiagramPage({ layout: 'grid' }));
    render();
    expect(host!.textContent).not.toContain('Re-pack');
  });

  it('says nothing of a step past the margin out of the Pages view', () => {
    printed.outsideMargin = { s1: true };
    install();
    render();
    act(() => row('s1').click());
    expect(host!.textContent).toContain('Part of this step crosses the margin.');
    act(() => state().setDiagramView('steps'));
    expect(host!.textContent).not.toContain('margin');
  });
});
