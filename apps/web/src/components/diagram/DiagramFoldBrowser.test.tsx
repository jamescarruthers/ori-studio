import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramPullAnchor } from '../../diagram/document/diagramDocument';
import type { FoldBrowserCard } from '../../diagram/fold/foldPull';
import type { FoldBrowserCardsState, FoldBrowserProvider } from '../../diagram/fold/useFoldBrowser';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DiagramFoldBrowser } from './DiagramFoldBrowser';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

const THUMBNAIL = { viewBox: '0 0 100 100', strokes: [{ x1: 0, y1: 0, x2: 100, y2: 0, role: 'edge' as const }] };

/** A sequence's path as the browser lists it: two folds with a turn between them, and Finished; step 3 still folding. */
function cards(): FoldBrowserCard[] {
  return [
    { index: 0, kind: 'fold', number: 1, sentence: 'Valley fold in half.', picture: THUMBNAIL, step: { kind: 'step', step: 'fstep-1', moment: 'before' } },
    { index: 1, kind: 'turn-over', number: null, sentence: 'Turn over', picture: THUMBNAIL, step: { kind: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } } },
    { index: 2, kind: 'fold', number: 2, sentence: 'Valley fold the corner.', picture: THUMBNAIL, step: { kind: 'step', step: 'fstep-3', moment: 'before' } },
    { index: 3, kind: 'fold', number: 3, sentence: 'Fold the flap up.', picture: null, step: null },
    { index: 4, kind: 'done', number: null, sentence: 'The model as the steps leave it.', picture: THUMBNAIL, step: { kind: 'step', step: 'fstep-4', moment: 'after' } },
  ];
}

/** A Fold provider with no Fold behind it: these cards, and a pull that records what it was asked for. */
function fakeProvider(listed: FoldBrowserCardsState = { status: 'ready', sequence: 'fold-1', cards: cards() }) {
  return {
    useCards: () => listed,
    pull: vi.fn<FoldBrowserProvider['pull']>(async () => 1),
    openFold: vi.fn(),
  } satisfies FoldBrowserProvider;
}

function render(provider: FoldBrowserProvider, anchor: DiagramPullAnchor = { kind: 'end' }) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<DiagramFoldBrowser state={{ anchor, opening: 7 }} provider={provider} />));
}

const text = () => host?.textContent ?? '';
const button = (label: string) =>
  [...(host?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent === label);
const options = () => [...(host?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
const press = (index: number, shiftKey = false) =>
  act(() => void options()[index]!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey })));

describe('the Fold browser (D17)', () => {
  it('lists the sequence’s steps, the turns between them and Finished, in Fold’s words', () => {
    render(fakeProvider());
    expect(text()).toContain('Add from Fold');
    expect(options().map((option) => option.querySelector('span:nth-child(2)')?.textContent)).toEqual([
      'Step 1',
      'Turn',
      'Step 2',
      'Step 3',
      'Finished',
    ]);
    expect(text()).toContain('Valley fold in half.');
    // A step Fold has not folded yet cannot be chosen, and says why.
    expect(options()[3]!.getAttribute('aria-disabled')).toBe('true');
    expect(options()[3]!.title).toContain('can’t be added yet');
  });

  it('adds what is chosen, in order, where it was opened for, through its provider', async () => {
    const provider = fakeProvider();
    render(provider);
    press(0);
    press(4);
    expect(button('Add 2 steps')).toBeTruthy();
    await act(async () => button('Add 2 steps')!.click());
    expect(provider.pull).toHaveBeenCalledWith(
      [
        { kind: 'step', step: 'fstep-1', moment: 'before' },
        { kind: 'step', step: 'fstep-4', moment: 'after' },
      ],
      { kind: 'end' },
      7
    );
  });

  it('offers the turn just before the first chosen step, and adds it with it unless told not to', async () => {
    const provider = fakeProvider();
    render(provider);
    press(2);
    expect(text()).toContain('With the turn before it');
    expect(options()[1]!.dataset.offered).toBeDefined();
    await act(async () => button('Add step')!.click());
    expect(provider.pull.mock.calls[0]![0]).toEqual([
      { kind: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } },
      { kind: 'step', step: 'fstep-3', moment: 'before' },
    ]);
  });

  it('marks the turn it offers in a solid line: on paper a dash is a valley fold', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/diagram/DiagramReferencesCard.module.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]*\[data-offered\][^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) expect(body, selector.trim()).not.toMatch(/dash|dott/);
  });

  it('chooses every step it can with Select all, a range with Shift', async () => {
    const provider = fakeProvider();
    render(provider);
    act(() => button('Select all')!.click());
    expect(text()).toContain('4 selected');
    act(() => button('Clear')!.click());
    press(0);
    press(2, true);
    expect(text()).toContain('3 selected');
  });

  it('says how to start when there is nothing to pull, and opens Fold', () => {
    const provider = fakeProvider({ status: 'empty' });
    render(provider);
    expect(text()).toContain('Fold a step in Fold');
    const open = [...(host?.querySelectorAll('button') ?? [])].filter((candidate) => candidate.textContent === 'Open Fold');
    act(() => open.at(-1)!.click());
    expect(provider.openFold).toHaveBeenCalledOnce();
  });

  it('fills an empty step with the first step, and says so', () => {
    const state = useWorkspaceStore.getState();
    const stepId = state.addDiagramStep()!;
    render(fakeProvider(), { kind: 'fill', stepId });
    press(0);
    press(2);
    expect(text()).toContain('Fill step 1');
    expect(button('Fill step 1 and add 1 after it')).toBeTruthy();
  });
});
