import { describe, expect, it } from 'vitest';
import { sequenceOf, step, valleyAt } from '../document/foldSequence.fixtures';
import { FOLD_PENDING_NODE } from '../session/foldSessionState';
import { foldGridEntries, isFoldGridTurn } from './foldGridEntries';
import { foldPathEntries } from './foldSequencePath';

describe('foldGridEntries', () => {
  it('makes each turn a card of its own between the numbers either side, as Fold numbers them', () => {
    const document = sequenceOf([
      step('t0', null, { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } }),
      step('a', 't0', valleyAt(0.5)),
      step('t1', 'a', { kind: 'turn', axis: 'vertical' }),
    ]);
    const entries = foldPathEntries(document, ['t0', 'a', 't1'], FOLD_PENDING_NODE, new Map(), FOLD_PENDING_NODE);
    const grid = foldGridEntries(entries);
    expect(grid.map((entry) => [entry.id, isFoldGridTurn(entry)])).toEqual([
      ['', false],
      ['t0', true],
      ['a', false],
      ['t1', true],
    ]);
    expect(grid[1]).toMatchObject({
      turn: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } },
      between: { before: 0, after: 1 },
    });
    expect(grid[3]).toMatchObject({ turn: { kind: 'turn-over', axis: 'vertical' }, between: { before: 1, after: null } });
    expect(grid.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
  });
});
