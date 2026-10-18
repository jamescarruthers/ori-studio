import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FoldOrderChooser } from './FoldOrderChooser';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const props = () => ({ index: 0, count: 3, exact: true, ready: true, waiting: false, onStep: vi.fn(), onBack: vi.fn(), onAccept: vi.fn() });

it('previews the first order without accepting it; cycling and explicit acceptance are separate', () => {
  const p = props();
  act(() => root.render(<FoldOrderChooser {...p} />));
  expect(p.onAccept).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Order 1 of 3');
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Next layer order"]')!.click());
  expect(p.onStep).toHaveBeenCalledWith(1);
  expect(p.onAccept).not.toHaveBeenCalled();
  act(() => host.querySelector<HTMLButtonElement>('[data-fold-order-accept]')!.click());
  expect(p.onAccept).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain('Spread');
});

it('cannot accept a candidate while it is loading, and names incomplete searches honestly', () => {
  const p = { ...props(), count: 1, exact: false, ready: false, waiting: true, onSearch: vi.fn() };
  act(() => root.render(<FoldOrderChooser {...p} />));
  expect(host.textContent).toContain('Search incomplete');
  act(() => host.querySelector<HTMLButtonElement>('[data-fold-order-accept]')!.click());
  expect(p.onAccept).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Next layer order"]')!.disabled).toBe(true);
});
