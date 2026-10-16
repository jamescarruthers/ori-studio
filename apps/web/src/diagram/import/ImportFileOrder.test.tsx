import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImportFileOrder } from './ImportFileOrder';
import { TooltipProvider } from '../../components/ui/Tooltip';
import type { PickedFile } from '../../platform/fileService';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
let ordered: PickedFile[];
const first = { name: 'same.cp', type: '', size: 1, read: async () => new Uint8Array([1]) };
const second = { ...first, read: async () => new Uint8Array([2]) };
const third = { ...first, name: 'third.svg' };
function List({ disabled = false }) {
  const [files, setFiles] = useState<PickedFile[]>([first, second, third]);
  useEffect(() => { ordered = files; }, [files]);
  return <TooltipProvider><ImportFileOrder files={files} onChange={setFiles} disabled={disabled} /></TooltipProvider>;
}
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<List />));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = [...host.querySelectorAll<HTMLElement>('li')].indexOf(this);
    return { top: index * 30, bottom: (index + 1) * 30, height: 30, left: 0, right: 200, width: 200 } as DOMRect;
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('reorders with a mouse drag, preserving duplicate file identity and the final import order', () => {
  const firstRow = host.querySelector('li')!;
  act(() => firstRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0, clientY: 15 })));
  act(() => window.dispatchEvent(new PointerEvent('pointermove', { clientY: 75 })));
  act(() => window.dispatchEvent(new PointerEvent('pointerup')));
  expect(ordered).toEqual([second, third, first]);
  expect(host.querySelectorAll('li')[2]).toBe(firstRow);
});
it('moves the focused handle with arrow keys, clamps at the ends and disables ordering during import', () => {
  const handle = host.querySelector('button')!;
  act(() => handle.focus());
  const key = (key: string) => act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  key('ArrowUp'); expect(ordered).toEqual([first, second, third]);
  key('ArrowDown'); expect(ordered).toEqual([second, first, third]);
  expect(document.activeElement).toBe(handle);
  act(() => root.render(<List disabled />));
  key('ArrowDown'); expect(ordered).toEqual([second, first, third]);
  expect(host.querySelectorAll('button')[1]!.disabled).toBe(true);
});
