/**
 * One Layer order engine worker's lifetime: spawned on demand, stamped with a
 * generation, terminated to stop it (`implementation-plans/layer-order-dialog.md`,
 * approach 5).
 *
 * Each role gets a runtime of its own (the dialog's session, its count, a
 * host's engine), and each runtime at most one worker
 * (`workers/layerOrderWorker.ts`). Nothing is shared with the Fold
 * workspace's worker, so stopping one costs Fold nothing.
 *
 * - **Spawned on demand.** Creating a runtime spawns nothing; the first call
 *   does. The Fold engine never loads with the page (approach 5), and this
 *   keeps it so.
 * - **Stopping is terminating.** The wasm has no cancel channel and a call
 *   cannot be interrupted, so the dialog's Cancel and a host's Stop are
 *   {@link LayerOrderRuntime.cancel}, and closing the dialog is
 *   {@link LayerOrderRuntime.dispose}. Every call in flight rejects first,
 *   then the worker goes (`engine/cpExactSolveSession.ts`: `terminate()`
 *   settles nothing, so a call left to it would never settle). The next call
 *   after a cancel spawns a fresh worker, with no session open.
 * - **A generation.** It moves when a worker goes away, and when its owner
 *   says the questions already asked no longer matter
 *   ({@link LayerOrderRuntime.invalidate}: the count after a commit). An
 *   answer asked through {@link LayerOrderRuntime.askCurrent} that comes back
 *   under a later generation is dropped as `stale`.
 * - **Engine loss is a typed failure.** A worker that dies (its `error`
 *   event) or an engine that trapped (`layer_order_engine_trapped`) drops the
 *   worker: every call on it rejects as {@link LayerOrderEngineLost} with
 *   `reason: 'crashed'`, and the crash is reported to Sentry once, under
 *   `layer-order:engine`.
 * - **Previews are latest-wins** ({@link LayerOrderRuntime.channel},
 *   `lib/latestWinsChannel.ts`): a preview already in the worker can't be
 *   dropped, only superseded when it returns.
 *
 * Store-free: its owner (the dialog's hook, the host engine) holds it.
 */
import { wrap, type Remote } from 'comlink';
import type { WasmErrorEnvelope } from '../../engine/types';
import { createLatestWinsChannel, type LatestWinsChannel } from '../../lib/latestWinsChannel';
import { attachWorkerDiagnostics } from '../../lib/workerDiagnostics';
import { reportError } from '../../monitoring';
import type { LayerOrderWorkerApi } from '../../workers/layerOrderWorker';
import { isLayerOrderEngineTrapped, type LayerOrderEngine, type LayerOrderTrapKind } from './layerOrderEngine';

/** What a worker is for; it tags a crash report. */
export type LayerOrderEngineRole = 'dialog' | 'count' | 'host';

/**
 * The worker, as the runtime asks it: comlink's proxy, typed as the contract
 * the worker exposes. Every call already answers a promise of plain data, so
 * the proxy is the contract; comlink's own `Remote` type would split each
 * union answer into a union of promises, from which a caller's inference
 * keeps only the first.
 */
export type LayerOrderClient = LayerOrderEngine;

/**
 * Why a worker went away: it crashed (a trap or its `error` event), its owner
 * cancelled the work in it, or its owner closed the runtime.
 */
export type LayerOrderLossReason = 'crashed' | 'cancelled' | 'closed';

export const LAYER_ORDER_ENGINE_LOST = 'layer_order_engine_lost';

/** What every call in flight on a worker rejects with when the worker goes away. */
export interface LayerOrderEngineLost extends WasmErrorEnvelope {
  readonly code: typeof LAYER_ORDER_ENGINE_LOST;
  readonly reason: LayerOrderLossReason;
}

export function isLayerOrderEngineLost(error: unknown): error is LayerOrderEngineLost {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === LAYER_ORDER_ENGINE_LOST;
}

