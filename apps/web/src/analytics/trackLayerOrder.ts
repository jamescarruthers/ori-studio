import type { LayerOrderFact } from '../layer-order/model/layerOrderAnalytics';
import { ANALYTICS_EVENTS } from './events';
import { track } from './runtime';

const EVENT_OF = {
  'layer order dialog opened': ANALYTICS_EVENTS.layerOrderDialogOpened,
  'layer constraint added': ANALYTICS_EVENTS.layerConstraintAdded,
  'layer constraint blocked': ANALYTICS_EVENTS.layerConstraintBlocked,
  'layer order dialog closed': ANALYTICS_EVENTS.layerOrderDialogClosed,
  'layer constraints need attention': ANALYTICS_EVENTS.layerConstraintsNeedAttention,
} as const satisfies Record<LayerOrderFact['event'], string>;

/**
 * One of the Layer order dialog's events, as its pure model built it
 * (`layer-order/model/layerOrderAnalytics.ts`): the dialog's hook sends the
 * four the dialog reports (opened, a constraint added or blocked, closed) at
 * the moment the model says they happened, and a host sends `layer
 * constraints need attention` after a refold (H4, H7). The properties are the
 * fact's own, enums and buckets only; nothing is added here.
 */
export function trackLayerOrderFact(fact: LayerOrderFact): void {
  track(EVENT_OF[fact.event], { ...fact.properties });
}
