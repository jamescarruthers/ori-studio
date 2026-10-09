import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import type { FoldSentenceStep } from './stepSentence';
import {
  cpOriginLabel,
  creaseDiffLines,
  lineLabel,
  operationBadge,
  operationLabel,
  type FoldCreaseDiff,
} from './stepWords';

const t = i18n.t.bind(i18n);

const ALL = { kind: 'all' } as const;
const fold = (direction: 'valley' | 'mountain'): FoldSentenceStep => ({
  op: 'fold',
  direction,
  line: { via: 'axiom', axiom: 2, inputs: [] },
  scope: ALL,
});
const NO_CHANGE: FoldCreaseDiff = {
  added: { mountain: 0, valley: 0, flat: 0 },
  refolded: 0,
  reversed: 0,
  unfolded: 0,
};

describe('operationLabel and operationBadge', () => {
  it('name each operation, a turn in its card’s words', () => {
    const steps: FoldSentenceStep[] = [
      fold('valley'),
      fold('mountain'),
      { op: 'precrease', direction: 'valley', line: { via: 'free' }, scope: ALL },
      { op: 'precrease', direction: 'mountain', line: { via: 'free' }, scope: ALL },
      { op: 'unfold', direction: 'valley', scope: ALL },
      { op: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } },
      { op: 'turn', turn: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'ccw' } } },
      { op: 'cp-jump' },
      { op: 'unknown' },
    ];
    expect(steps.map((step) => operationLabel(t, step))).toEqual([
      'Valley fold',
      'Mountain fold',
      'Valley fold and unfold',
      'Mountain fold and unfold',
      'Unfold',
      'Turn over, side to side',
      'Rotate 1/4 turn counterclockwise',
      'Import crease pattern',
      'From a newer Ori Studio',
    ]);
    expect(steps.map((step) => operationBadge(t, step))).toEqual([
      'Valley',
      'Mountain',
      'Precrease',
      'Precrease',
      'Unfold',
      'Turn over',
      'Rotate',
      'Imported',
      'Newer',
    ]);
  });
});

describe('lineLabel', () => {
  it('says how the line was found, and nothing for a step without one', () => {
    expect(lineLabel(t, fold('valley'))).toBe('Axiom 2 · point onto point');
    expect(lineLabel(t, { op: 'precrease', direction: 'valley', line: { via: 'free' }, scope: ALL })).toBe(
      'Free line'
    );
    expect(lineLabel(t, { op: 'fold', direction: 'valley', line: { via: 'crease' }, scope: ALL })).toBe(
      'Existing crease'
    );
    // An unfold is always along a bend.
    expect(lineLabel(t, { op: 'unfold', direction: 'valley', scope: ALL })).toBe('Existing crease');
    expect(lineLabel(t, { op: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } })).toBeNull();
    expect(lineLabel(t, { op: 'cp-jump' })).toBeNull();
    // A sink's line is found as a fold's; an unsink's is the ring's crease.
    expect(lineLabel(t, { op: 'sink', kind: 'open', line: { via: 'free' } })).toBe('Free line');
    expect(lineLabel(t, { op: 'sink', kind: 'unsink', line: { via: 'crease' } })).toBe('Existing crease');
  });
});

describe('a sink’s words', () => {
  it('names each sink, label and badge alike', () => {
    const steps: FoldSentenceStep[] = (['open', 'closed', 'unsink'] as const).map((kind) => ({
      op: 'sink',
      kind,
      line: { via: 'free' },
    }));
    const names = ['Open sink', 'Closed sink', 'Unsink'];
    expect(steps.map((step) => operationLabel(t, step))).toEqual(names);
    expect(steps.map((step) => operationBadge(t, step))).toEqual(names);
  });
});

describe('creaseDiffLines', () => {
  it('says a fold’s new creases with their letters, as the design does', () => {
    expect(creaseDiffLines(t, { ...NO_CHANGE, added: { mountain: 2, valley: 2, flat: 0 } })).toEqual([
      'Adds 4 creases (2 M, 2 V)',
    ]);
    expect(creaseDiffLines(t, { ...NO_CHANGE, added: { mountain: 0, valley: 1, flat: 0 } })).toEqual([
      'Adds 1 crease (0 M, 1 V)',
    ]);
  });

  it('gives each kind of change a line of its own, in order', () => {
    expect(
      creaseDiffLines(t, {
        added: { mountain: 1, valley: 0, flat: 3 },
        refolded: 2,
        reversed: 1,
        unfolded: 4,
      })
    ).toEqual([
      'Adds 1 crease (1 M, 0 V)',
      'Adds 3 precreases',
      'Refolds 2 precreases',
      'Refolds 1 precrease the other way',
      'Unfolds 4 creases',
    ]);
  });

  it('says a step that changes nothing does so', () => {
    expect(creaseDiffLines(t, NO_CHANGE)).toEqual(['Changes no creases']);
  });
});

describe('cpOriginLabel', () => {
  it('names every origin Import CP records', () => {
    expect(
      (['cp', 'fold', 'ori', 'orh', 'sample', 'edit_folded_figure'] as const).map((origin) =>
        cpOriginLabel(t, origin)
      )
    ).toEqual(['CP file', 'FOLD file', 'ORI file', 'ORH file', 'Sample', 'Edit’s folded figure']);
  });
});
