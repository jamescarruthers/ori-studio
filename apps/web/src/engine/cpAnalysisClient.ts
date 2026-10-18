import * as Comlink from 'comlink';
import type { OristudioCpWorkerApi } from '../workers/oristudioCpWorker';
import type { FoldArtifacts } from './types';
import { attachWorkerDiagnostics } from '../lib/workerDiagnostics';

/**
 * Live CP segmentation needs the shared TypeScript topology fallback.
 * Reuse the CP worker's pure analysis entry point (it does not initialize wasm).
 * One worker serves the active document and native task clients; idle disposal bounds its retained heap.
 */
let shared: {
  worker: Worker;
  api: Comlink.Remote<OristudioCpWorkerApi>;
  failure: Promise<never>;
  fail: (error: unknown) => void;
  detach: () => void;
} | null = null;
let users = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
function dispose(error: unknown = new Error('Crease-pattern analysis worker stopped')) {
  const current = shared;
  shared = null;
  // A worker can have several queued callers. Termination must settle all of
  // them, including those whose Comlink response can no longer arrive.
  current?.fail(error);
  current?.detach();
  current?.worker.terminate();
}
export function analyzeCpFold(text: string): Promise<FoldArtifacts> {
  return withAnalysisWorker((api) => api.analyzeFold(text));
}

/** Same worker and containment algorithm as selection, with transferable input. */
export function analyzeCpFoldWithContainment(text: string, midpoints: Float64Array) {
  return withAnalysisWorker((api) => api.analyzeFoldWithContainment(text, Comlink.transfer(midpoints, [midpoints.buffer])));
}

async function withAnalysisWorker<T>(run: (api: Comlink.Remote<OristudioCpWorkerApi>) => Promise<T>): Promise<T> {
  clearTimeout(idle);
  if (!shared) {
    const worker = new Worker(new URL('../workers/oristudioCpWorker.ts', import.meta.url), {
      type: 'module',
    });
    let reject: (error: unknown) => void = () => undefined;
    const failure = new Promise<never>((_, fail) => {
      reject = fail;
    });
    void failure.catch(() => undefined);
    const detach = attachWorkerDiagnostics(worker, 'cp-analysis', (info) => reject(new Error(info.message)));
    shared = { worker, api: Comlink.wrap<OristudioCpWorkerApi>(worker), failure, fail: reject, detach };
  }
  const current = shared;
  users++;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Crease-pattern analysis timed out')), 120000);
    });
    return await Promise.race([run(current.api), current.failure, timeout]);
  } catch (error) {
    if (shared === current) dispose(error);
    throw error;
  } finally {
    clearTimeout(timer);
    if (--users === 0) idle = setTimeout(dispose, 30000);
  }
}
