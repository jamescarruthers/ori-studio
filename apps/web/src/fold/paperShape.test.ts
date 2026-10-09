import { describe, expect, it } from 'vitest';
import {
  RECTANGLE_PRESETS,
  normalizeAspect,
  rectanglePresetOf,
  rectangleShape,
  regularSides,
  sameShape,
  shapeOfKind,
  type FoldPaperShape,
} from './paperShape';

describe('normalizeAspect', () => {
  it('scales a width : height to longer side 1', () => {
    expect(normalizeAspect(3, 4)).toEqual({ width: 0.75, height: 1 });
    expect(normalizeAspect(4, 2)).toEqual({ width: 1, height: 0.5 });
  });

  it('refuses what the engine would: not positive, not finite, or narrower than the minimum feature', () => {
    expect(normalizeAspect(0, 1)).toBeNull();
    expect(normalizeAspect(-1, 1)).toBeNull();
    expect(normalizeAspect(Number.NaN, 1)).toBeNull();
    expect(normalizeAspect(Number.POSITIVE_INFINITY, 1)).toBeNull();
    expect(normalizeAspect(1, 5000)).toBeNull();
    expect(normalizeAspect(1, 999)).not.toBeNull();
  });
});

describe('rectangleShape', () => {
  it('is a rectangle at longer side 1, or the square when the sides agree', () => {
    expect(rectangleShape(2, 1)).toEqual({ shape: 'rectangle', width: 1, height: 0.5 });
    expect(rectangleShape(5, 5)).toEqual({ shape: 'square' });
    expect(rectangleShape(1, 0)).toBeNull();
  });
});

describe('rectanglePresetOf', () => {
  it('knows the design’s presets by their proportions, at any scale, and nothing else', () => {
    expect(rectanglePresetOf(1, Math.SQRT2)?.label).toBe('1:√2');
    expect(rectanglePresetOf(3, 4)?.label).toBe('3:4');
    expect(rectanglePresetOf(2, 1)?.label).toBe('2:1');
    expect(rectanglePresetOf(1, 2)).toBeNull();
    expect(rectanglePresetOf(4, 3)).toBeNull();
    for (const preset of RECTANGLE_PRESETS) {
      expect(Math.max(preset.width, preset.height)).toBe(1);
    }
  });
});

describe('regularSides', () => {
  it('takes a whole number of sides from 3 to 8', () => {
    expect(regularSides(3)).toBe(3);
    expect(regularSides(8)).toBe(8);
    expect(regularSides(5.4)).toBe(5);
    expect(regularSides(2)).toBeNull();
    expect(regularSides(9)).toBeNull();
    expect(regularSides(Number.NaN)).toBeNull();
  });
});

describe('shapeOfKind', () => {
  const rectangle: FoldPaperShape = { shape: 'rectangle', width: 0.75, height: 1 };

  it('keeps the shape when its own kind is picked again', () => {
    expect(shapeOfKind('rectangle', rectangle)).toBe(rectangle);
  });

  it('starts a new kind at its first offer', () => {
    expect(shapeOfKind('square', rectangle)).toEqual({ shape: 'square' });
    expect(shapeOfKind('rectangle', { shape: 'square' })).toEqual({
      shape: 'rectangle',
      width: Math.SQRT1_2,
      height: 1,
    });
    expect(shapeOfKind('regular', { shape: 'square' })).toEqual({ shape: 'regular', sides: 6 });
  });
});

describe('sameShape', () => {
  it('compares sheets, not how they were written', () => {
    expect(sameShape({ shape: 'square' }, { shape: 'square' })).toBe(true);
    expect(
      sameShape({ shape: 'rectangle', width: 3, height: 4 }, { shape: 'rectangle', width: 0.75, height: 1 })
    ).toBe(true);
    expect(
      sameShape({ shape: 'rectangle', width: 0.75, height: 1 }, { shape: 'rectangle', width: 1, height: 0.75 })
    ).toBe(false);
    expect(sameShape({ shape: 'regular', sides: 6 }, { shape: 'regular', sides: 6 })).toBe(true);
    expect(sameShape({ shape: 'regular', sides: 6 }, { shape: 'regular', sides: 5 })).toBe(false);
    expect(sameShape({ shape: 'square' }, { shape: 'regular', sides: 4 })).toBe(false);
  });
});
