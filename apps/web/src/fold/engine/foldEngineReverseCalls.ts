/**
 * The reverse fold's one query on the Fold engine's bridge
 * (`oristudio-fold-wasm/src/ops_reverse.rs`), beside the step calls
 * (`foldEngineCalls.ts`) and the io calls (`foldEngineIoCalls.ts`) over the
 * same wasm `FoldEngine`: what `workers/foldSequenceWorker.ts` exposes, kept
 * apart from the worker so the wasm tests drive exactly this call.
 *
 * A reverse fold lands, replays and is pictured through the step calls like
 * any step; this asks only what the tools need before it lands.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */

import type { FoldChoices } from '../document/foldSequenceDocument';
import { requireHandle, requireObject } from './foldEngineCalls';
import type { FoldEngineReverseOp, FoldReverseAsked } from './foldEngineReverseWire';
import type { FoldEngineOutcome } from './foldEngineWire';

/** The wasm class's reverse surface, as the generated `FoldEngine` has it. */
export interface FoldReverseWasmEngine {
  reverse(state: number, op: unknown, choices: unknown): unknown;
}

export interface FoldEngineReverseCalls {
  /**
   * What a reverse fold from `state` moves, which kinds land and the choice
   * it still needs. A refusal is the tip's: nothing stays, a flap with no
   * opening, a stored choice that no longer resolves.
   */
  reverse(state: number, op: FoldEngineReverseOp, choices?: FoldChoices): FoldEngineOutcome<FoldReverseAsked>;
}

export function createFoldEngineReverseCalls(engine: FoldReverseWasmEngine): FoldEngineReverseCalls {
  return {
    reverse(state, op, choices) {
      const handle = requireHandle('state', state);
      requireObject('op', op);
      return engine.reverse(
        handle,
        op,
        choices === undefined ? undefined : requireObject('choices', choices)
      ) as FoldEngineOutcome<FoldReverseAsked>;
    },
  };
}
