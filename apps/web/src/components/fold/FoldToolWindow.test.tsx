import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FoldCrossSection } from '../../fold/engine/foldEngineWire';
import type { FoldShortcutId } from '../../fold/tools/foldToolCatalog';
import {
  foldToolWindow,
  type FoldPreview,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
} from '../../fold/tools/foldToolWindow';
import { allByRole, byRole, queryByRole } from '../../test/roleQueries';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldToolWindow } from './FoldToolWindow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = i18n.t.bind(i18n);

let host: HTMLDivElement;
let root: Root;
let viewport: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  viewport = document.createElement('div');
  viewport.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 764, bottom: 700, width: 764, height: 700 }) as DOMRect;
  document.body.appendChild(viewport);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  viewport.remove();
  localStorage.clear();
});

function verbs() {
  return {
    selectTool: vi.fn(),
    selectLineMode: vi.fn(),
    includeFlaps: vi.fn(),
    foldOtherWay: vi.fn(),
    pickFlap: vi.fn(),
    useLine: vi.fn(),
    swapSide: vi.fn(),
    toggleFlap: vi.fn(),
    hoverFlap: vi.fn(),
    cancel: vi.fn(),
    commit: vi.fn(),
  } satisfies FoldToolWindowVerbs;
}

const section: FoldCrossSection = {
  line: { n: [0, 1], d: 0.5 },
  side: 'positive',
  from: { x: 0, y: 0.5 },
  to: { x: 1, y: 0.5 },
  flaps: [
    { faces: [2, 3], witness: [0.2, 0.7] },
    { faces: [0, 1], witness: [0.2, 0.2] },
  ],
  rows: [
    { faces: [3], spans: [[0, 1]], flap: 0 },
    { faces: [2], spans: [[0, 1]], flap: 0 },
    { faces: [1], spans: [[0, 1]], flap: 1 },
    { faces: [0], spans: [[0, 1]], flap: 1 },
  ],
  intervals: [{ start: 0, end: 1, faces: [3, 2, 1, 0], rows: [0, 1, 2, 3] }],
  order: { kind: 'layered', unordered: [] },
  layers: 4,
  joins: [],
};

const preview = (extra: Partial<FoldPreview> = {}): FoldPreview => ({
  section,
  interval: null,
  seed: 'all',
  added: [],
  refused: null,
  landing: false,
  ...extra,
});

function render(view: Partial<FoldToolWindowView>, calls = verbs(), keyLabel?: (id: FoldShortcutId) => string | undefined) {
  const model = foldToolWindow(
    t,
    { tool: 'valley', lineMode: 'axiom-2', readOnly: null, picks: 0, preview: null, ...view },
    calls,
    { coarse: false, alt: 'Alt' }
  );
  act(() =>
    root.render(
      <TooltipProvider delayDuration={0}>
        <FoldToolWindow container={viewport} model={model} keyLabel={keyLabel} />
      </TooltipProvider>
    )
  );
  return calls;
}

const fold = () => document.querySelector<HTMLElement>('[aria-label="Fold tool options"]');

