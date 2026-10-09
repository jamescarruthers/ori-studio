import { describe, expect, it } from 'vitest';
import type { FoldReverseReport } from '../engine/foldEngineReverseWire';
import { foldCompoundPaneRows } from './foldCompoundRows';

const opening = {
  lower: [1],
  upper: [2],
  spine: { n: [0.7071, 0.7071] as [number, number], d: 0.7071 },
  across: [3],
  lower_body: [4],
  upper_body: [5],
  stored: { upper: [[0.9, 0.1] as [number, number]] },
};

const report = (extra: Partial<FoldReverseReport> = {}): FoldReverseReport => ({
  op: 'reverse',
  line: { n: [0, 1], d: 0.5 },
  side: 'negative',
  snap: { clusters: 0, angle: 0, max_shift: 0 },
  kind: 'inside',
  openings: [opening],
  whole: [],
  moving: [1, 2],
  blocks: [[6], [7]],
  created: [8, 9],
  unfolded: [],
  refolded: [],
  reversed: [3],
  split: 2,
  motion: { kind: 'visual', legs: [] },
  stored: {},
  ...extra,
});

describe('a compound fold’s Step pane rows', () => {
  it('counts its blocks and says whether its opening and order were chosen among several', () => {
    expect(foldCompoundPaneRows(report())).toEqual({ blocks: 2, opening: 'only', orderChosen: false });
    expect(
      foldCompoundPaneRows(report({ stored: { openings: [opening.stored], order: { faces: [], orders: [[0, 1, 1]] } } }))
    ).toEqual({ blocks: 2, opening: 'chosen', orderChosen: true });
    // A flap moving whole has no opening to speak of.
    expect(foldCompoundPaneRows(report({ openings: [], whole: [[1, 2]], blocks: [[6, 7]] }))).toEqual({
      blocks: 1,
      opening: null,
      orderChosen: false,
    });
    expect(foldCompoundPaneRows(undefined)).toBeUndefined();
  });
});
