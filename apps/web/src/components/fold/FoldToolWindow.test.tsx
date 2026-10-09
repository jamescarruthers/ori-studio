import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FoldCrossSection } from '../../fold/tools/engineContracts';
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
  flaps: [
    { faces: [2, 3], witness: [0.2, 0.7] },
    { faces: [0, 1], witness: [0.2, 0.2] },
  ],
  layers: [
    { faces: [3], span: [0, 1], flap: 0, unordered: false },
    { faces: [2], span: [0, 1], flap: 0, unordered: false },
    { faces: [1], span: [0, 1], flap: 1, unordered: false },
    { faces: [0], span: [0, 1], flap: 1, unordered: false },
  ],
  intervals: [{ span: [0, 1], faces: [3, 2, 1, 0], layers: [0, 1, 2, 3] }],
  joins: [],
  depth: 4,
  woven: false,
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
  it('shows nothing when the tool has no window', () => {
    render({ tool: 'inside-reverse' });
    expect(fold()).toBeNull();
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
