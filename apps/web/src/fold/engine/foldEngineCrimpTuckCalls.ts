/**
 * The crimp's and the tuck's calls, over the same wasm `FoldEngine` as
 * `foldEngineCalls.ts`: what `workers/foldSequenceWorker.ts` exposes beside
 * the step calls, kept apart from the worker so the wasm test drives exactly
 * these calls in-process.
 *
 * Arguments are checked here as `foldEngineCalls.ts` checks its own: a
 * handle is a whole number, an op and choices are objects; the shapes inside
 * are serde's to check, in Rust. A caller's mistake throws a
 * `{ code, message }` envelope; a refusal is a value.
 *
 * Every landed state — the one a fold lands, and each order a choice lists —
 * carries its `fs1` fingerprint, taken here like a step's, so a commit needs
 * nothing more from the worker.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */

import { foldStateFingerprint } from '../document/foldDigest';
import type { FoldChoices } from '../document/foldSequenceDocument';
import { requireHandle, requireObject } from './foldEngineCalls';
import type {
  FoldCompound,
  FoldCompoundFingerprinted,
  FoldCompoundLanded,
  FoldCrimpAnalysed,
  FoldCrimpReport,
  FoldEngineCrimpOp,
  FoldEngineTuckOp,
  FoldTuckAnalysed,
  FoldTuckReport,
} from './foldEngineCrimpTuckWire';
import type { FoldEngineOutcome } from './foldEngineWire';

/** The wasm class's crimp and tuck surface, as the generated `FoldEngine` has it. */
export interface FoldWasmCrimpTuckEngine {
  analyse_crimp(state: number, op: unknown, choices: unknown): unknown;
  analyse_tuck(state: number, op: unknown, choices: unknown): unknown;
  crimp(state: number, op: unknown, choices: unknown): unknown;
  tuck(state: number, op: unknown, choices: unknown): unknown;
  canonical_keys(state: number): string[];
}

/** A crimp's or tuck's answer, every landed state fingerprinted. */
export type FoldCompoundOutcome<R> = FoldEngineOutcome<FoldCompound<R, FoldCompoundFingerprinted<R>>>;

export interface FoldEngineCrimpTuckCalls {
  /** A crimp's tip and openings, what lies beyond ℓ2, and the kinds that land. */
  analyseCrimp(state: number, op: FoldEngineCrimpOp, choices?: FoldChoices): FoldEngineOutcome<FoldCrimpAnalysed>;
  /**
   * What a tuck moves and every layer its block lands on, each with whether
   * it takes the tuck (null where the listing's budget ran out first).
   */
  analyseTuck(state: number, op: FoldEngineTuckOp, choices?: FoldChoices): FoldEngineOutcome<FoldTuckAnalysed>;
  /** Fold a crimp: landed, an opening to choose, or the orders to choose from, each landed. */
  crimp(state: number, op: FoldEngineCrimpOp, choices?: FoldChoices): FoldCompoundOutcome<FoldCrimpReport>;
  /** Fold a tuck: landed, or the orders to choose from, each landed. */
  tuck(state: number, op: FoldEngineTuckOp, choices?: FoldChoices): FoldCompoundOutcome<FoldTuckReport>;
}

export function createFoldEngineCrimpTuckCalls(engine: FoldWasmCrimpTuckEngine): FoldEngineCrimpTuckCalls {
  const args = (state: number, op: object, choices: FoldChoices | undefined) =>
    [
      requireHandle('state', state),
      requireObject('op', op),
      choices === undefined ? undefined : requireObject('choices', choices),
    ] as const;

  function fingerprinted<R>(landed: FoldCompoundLanded<R>): FoldCompoundFingerprinted<R> {
    return { ...landed, fingerprint: foldStateFingerprint({ keys: engine.canonical_keys(landed.state) }) };
  }

  function compound<R>(answer: unknown): FoldCompoundOutcome<R> {
    const outcome = answer as FoldEngineOutcome<FoldCompound<R>>;
    if (outcome.status !== 'ok') return outcome;
    switch (outcome.outcome) {
      case 'landed':
        return { ...outcome, ...fingerprinted(outcome) };
      case 'choose_order':
        return { ...outcome, candidates: outcome.candidates.map(fingerprinted) };
      case 'choose_opening':
        return outcome;
    }
  }

  return {
    analyseCrimp(state, op, choices) {
      return engine.analyse_crimp(...args(state, op, choices)) as FoldEngineOutcome<FoldCrimpAnalysed>;
    },

    analyseTuck(state, op, choices) {
      return engine.analyse_tuck(...args(state, op, choices)) as FoldEngineOutcome<FoldTuckAnalysed>;
    },

    crimp(state, op, choices) {
      return compound<FoldCrimpReport>(engine.crimp(...args(state, op, choices)));
    },

    tuck(state, op, choices) {
      return compound<FoldTuckReport>(engine.tuck(...args(state, op, choices)));
    },
  };
}
