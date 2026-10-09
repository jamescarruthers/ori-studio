/**
 * The vertex folds' calls — squash, petal fold, rabbit ear, swivel (plan
 * Phase 11) — over the same wasm `FoldEngine` as `foldEngineCalls.ts`: what
 * `workers/foldSequenceWorker.ts` exposes beside the step and io calls, kept
 * apart from the worker so the wasm test drives exactly these calls
 * in-process.
 *
 * Arguments are checked here, at the boundary, as `foldEngineIoCalls.ts`
 * checks its own: handles are whole numbers, a choice is a list of indices,
 * an op and choices are objects. A caller's mistake throws a
 * `{ code, message }` envelope; a refusal is a value. A landed fold carries
 * its state's `fs1` fingerprint, taken here like a step's, so a commit needs
 * nothing more from the worker.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */

import { foldStateFingerprint } from '../document/foldDigest';
import type { FoldChoices, FoldVertexOp } from '../document/foldSequenceDocument';
import { invalidInput, requireHandle, requireObject } from './foldEngineCalls';
import type {
  FoldVertexAnalysed,
  FoldVertexFingerprinted,
  FoldVertexLanded,
  FoldVertexTried,
} from './foldEngineSquashWire';
import type { FoldEngineOutcome } from './foldEngineWire';

/** The wasm class's vertex-fold surface, as the generated `FoldEngine` has it. */
export interface FoldWasmVertexEngine {
  vertex_analysis(state: number, op: unknown): unknown;
  vertex_fold(state: number, op: unknown, choices: unknown): unknown;
  vertex_pick(pending: number, choice: Uint32Array): unknown;
  release_vertex_choices(pending: Uint32Array): number;
  canonical_keys(state: number): string[];
}

/** The largest index a choice can carry: a `u32`. */
const MAX_INDEX = 0xffff_ffff;

function requireIndices(name: string, values: unknown, check: (k: number, value: unknown) => number): Uint32Array {
  if (!Array.isArray(values)) throw invalidInput(`${name} must be an array`);
  return Uint32Array.from(values, (value: unknown, k) => check(k, value));
}

function requireIndex(k: number, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_INDEX) {
    throw invalidInput(`choice[${k}] must be an index (a whole number from 0), got ${String(value)}`);
  }
  return value;
}

export interface FoldEngineVertexCalls {
  /** The flap, petal or fan a vertex op names on `state`, before it folds. */
  vertexAnalysis(state: number, op: FoldVertexOp): FoldEngineOutcome<FoldVertexAnalysed>;
  /** Fold it: landed, with its fingerprint, or a choice of orders held under `pending`. */
  vertexFold(state: number, op: FoldVertexOp, choices?: FoldChoices): FoldEngineOutcome<FoldVertexTried>;
  /** Land one listed order per component; its `vertex.stored` is what the step stores. */
  vertexPick(pending: number, choice: readonly number[]): FoldEngineOutcome<FoldVertexFingerprinted>;
  /** Let pending choices go; how many were held. */
  releaseVertexChoices(pending: readonly number[]): number;
}

/** What the bridge's `vertex_fold` returns: a landing has no fingerprint yet. */
type Tried = ({ result: 'landed' } & FoldVertexLanded) | Extract<FoldVertexTried, { result: 'choose' }>;

export function createFoldEngineVertexCalls(engine: FoldWasmVertexEngine): FoldEngineVertexCalls {
  const fingerprint = (state: number) => foldStateFingerprint({ keys: engine.canonical_keys(state) });

  return {
    vertexAnalysis(state, op) {
      return engine.vertex_analysis(requireHandle('state', state), requireObject('op', op)) as FoldEngineOutcome<
        FoldVertexAnalysed
      >;
    },

    vertexFold(state, op, choices) {
      const tried = engine.vertex_fold(
        requireHandle('state', state),
        requireObject('op', op),
        choices === undefined ? undefined : requireObject('choices', choices)
      ) as FoldEngineOutcome<Tried>;
      if (tried.status !== 'ok' || tried.result !== 'landed') return tried;
      return { ...tried, fingerprint: fingerprint(tried.state) };
    },

    vertexPick(pending, choice) {
      const landed = engine.vertex_pick(
        requireHandle('pending', pending),
        requireIndices('choice', choice, requireIndex)
      ) as FoldEngineOutcome<FoldVertexLanded>;
      return landed.status === 'ok' ? { ...landed, fingerprint: fingerprint(landed.state) } : landed;
    },

    releaseVertexChoices(pending) {
      const handles = requireIndices('pending', pending, (k, value) => requireHandle(`pending[${k}]`, value));
      return handles.length === 0 ? 0 : engine.release_vertex_choices(handles);
    },
  };
}
