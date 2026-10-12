import { describe, expect, it } from 'vitest';
import { FOLD_SHEET_KEY } from '../document/foldStepTree';
import { bookScene, flatSquareScene } from './foldCanvas.fixtures';
import { foldPickIndex } from './foldPicking';
import { foldedFormKey } from './useFoldCanvasPaint';

describe('foldedFormKey', () => {
  it('names the step on screen once its own picture is shown, the sheet by its key', () => {
    const book = bookScene();
    expect(foldedFormKey({ cursorId: 'fstep-1', scene: book, index: foldPickIndex(book, null, []) })).toBe('fstep-1');
    const sheet = flatSquareScene();
    expect(foldedFormKey({ cursorId: null, scene: sheet, index: foldPickIndex(sheet, null, []) })).toBe(FOLD_SHEET_KEY);
  });

  it('names nothing while the last picture shown stands in for the step on its way', () => {
    // The cursor moved on: its scene is not in, and the book is still shown.
    expect(foldedFormKey({ cursorId: 'fstep-2', scene: bookScene(), index: null })).toBeNull();
    // Its scene is in, but the picture shown is still the one before.
    const next = flatSquareScene();
    expect(foldedFormKey({ cursorId: 'fstep-2', scene: bookScene(), index: foldPickIndex(next, null, []) })).toBeNull();
    expect(foldedFormKey({ cursorId: null, scene: null, index: null })).toBeNull();
  });
});
