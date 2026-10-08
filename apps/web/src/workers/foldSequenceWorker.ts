/**
 * The Fold engine's bridge (`crates/oristudio-fold-wasm`), alone in a worker.
 *
 * One `FoldEngine` holds every state this worker has landed, by handle: a
 * replay's cache, the step on screen and the preview under the pointer. The
 * calls are `fold/engine/foldEngineCalls.ts`, which checks every argument and
 * takes `fs1` fingerprints here, so a step's answer is a handle, a summary
 * and sixteen hex digits however large the state. Errors leave as
 * `{ code, message }` envelopes like every other bridge; refusals are values.
 *
 * The worker cannot be interrupted mid-call, so the runtime that owns it
 * (`store/workspaceStore/foldSequenceRuntime.ts`) stops work by terminating
 * it, and every handle goes with it.
 *
 * Same shape as `precreaseWorker.ts`: lazy `init()`, one `call()` wrapper.
 */
import { expose } from 'comlink';
import init, {
  FoldEngine,
  fold_engine_version,
} from '../generated/oristudio-fold-wasm/oristudio_fold_wasm';
import type { WasmErrorEnvelope } from '../engine/types';
import { createFoldEngineCalls, type FoldEngineCalls } from '../fold/engine/foldEngineCalls';
import type {
  FoldAnalysed,
  FoldEngineChoices,
  FoldEngineOp,
  FoldEngineOutcome,
  FoldEnginePaper,
  FoldSheetLanded,
  FoldStateFingerprint,
  FoldStateSummary,
  FoldStepFingerprinted,
  FoldStepLanded,
} from '../fold/engine/foldEngineWire';

let ready: Promise<FoldEngineCalls> | null = null;

/** The module, and the one engine every call shares. */
function ensureReady(): Promise<FoldEngineCalls> {
  ready ??= init().then(() => createFoldEngineCalls(new FoldEngine()));
  return ready;
}

function normalizeError(error: unknown): WasmErrorEnvelope {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return error as WasmErrorEnvelope;
  }
  return {
    code: 'oristudio_fold_wasm_error',
    message: error instanceof Error ? error.message : String(error),
  };
}

async function call<T>(fn: (calls: FoldEngineCalls) => T): Promise<T> {
  try {
    return fn(await ensureReady());
  } catch (error) {
    throw normalizeError(error);
  }
}

const api = {
  /** `FOLD_ENGINE_VERSION`, stored beside every cached state. */
  async engineVersion(): Promise<number> {
    return call(() => fold_engine_version());
  },

  /** The flat sheet a sequence starts from, with its fingerprint. */
  async sheet(paper: FoldEnginePaper): Promise<FoldEngineOutcome<FoldSheetLanded>> {
    return call((calls) => calls.sheet(paper));
  },

  /** What a fold along a line would move, without folding (D14 tier 2). */
  async analyse(state: number, op: FoldEngineOp): Promise<FoldEngineOutcome<FoldAnalysed>> {
    return call((calls) => calls.analyse(state, op));
  },

  /** One step for a preview (D14 tier 3): a new handle, no fingerprint. */
  async apply(
    state: number,
    op: FoldEngineOp,
    choices?: FoldEngineChoices
  ): Promise<FoldEngineOutcome<FoldStepLanded>> {
    return call((calls) => calls.apply(state, op, choices));
  },

  /** One step with its fingerprint: what a replay and a commit take. */
  async step(
    state: number,
    op: FoldEngineOp,
    choices?: FoldEngineChoices
  ): Promise<FoldEngineOutcome<FoldStepFingerprinted>> {
    return call((calls) => calls.step(state, op, choices));
  },

  async summary(state: number): Promise<FoldStateSummary> {
    return call((calls) => calls.summary(state));
  },

  async fingerprint(state: number): Promise<FoldStateFingerprint> {
    return call((calls) => calls.fingerprint(state));
  },

  /** Let states go; how many were held. */
  async release(states: readonly number[]): Promise<number> {
    return call((calls) => calls.release(states));
  },

  /** Let every state go. */
  async clear(): Promise<void> {
    return call((calls) => calls.clear());
  },

  /** How many states are held, for diagnostics and tests. */
  async live(): Promise<number> {
    return call((calls) => calls.live());
  },
};

export type FoldSequenceWorkerApi = typeof api;

expose(api);
