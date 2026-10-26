import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramImportMenu } from './DiagramImportMenu';

/**
 * The Import menu: its three ways, which one was chosen counted with where
 * the menu was, and why a way waits. How it opens, closes and hands the
 * focus back is `MenuButton`'s (its own test).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analytics = vi.hoisted(() => ({ trackDiagramImportWayChosen: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

const trigger = () => [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Import')!;
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const open = () =>
  act(() => trigger().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
const choose = (name: string) => act(() => rows().find((row) => row.textContent === name)?.click());

describe('DiagramImportMenu', () => {
  it('offers files, References and Fold, each with its verb’s icon, and says which was chosen and where', () => {
    const onChoose = vi.fn();
    act(() =>
      root?.render(<DiagramImportMenu from="empty_state" patternOpen foldSteps onChoose={onChoose} />)
    );
    open();
    expect(rows().map((row) => row.textContent)).toEqual(['From File (CP, Defox)…', 'From References…', 'From Fold…']);
    expect(rows().every((row) => row.querySelector('svg') !== null)).toBe(true);
    expect(rows().some((row) => row.hasAttribute('data-disabled'))).toBe(false);
    choose('From Fold…');
    expect(onChoose).toHaveBeenCalledWith('from-fold');
    expect(analytics.trackDiagramImportWayChosen).toHaveBeenCalledWith('fold', 'empty_state');
  });

  it('counts a card’s choice as the card’s, its trigger one of the card’s pointer shortcuts', () => {
    const onChoose = vi.fn();
    act(() =>
      root?.render(<DiagramImportMenu from="card" pointerOnly size="sm" patternOpen foldSteps={false} onChoose={onChoose} />)
    );
    expect(trigger().tabIndex).toBe(-1);
    expect(trigger().getAttribute('aria-hidden')).toBe('true');
    open();
    choose('From File (CP, Defox)…');
    expect(onChoose).toHaveBeenCalledWith('import-steps');
    expect(analytics.trackDiagramImportWayChosen).toHaveBeenCalledWith('file', 'card');
  });

  it('holds References with no crease pattern open and Fold with no step to take, saying why', () => {
    act(() => root?.render(<DiagramImportMenu from="card" patternOpen={false} foldSteps={false} onChoose={vi.fn()} />));
    open();
    const [, references, fold] = rows();
    expect(references!.hasAttribute('data-disabled')).toBe(true);
    expect(references!.title).toBe('Open a crease pattern in Edit to plan its folds');
    expect(fold!.hasAttribute('data-disabled')).toBe(true);
    expect(fold!.title).toBe('Fold a step in Fold to take it from there');
  });
});
