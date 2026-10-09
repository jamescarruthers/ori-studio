/**
 * The Fold engine's calls, over one wasm `FoldEngine`: what
 * `workers/foldSequenceWorker.ts` exposes, kept apart from the worker so the
 * wasm test drives exactly these calls in-process.
 *
 * Every argument is checked here, at the boundary, before wasm-bindgen sees
 * it: a handle that is not a whole number would be coerced to some other
 * state's handle rather than refused. The shapes inside a paper, an op or
 * choices are serde's to check, in Rust; this only makes sure each is an
 * object. A caller's mistake throws a `{ code, message }` envelope; a
 * refusal is a value (`foldEngineWire.ts`).
 *
 * The `fs1` fingerprint is taken here, inside the worker, from the keys the
 * engine spells, so only sixteen hex digits cross to the main thread.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */

import type { WasmErrorEnvelope } from '../../engine/types';
import { foldEngineFingerprint } from './foldEngineFingerprint';
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
} from './foldEngineWire';

/** The wasm class's surface, as the generated `FoldEngine` has it. */
export interface FoldWasmEngine {
  sheet(paper: unknown): unknown;
  analyse(state: number, op: unknown): unknown;
  apply(state: number, op: unknown, choices: unknown): unknown;
  summary(state: number): unknown;
  canonical_keys(state: number): string[];
  release(states: Uint32Array): number;
  clear(): void;
  live(): number;
}

/** The largest handle the engine can hand out: a `u32`. */
const MAX_HANDLE = 0xffff_ffff;

export function invalidInput(message: string): WasmErrorEnvelope {
  return { code: 'invalid_input', message };
}

export function requireHandle(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_HANDLE) {
    throw invalidInput(`${name} must be a handle (a whole number from 1), got ${String(value)}`);
  }
  return value;
}

export function requireObject<T>(name: string, value: T): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidInput(`${name} must be an object`);
  }
  return value;
}

export interface FoldEngineCalls {
  /** The flat sheet a sequence starts from, with its fingerprint. */
  sheet(paper: FoldEnginePaper): FoldEngineOutcome<FoldSheetLanded>;
  /** What a fold along a line would move, without folding (D14 tier 2). */
  analyse(state: number, op: FoldEngineOp): FoldEngineOutcome<FoldAnalysed>;
  /** One step, for a preview: no fingerprint. The parent stays held. */
  apply(state: number, op: FoldEngineOp, choices?: FoldEngineChoices): FoldEngineOutcome<FoldStepLanded>;
  /** One step with the landed state's fingerprint: what a replay and a commit take. */
  step(
    state: number,
    op: FoldEngineOp,
    choices?: FoldEngineChoices
  ): FoldEngineOutcome<FoldStepFingerprinted>;
  summary(state: number): FoldStateSummary;
  fingerprint(state: number): FoldStateFingerprint;
  /** Let states go; how many were held. */
  release(states: readonly number[]): number;
  clear(): void;
  /** How many states are held. */
  live(): number;
}

export function createFoldEngineCalls(engine: FoldWasmEngine): FoldEngineCalls {
  const fingerprint = (state: number): FoldStateFingerprint =>
    foldEngineFingerprint(engine.canonical_keys(state));
  const apply = (state: number, op: FoldEngineOp, choices?: FoldEngineChoices) => {
    const handle = requireHandle('state', state);
    requireObject('op', op);
    if (choices !== undefined) requireObject('choices', choices);
    return engine.apply(handle, op, choices) as FoldEngineOutcome<FoldStepLanded>;
  };

  return {
    sheet(paper) {
      requireObject('paper', paper);
      const made = engine.sheet(paper) as FoldEngineOutcome<Omit<FoldSheetLanded, 'fingerprint'>>;
      return made.status === 'ok' ? { ...made, fingerprint: fingerprint(made.state) } : made;
    },

    analyse(state, op) {
      const handle = requireHandle('state', state);
      requireObject('op', op);
      return engine.analyse(handle, op) as FoldEngineOutcome<FoldAnalysed>;
    },

    apply,

    step(state, op, choices) {
      const landed = apply(state, op, choices);
      return landed.status === 'ok' ? { ...landed, fingerprint: fingerprint(landed.state) } : landed;
    },

    summary(state) {
      return engine.summary(requireHandle('state', state)) as FoldStateSummary;
    },

    fingerprint(state) {
      return fingerprint(requireHandle('state', state));
    },

    release(states) {
      if (!Array.isArray(states)) throw invalidInput('states must be an array of handles');
      const handles = states.map((state, k) => requireHandle(`states[${k}]`, state));
      return handles.length === 0 ? 0 : engine.release(Uint32Array.from(handles));
    },

    clear() {
      engine.clear();
    },

    live() {
      return engine.live();
    },
  };
}
