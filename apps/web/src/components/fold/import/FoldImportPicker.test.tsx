import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoldImportPicker } from './FoldImportPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

/** What the browser's file input offers when the picker opens it: read as its click lands. */
function captureAccept(): string[] {
  const accepts: string[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = realCreate(tag);
    if (tag === 'input') {
      const input = element as HTMLInputElement;
      input.click = () => accepts.push(input.accept);
    }
    return element;
  });
  return accepts;
}

describe('FoldImportPicker', () => {
  it('offers the crease-pattern formats, and a type iOS matches to any file so none of them is greyed out', () => {
    act(() => root.render(<FoldImportPicker dragging={false} busy={false} onRequest={() => {}} />));
    const accepts = captureAccept();
    const browse = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('click to browse'));
    act(() => browse?.click());
    expect(accepts).toHaveLength(1);
    expect(accepts[0]?.split(',')).toEqual(['.cp', '.fold', '.ori', '.orh', 'application/octet-stream']);
  });
});
