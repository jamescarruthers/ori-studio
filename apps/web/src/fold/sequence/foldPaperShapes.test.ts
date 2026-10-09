import { describe, expect, it } from 'vitest';
import { regularPolygonShape } from '../document/foldSequenceDocument';
import { documentShapeOf, paneShapeOf } from './foldPaperShapes';

describe('the sheet between the document and the Paper tab', () => {
  it('reads a document’s shape as the tab offers it', () => {
    expect(paneShapeOf({ kind: 'square' })).toEqual({ shape: 'square' });
    expect(paneShapeOf({ kind: 'rectangle', aspect: [1, 0.5] })).toEqual({ shape: 'rectangle', width: 1, height: 0.5 });
    expect(paneShapeOf(regularPolygonShape(5)!)).toEqual({ shape: 'regular', sides: 5 });
  });

  it('stores the tab’s shape as the document keeps it, at longer side 1', () => {
    expect(documentShapeOf({ shape: 'square' })).toEqual({ kind: 'square' });
    expect(documentShapeOf({ shape: 'rectangle', width: 3, height: 4 })).toEqual({
      kind: 'rectangle',
      aspect: [0.75, 1],
    });
    expect(documentShapeOf({ shape: 'regular', sides: 7 })).toEqual(regularPolygonShape(7));
  });

  it('makes a rectangle with equal sides the square', () => {
    expect(documentShapeOf({ shape: 'rectangle', width: 2, height: 2 })).toEqual({ kind: 'square' });
  });

  it('refuses a sheet the engine does not fold', () => {
    expect(documentShapeOf({ shape: 'rectangle', width: 1, height: 0 })).toBeNull();
    expect(documentShapeOf({ shape: 'rectangle', width: 1, height: 1e-4 })).toBeNull();
    expect(documentShapeOf({ shape: 'regular', sides: 9 })).toBeNull();
  });

  it('round-trips every shape the tab can make', () => {
    for (const shape of [
      { kind: 'square' } as const,
      { kind: 'rectangle', aspect: [Math.SQRT1_2, 1] } as const,
      regularPolygonShape(3)!,
      regularPolygonShape(8)!,
    ]) {
      expect(documentShapeOf(paneShapeOf(shape))).toEqual(shape);
    }
  });
});