function lost(reason: LayerOrderLossReason): LayerOrderEngineLost {
  const message = {
    crashed: 'The layer order engine stopped while it was running.',
    cancelled: 'The layer order engine was stopped while it was running.',
    closed: 'The layer order engine was closed while it was running.',
  }[reason];
  return { code: LAYER_ORDER_ENGINE_LOST, reason, message };
}

/** Why a worker crashed: how its engine trapped, or the worker dying (`error`). */
export type LayerOrderCrashCause = LayerOrderTrapKind | 'worker_error';

/** Hears a worker go away: why, and for a crash, what crashed it. */
export type LayerOrderLossListener = (reason: LayerOrderLossReason, cause?: LayerOrderCrashCause) => void;

interface CrashReport {
  readonly cause: LayerOrderCrashCause;
  readonly message: string;
  readonly stack?: string;
}

/**
 * A crash as Sentry sees it, as `FoldEngineCrash` is for the Fold workspace's
 * worker: named for this engine, so the two group apart, and carrying the
 * worker's own stack where there is one, so the frames point at the module
 * and not at the runtime that noticed.
 */
export class LayerOrderEngineCrash extends Error {
  readonly reason: LayerOrderCrashCause;

  constructor({ cause, message, stack }: CrashReport) {
    super(`${cause}: ${message}`);
    this.name = 'LayerOrderEngineCrash';
    this.reason = cause;
    if (stack) this.stack = stack;
  }
}

/** An answer asked for the current generation, or word that the generation moved while it ran. */
export type LayerOrderCurrent<T> = { status: 'answered'; value: T } | { status: 'stale' };

export interface LayerOrderRuntime {
  /** The engine, every call guarded: it spawns the worker on the first call. */
  readonly engine: LayerOrderEngine;
  /** Ask the worker, spawning it if none is running. Rejects as {@link LayerOrderEngineLost} if the worker goes away first. */
  ask<T>(run: (client: LayerOrderClient) => Promise<T>): Promise<T>;
  /** {@link ask}, with the answer dropped as `stale` if the generation moved while it ran. */
  askCurrent<T>(run: (client: LayerOrderClient) => Promise<T>): Promise<LayerOrderCurrent<T>>;
  /** A latest-wins stream to the worker, one per preview stream. */
  channel(): LatestWinsChannel<LayerOrderClient>;
  /** Which questions still count; moves when a worker goes away and on {@link invalidate}. */
  generation(): number;
  /** Move the generation: answers asked through {@link askCurrent} before now come back stale. */
  invalidate(): void;
  /**
   * Stop the work now: reject every call in flight as `cancelled`, then
   * terminate the worker. The next call spawns a fresh one, with no session
   * open. Whether a worker was running.
   */
  cancel(): boolean;
  /** Close for good: as {@link cancel}, as `closed`, and every later call rejects as `closed`. Idempotent. */
  dispose(): void;
  /** Whether a worker is running. */
  running(): boolean;
  /** Called when a worker goes away, after the calls on it are rejected. */
  onLost(listener: LayerOrderLossListener): () => void;
}

export interface LayerOrderRuntimeOptions {
  readonly role: LayerOrderEngineRole;
  /** Starts a worker. The default spawns `workers/layerOrderWorker.ts`; tests pass a fake. */
  readonly spawn?: () => Worker;
}

/** The proxy as {@link LayerOrderClient}: assignable as it is, since a union of promises is a promise of the union. */
function clientOf(remote: Remote<LayerOrderWorkerApi>): LayerOrderClient {
  return remote;
}

function spawnLayerOrderWorker(): Worker {
  return new Worker(new URL('../../workers/layerOrderWorker.ts', import.meta.url), { type: 'module' });
}

interface Live {
  readonly worker: Worker;
  readonly client: LayerOrderClient;
  readonly detach: () => void;
  /** Rejects one call in flight. */
  readonly waiting: Set<(failure: LayerOrderEngineLost) => void>;
}

