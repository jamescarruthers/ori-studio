import { useCallback, useMemo } from 'react';
import type { FoldStep } from '../document/foldSequenceDocument';
import type { FoldScene } from '../engine/foldEngineWire';
import type { FoldSessionNode, FoldSessionSnapshot } from '../session/foldSessionState';
import { FOLD_SCENE_QUERY, FOLD_STEP_ACTION_QUERY } from '../session/foldStateQueries';
import { useFoldNode, useFoldSessionState, useFoldStateQuery } from '../session/useFoldSession';
import { stepMotionLegsOf } from '../engine/foldEngineCompoundWire';
import { foldStepMotion, type FoldStepMotion, type FoldStepPane } from './foldStepMotion';

/** The two states a step plays between, as the session holds them. */
export interface FoldStepScenes {
  /** The step as the document stores it: null for the sheet, a step this build cannot read, or none. */
  step: FoldStep | null;
  /** The step's landed node. */
  landed: FoldSessionNode | null;
  /** The parent state's scene — the sheet's for a first step — null until it is in. */
  before: FoldScene | null;
  /** The step's own landed scene, null until it is in. */
  after: FoldScene | null;
}

/**
 * A step's op from the shown sequence, its node, and its scene and its
 * parent's, asked of the engine whenever either state changes — the scenes
 * the canvas and the strip ask too, so the session answers all of them with
 * one ask each (`FoldSession.query`). Nothing is asked without a step that
 * has a motion: not of the sheet, nor of a locked step.
 */
export function useFoldStepScenes(stepId: string | null): FoldStepScenes {
  const selectStep = useCallback(
    (snapshot: FoldSessionSnapshot) =>
      stepId === null ? null : (snapshot.sequence?.steps.find((step) => step.id === stepId) ?? null),
    [stepId]
  );
  const node = useFoldSessionState(selectStep);
  const step: FoldStep | null = node && node.unknown === undefined ? node : null;
  const landed = useFoldNode(stepId);
  // The step's parent: the sheet for the first.
  const parent = useFoldNode(step?.parent ?? null);
  const after = useFoldStateQuery(step ? (landed?.state ?? null) : null, FOLD_SCENE_QUERY);
  const before = useFoldStateQuery(step ? (parent?.state ?? null) : null, FOLD_SCENE_QUERY);
  return useMemo(() => ({ step, landed, before, after }), [step, landed, before, after]);
}

/**
 * A step's motion, from the session: its op, its scene and its parent's
 * (`useFoldStepScenes`), what it did from its node, and its picture asked of
 * the engine whenever its state changes. Null for the sheet, a step this
 * build cannot read, a step without a state, until every answer is in, and
 * without a pane.
 *
 * `pane` is how the folded pane pictures a state (its placement and its
 * paper), so the motion's first and last frames are the pane's pictures of
 * the parent and of the step: keep it one function while the pane pictures
 * states the same way, or every render builds the motion again.
 *
 * Built from the step's op, never its node: a note, a mark or a spread
 * replaces the node and keeps the op, and changes nothing a frame draws — a
 * new motion would hand the pane its own scene back mid-play.
 */
export function useFoldStepMotion(stepId: string | null, pane: FoldStepPane | null): FoldStepMotion | null {
  const { step, landed, before, after } = useFoldStepScenes(stepId);
  const op = step?.op ?? null;
  const report = landed?.report ?? null;
  // Every compound family's report, as the session keeps it on the node, carries its legs.
  const legs = stepMotionLegsOf(landed?.compound);
  const acted = useFoldStateQuery(step ? (landed?.state ?? null) : null, FOLD_STEP_ACTION_QUERY);
  return useMemo(() => {
    if (!op || !pane || !after || !before || !acted) return null;
    return foldStepMotion({ op, before, after, action: acted.action, report, legs }, pane);
  }, [op, pane, after, before, acted, report, legs]);
}
