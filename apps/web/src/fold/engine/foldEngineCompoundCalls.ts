/**
 * The compound folds' one question on the Fold engine's bridge
 * (`oristudio-fold-wasm/src/compound.rs`), beside the step calls
 * (`foldEngineCalls.ts`) and the io calls (`foldEngineIoCalls.ts`) over the
 * same wasm `FoldEngine`: what `workers/foldSequenceWorker.ts` exposes, kept
 * apart from the worker so the wasm tests drive exactly this call.
 *
 * Every compound fold — a reverse fold, a crimp, a tuck, a vertex fold, a
 * sink — lands, replays and is pictured through the step calls like any
 * step; this asks only what its family's tools need before it lands, and
 * answers with its family's answer tagged by `family`
 * (`foldEngineCompoundWire.ts`). A family's choosing calls are its own
 * (`foldEngineCrimpTuckCalls.ts`, `foldEngineSquashCalls.ts`,
 * `foldEngineSinkCalls.ts`).
 *
 * Arguments are checked here as `foldEngineCalls.ts` checks its own: a
 * handle is a whole number, the op a compound fold's, the choices an
 * object. A caller's mistake throws a `{ code, message }` envelope; a refusal
 * is a value.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */

import type { FoldChoices } from '../document/foldSequenceDocument';
import { invalidInput, requireHandle, requireObject } from './foldEngineCalls';
import { isFoldCompoundOp, type FoldCompoundAnalysis, type FoldEngineCompoundOp } from './foldEngineCompoundWire';
import type { FoldEngineOutcome } from './foldEngineWire';

/** The wasm class's compound surface, as the generated `FoldEngine` has it. */
export interface FoldWasmCompoundEngine {
  compound_analysis(state: number, op: unknown, choices: unknown): unknown;
}

export interface FoldEngineCompoundCalls {
  /**
   * What a compound fold from `state` is before it lands, as its family's
   * tools ask: a reverse fold's tip and the kinds that land, a crimp's tip
   * and kinds, a tuck's targets, a vertex op's flap, petal or fan, a sink's
   * point and pockets. A refusal is its family's: nothing stays, a flap with
   * no opening, a stored choice that no longer resolves, …
   */
  compoundAnalysis(
    state: number,
    op: FoldEngineCompoundOp,
    choices?: FoldChoices
  ): FoldEngineOutcome<FoldCompoundAnalysis>;
}

function requireCompoundOp(op: FoldEngineCompoundOp): FoldEngineCompoundOp {
  requireObject('op', op);
  if (!isFoldCompoundOp(op)) {
    const kind: unknown = (op as { kind?: unknown }).kind;
    throw invalidInput(`op must be a compound fold's, got ${String(kind)}`);
  }
  return op;
}

export function createFoldEngineCompoundCalls(engine: FoldWasmCompoundEngine): FoldEngineCompoundCalls {
  return {
    compoundAnalysis(state, op, choices) {
      return engine.compound_analysis(
        requireHandle('state', state),
        requireCompoundOp(op),
        choices === undefined ? undefined : requireObject('choices', choices)
      ) as FoldEngineOutcome<FoldCompoundAnalysis>;
    },
  };
}