export function createLayerOrderRuntime(options: LayerOrderRuntimeOptions): LayerOrderRuntime {
  const spawn = options.spawn ?? spawnLayerOrderWorker;
  let live: Live | null = null;
  let generation = 0;
  let closed = false;
  const listeners = new Set<LayerOrderLossListener>();

  const start = (): Live => {
    const worker = spawn();
    const started: Live = {
      worker,
      client: clientOf(wrap<LayerOrderWorkerApi>(worker)),
      // Guarded on identity, so a late event from a worker already replaced cannot drop its replacement.
      detach: attachWorkerDiagnostics(worker, 'layer-order', (failure) => {
        if (live === started) drop('crashed', { cause: 'worker_error', message: failure.message });
      }),
      waiting: new Set(),
    };
    live = started;
    return started;
  };

  /**
   * The one place a worker goes away. Every call in flight is rejected first,
   * and only then is the worker terminated and the generation moved, so a
   * listener that asks again gets a fresh worker in a fresh generation.
   */
  const drop = (reason: LayerOrderLossReason, crash?: CrashReport): boolean => {
    const gone = live;
    if (!gone) return false;
    live = null;
    const failure = lost(reason);
    for (const reject of [...gone.waiting]) reject(failure);
    gone.waiting.clear();
    gone.detach();
    gone.worker.terminate();
    generation += 1;
    if (crash) {
      reportError(new LayerOrderEngineCrash(crash), {
        surface: 'layer-order:engine',
        tags: { reason: crash.cause, role: options.role },
      });
    }
    for (const listener of [...listeners]) listener(reason, crash?.cause);
    return true;
  };

  /** Settle with `pending`, or reject the moment `target` goes away. */
  const guarded = <T>(target: Live, pending: Promise<T>): Promise<T> => {
    let release = () => {};
    const gone = new Promise<never>((_resolve, reject) => {
      target.waiting.add(reject);
      release = () => target.waiting.delete(reject);
    });
    return Promise.race([pending, gone]).finally(release);
  };

  const ask = <T>(run: (client: LayerOrderClient) => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(lost('closed'));
    const target = live ?? start();
    let pending: Promise<T>;
    try {
      pending = run(target.client);
    } catch (error) {
      pending = Promise.reject(error);
    }
    return guarded(
      target,
      pending.catch((error: unknown) => {
        if (!isLayerOrderEngineTrapped(error)) throw error;
        // Only the first answer from a dead engine drops its worker; a later one is from a corpse.
        if (live === target) drop('crashed', { cause: error.trap, message: error.message, stack: error.stack });
        throw lost('crashed');
      })
    );
  };

  const askCurrent = async <T>(run: (client: LayerOrderClient) => Promise<T>): Promise<LayerOrderCurrent<T>> => {
    const asked = generation;
    const value = await ask(run);
    return generation === asked ? { status: 'answered', value } : { status: 'stale' };
  };

  const engine: LayerOrderEngine = {
    open: (source, limits) => ask((client) => client.open(source, limits)),
    restore: (source, record, limits) => ask((client) => client.restore(source, record, limits)),
    openPairs: () => ask((client) => client.openPairs()),
    constraints: () => ask((client) => client.constraints()),
    preview: (candidate, limits) => ask((client) => client.preview(candidate, limits)),
    commit: (constraints, limits) => ask((client) => client.commit(constraints, limits)),
    stacks: (side) => ask((client) => client.stacks(side)),
    scene: (side) => ask((client) => client.scene(side)),
    save: () => ask((client) => client.save()),
    relations: () => ask((client) => client.relations()),
    close: () => ask((client) => client.close()),
    explain: (candidate, limits) => ask((client) => client.explain(candidate, limits)),
    countSolutions: (limits) => ask((client) => client.countSolutions(limits)),
    stepSolution: (step, limits) => ask((client) => client.stepSolution(step, limits)),
  };

  return {
    engine,
    ask,
    askCurrent,
    channel: () => createLatestWinsChannel<LayerOrderClient>(ask),
    generation: () => generation,
    invalidate: () => {
      generation += 1;
    },
    cancel: () => drop('cancelled'),
    dispose: () => {
      closed = true;
      drop('closed');
    },
    running: () => live !== null,
    onLost: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
