/**
 * The one door into the Layer order dialog (`implementation-plans/layer-order-dialog.md`,
 * row U4). Edit's figures and selection (H3, H5), a Diagram step (H7) and
 * Pose (H8) each build a `LayerOrderRequest` and call
 * {@link openLayerOrderDialog}; nothing else outside the dialog imports any
 * of it, and nothing at all but this module imports the dialog's component
 * (`layerOrderBoundary.test.ts`).
 *
 * **Nothing loads with the page** (approach 5). This module is a few lines
 * and imports no engine and no dialog code: the dialog's chunk (its
 * component, the session hook, the engine runtime and comlink) comes in one
 * `import()` on the first open, and the engine's worker, with the Fold wasm,
 * only when the dialog mounts and opens its session. Opening and closing the
 * workspace, a file, a render or a selection load none of it.
 * {@link prefetchLayerOrderDialog} loads the code ahead of an intent (a menu
 * opening) and never spawns a worker.
 *
 * **Every open answers**, never rejects (`LayerOrderDialogOutcome`): only
 * `applied` writes. A host that gets anything else leaves its document as it
 * was.
 */
import { toast } from 'sonner';
import i18n from '../../i18n';
import { lazyModule } from '../../lib/lazyModule';
import type { LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import type * as LayerOrderDialogChunk from '../../components/layer-order/LayerOrderDialog';
import {
  beginLayerOrderDialog,
  settleLayerOrderDialog,
  type LayerOrderDialogOutcome,
} from './layerOrderDialogStore';

export type { LayerOrderDialogOutcome } from './layerOrderDialogStore';

/** The dialog's chunk, as the mount renders it. */
export type LayerOrderDialogModule = typeof LayerOrderDialogChunk;

const dialog = lazyModule<LayerOrderDialogModule>(() => import('../../components/layer-order/LayerOrderDialog'));

/**
 * Open the Layer order dialog on `request`, and answer how it ended.
 *
 * - `applied`: commit `outcome.applied` (one fold with its relations on its
 *   source, one undo step, its record saved);
 * - `unchanged`, `cancelled`: write nothing;
 * - `busy`: another Layer order dialog is open, and this ask opened nothing;
 * - `unavailable`: the dialog's code did not load (offline); the user has
 *   been told, so the host says nothing more.
 */
export function openLayerOrderDialog(request: LayerOrderRequest): Promise<LayerOrderDialogOutcome> {
  const begun = beginLayerOrderDialog(request);
  if (!('opening' in begun)) return Promise.resolve(begun);
  const { id } = begun.opening;
  dialog.load().catch(() => {
    // A stale deploy reloads the page (`importOrReload`); what is left is a load that can't
    // reach the server. Said once, here, so no host has to.
    if (settleLayerOrderDialog(id, { kind: 'unavailable' })) {
      toast.error(i18n.t('toasts:layerOrder.unavailable', 'Layer order didn’t load. Check your connection and try again.'));
    }
  });
  return begun.outcome;
}

/** Load the dialog's code ahead of a use, with nothing to report if it fails: the open that follows does. Spawns nothing. */
export function prefetchLayerOrderDialog(): void {
  void dialog.load().catch(() => undefined);
}

/** The dialog's code once it has loaded, for the mount's render; never asks for it. */
export function useLoadedLayerOrderDialog(): LayerOrderDialogModule | null {
  return dialog.useLoaded();
}

export function resetLayerOrderDialogGatewayForTest(): void {
  dialog.resetForTest();
}
