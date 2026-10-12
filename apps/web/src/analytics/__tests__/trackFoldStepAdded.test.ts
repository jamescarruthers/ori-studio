import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A Fold vertex fold's step is counted by how it named what it takes, enums
 * only: a petal fold's hinge, a swivel's form — by its edge at a pivot, by its
 * edge on a folded edge, or by its rays — and an edge form's target.
 */

const runtime = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, track: runtime.track };
});

const { trackFoldStepAdded } = await import('../trackFold');

beforeEach(() => {
  runtime.track.mockClear();
});

describe('trackFoldStepAdded for a swivel', () => {
  it('sends its form, and an edge form’s target', () => {
    trackFoldStepAdded('swivel', { vertex: { swivelForm: 'fold', target: 'crease' } });
    expect(runtime.track).toHaveBeenCalledWith('fold step added', {
      op_kind: 'swivel',
      swivel_form: 'fold',
      target: 'crease',
    });
    trackFoldStepAdded('swivel', { vertex: { swivelForm: 'edge', target: 'free' } });
    expect(runtime.track).toHaveBeenLastCalledWith('fold step added', {
      op_kind: 'swivel',
      swivel_form: 'edge',
      target: 'free',
    });
    trackFoldStepAdded('swivel', { vertex: { swivelForm: 'rays' } });
    expect(runtime.track).toHaveBeenLastCalledWith('fold step added', { op_kind: 'swivel', swivel_form: 'rays' });
  });
});
