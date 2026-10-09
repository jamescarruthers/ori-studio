/**
 * The Fold worker's start: a wasm module that failed to arrive or compile is
 * asked for again by the next call, so the session's "Try again" — which
 * calls the same live worker — can succeed without the worker being replaced.
 */
import { describe, expect, it, vi } from 'vitest';

const worker = vi.hoisted(() => ({
  api: null as Record<string, (...args: unknown[]) => Promise<unknown>> | null,
  inits: 0,
}));

vi.mock('comlink', () => ({
  expose: (api: Record<string, (...args: unknown[]) => Promise<unknown>>) => {
    worker.api = api;
  },
}));

vi.mock('../generated/oristudio-fold-wasm/oristudio_fold_wasm', () => ({
  // The first fetch of the module fails, as it does offline before the service worker caches it.
  default: () => {
    worker.inits += 1;
    return worker.inits === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve();
  },
  FoldEngine: class {},
  fold_engine_version: () => 7,
}));

describe('the Fold worker', () => {
  it('starts the module again on the next call after a start that failed', async () => {
    await import('./foldSequenceWorker');
    const api = worker.api!;

    await expect(api.engineVersion!()).rejects.toEqual({
      code: 'oristudio_fold_wasm_error',
      message: 'Failed to fetch',
    });
    await expect(api.engineVersion!()).resolves.toBe(7);
    await expect(api.engineVersion!()).resolves.toBe(7);
    // Started once more, then kept.
    expect(worker.inits).toBe(2);
  });
});
