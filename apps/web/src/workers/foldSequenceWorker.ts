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
import type { FoldStateFingerprint } from '../fold/document/foldDigest';
import type { FoldChoices, FoldModelLine, FoldPaper, SheetPoint } from '../fold/document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../fold/engine/foldEngineCalls';
import {
  createFoldEngineCrimpTuckCalls,
  type FoldCompoundOutcome,
  type FoldEngineCrimpTuckCalls,
} from '../fold/engine/foldEngineCrimpTuckCalls';
import type {
  FoldCrimpAnalysed,
  FoldCrimpReport,
  FoldEngineCrimpOp,
  FoldEngineTuckOp,
  FoldTuckAnalysed,
  FoldTuckReport,
} from '../fold/engine/foldEngineCrimpTuckWire';
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
  FoldActed,
  FoldAnalysed,
  FoldAxiomCandidates,
  FoldAxiomLine,
  FoldDepthChosen,
  FoldEngineOp,
  FoldEngineOutcome,
  FoldLandmarks,
  FoldModelPoint,
  FoldScene,
  FoldSectioned,
  FoldSheetLanded,
  FoldSide,
  FoldStateSummary,
  FoldStepActed,
  FoldStepFingerprinted,
  FoldStepLanded,
  FoldStepSummarised,
  FoldTopVisible,
} from '../fold/engine/foldEngineWire';

/** The step calls, the io calls and the compound folds', over one engine. */
type FoldWorkerCalls = FoldEngineCalls & FoldEngineIoCalls & FoldEngineCrimpTuckCalls;

let ready: Promise<FoldWorkerCalls> | null = null;

/**
 * The module, and the one engine every call shares. A start that failed — a
 * fetch of the `.wasm` that did not arrive, a compile that ran out of memory —
 * is forgotten, so the next call starts it again: the session's retry asks
 * this same worker, which nothing replaces while it is alive.
 */
function ensureReady(): Promise<FoldWorkerCalls> {
  if (ready) return ready;
  const starting = init().then(() => {
    const engine = new FoldEngine();
    return {
      ...createFoldEngineCalls(engine),
      ...createFoldEngineIoCalls(engine),
      ...createFoldEngineCrimpTuckCalls(engine),
    };
  });
  ready = starting;
  starting.catch(() => {
    if (ready === starting) ready = null;
  });
  return starting;
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
  async sheet(paper: FoldPaper): Promise<FoldEngineOutcome<FoldSheetLanded>> {
    return call((calls) => calls.sheet(paper));
  },

  /** One step for a preview (D14 tier 3): a new handle, no fingerprint. */
  async apply(state: number, op: FoldEngineOp, choices?: FoldChoices): Promise<FoldEngineOutcome<FoldStepLanded>> {
    return call((calls) => calls.apply(state, op, choices));
  },

  /** One step with its fingerprint: what a replay and a commit take. */
  async step(
    state: number,
    op: FoldEngineOp,
    choices?: FoldChoices
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

  // Queries on a handle (plan D12, D14): the panes' and the tools'.

  /** What a fold along a line would move, without folding (D14 tier 2). */
  async analyse(state: number, op: FoldEngineOp, choices?: FoldChoices): Promise<FoldEngineOutcome<FoldAnalysed>> {
    return call((calls) => calls.analyse(state, op, choices));
  },

  /** That fold's picture on `state`, before it lands. */
  async action(state: number, op: FoldEngineOp, choices?: FoldChoices): Promise<FoldEngineOutcome<FoldActed>> {
    return call((calls) => calls.action(state, op, choices));
  },

  /** The moving sets a depth seed at the sheet point `at` can pick. */
  async depthChoices(
    state: number,
    op: FoldEngineOp,
    at: SheetPoint,
    choices?: FoldChoices
  ): Promise<FoldEngineOutcome<FoldDepthChosen>> {
    return call((calls) => calls.depthChoices(state, op, at, choices));
  },

  /** The layers along a model line on one side of it, with their joins (D14 tier 2). */
  async crossSection(
    state: number,
    line: FoldModelLine,
    side: FoldSide
  ): Promise<FoldEngineOutcome<FoldSectioned>> {
    return call((calls) => calls.crossSection(state, line, side));
  },

  /** An axiom line's folds here, for the candidate chooser. */
  async axiomCandidates(state: number, line: FoldAxiomLine): Promise<FoldEngineOutcome<FoldAxiomCandidates>> {
    return call((calls) => calls.axiomCandidates(state, line));
  },

  /** The summary of the step that landed `state`, while its parent is held. */
  async stepSummary(state: number): Promise<FoldEngineOutcome<FoldStepSummarised>> {
    return call((calls) => calls.stepSummary(state));
  },

  /** The picture of the step that landed `state`, while its parent is held. */
  async stepAction(state: number): Promise<FoldEngineOutcome<FoldStepActed>> {
    return call((calls) => calls.stepAction(state));
  },

  async scene(state: number): Promise<FoldScene> {
    return call((calls) => calls.scene(state));
  },

  /** Landmarks with provenance and visibility; Divide-line marks as sheet points. */
  async landmarks(state: number, marks: readonly SheetPoint[]): Promise<FoldLandmarks> {
    return call((calls) => calls.landmarks(state, marks));
  },

  /** The face seen at a model-frame point, and the sheet point there. */
  async topVisibleAt(state: number, at: FoldModelPoint): Promise<FoldTopVisible | null> {
    return call((calls) => calls.topVisibleAt(state, at));
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

  // The crimp and the tuck (`fold/engine/foldEngineCrimpTuckCalls.ts`).

  /** A crimp's tip and openings, what lies beyond ℓ2, and the kinds that land. */
  async analyseCrimp(
    state: number,
    op: FoldEngineCrimpOp,
    choices?: FoldChoices
  ): Promise<FoldEngineOutcome<FoldCrimpAnalysed>> {
    return call((calls) => calls.analyseCrimp(state, op, choices));
  },

  /** What a tuck moves and the layers its block can be tucked against. */
  async analyseTuck(
    state: number,
    op: FoldEngineTuckOp,
    choices?: FoldChoices
  ): Promise<FoldEngineOutcome<FoldTuckAnalysed>> {
    return call((calls) => calls.analyseTuck(state, op, choices));
  },

  /** Fold a crimp: landed, an opening to choose, or the orders to choose from. */
  async crimp(
    state: number,
    op: FoldEngineCrimpOp,
    choices?: FoldChoices
  ): Promise<FoldCompoundOutcome<FoldCrimpReport>> {
    return call((calls) => calls.crimp(state, op, choices));
  },

  /** Fold a tuck: landed, or the orders to choose from. */
  async tuck(state: number, op: FoldEngineTuckOp, choices?: FoldChoices): Promise<FoldCompoundOutcome<FoldTuckReport>> {
    return call((calls) => calls.tuck(state, op, choices));
  },
};

export type FoldSequenceWorkerApi = typeof api;

expose(api);
