/**
 * The vertex folds' words — squash, petal fold, rabbit ear, swivel (plan
 * Phase 11) — for `stepSentence` and `stepWords`: one whole sentence, one
 * operation name and one badge per fold, each a literal `t()` call so the
 * extractor sees it. A vertex fold names no line and no layer count (its
 * creases are its own, computed from the flap or the triangle), so each is
 * one sentence, not a table.
 *
 * React-free.
 */
import type { TFunction } from 'i18next';
import type { FoldVertexOpKind } from './document/foldSequenceDocument';

/** The step's sentence: "Squash-fold the flap." */
export function vertexSentence(t: TFunction, fold: FoldVertexOpKind): string {
  switch (fold) {
    case 'squash':
      return t('panels:fold.sentence.squash', 'Squash-fold the flap.');
    case 'petal':
      return t('panels:fold.sentence.petal', 'Petal-fold the flap.');
    case 'rabbit-ear':
      return t('panels:fold.sentence.rabbitEar', 'Rabbit-ear the triangle.');
    case 'swivel':
      return t('panels:fold.sentence.swivel', 'Swivel-fold the paper about the point.');
  }
}

/** What the operation is called: "Squash fold". */
export function vertexLabel(t: TFunction, fold: FoldVertexOpKind): string {
  switch (fold) {
    case 'squash':
      return t('panels:fold.words.squash', 'Squash fold');
    case 'petal':
      return t('panels:fold.words.petal', 'Petal fold');
    case 'rabbit-ear':
      return t('panels:fold.words.rabbitEar', 'Rabbit ear');
    case 'swivel':
      return t('panels:fold.words.swivel', 'Swivel fold');
  }
}

/** The operation in a word, for a badge beside a step's number: "Squash". */
export function vertexBadge(t: TFunction, fold: FoldVertexOpKind): string {
  switch (fold) {
    case 'squash':
      return t('panels:fold.words.badgeSquash', 'Squash');
    case 'petal':
      return t('panels:fold.words.badgePetal', 'Petal');
    case 'rabbit-ear':
      return t('panels:fold.words.badgeRabbitEar', 'Rabbit ear');
    case 'swivel':
      return t('panels:fold.words.badgeSwivel', 'Swivel');
  }
}
