import { expect, it } from 'vitest';
import { ribbonPath } from './ribbonPath';
import { flowLane, type LaneStop } from './flowLane';

it('fairs a hand-placed bump while the band still covers the original picture centre', () => {
  const stops: LaneStop[] = [
    { x: 30, y: 40, row: 0, rightToLeft: false },
    { x: 90, y: 90, row: 0, rightToLeft: false, placed: true },
    { x: 150, y: 40, row: 0, rightToLeft: false },
  ];
  const { lane } = ribbonPath(stops, 12);
  const middle = lane.curves[0]!.to;
  expect(middle.y).toBeLessThan(stops[1]!.y);
  expect(Math.abs(middle.y - stops[1]!.y)).toBeLessThanOrEqual(6);
  expect(stops[1]!.y).toBe(90);
});

it('follows a sloping pass without flattening its interior picture joins', () => {
  const stops: LaneStop[] = [
    { x: 20, y: 40, row: 0, rightToLeft: false },
    { x: 80, y: 60, row: 0, rightToLeft: false },
    { x: 140, y: 90, row: 0, rightToLeft: false },
  ];
  const { lane } = ribbonPath(stops);
  const [before, after] = lane.curves;
  expect(before!.c2.y).toBeLessThan(before!.to.y);
  expect(after!.c1.y).toBeGreaterThan(before!.to.y);
  const incoming = (before!.to.y - before!.c2.y) / (before!.to.x - before!.c2.x);
  const outgoing = (after!.c1.y - before!.to.y) / (after!.c1.x - before!.to.x);
  expect(incoming).toBeCloseTo(outgoing, 10);
});

it('does not change the first or last picture anchor when adding page-edge joins', () => {
  const stops: LaneStop[] = [
    { x: 30, y: 60, row: 0, rightToLeft: false },
    { x: 90, y: 80, row: 0, rightToLeft: false },
    { x: 150, y: 60, row: 0, rightToLeft: false },
  ];
  const result = flowLane({ stops, packed: true,
    plan: { side: 'right', up: true, firstRightToLeft: false, entry: 'spine', exit: 'turn' },
    pageWidth: 210, cellW: 60, halfWidth: 10, offPage: 10, spineIn: 30, spineOut: null,
  })!;
  for (const stop of [stops[0]!, stops[2]!])
    expect(result.lane.curves.some(c => c.to.x === stop.x && c.to.y === stop.y)).toBe(true);
  expect(result.lane.curves[0]!.to.y).toBe(30);
});
