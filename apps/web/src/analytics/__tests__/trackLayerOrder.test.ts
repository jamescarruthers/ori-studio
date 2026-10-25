import { beforeEach, expect, it, vi } from 'vitest';
import { needsAttentionFact } from '../../layer-order/model/layerOrderAnalytics';

/**
 * A host's saved constraints needing attention are counted with enums and a
 * bucket only (spec §10): where, and how many, by the dialog's own ladder.
 */

const runtime = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, track: runtime.track };
});

const { trackLayerConstraintsNeedAttention } = await import('../trackLayerOrder');

beforeEach(() => {
  runtime.track.mockClear();
});

it('sends where and how many, bucketed, and nothing else', () => {
  trackLayerConstraintsNeedAttention(needsAttentionFact('diagram_step', 3).properties);
  expect(runtime.track).toHaveBeenCalledWith('layer constraints need attention', {
    surface: 'diagram_step',
    broken_count_bucket: '<=5',
  });
  trackLayerConstraintsNeedAttention(needsAttentionFact('diagram_step', 40).properties);
  expect(runtime.track).toHaveBeenLastCalledWith('layer constraints need attention', {
    surface: 'diagram_step',
    broken_count_bucket: '>10',
  });
});
