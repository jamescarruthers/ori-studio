import { describe, expect, it } from 'vitest';
import { cpDocument, movedLines, TWO_SQUARES, twoSquaresIndex } from '../../diagram/capture/capture.fixtures';
import { drawSheets } from './useCpPatternSheets';

describe('drawSheets', () => {
  it('draws a crease pattern’s sheets once, for every picker that asks while it stands', () => {
    const document = cpDocument();
    const index = twoSquaresIndex();
    const drawn = drawSheets(document, index);
    expect(drawn.map(({ thumbnail }) => thumbnail?.strokes.length)).toEqual([6, 5]);
    expect(drawSheets(document, index)).toBe(drawn);
  });

  it('draws again for creases that changed, or another index of them', () => {
    const document = cpDocument();
    const drawn = drawSheets(document, twoSquaresIndex());
    expect(drawSheets(document, twoSquaresIndex())).not.toBe(drawn);
    expect(drawSheets(cpDocument(movedLines(TWO_SQUARES, 300, 40)), twoSquaresIndex({ dx: 300, dy: 40 }))).not.toBe(drawn);
  });
});