describe('FoldToolWindow', () => {
  it('locates the reverse fold’s line as every fold does', () => {
    render({ tool: 'inside-reverse', picks: 1 });
    const window = fold()!;
    expect(byRole(window, 'button', /^Inside reverse fold/).getAttribute('aria-expanded')).toBe('true');
    expect(byRole(window, 'combobox', 'Locate line')).toBeTruthy();
    expect(queryByRole(window, 'group', 'Kind')).toBeNull();
  });

  it('takes the reverse fold’s kind that fits, offers the other only when it fits too, and steps its choices', () => {
    const calls = {
      ...verbs(),
      setReverseKind: vi.fn(),
      stepOpening: vi.fn(),
      stepOrder: vi.fn(),
      otherKind: vi.fn(),
    } satisfies FoldToolWindowVerbs;
    const reverse = { kind: 'outside' as const, kinds: ['outside' as const], known: true, ways: 0, way: 0, orders: 3, order: 1 };
    render({ tool: 'inside-reverse', preview: preview(), reverse }, calls);
    let window = fold()!;
    // Named for the kind folded: the only one that fits here.
    expect(byRole(window, 'button', /^Outside reverse fold \d settings/).getAttribute('aria-expanded')).toBe('true');
    expect(byRole(window.querySelector<HTMLElement>('[data-footer]')!, 'button', 'Outside reverse fold')).toBeTruthy();
    const kinds = byRole(window, 'group', 'Kind');
    // Disabled as an option is, still focusable so its tooltip can say why.
    expect(byRole(kinds, 'button', 'Inside').getAttribute('aria-disabled')).toBe('true');
    expect(byRole(kinds, 'button', 'Outside').getAttribute('aria-pressed')).toBe('true');
    expect(window.textContent).toContain('Only the outside reverse fold fits here.');
    expect(window.textContent).toContain('Tip side');
    // One of three orders: a stepper, and no opening to choose.
    expect(window.textContent).toContain('2 of 3');
    expect(queryByRole(window, 'button', 'Opening: Next')).toBeNull();
    act(() => byRole(window, 'button', 'Layer order: Next').click());
    expect(calls.stepOrder).toHaveBeenCalledWith(1);

    // Both fit: either can be taken.
    render({ tool: 'inside-reverse', preview: preview(), reverse: { ...reverse, kinds: ['inside', 'outside'], orders: 0, ways: 2 } }, calls);
    window = fold()!;
    act(() => byRole(byRole(window, 'group', 'Kind'), 'button', 'Inside').click());
    expect(calls.setReverseKind).toHaveBeenCalledWith('inside');
    act(() => byRole(window, 'button', 'Opening: Previous').click());
    expect(calls.stepOpening).toHaveBeenCalledWith(-1);

    // A kind that does not fit is refused with the other as its fix.
    render(
      {
        tool: 'inside-reverse',
        preview: preview({
          refused: { refusal: { code: 'reverse_kind_infeasible', kind: 'inside', faces: [1] }, fixes: [{ fix: 'other_kind', kind: 'outside' }] },
        }),
        reverse: { ...reverse, kind: 'inside', kinds: [], known: true },
      },
      calls
    );
    const alert = byRole(fold()!, 'alert', /^It cannot go inside/);
    act(() => byRole(alert, 'button', 'Outside reverse fold instead').click());
    expect(calls.otherKind).toHaveBeenCalledWith('outside');
  });

  it('locates a crimp’s two lines, its second line’s mode beside its first’s', () => {
    const calls = { ...verbs(), setSecondLineMode: vi.fn() } satisfies FoldToolWindowVerbs;
    render({ tool: 'crimp', lineMode: 'free', secondLineMode: 'free', picks: 2 }, calls);
    const window = fold()!;
    expect(byRole(window, 'button', /^Crimp 2 settings/).getAttribute('aria-expanded')).toBe('true');
    expect(byRole(window, 'combobox', 'First line')).toBeTruthy();
    expect(byRole(window, 'combobox', 'Second line')).toBeTruthy();
    // The step in hand: the second line's first click.
    expect(window.querySelector('[aria-current="step"]')?.textContent).toBe(
      'Click where the second line starts, beyond the first toward the tip: where the flap turns back out.'
    );
    // What a crimp is, above the steps, before any click.
    expect(window.textContent).toContain('Folds a flap in along a first line and back out along a second');
  });

  it('previews a crimp under its kind’s name, with the kind that fits', () => {
    const calls = { ...verbs(), setReverseKind: vi.fn() } satisfies FoldToolWindowVerbs;
    const crimp = { kind: 'inside' as const, kinds: ['inside' as const], known: true, ways: 0, way: 0, orders: 0, order: 0 };
    render({ tool: 'crimp', lineMode: 'free', picks: 4, preview: preview(), crimp }, calls);
    const window = fold()!;
    expect(byRole(window.querySelector<HTMLElement>('[data-footer]')!, 'button', 'Inside crimp')).toBeTruthy();
    expect(byRole(byRole(window, 'group', 'Kind'), 'button', 'Outside').getAttribute('aria-disabled')).toBe('true');
    expect(window.textContent).toContain('Only the inside crimp fits here.');
    expect(queryByRole(window, 'combobox', 'Second line')).toBeNull();
  });

  it('previews a tuck with the layers it can go against, stepped through, and its direction', () => {
    const calls = { ...verbs(), setTuckDirection: vi.fn(), stepTuckTarget: vi.fn() } satisfies FoldToolWindowVerbs;
    const tuck = {
      direction: 'valley' as const,
      known: true,
      targets: 3,
      target: 1,
      faces: [2, 5, 6],
      orders: 0,
      order: 0,
    };
    render({ tool: 'tuck', lineMode: 'free', picks: 2, preview: preview({ seed: [1] }), tuck }, calls);
    const window = fold()!;
    const section = window.querySelector<HTMLElement>('[data-fold-tuck]')!;
    expect(section.textContent).toContain('3 layers here take the tuck under them: the folded paper lights each.');
    expect(section.textContent).toContain('2 of 3');
    act(() => byRole(section, 'button', 'Tuck under: Next').click());
    expect(calls.stepTuckTarget).toHaveBeenCalledWith(1);
    act(() => byRole(byRole(window, 'group', 'Fold'), 'button', 'Mountain fold and tuck').click());
    expect(calls.setTuckDirection).toHaveBeenCalledWith('mountain');
    expect(byRole(window.querySelector<HTMLElement>('[data-footer]')!, 'button', 'Valley fold and tuck')).toBeTruthy();
  });

  it('draws a vertex fold’s direction, its precondition and its choices, each acting', () => {
    const calls = {
      ...verbs(),
      stepOrder: vi.fn(),
      setVertexDirection: vi.fn(),
      stepEmergent: vi.fn(),
      stepFanLayers: vi.fn(),
      resetSquashTarget: vi.fn(),
    } satisfies FoldToolWindowVerbs;
    const vertex = {
      tool: 'rabbit-ear' as const,
      direction: 'valley' as const,
      described: true,
      known: true,
      target: 'hinge' as const,
      emergents: [true, true, false],
      emergent: 0,
      layers: 2,
      fanLayers: null,
      orders: 0,
      order: 0,
    };
    render({ tool: 'rabbit-ear', lineMode: 'crease', picks: 4, preview: preview({ section: null }), vertex }, calls);
    let window = fold()!;
    expect(byRole(window, 'button', /^Rabbit ear \d settings/).getAttribute('aria-expanded')).toBe('true');
    // The direction, and the precondition said beneath it.
    const direction = byRole(window, 'group', 'Direction');
    expect(byRole(direction, 'button', 'Valley').getAttribute('aria-pressed')).toBe('true');
    act(() => byRole(direction, 'button', 'Mountain').click());
    expect(calls.setVertexDirection).toHaveBeenCalledWith('mountain');
    expect(window.querySelector('[data-fold-vertex-note]')?.textContent).toMatch(/incenter/);
    // No moving side, no layer picker: a vertex fold has neither.
    expect(window.textContent).not.toContain('Moving side');
    // The fourth crease and the layers, steppers; no ridge to choose: the
    // fourth crease is the ear's ridge.
    expect(window.textContent).toContain('1 of 3');
    expect(window.textContent).toContain('All 2');
    act(() => byRole(window, 'button', 'Fourth crease: Next').click());
    expect(calls.stepEmergent).toHaveBeenCalledWith(1);
    act(() => byRole(window, 'button', 'Layers: Previous').click());
    expect(calls.stepFanLayers).toHaveBeenCalledWith(-1);
    expect(queryByRole(window, 'group', 'Ridge')).toBeNull();
    expect(window.textContent).not.toContain('Ridge');

    // A squash aimed off its hinge: the way back to it.
    render(
      {
        tool: 'squash',
        lineMode: 'crease',
        picks: 1,
        preview: preview({ section: null }),
        vertex: { ...vertex, tool: 'squash', target: 'point', emergents: [], layers: 0 },
      },
      calls
    );
    window = fold()!;
    expect(window.textContent).toContain('The point clicked');
    act(() => byRole(window, 'button', 'Back to the hinge').click());
    expect(calls.resetSquashTarget).toHaveBeenCalledTimes(1);

    // A petal fold and a swivel say what they are and need above their steps,
    // before the first click, and nothing again under the direction.
    for (const [tool, intro, first] of [
      ['petal', 'Lifts a flap’s lower point up along a line H', 'Click the precrease H'],
      ['swivel', 'Folds the paper about a point', 'Hold '],
    ] as const) {
      render({ tool, lineMode: 'crease', picks: 0, vertex: { ...vertex, tool, described: false, known: false } }, calls);
      window = fold()!;
      const text = window.textContent ?? '';
      expect(text.indexOf(intro), tool).toBeGreaterThan(-1);
      expect(text.indexOf(intro), tool).toBeLessThan(text.indexOf(first));
      expect(window.querySelector('[aria-current="step"]')?.textContent, tool).toMatch(new RegExp(`^${first}`));
      expect(window.querySelector('[data-fold-vertex-note]'), tool).toBeNull();
      expect(byRole(window, 'group', 'Direction')).toBeTruthy();
    }
  });

  it('draws a sink’s kind, its line’s rule and depth, its pocket, and a refusal whose fixes act', () => {
    const calls = {
      ...verbs(),
      otherSink: vi.fn(),
      stepPocket: vi.fn(),
      stepOrder: vi.fn(),
    } satisfies FoldToolWindowVerbs;
    const sink = {
      tool: 'open-sink' as const,
      known: true,
      openRefusal: 'sink_line_tilted' as const,
      pocketsFound: 2,
      pockets: 0,
      pocket: 0,
      pocketName: null,
      orders: 0,
      order: 0,
      depth: 0.3,
      sunk: 0,
    };
    const square = { fix: 'use_line' as const, line: { n: [0, 1] as [number, number], d: 0.4 }, side: 'positive' as const };
    render(
      {
        tool: 'open-sink',
        preview: preview({
          refused: {
            refusal: { code: 'sink_line_tilted', offset: 0.02, faces: [1] },
            fixes: [square, { fix: 'other_sink', kind: 'closed' }],
          },
        }),
        sink,
      },
      calls
    );
    let window = fold()!;
    const kinds = byRole(window, 'group', 'Sink');
    expect(byRole(kinds, 'button', 'Open').getAttribute('aria-pressed')).toBe('true');
    expect(byRole(kinds, 'button', 'Open').getAttribute('aria-disabled')).toBe('true');
    act(() => byRole(kinds, 'button', 'Closed').click());
    expect(calls.selectTool).toHaveBeenCalledWith('closed-sink');
    expect(window.querySelector('[data-fold-sink-square]')?.textContent).toContain('exactly square');
    expect(window.querySelector('[data-fold-sink-depth]')?.textContent).toBe('0.3 from the tip');
    const alert = byRole(window, 'alert', /^The line is not square to the point/);
    act(() => byRole(alert, 'button', 'Use the square line').click());
    expect(calls.useLine).toHaveBeenCalledWith(square);
    act(() => byRole(alert, 'button', 'Closed sink instead').click());
    expect(calls.otherSink).toHaveBeenCalledWith('closed');

    // A closed sink's front and back pockets, stepped through.
    render(
      {
        tool: 'closed-sink',
        preview: preview(),
        sink: { ...sink, tool: 'closed-sink', openRefusal: null, pockets: 2, pocketName: 'front' },
      },
      calls
    );
    window = fold()!;
    expect(window.querySelector('[data-fold-sink-square]')).toBeNull();
    expect(window.querySelector('[data-fold-choice="Pocket"]')?.textContent).toContain('Front');
    act(() => byRole(window, 'button', 'Pocket: Next').click());
    expect(calls.stepPocket).toHaveBeenCalledWith(1);
  });

  it('says a commit asked for before the preview landed is waiting for it, and nothing once none is', () => {
    render({ preview: preview({ landing: true, queued: true }) });
    expect(fold()!.textContent).toContain('Folding as soon as the preview is ready…');
    // Asked for before the step was built: still waiting.
    render({ preview: preview({ landing: false, queued: true }) });
    expect(fold()!.textContent).toContain('Folding as soon as the preview is ready…');
    render({ preview: preview({ landing: true }) });
    expect(fold()!.textContent).not.toContain('Folding as soon as the preview is ready…');
  });

  it('keeps to a third of a phone’s height, so the paper it folds stays in view', async () => {
    const { PHONE_MEDIA_QUERY } = await import('../../platform/phoneLayout');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === PHONE_MEDIA_QUERY,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    try {
      render({ preview: preview() });
      expect(fold()?.getAttribute('data-height')).toBe('capped');
    } finally {
      vi.unstubAllGlobals();
    }
    render({ preview: preview() });
    expect(fold()?.hasAttribute('data-height')).toBe(false);
  });

  it('numbers the steps to locate the line, marks the one in hand, and offers the line modes', () => {
    render({ picks: 1 });
    const window = fold()!;
    expect(byRole(window, 'button', /^Valley fold/).getAttribute('aria-expanded')).toBe('true');
    expect(window.textContent).toContain('1 setting');
    const steps = [...window.querySelectorAll('ol li')];
    expect(steps.map((step) => step.textContent)).toEqual([
      'Click the point to move.',
      'Click where it should land.',
      'Pick the fold and the layers, then press Enter.',
    ]);
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(window.textContent).toContain('Hold Alt to put a point down anywhere, without snapping.');
    expect(byRole(window, 'combobox', 'Locate line').textContent).toContain('Axiom 2: point onto point');
    // Not yet: the fold's own controls come with the preview.
    expect(queryByRole(window, 'group', 'Fold')).toBeNull();
    expect(queryByRole(window, 'button', 'Cancel')).toBeNull();
  });

  it('switches the kind, swaps the side and picks layers through the model', () => {
    const calls = render({ preview: preview({ seed: [0] }) });
    const window = fold()!;
    const kinds = byRole(window, 'group', 'Fold');
    expect(allByRole(kinds, 'button').map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')])).toEqual([
      ['Valley fold', 'true'],
      ['Mountain fold', 'false'],
      ['Precrease', 'false'],
    ]);
    act(() => byRole(kinds, 'button', 'Mountain fold').click());
    expect(calls.selectTool).toHaveBeenCalledWith('mountain');

    act(() => byRole(window, 'button', 'Swap').click());
    expect(calls.swapSide).toHaveBeenCalledTimes(1);

    expect(window.textContent).toContain('2 of 4 layers moving');
    const layers = byRole(window, 'listbox', 'Layers at the fold line, top to bottom');
    act(() => byRole(layers, 'option', 'Layer 3, Flap 2').click());
    act(() => byRole(window, 'button', 'Flap 1, 2 layers').click());
    expect(calls.toggleFlap.mock.calls).toEqual([[1], [0]]);
  });

  it('commits and cancels from its footer, naming their keys, and refuses a commit while refused', () => {
    const keys = (id: FoldShortcutId) => ({ 'fold.commit': 'Enter', 'viewport.cancel': 'Esc', 'fold.swapSide': 'S' })[id as string];
    // The footer's commit is named for the fold, as the V / M / P control's option is.
    const footer = () => fold()!.querySelector<HTMLElement>('[data-footer]')!;
    let calls = render({ preview: preview() }, verbs(), keys);
    let window = fold()!;
    const commit = byRole(footer(), 'button', 'Valley fold');
    expect(commit.getAttribute('title')).toBe('Valley fold (Enter)');
    expect(byRole(footer(), 'button', 'Cancel').getAttribute('title')).toBe('Cancel (Esc)');
    expect(byRole(window, 'button', 'Swap').getAttribute('title')).toBe('Swap (S)');
    act(() => commit.click());
    act(() => byRole(footer(), 'button', 'Cancel').click());
    expect(calls.commit).toHaveBeenCalledTimes(1);
    expect(calls.cancel).toHaveBeenCalledTimes(1);

    calls = render({
      preview: preview({
        refused: { refusal: { code: 'layer_order' }, fixes: [{ fix: 'opposite_direction' }] },
      }),
    });
    window = fold()!;
    expect((byRole(footer(), 'button', 'Valley fold') as HTMLButtonElement).disabled).toBe(true);
    const alert = byRole(window, 'alert', /^Collision/);
    act(() => byRole(alert, 'button', 'Mountain fold instead').click());
    expect(calls.foldOtherWay).toHaveBeenCalledTimes(1);
  });

  it('says it is finding the layers until the section arrives', () => {
    render({ preview: preview({ section: null, landing: true }) });
    const window = fold()!;
    expect(byRole(window, 'status', 'Finding the layers at the line…')).toBeTruthy();
    expect(queryByRole(window, 'listbox', /Layers/)).toBeNull();
  });

  it('keeps its collapsed state apart from the other workspaces’ windows', () => {
    render({});
    act(() => fold()?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click());
    expect(localStorage.getItem('oristudio:fold-tool-hint-collapsed')).toBe('true');
    expect(localStorage.getItem('oristudio:simulator-tool-hint-collapsed')).toBeNull();
  });
});
