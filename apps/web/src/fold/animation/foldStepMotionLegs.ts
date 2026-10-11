import type { FoldStepMotionLegs } from '../engine/foldEngineWire';
import type { FoldSessionNode } from '../session/foldSessionState';

/**
 * A compound step's legs (the engine's `StepMotion`, plan D15), from what
 * the session holds of its landed node: the one place the step player reads
 * them, whatever family the step is. Null for a step that is no compound
 * fold, and for one whose report the session does not carry.
 *
 * Every family's report carries its legs as `motion` (reverse, crimp, tuck,
 * the vertex folds, the sinks); the session keeps a compound fold's report
 * under `compound`. Should the reports' shape or where the session keeps
 * them change, this is the line that follows it.
 */
export function foldStepMotionLegsOf(
  node: Pick<FoldSessionNode, 'compound'> | null | undefined
): FoldStepMotionLegs | null {
  return node?.compound?.motion ?? null;
}
