/**
 * The vertex folds' words — squash, petal fold, rabbit ear, swivel (plan
 * Phase 11) — for `stepSentence` and `stepWords`: one whole sentence, one
 * operation name and one badge per fold, each a literal `t()` call so the
 * extractor sees it. A vertex fold names no line and no layer count (its
 * creases are its own, computed from the flap or the triangle), so each is
 * one sentence, not a table.
 *
 * The direction is said: a valley vertex fold folds the paper on top, toward
 * the viewer, and a mountain one the paper at the back, behind — the flap a
 * click names is the top one for a valley and the bottom one for a mountain
 * (`tools/vertex/vertexStep`). A mountain fold is said "behind", as a diagram
 * says it, in a sentence of its own. The badge is the fold's alone, as the
 * tuck's is.
 *
 * React-free.
 */
import type { TFunction } from 'i18next';
import type { FoldDirection, FoldVertexOpKind } from './document/foldSequenceDocument';

/** The step's sentence: "Squash-fold the flap.", "Squash-fold the flap behind." */
export function vertexSentence(t: TFunction, fold: FoldVertexOpKind, direction: FoldDirection): string {
  if (direction === 'mountain') {
    switch (fold) {
      case 'squash':
        return t('panels:fold.sentence.behind.squash', 'Squash-fold the flap behind.');
      case 'petal':
        return t('panels:fold.sentence.behind.petal', 'Petal-fold the flap behind.');
      case 'rabbit-ear':
        return t('panels:fold.sentence.behind.rabbitEar', 'Rabbit-ear the triangle behind.');
      case 'swivel':
        return t('panels:fold.sentence.behind.swivel', 'Swivel-fold the paper behind, about the point.');
    }
  }
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

/** What the operation is called: "Squash fold", "Squash fold behind". */
export function vertexLabel(t: TFunction, fold: FoldVertexOpKind, direction: FoldDirection): string {
  if (direction === 'mountain') {
    switch (fold) {
      case 'squash':
        return t('panels:fold.words.behind.squash', 'Squash fold behind');
      case 'petal':
        return t('panels:fold.words.behind.petal', 'Petal fold behind');
      case 'rabbit-ear':
        return t('panels:fold.words.behind.rabbitEar', 'Rabbit ear behind');
      case 'swivel':
        return t('panels:fold.words.behind.swivel', 'Swivel fold behind');
    }
  }
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
