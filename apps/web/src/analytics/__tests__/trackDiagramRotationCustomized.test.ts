import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A rotation's Amount set to Custom says only what it is on — a turn or a
 * rotate mark — never the angle.
 */

const runtime = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, track: runtime.track };
});

const { trackDiagramRotationCustomized } = await import('../trackDiagram');

beforeEach(() => {
  runtime.track.mockClear();
});

describe('trackDiagramRotationCustomized', () => {
  it('sends what the rotation is on, and nothing else', () => {
    trackDiagramRotationCustomized('turn');
    expect(runtime.track).toHaveBeenCalledWith('diagram rotation customized', { target: 'turn' });
    trackDiagramRotationCustomized('mark');
    expect(runtime.track).toHaveBeenLastCalledWith('diagram rotation customized', { target: 'mark' });
  });
});
