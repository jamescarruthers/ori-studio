/**
 * When a Layer order engine failure is the browser failing to load it, not
 * the engine failing: the one rule the dialog and the hosts' engine both
 * follow (`implementation-plans/layer-order-dialog.md`, approach 5).
 *
 * The dialog's code, its worker and the Fold wasm are fetched the first time
 * they are needed, never ahead (approach 5), so a user who is offline, or on
 * a connection that drops, meets them failing to load. That is browser noise,
 * not a defect: the dialog shows its lost state with Try again (the gateway, a
 * toast; a host, `lost` as `unavailable`), and nothing is reported to Sentry.
 * A trap, a worker that crashed while running, and any other engine error are
 * defects, and are reported once, as before.
 *
 * What counts as failing to load:
 * - **a worker that never ran**, its `error` a plain event
 *   (`WorkerFailure.loadFailed`), or the runtime's loss for one
 *   (`LayerOrderEngineLost.loadFailed`): its script or an import did not load;
 * - **an engine that did not start** (`layer_order_engine_unavailable`)
 *   because the Fold wasm did not arrive: a fetch the network refused, or a
 *   response that was not wasm (a page in its place);
 * - **a lazy chunk that did not load** (the dialog's code, the host
 *   engine's), as `importOrReload` words it, or a fetch the network refused;
 * - for those last two, **any failure while the browser says it is offline**.
 *
 * Small and engine-free: the dialog's gateway imports it with the page.
 */
import { isChunkLoadError } from '../../lib/importOrReload';
// The leaf, not the contract: the gateway imports this with the page.
import { LAYER_ORDER_CALL_FAILURES, isLayerOrderEngineTrapped } from './layerOrderCallFailures';

/**
 * How browsers word a fetch that did not happen, and a response that was not
 * the wasm asked for (an HTML page served in its place):
 * - a refused fetch: Chromium's "Failed to fetch", Firefox's "NetworkError
 *   when attempting to fetch resource", WebKit's "Load failed", "The network
 *   connection was lost" and "The Internet connection appears to be offline";
 * - not wasm: `instantiateStreaming` refusing the response's status or type,
 *   then the compile of what came finding no wasm header (Chromium "expected
 *   magic word", Firefox "failed to match magic number", WebKit "doesn't start
 *   with '\0asm'").
 */
const FETCH_FAILURE =
  /Failed to fetch|NetworkError when attempting to fetch|Load failed|network connection was lost|Internet connection appears to be offline|HTTP status code is not ok|Incorrect response MIME type|expected magic word|failed to match magic number|doesn't start with '\\0asm'/i;

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function messageOf(failure: object): string {
  const message = (failure as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

/** Whether `failure` is the browser failing to load the engine (see the module docs): shown, never reported. */
export function isLayerOrderLoadFailure(failure: unknown): boolean {
  if (!failure || typeof failure !== 'object') return false;
  // A trap is the engine's own failure, offline or not.
  if (isLayerOrderEngineTrapped(failure)) return false;
  // A worker that never ran, or the runtime's loss for one.
  if ((failure as { loadFailed?: unknown }).loadFailed === true) return true;
  // The worker ran and its engine did not start: the wasm did not arrive.
  if ((failure as { code?: unknown }).code === LAYER_ORDER_CALL_FAILURES.unavailable) {
    return offline() || FETCH_FAILURE.test(messageOf(failure));
  }
  // A lazy chunk's import.
  if (failure instanceof Error) {
    return offline() || isChunkLoadError(failure) || FETCH_FAILURE.test(failure.message);
  }
  return false;
}
