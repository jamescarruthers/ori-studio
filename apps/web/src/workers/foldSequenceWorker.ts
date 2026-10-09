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
import type { OristudioCpFoldedPaperScene } from '../engine/oristudioCpTypes';
import type { WasmErrorEnvelope } from '../engine/types';
import { createFoldEngineCalls, type FoldEngineCalls } from '../fold/engine/foldEngineCalls';
import { createFoldEngineIoCalls, type FoldEngineIoCalls } from '../fold/engine/foldEngineIoCalls';
import type {
  FoldExported,
  FoldImportFingerprinted,
  FoldImportLimits,
  FoldImportOpened,
  FoldImportSource,
  FoldImportTarget,
} from '../fold/engine/foldEngineIoWire';
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

/** The step calls and the io calls, over one engine. */
type FoldWorkerCalls = FoldEngineCalls & FoldEngineIoCalls;

let ready: Promise<FoldWorkerCalls> | null = null;

/** The module, and the one engine every call shares. */
function ensureReady(): Promise<FoldWorkerCalls> {
  ready ??= init().then(() => {
    const engine = new FoldEngine();
    return { ...createFoldEngineCalls(engine), ...createFoldEngineIoCalls(engine) };
  });
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

async function call<T>(fn: (calls: FoldWorkerCalls) => T): Promise<T> {
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

  // Import CP, Edit's folded figure, Send to Edit and the FOLD export
  // (`fold/engine/foldEngineIoCalls.ts`).

  /** Import CP: read the file, import it against the target, complete its order. */
  async importCp(
    source: FoldImportSource,
    target: FoldImportTarget,
    limits?: FoldImportLimits
  ): Promise<FoldEngineOutcome<FoldImportOpened>> {
    return call((calls) => calls.importCp(source, target, limits));
  },

  /** Land one listed order per component as a step, with its fingerprint and op. */
  async importPick(
    importHandle: number,
    choice: readonly number[]
  ): Promise<FoldEngineOutcome<FoldImportFingerprinted>> {
    return call((calls) => calls.importPick(importHandle, choice));
  },

  /** Start from Edit's folded figure: the kernel's paper scene of it. */
  async importEditFoldedFigure(
    scene: OristudioCpFoldedPaperScene,
    target: FoldImportTarget,
    limits?: FoldImportLimits
  ): Promise<FoldEngineOutcome<FoldImportFingerprinted>> {
    return call((calls) => calls.importEditFoldedFigure(scene, target, limits));
  },

  /** Let imports go; how many were held. */
  async releaseImports(imports: readonly number[]): Promise<number> {
    return call((calls) => calls.releaseImports(imports));
  },

  async liveImports(): Promise<number> {
    return call((calls) => calls.liveImports());
  },

  /** Send to Edit: the state's crease pattern as FOLD text. */
  async sendToEdit(state: number, title?: string): Promise<string> {
    return call((calls) => calls.sendToEdit(state, title));
  },

  /** The FOLD file of a path of states. */
  async exportFold(states: readonly number[], title?: string): Promise<FoldEngineOutcome<FoldExported>> {
    return call((calls) => calls.exportFold(states, title));
  },
};

export type FoldSequenceWorkerApi = typeof api;

expose(api);
