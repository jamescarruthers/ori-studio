/**
 * The Layer order engine, alone in a worker (`implementation-plans/layer-order-dialog.md`,
 * approach 5): one constraint session over a flat fold and its solutions
 * cursor, behind the contract in `layer-order/engine/layerOrderEngine.ts`,
 * over the Fold bridge's `layer_*` calls (`layerOrderBridgeBackend.ts`).
 *
 * One file for both roles, each in a worker of its own, spawned by
 * `layer-order/engine/layerOrderRuntime.ts`: the dialog's session, whose
 * runtime advances the solution count in short slices between the dialog's
 * calls, and the hosts' engine (H2). Neither is the Fold workspace's worker,
 * and neither touches its engine: stopping one never costs Fold a state, and
 * a session here never queues behind Fold's replays. Each holds its own
 * instance of the Fold wasm, loaded on the worker's first call.
 *
 * **Never pre-downloaded.** This worker and the Fold wasm it loads are
 * fetched the first time something spawns it, never warmed by the service
 * worker (`UNWARMED_PATTERNS`, `vite.config.ts`; the WebKit lane checks the
 * cache, `scripts/webkit-pwa-check.mjs`).
 */
import { expose } from 'comlink';
import init, { FoldEngine } from '../generated/oristudio-fold-wasm/oristudio_fold_wasm';
import { createLayerOrderBridgeBackend } from './layerOrderBridgeBackend';
import { createLayerOrderWorkerApi } from './layerOrderWorkerApi';

expose(
  createLayerOrderWorkerApi(async () => {
    await init();
    return createLayerOrderBridgeBackend(new FoldEngine());
  })
);
