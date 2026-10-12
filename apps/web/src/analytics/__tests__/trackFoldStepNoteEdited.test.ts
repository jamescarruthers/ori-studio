import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A Fold step's note edit is counted by what it did alone: never its text, nor which step. */

const runtime = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, track: runtime.track };
});

const { trackFoldStepNoteEdited } = await import('../trackFold');

beforeEach(() => {
  runtime.track.mockClear();
});

describe('trackFoldStepNoteEdited', () => {
  it('sends what the sitting did, and nothing else', () => {
    trackFoldStepNoteEdited('added');
    trackFoldStepNoteEdited('cleared');
    expect(runtime.track.mock.calls).toEqual([
      ['fold step note edited', { action: 'added' }],
      ['fold step note edited', { action: 'cleared' }],
    ]);
  });
});
