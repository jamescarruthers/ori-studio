import { describe, expect, it } from 'vitest';
import { isClick } from './cpSurfaceInput';

describe('isClick', () => {
  it('counts movement under the threshold as a click', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(false);
  });
});
