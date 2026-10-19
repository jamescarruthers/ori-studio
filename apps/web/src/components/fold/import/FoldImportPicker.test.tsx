import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoldImportPicker } from './FoldImportPicker';

import { regionReferenceFor } from '../../../cp-workspace/regions/regionReference';
import { sheetRegions } from '../../../cp-workspace/sheets/cpSheetRegions';
import { twoSquaresIndex } from '../../../diagram/capture/capture.fixtures';
const sheets = sheetRegions(twoSquaresIndex()).map(sheet => ({ sheet, thumbnail: null }));
vi.mock('../../../cp-workspace/sheets/useCpPatternSheets', () => ({
  useCpPatternSheets: () => ({ status: 'ready', sheets }),
}));

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

it('links just the clicked region and disables pattern cards while resolving', () => {
  const onRequest = vi.fn();
  act(() => root.render(<FoldImportPicker dragging={false} busy={false} onRequest={onRequest} />));
  const card = () => host.querySelector<HTMLButtonElement>('button[aria-label="Pattern 2"]')!;
  act(() => card().click());
  expect(onRequest).toHaveBeenCalledExactlyOnceWith({ kind: 'project-cp', region: regionReferenceFor(sheets[1]!.sheet) });
  act(() => root.render(<FoldImportPicker dragging={false} busy onRequest={onRequest} />));
  expect(card().disabled).toBe(true);
  act(() => card().click());
  expect(onRequest).toHaveBeenCalledOnce();
});
