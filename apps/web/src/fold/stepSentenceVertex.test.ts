import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { FOLD_VERTEX_OP_KINDS } from './document/foldSequenceDocument';
import { foldSentenceStepOf } from './sequence/foldSentenceStep';
import { foldStepSentence } from './stepSentence';
import { lineLabel, operationBadge, operationLabel } from './stepWords';

const t = i18n.t.bind(i18n);

describe('a vertex fold’s words', () => {
  it('are a sentence, a name and a badge of their own, and no line', () => {
    const words = FOLD_VERTEX_OP_KINDS.map((fold) => {
      const step = { op: 'vertex', fold, direction: 'valley' } as const;
      return [foldStepSentence(t, step), operationLabel(t, step), operationBadge(t, step), lineLabel(t, step)];
    });
    expect(words).toEqual([
      ['Squash-fold the flap.', 'Squash fold', 'Squash', null],
      ['Petal-fold the flap.', 'Petal fold', 'Petal', null],
      ['Rabbit-ear the triangle.', 'Rabbit ear', 'Rabbit ear', null],
      ['Swivel-fold the paper about the point.', 'Swivel fold', 'Swivel', null],
    ]);
  });

  it('come from the stored op, its direction kept', () => {
    const context = { paper: { kind: 'square' }, marks: [] } as unknown as Parameters<typeof foldSentenceStepOf>[1];
    expect(foldSentenceStepOf({ kind: 'squash', flap: [0.2, 0.1], direction: 'mountain' }, context)).toEqual({
      op: 'vertex',
      fold: 'squash',
      direction: 'mountain',
    });
  });
});
