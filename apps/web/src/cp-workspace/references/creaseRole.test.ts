import { describe, expect, it } from 'vitest';
import { SEG_ATTR_STRIDE } from '../../engine/oristudioCpGeometry';
import { HINT_MOUNTAIN, HINT_VALLEY } from '../../lib/foldAngle';
import { creaseRoleAt, creaseRoleOf } from './creaseRole';

describe('creaseRoleOf', () => {
  it('reads a named colour as creaseRoleAt reads its number', () => {
    const cases: [string, number, ('Mountain' | 'Valley')?, number?][] = [
      ['Black0', 0],
      ['Red1', 1],
      ['Blue2', 2],
      ['Cyan3', 3],
      ['Grey10', 10],
      ['Angle', -2, 'Mountain', HINT_MOUNTAIN],
      ['Angle', -2, 'Valley', HINT_VALLEY],
      ['Angle', -2],
      ['None', -1],
    ];
    for (const [color, code, hint, hintCode] of cases) {
      const attr = new Int32Array(SEG_ATTR_STRIDE);
      attr[0] = code;
      if (hintCode !== undefined) attr[4] = hintCode;
      expect(creaseRoleOf({ color, fold_direction_hint: hint }), color).toBe(creaseRoleAt(attr, 0));
    }
  });

  it('keeps an unassigned crease unassigned rather than aux, which a title block leaves out', () => {
    expect(creaseRoleOf({ color: 'None' })).toBe('unassigned');
    expect(creaseRoleOf({ color: 'Angle' })).toBe('unassigned');
  });
});
