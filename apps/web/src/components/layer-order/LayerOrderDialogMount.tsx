import { useEffect } from 'react';
import { useLoadedLayerOrderDialog } from '../../layer-order/dialog/layerOrderDialogGateway';
import {
  registerLayerOrderDialogMount,
  settleLayerOrderDialog,
  useLayerOrderDialogStore,
} from '../../layer-order/dialog/layerOrderDialogStore';
import { ErrorBoundary } from '../errors/ErrorBoundary';

/**
 * The Layer order dialog's place at the app root (`App.tsx`). Nothing until a
 * host opens the dialog through its gateway, which asks for the dialog's code
 * then; the dialog once that code is here. Rendering this loads no code,
 * spawns no worker and costs a store read.
 *
 * Its being mounted is what lets a host's open go ahead: with none mounted, an
 * open answers `unavailable` at once rather than waiting on a dialog nobody
 * shows, and an open dialog goes when its mount does. A dialog that crashes
 * is reported and answers `cancelled`, so its host is never left waiting and
 * the next open is not refused as `busy`.
 */
export function LayerOrderDialogMount() {
  const opening = useLayerOrderDialogStore((state) => state.opening);
  const chunk = useLoadedLayerOrderDialog();
  useEffect(() => registerLayerOrderDialogMount(), []);
  if (!opening || !chunk) return null;
  return (
    <ErrorBoundary
      key={opening.id}
      surface="overlay:layer-order"
      variant="overlay"
      onError={() => settleLayerOrderDialog(opening.id, { kind: 'cancelled' })}
    >
      <chunk.LayerOrderDialog opening={opening} />
    </ErrorBoundary>
  );
}
