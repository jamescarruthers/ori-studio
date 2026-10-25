/** The dialog's analytics facts (spec §10): enums and buckets only. */
import { describe, expect, it } from 'vitest';
import {
  constraintAddedFact,
  constraintBlockedFact,
  dialogClosedFact,
  dialogOpenedFact,
  needsAttentionFact,
  solutionsBucket,
} from './layerOrderAnalytics';

describe('the analytics facts', () => {
  it('solutions_bucket: pending, skipped, a bucket when exact, a lower bound when not', () => {
    expect(solutionsBucket(null, true)).toBe('pending');
    expect(solutionsBucket({ n: 9, exact: true }, false)).toBe('skipped');
    expect(solutionsBucket({ n: 0, exact: true }, true)).toBe('<=0');
    expect(solutionsBucket({ n: 1, exact: true }, true)).toBe('<=1');
    expect(solutionsBucket({ n: 9, exact: true }, true)).toBe('<=10');
    expect(solutionsBucket({ n: 5000, exact: true }, true)).toBe('>1000');
    expect(solutionsBucket({ n: 37, exact: false }, true)).toBe('>=10');
    expect(solutionsBucket({ n: 2_000_000, exact: false }, true)).toBe('>=1000');
  });

  it('each event carries only enums and bucketed counts', () => {
    expect(dialogOpenedFact('diagram_step', 340, 'pending')).toEqual({
      event: 'layer order dialog opened',
      properties: { surface: 'diagram_step', face_count_bucket: '<=500', solutions_bucket: 'pending' },
    });
    expect(constraintAddedFact('behind', 'folded', 'list')).toEqual({
      event: 'layer constraint added',
      properties: { verb: 'behind', subject_origin: 'folded', object_origin: 'list' },
    });
    expect(constraintBlockedFact(3)).toEqual({
      event: 'layer constraint blocked',
      properties: { constraint_count_bucket: '<=5' },
    });
    expect(dialogClosedFact('cancelled', 0, '<=10', 42_000)).toEqual({
      event: 'layer order dialog closed',
      properties: {
        outcome: 'cancelled',
        constraint_count_bucket: '<=0',
        solutions_bucket: '<=10',
        elapsed_ms_bucket: '<=60000',
      },
    });
    expect(needsAttentionFact('edit_figure', 2)).toEqual({
      event: 'layer constraints need attention',
      properties: { surface: 'edit_figure', broken_count_bucket: '<=2' },
    });
  });

  it('a clock that ran backwards buckets as no time, never a negative number', () => {
    expect(dialogClosedFact('applied', 1, 'pending', -5).properties).toMatchObject({ elapsed_ms_bucket: '<=5000' });
  });
});
