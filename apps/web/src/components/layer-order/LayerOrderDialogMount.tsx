import { useEffect, useState } from 'react';
import {
  abandonLayerOrderDialog,
  registerLayerOrderDialogMount,
  useLayerOrderDialogOpening,
  useLoadedLayerOrderDialog,
} from '../../layer-order/dialog/layerOrderDialogGateway';
import { ErrorBoundary } from '../errors/ErrorBoundary';

/**
 * The Layer order dialog's place at the app root (`App.tsx`). Nothing until a
 * host opens the dialog through its gateway, which asks for the dialog's code
 * then; the dialog once that code is here. Rendering this loads no code,
 * spawns no worker and costs a store read. Like a host, it reaches the dialog
 * only through the gateway (`layerOrderBoundary.test.ts`).
 *
 * Its being mounted is what lets a host's open go ahead: with none mounted, an
 * open answers `unavailable` at once rather than waiting on a dialog nobody
 * shows, and an open dialog goes when its mount does.
 *
 * **A dialog that crashes** is reported (the boundary) and answers its host
 * `cancelled` at once, so the host never waits and the next open is not
 * `busy`; its worker goes with it. Its fallback ("This dialog stopped
 * working") stays on screen, with Close rather than Try again, until it is
 * closed or another opening takes its place.
 */
export function LayerOrderDialogMount() {
  const opening = useLayerOrderDialogOpening();
  const chunk = useLoadedLayerOrderDialog();
  // The opening whose dialog crashed, kept so its fallback outlives its answer.
  const [crashed, setCrashed] = useState<number | null>(null);
  useEffect(() => registerLayerOrderDialogMount(), []);
  const shown = opening?.id ?? crashed;
  if (shown === null || !chunk) return null;
  return (
    <ErrorBoundary
      key={shown}
      surface="overlay:layer-order"
      variant="overlay"
      // Its host has heard `cancelled`: nothing can reopen it, so the fallback offers Close, not Try again.
      retryable={false}
      onError={() => {
        abandonLayerOrderDialog(shown);
        setCrashed(shown);
      }}
    >
      {opening?.id === shown ? <chunk.LayerOrderDialog opening={opening} /> : null}
    </ErrorBoundary>
  );
}
