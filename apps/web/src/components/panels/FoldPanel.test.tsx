import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const menu = vi.hoisted(() => ({ handleMenuAction: vi.fn() }));
vi.mock('../../commands/menuActions', () => ({ handleMenuAction: menu.handleMenuAction }));

/** The capability layer reads the whole workspace store; the subject here is the header. */
const capabilities = vi.hoisted(() => ({
  value: {} as Record<string, { enabled: boolean; visible: boolean; label: string; reason: string }>,
}));
vi.mock('../../store/workspaceStore/useWorkspaceCapabilities', () => ({
  useWorkspaceCapabilities: () => capabilities.value,
}));

/**
 * The canvas holds the Fold engine's worker and two WebGL surfaces, neither of
 * which jsdom has; it is tested on its own (`components/fold/canvas`). The
 * subject here is the shell around it.
 */
vi.mock('../fold/canvas/FoldCanvas', () => ({ FoldCanvas: () => null }));

import { useLayoutStore } from '../../store/layoutStore';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldPanel } from './FoldPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialLayoutState = useLayoutStore.getInitialState();

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse') ? coarse : false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
}

function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <TooltipProvider>
        <FoldPanel />
      </TooltipProvider>
    )
  );
}

const panel = () => container?.querySelector<HTMLElement>('section[aria-label="Fold workspace"]');
const button = (label: string) =>
  [...(container?.querySelectorAll('button') ?? [])].find((each) => each.getAttribute('aria-label') === label);

beforeEach(() => {
  useLayoutStore.setState({ ...initialLayoutState, activeWorkspace: 'fold' }, true);
  menu.handleMenuAction.mockClear();
  capabilities.value = {
    'edit.undo': { enabled: true, visible: true, label: 'Undo', reason: 'Undo' },
    'edit.redo': { enabled: false, visible: true, label: 'Redo', reason: 'Redo' },
  };
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  useLayoutStore.setState(initialLayoutState, true);
});

describe('the Fold panel shell', () => {
  it('names the workspace and offers the drawer a slot in its header', () => {
    stubPointer(false);
    render();

    expect(panel()?.textContent).toContain('Fold');
    // The touch drawer seats its pill here rather than in the canvas pill lane,
    // which would sit over this header.
    const slot = useLayoutStore.getState().viewDrawerSlot;
    expect(slot).not.toBeNull();
    expect(panel()?.contains(slot)).toBe(true);
    // Undo and redo are the menu bar's on a fine pointer.
    expect(button('Undo')).toBeUndefined();
  });

  it('gives a coarse pointer undo and redo in the header, through the menu chokepoint', () => {
    stubPointer(true);
    render();

    expect(button('Undo')?.disabled).toBe(false);
    expect(button('Redo')?.disabled).toBe(true);
    act(() => button('Undo')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(menu.handleMenuAction.mock.calls).toEqual([['edit.undo']]);
  });

  it('gives the slot back when it unmounts', () => {
    stubPointer(true);
    render();
    act(() => root?.unmount());
    root = null;

    expect(useLayoutStore.getState().viewDrawerSlot).toBeNull();
  });
});
