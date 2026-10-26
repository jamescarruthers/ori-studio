import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagramImportMenu } from './DiagramImportMenu';

/**
 * The Import menu: its three ways, which one was chosen counted with where
 * the menu was, and — on a card, where its trigger is a pointer's shortcut
 * no keyboard reaches — the focus handed back to what had it, never to the
 * hidden trigger.
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
  it('offers files, References and Fold, and says which was chosen and where', () => {
    const onChoose = vi.fn();
    act(() =>
      root?.render(<DiagramImportMenu from="empty_state" patternOpen foldSteps onChoose={onChoose} />)
    );
    open();
    expect(rows().map((row) => row.textContent)).toEqual(['From File (CP, Defox)…', 'From References…', 'From Fold…']);
    expect(rows().some((row) => row.hasAttribute('data-disabled'))).toBe(false);
    choose('From Fold…');
    expect(onChoose).toHaveBeenCalledWith('from-fold');
    expect(analytics.trackDiagramImportWayChosen).toHaveBeenCalledWith('fold', 'empty_state');
  });

  it('is a pointer’s shortcut on a card: out of the tab order, hidden, and the focus goes back to what had it', async () => {
    const onChoose = vi.fn();
    const card = document.createElement('div');
    card.tabIndex = 0;
    document.body.append(card);
    act(() =>
      root?.render(<DiagramImportMenu from="card" pointerOnly size="sm" patternOpen foldSteps={false} onChoose={onChoose} />)
    );
    expect(trigger().tabIndex).toBe(-1);
    expect(trigger().getAttribute('aria-hidden')).toBe('true');
    card.focus();
    open();
    // From File… opens its dialog once the dialog's code has loaded: the focus comes back first.
    choose('From File (CP, Defox)…');
    expect(onChoose).toHaveBeenCalledWith('import-steps');
    expect(analytics.trackDiagramImportWayChosen).toHaveBeenCalledWith('file', 'card');
    // The menu gives the focus back a turn after it closes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(card);
    card.remove();
  });

  it('gives the focus to its card when nothing had it, or what had it went with the step the way selected', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    act(() =>
      root?.render(
        <div role="option" aria-selected={false} tabIndex={-1}>
          <DiagramImportMenu from="card" pointerOnly patternOpen foldSteps onChoose={() => elsewhere.remove()} />
        </div>
      )
    );
    const card = host?.querySelector('[role="option"]');
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    elsewhere.focus();
    open();
    choose('From File (CP, Defox)…');
    await settle();
    expect(document.activeElement).toBe(card);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    open();
    choose('From File (CP, Defox)…');
    await settle();
    expect(document.activeElement).toBe(card);
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
