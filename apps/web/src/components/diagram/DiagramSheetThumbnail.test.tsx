import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DiagramSheetThumbnail } from './DiagramSheetThumbnail';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('keeps alternating crease inks in drawing order and accepts only finite coordinates in generated markup', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const thumbnail: SheetThumbnail = {
    viewBox: '0 0 100 100',
    strokes: [
      { role: 'mountain', x1: 0, y1: 0, x2: 100, y2: 100 },
      { role: 'valley', x1: 0, y1: 100, x2: 100, y2: 0 },
      { role: 'mountain', x1: 50, y1: 0, x2: 50, y2: 100 },
      { role: 'edge', x1: NaN, y1: 0, x2: 100, y2: 0 },
    ],
  };
  try {
    act(() => root.render(<DiagramSheetThumbnail thumbnail={thumbnail} />));
    const paths = [...host.querySelectorAll('path')];
    expect(paths.map((path) => path.dataset.role)).toEqual(['mountain', 'valley', 'mountain']);
    expect(paths.map((path) => path.getAttribute('d'))).toEqual([
      'M0 0L100 100',
      'M0 100L100 0',
      'M50 0L50 100',
    ]);
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  } finally {
    act(() => root.unmount());
  }
});
