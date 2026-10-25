/**
 * The Layer order engine, alone in a worker (`implementation-plans/layer-order-dialog.md`,
 * approach 5): one constraint session over a flat fold, behind the contract in
 * `layer-order/engine/layerOrderEngine.ts`.
 *
 * One file for every role, each in a worker of its own, spawned by
 * `layer-order/engine/layerOrderRuntime.ts`: the dialog's session, the
 * dialog's solution count, and the hosts' engine (H2). None is the Fold
 * workspace's worker, and none touches its engine: stopping one never costs
 * Fold a state, and a session here never queues behind Fold's replays.
 *
 * **Never pre-downloaded.** This worker and the Fold wasm it will load are
 * fetched the first time something spawns it, never warmed by the service
 * worker (`UNWARMED_PATTERNS`, `vite.config.ts`).
 *
 * **Not wired yet.** Its backend is unavailable, so every call rejects as
 * `layer_order_engine_unavailable`, and nothing spawns it. U6 replaces the
 * backend with the Fold bridge's `layer_*` bindings, kept in this directory,
 * the only one that imports the Fold wasm glue.
 */
import { expose } from 'comlink';
import { createLayerOrderWorkerApi, unavailableLayerOrderBackend } from './layerOrderWorkerApi';

const api = createLayerOrderWorkerApi(unavailableLayerOrderBackend);

export type LayerOrderWorkerApi = typeof api;

expose(api);
