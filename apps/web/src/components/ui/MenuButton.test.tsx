import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuAction } from './ActionMenu';
import { MenuButton } from './MenuButton';

/**
 * The menu button's rules: its rows are its actions; a row that opens a
 * dialog leaves the focus to the dialog; and a pointer-only one never takes
 * the focus, handing it to the surface it is a shortcut of, or back to what
 * had it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
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

const trigger = () => [...(host?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Add')!;
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const open = () =>
  act(() => trigger().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
const choose = (name: string) => act(() => rows().find((row) => row.textContent === name)?.click());
/** The menu gives the focus back a turn after it closes. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function actions(overrides: Partial<Record<string, Partial<MenuAction>>> = {}): MenuAction[] {
  return [
    { id: 'one', label: 'One', onSelect: vi.fn(), ...overrides.one },
    { id: 'two', label: 'Two', onSelect: vi.fn(), ...overrides.two },
  ];
}

describe('MenuButton', () => {
  it('opens its actions under its label, running the one chosen, and says why one waits', () => {
    const list = actions({ two: { disabled: true, title: 'Not yet' } });
    act(() => root?.render(<MenuButton label="Add" actions={list} />));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    open();
    expect(rows().map((row) => row.textContent)).toEqual(['One', 'Two']);
    expect(rows()[1]!.hasAttribute('data-disabled')).toBe(true);
    expect(rows()[1]!.title).toBe('Not yet');
    choose('One');
    expect(list[0]!.onSelect).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('gives the focus back to itself as it closes, but not over a dialog a row opened', async () => {
    const dialog = document.createElement('button');
    document.body.append(dialog);
    // A dialog takes the focus as it mounts, once the menu has closed.
    const list = actions({ two: { opensDialog: true, onSelect: () => queueMicrotask(() => dialog.focus()) } });
    act(() => root?.render(<MenuButton label="Add" actions={list} />));
    open();
    choose('One');
    await settle();
    expect(document.activeElement).toBe(trigger());
    open();
    choose('Two');
    await settle();
    expect(document.activeElement).toBe(dialog);
    dialog.remove();
  });

  it('as a pointer’s shortcut stays out of the tab order and hidden, and gives the focus to the surface it is a shortcut of', async () => {
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    act(() =>
      root?.render(
        <div role="option" aria-selected={false} tabIndex={-1}>
          <MenuButton label="Add" pointerOnly actions={actions()} />
        </div>
      )
    );
    expect(trigger().tabIndex).toBe(-1);
    expect(trigger().getAttribute('aria-hidden')).toBe('true');
    const surface = host?.querySelector('[role="option"]');
    // Another card had the focus: the one whose shortcut was used takes it, as its other shortcuts leave it.
    elsewhere.focus();
    open();
    choose('One');
    await settle();
    expect(document.activeElement).toBe(surface);
    (document.activeElement as HTMLElement).blur();
    open();
    choose('Two');
    await settle();
    expect(document.activeElement).toBe(surface);
    elsewhere.remove();
  });

  it('as a pointer’s shortcut on no focusable surface gives the focus back to what had it', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    act(() => root?.render(<MenuButton label="Add" pointerOnly actions={actions()} />));
    field.focus();
    open();
    choose('One');
    await settle();
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});
