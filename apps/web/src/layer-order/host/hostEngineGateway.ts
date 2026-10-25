/**
 * The one door into the Layer order host engine
 * (`implementation-plans/layer-order-dialog.md`, row H2): what Edit's refold
 * and reopen, the Diagram's capture and Refresh, and Pose call when no dialog
 * is open. Hosts import this module, never `layerOrderHostEngine.ts`.
 *
 * **Nothing loads with the page** (approach 5). This module is a few lines and
 * imports no engine: the host engine's code, the runtime and comlink come in
 * one `import()` the first time a host asks, as the Diagram's capture awaits
 * `loadFold()`, and the worker and its Fold wasm only when a resolve starts.
 * Never at file open, on render, on selection or in link status: what a host
 * shows at rest comes from saved data. {@link prefetchLayerOrderHostEngine}
 * loads code ahead of an intent and never spawns a worker. A dialog gateway
 * can share {@link loadLayerOrderHostEngine}, so the dialog and the hosts load
 * the runtime once between them.
 *
 * **Every call answers** a {@link LayerOrderResolution}, never a rejection: a
 * load that fails is a `lost` engine, forgotten, so the next ask loads again.
 * The browser failing to fetch it (offline, a stale deploy) is reported to no
 * one (`engine/layerOrderLoadFailure.ts`); any other failure once.
 *
 * **Stop.** A host runs a resolve inside the fold run it already shows
 * (`withFoldInFlight`'s or `runStepFold`'s work gets the run's stop signal)
 * and passes that signal here: the run's Stop then terminates the resolve's
 * worker too, and the resolve answers `cancelled`.
 */
import type { LayerOrderLimits } from '../engine/layerOrderEngine';
import { isLayerOrderLoadFailure } from '../engine/layerOrderLoadFailure';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { lazyModule } from '../../lib/lazyModule';
import { reportError } from '../../monitoring';
import type * as HostEngine from './layerOrderHostEngine';
import type {
  LayerOrderResolveBatch,
  LayerOrderResolveBatchOptions,
  LayerOrderResolveOptions,
} from './layerOrderHostEngine';
import { LAYER_ORDER_CANCELLED, lostLayerOrder, type LayerOrderResolution } from './layerOrderResolution';

export type { LayerOrderResolveBatch, LayerOrderResolveBatchOptions, LayerOrderResolveOptions };
export type {
  LayerOrderFound,
  LayerOrderKept,
  LayerOrderLossCause,
  LayerOrderResolution,
} from './layerOrderResolution';

export type LayerOrderHostEngine = typeof HostEngine;

const hostEngine = lazyModule<LayerOrderHostEngine>(() => import('./layerOrderHostEngine'));

/** Load the host engine's code, once, whoever asks; a failed load is forgotten. Spawns nothing. */
export function loadLayerOrderHostEngine(): Promise<LayerOrderHostEngine> {
  return hostEngine.load();
}

/** Ask for the code ahead of a use (a menu opening, a hover), with nothing to report if it fails: the use does. */
export function prefetchLayerOrderHostEngine(): void {
  void hostEngine.load().catch(() => undefined);
}

/**
 * A batch of resolves on one worker: a Refresh All's. Opening it loads
 * nothing; its first resolve loads the code and spawns the worker. Close it
 * when the last resolve has answered.
 */
export function openLayerOrderResolveBatch(options: LayerOrderResolveBatchOptions = {}): LayerOrderResolveBatch {
  let closed = false;
  let batch: LayerOrderResolveBatch | null = null;
  let opening: Promise<LayerOrderResolveBatch | null> | null = null;

  const open = (): Promise<LayerOrderResolveBatch | null> => {
    opening ??= hostEngine.load().then((engine) => {
      if (closed) return null;
      batch = engine.createLayerOrderResolveBatch(options);
      return batch;
    });
    return opening;
  };

  return {
    async resolve(source, record, limits, more = {}) {
      const stopped = () => closed || !!options.signal?.aborted || !!more.signal?.aborted;
      if (stopped()) return LAYER_ORDER_CANCELLED;
      let opened: LayerOrderResolveBatch | null;
      try {
        opened = await open();
      } catch (error) {
        // Forgotten, so the next resolve loads again. A load the browser failed (offline) is
        // reported to no one (`engine/layerOrderLoadFailure.ts`); anything else once per resolve.
        opening = null;
        if (stopped()) return LAYER_ORDER_CANCELLED;
        if (!isLayerOrderLoadFailure(error)) reportError(error, { surface: 'layer-order:host', tags: { cause: 'unavailable' } });
        return lostLayerOrder('unavailable', record);
      }
      if (!opened) return LAYER_ORDER_CANCELLED;
      return opened.resolve(source, record, limits, more);
    },
    close() {
      closed = true;
      batch?.close();
    },
  };
}

/**
 * Restore `record` (its points in the crease pattern's coordinates, through
 * the host's `PaperFrame`) onto `source`, the fold the host's kernel just
 * made, within `limits` (`LAYER_ORDER_LIMITS.restore` when left out), on a
 * worker spawned for this resolve and terminated when it answers.
 */
export async function resolveLayerOrder(
  source: LayerOrderSource,
  record: LayerOrderRecord,
  limits?: LayerOrderLimits,
  options: LayerOrderResolveOptions = {}
): Promise<LayerOrderResolution> {
  const batch = openLayerOrderResolveBatch();
  try {
    return await batch.resolve(source, record, limits, options);
  } finally {
    batch.close();
  }
}

export function resetLayerOrderHostEngineForTest(): void {
  hostEngine.resetForTest();
}
