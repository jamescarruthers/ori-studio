/**
 * The Fold engine as a document replay drives it: the port the replay
 * orchestrator calls (`fold/document/foldReplay.ts`'s `FoldEnginePort`, on the
 * document branch), implemented over the bridge's calls.
 *
 * The types here are that port's, structurally — `engineVersion`, `sheet`,
 * `step`, an optional `release`, and outcomes that either landed with a state
 * and its `fs1` fingerprint or did not, with the refusal's code — so the
 * replayer takes this adapter as it is. When the two branches meet, these
 * declarations give way to the document's.
 *
 * **Handles carry their engine's generation.** A worker that is terminated
 * (to stop work) or crashes takes every state it held with it, and the one
 * spawned after it numbers its states from 1 again. A handle is therefore
 * `{ generation, id }`: a step from a handle of an older generation rejects
 * as `fold_state_lost` instead of folding some other state that happens to
 * share its number, and releasing one is a no-op. The replayer's owner hears
 * the loss (`onFoldSequenceClientLost`), clears the replayer and replays.
 *
 * Pure: no React, no store, no wasm.
 */

import type { WasmErrorEnvelope } from '../../engine/types';
import type {
  FoldEngineChoices,
  FoldEngineOp,
  FoldEngineOutcome,
  FoldEnginePaper,
  FoldSheetLanded,
  FoldStateFingerprint,
  FoldStepFingerprinted,
} from './foldEngineWire';

/** A landed state, named for the engine that holds it. */
export interface FoldEngineStateHandle {
  readonly generation: number;
  readonly id: number;
}

/** What the engine made of one step, or of the sheet. */
export type FoldEngineReplayOutcome<S> =
  | { landed: true; state: S; fingerprint: FoldStateFingerprint }
  /** The inputs no longer resolve, or a stored choice no longer does: the refusal's code. */
  | { landed: false; code: string };

/** The engine as replay drives it. `S` names a landed state to the engine. */
export interface FoldEnginePort<S> {
  /** The engine's `FOLD_ENGINE_VERSION`, stored beside every cached state. */
  readonly engineVersion: number;
  /** The flat sheet a sequence starts from. */
  sheet(paper: FoldEnginePaper): Promise<FoldEngineReplayOutcome<S>>;
  /** One step, from its parent's landed state. */
  step(
    parent: S,
    step: { op: FoldEngineOp; choices?: FoldEngineChoices }
  ): Promise<FoldEngineReplayOutcome<S>>;
  /** Let go of a state the cache no longer holds. */
  release?(state: S): void;
}

/** Where the engine runs: the worker's client, or the wasm in-process (tests). */
export interface FoldEngineSource {
  /** The engine instance now answering; it changes whenever the old one and its states are gone. */
  generation(): number;
  sheet(paper: FoldEnginePaper): Promise<FoldEngineOutcome<FoldSheetLanded>>;
  step(
    state: number,
    op: FoldEngineOp,
    choices?: FoldEngineChoices
  ): Promise<FoldEngineOutcome<FoldStepFingerprinted>>;
  release(states: readonly number[]): Promise<unknown>;
}

/** A step was asked of a state its engine no longer holds. */
export function foldStateLostError(handle: FoldEngineStateHandle): WasmErrorEnvelope {
  return {
    code: 'fold_state_lost',
    message: `state ${handle.id} belonged to engine ${handle.generation}, which has since stopped`,
  };
}

/**
 * The port over `source`. Releases are batched: every handle released in one
 * turn of the event loop goes to the engine in one call, which is what a
 * cache trim of a hundred states needs.
 */
export function createFoldEnginePort(
  source: FoldEngineSource,
  engineVersion: number
): FoldEnginePort<FoldEngineStateHandle> {
  let releasing: { generation: number; ids: number[] } | null = null;

  const flush = () => {
    const batch = releasing;
    releasing = null;
    // An engine that stopped since took these with it.
    if (!batch || batch.generation !== source.generation()) return;
    // Nothing waits on a release, and a failed one leaves only memory held
    // in an engine that is being replaced anyway.
    source.release(batch.ids).catch(() => undefined);
  };

  const landing = <T extends { state: number; fingerprint: FoldStateFingerprint }>(
    outcome: FoldEngineOutcome<T>,
    generation: number
  ): FoldEngineReplayOutcome<FoldEngineStateHandle> =>
    outcome.status === 'ok'
      ? { landed: true, state: { generation, id: outcome.state }, fingerprint: outcome.fingerprint }
      : { landed: false, code: outcome.refusal.code };

  return {
    engineVersion,

    async sheet(paper) {
      const generation = source.generation();
      return landing(await source.sheet(paper), generation);
    },

    async step(parent, { op, choices }) {
      const generation = source.generation();
      if (parent.generation !== generation) throw foldStateLostError(parent);
      return landing(await source.step(parent.id, op, choices), generation);
    },

    release(state) {
      if (state.generation !== source.generation()) return;
      if (releasing?.generation !== state.generation) {
        // A batch of an older generation is stale: its engine is gone.
        releasing = { generation: state.generation, ids: [] };
        queueMicrotask(flush);
      }
      releasing.ids.push(state.id);
    },
  };
}
