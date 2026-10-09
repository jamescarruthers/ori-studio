import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import {
  foldStepSentence,
  sentenceInputLetters,
  type FoldLayerScope,
  type FoldSentenceLine,
  type FoldSentenceReference,
  type FoldSentenceStep,
} from './stepSentence';

// The app's own i18next, which the test setup starts on the inline English
// defaults: plural defaults resolve as they do at run time.
const t = i18n.t.bind(i18n);

const ALL: FoldLayerScope = { kind: 'all' };
const corner = (corner: 'sw' | 'se' | 'nw' | 'ne'): FoldSentenceReference => ({ kind: 'corner', corner });
const edge = (side: 'bottom' | 'top' | 'left' | 'right'): FoldSentenceReference => ({ kind: 'edge', side });
const POINT: FoldSentenceReference = { kind: 'point' };
const LINE: FoldSentenceReference = { kind: 'line' };

const valley = (line: FoldSentenceLine, scope: FoldLayerScope = ALL): FoldSentenceStep => ({
  op: 'fold',
  direction: 'valley',
  line,
  scope,
});

describe('foldStepSentence', () => {
  it('says a half fold corner to corner as the design writes it, mover first', () => {
    const halfDiagonal: FoldSentenceLine = {
      via: 'axiom',
      axiom: 2,
      inputs: [corner('sw'), corner('ne')],
      moving: [1],
      inHalf: true,
    };
    expect(foldStepSentence(t, valley(halfDiagonal))).toBe(
      'Valley fold in half, bringing the top-right corner onto the bottom-left corner, through all layers.'
    );
    // The same fold with the other corner moving names that one first.
    expect(foldStepSentence(t, valley({ ...halfDiagonal, moving: [0] }))).toBe(
      'Valley fold in half, bringing the bottom-left corner onto the top-right corner, through all layers.'
    );
    // Not in half: the same move without the words for it.
    expect(foldStepSentence(t, valley({ ...halfDiagonal, inHalf: false }))).toBe(
      'Valley fold, bringing the top-right corner onto the bottom-left corner, through all layers.'
    );
  });

  it('keeps the axiom’s order when nothing is said to move', () => {
    const edges: FoldSentenceLine = { via: 'axiom', axiom: 3, inputs: [edge('bottom'), edge('top')] };
    expect(foldStepSentence(t, valley(edges))).toBe(
      'Valley fold, bringing the bottom edge onto the top edge, through all layers.'
    );
    expect(foldStepSentence(t, valley({ ...edges, inHalf: true }))).toBe(
      'Valley fold in half, bringing the bottom edge onto the top edge, through all layers.'
    );
  });

  it('says each layer scope, counted from the top for a valley and the bottom for a mountain', () => {
    const line: FoldSentenceLine = { via: 'free' };
    expect(foldStepSentence(t, valley(line, { kind: 'depth', layers: 1 }))).toBe(
      'Valley fold along the line drawn, folding only the top layer.'
    );
    expect(foldStepSentence(t, valley(line, { kind: 'depth', layers: 4 }))).toBe(
      'Valley fold along the line drawn, folding only the top 4 layers.'
    );
    expect(
      foldStepSentence(t, { op: 'fold', direction: 'mountain', line, scope: { kind: 'depth', layers: 2 } })
    ).toBe('Mountain fold along the line drawn, folding only the bottom 2 layers.');
    expect(foldStepSentence(t, valley(line, { kind: 'flaps', flaps: 1 }))).toBe(
      'Valley fold along the line drawn, folding only the flap shown.'
    );
    expect(foldStepSentence(t, valley(line, { kind: 'flaps', flaps: 3 }))).toBe(
      'Valley fold along the line drawn, folding only the 3 flaps shown.'
    );
  });

  it('says a precrease as fold and unfold, in its direction', () => {
    const crease: FoldSentenceLine = { via: 'crease' };
    expect(foldStepSentence(t, { op: 'precrease', direction: 'valley', line: crease, scope: ALL })).toBe(
      'Valley fold and unfold along the existing crease, through all layers.'
    );
    expect(
      foldStepSentence(t, {
        op: 'precrease',
        direction: 'mountain',
        line: crease,
        scope: { kind: 'depth', layers: 2 },
      })
    ).toBe('Mountain fold and unfold along the existing crease, folding only the bottom 2 layers.');
  });

  it('names the sheet’s own references by description and the rest by their letters', () => {
    // O1 `[p, q]`: the corner keeps the letter P, so the mark is Q.
    expect(foldStepSentence(t, valley({ via: 'axiom', axiom: 1, inputs: [corner('sw'), POINT] }))).toBe(
      'Valley fold along the line joining the bottom-left corner and point Q, through all layers.'
    );
    // O4 `[p, m]`: through p, m folded onto itself.
    expect(foldStepSentence(t, valley({ via: 'axiom', axiom: 4, inputs: [POINT, edge('bottom')] }))).toBe(
      'Valley fold the bottom edge onto itself, pivoting on point P, through all layers.'
    );
  });

  it('brings O5’s point onto its line, or the line onto the point when the line moves', () => {
    const o5: FoldSentenceLine = { via: 'axiom', axiom: 5, inputs: [POINT, corner('ne'), LINE], moving: [1] };
    expect(foldStepSentence(t, valley(o5))).toBe(
      'Valley fold, pivoting on point P, bringing the top-right corner onto line A, through all layers.'
    );
    expect(foldStepSentence(t, valley({ ...o5, moving: [2] }))).toBe(
      'Valley fold, pivoting on point P, bringing line A onto the top-right corner, through all layers.'
    );
  });

  it('orders each of O6’s pairs by its own mover', () => {
    const o6: FoldSentenceLine = {
      via: 'axiom',
      axiom: 6,
      inputs: [POINT, LINE, POINT, LINE],
      moving: [0, 3],
    };
    expect(foldStepSentence(t, valley(o6))).toBe(
      'Valley fold, bringing point P onto line A and line B onto point Q, through all layers.'
    );
  });

  it('folds O7’s second line onto itself and lands its point on the first', () => {
    const o7: FoldSentenceLine = { via: 'axiom', axiom: 7, inputs: [POINT, LINE, edge('left')], moving: [0] };
    expect(foldStepSentence(t, valley(o7))).toBe(
      'Valley fold the left edge onto itself so that point P lands on line A, through all layers.'
    );
  });

  it('says "in half" only where a fold brings one thing onto another', () => {
    const o5: FoldSentenceLine = { via: 'axiom', axiom: 5, inputs: [POINT, POINT, LINE], inHalf: true };
    expect(foldStepSentence(t, valley(o5))).toBe(
      'Valley fold, pivoting on point P, bringing point Q onto line A, through all layers.'
    );
  });

  it('marks a missing input rather than shifting the others along', () => {
    expect(foldStepSentence(t, valley({ via: 'axiom', axiom: 2, inputs: [POINT] }))).toBe(
      'Valley fold, bringing point P onto ?, through all layers.'
    );
  });

  it('says an unfold by the layers it opens', () => {
    expect(foldStepSentence(t, { op: 'unfold', direction: 'valley', scope: { kind: 'flaps', flaps: 1 } })).toBe(
      'Unfold the flap shown.'
    );
    expect(foldStepSentence(t, { op: 'unfold', direction: 'valley', scope: { kind: 'depth', layers: 2 } })).toBe(
      'Unfold the top 2 layers.'
    );
    expect(foldStepSentence(t, { op: 'unfold', direction: 'mountain', scope: ALL })).toBe(
      'Unfold along the existing crease, through all layers.'
    );
  });

  it('says a turn in the words its card uses', () => {
    expect(foldStepSentence(t, { op: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } })).toBe(
      'Turn over, side to side.'
    );
    expect(
      foldStepSentence(t, {
        op: 'turn',
        turn: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } },
      })
    ).toBe('Rotate 1/4 turn clockwise.');
  });

  it('says what an imported crease pattern and a newer step are', () => {
    expect(foldStepSentence(t, { op: 'cp-jump' })).toBe('Collapse into the imported crease pattern.');
    expect(foldStepSentence(t, { op: 'unknown' })).toBe('A step made with a newer Ori Studio.');
  });
});

describe('sentenceInputLetters', () => {
  it('letters every input by position and kind, the sheet’s own included', () => {
    expect(sentenceInputLetters([corner('sw'), edge('top'), POINT, LINE]).byInput).toEqual(['P', 'A', 'Q', 'B']);
    expect(sentenceInputLetters([{ kind: 'diagonal', diagonal: 'sw_ne' }, POINT])).toEqual({
      byInput: ['A', 'P'],
      nextPoint: 'Q',
      nextLine: 'B',
    });
  });
});
