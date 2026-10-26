import { ANALYTICS_EVENTS } from './events';
import { track } from './runtime';

/** Where a host's layer order lives: an Edit figure, an Edit selection, a Diagram step, Pose. */
type LayerOrderSurface = 'edit_figure' | 'edit_pattern' | 'diagram_step' | 'pose';

/**
 * A host's saved layer constraints need attention after an edit (spec §10):
 * where, and how many did not hold, bucketed by the Layer order model's own
 * ladder (`needsAttentionFact`, `layer-order/model/layerOrderAnalytics.ts`),
 * so the dialog's and the hosts' buckets agree. Never a face, a point or the
 * count itself.
 */
export function trackLayerConstraintsNeedAttention(properties: {
  surface: LayerOrderSurface;
  broken_count_bucket: string;
}): void {
  track(ANALYTICS_EVENTS.layerConstraintsNeedAttention, properties);
}

/**
 * A record a reload detached from its host, because an older build folded
 * it again, let go with Dismiss rather than reviewed: where, and how many
 * constraints it held, bucketed by the dialog's ladder (`dismissedFact`).
 */
export function trackLayerConstraintsDismissed(properties: {
  surface: LayerOrderSurface;
  constraint_count_bucket: string;
}): void {
  track(ANALYTICS_EVENTS.layerConstraintsDismissed, properties);
}
