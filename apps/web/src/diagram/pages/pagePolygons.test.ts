import { describe, expect, it } from 'vitest';
import { convexHull, rectangle, separate } from './pagePolygons';

const ORIGIN = { x: 0, y: 0 };

describe('page polygons', () => {
  it('outlines a box corner by corner', () => {
    expect(rectangle(1, 2, 3, 4)).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
      { x: 1, y: 6 },
    ]);
  });

  it('keeps only the outer corners of a set of points', () => {
    const hull = convexHull([...rectangle(0, 0, 10, 10), { x: 5, y: 5 }, { x: 2, y: 8 }]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(expect.arrayContaining([...rectangle(0, 0, 10, 10)]));
  });

  it('says how far two outlines must part, and nothing for ones already apart', () => {
    const a = rectangle(0, 0, 10, 10);
    expect(separate(a, ORIGIN, rectangle(20, 0, 10, 10), ORIGIN, 0)).toBeNull();
    // Overlapping by 2 mm across: parted along x.
    const push = separate(a, ORIGIN, rectangle(8, 0, 10, 10), ORIGIN, 0)!;
    expect(Math.abs(push.x)).toBeCloseTo(2, 9);
    expect(push.y).toBeCloseTo(0, 9);
    // A clearance asks for room even between outlines that do not touch.
    expect(separate(a, ORIGIN, rectangle(11, 0, 10, 10), ORIGIN, 2)).not.toBeNull();
    // A negative one lets them overlap that much.
    expect(separate(a, ORIGIN, rectangle(9.995, 0, 10, 10), ORIGIN, -0.01)).toBeNull();
  });

  it('lets a box sit in the empty corner of a diamond', () => {
    const diamond = convexHull([
      { x: 5, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 5 },
    ]);
    expect(separate(rectangle(0, 0, 2, 2), ORIGIN, diamond, ORIGIN, 0)).toBeNull();
    expect(separate(rectangle(4, 4, 2, 2), ORIGIN, diamond, ORIGIN, 0)).not.toBeNull();
  });
});
