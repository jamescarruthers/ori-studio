import { useCallback, useMemo } from 'react';
import type { FoldStep } from '../document/foldSequenceDocument';
import type { FoldSessionSnapshot } from '../session/foldSessionState';
import { FOLD_SCENE_QUERY, FOLD_STEP_ACTION_QUERY } from '../session/foldStateQueries';
import { useFoldNode, useFoldSessionState, useFoldStateQuery } from '../session/useFoldSession';
import { foldStepMotion, type FoldStepMotion, type FoldStepPane } from './foldStepMotion';

/**
 * A step's motion, from the session: its op from the shown sequence, what it
 * did from its node, and its scene, its parent's scene and its picture asked
 * of the engine whenever either state changes — the scenes the canvas and
 * the strip ask too, so the session answers all of them with one ask each
 * (`FoldSession.query`). Null for the sheet, a step this build cannot read, a
 * step without a state, until every answer is in, and without a pane.
 *
 * `pane` is how the folded pane pictures a state (its placement and its
 * paper), so the motion's first and last frames are the pane's pictures of
 * the parent and of the step: keep it one function while the pane pictures
 * states the same way, or every render builds the motion again.
 */
export function useFoldStepMotion(stepId: string | null, pane: FoldStepPane | null): FoldStepMotion | null {
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
  const report = landed?.report ?? null;
  // Nothing is asked without a step that has a motion: not of the sheet, nor of a locked step.
  const after = useFoldStateQuery(step ? (landed?.state ?? null) : null, FOLD_SCENE_QUERY);
  const before = useFoldStateQuery(step ? (parent?.state ?? null) : null, FOLD_SCENE_QUERY);
  const acted = useFoldStateQuery(step ? (landed?.state ?? null) : null, FOLD_STEP_ACTION_QUERY);
  return useMemo(() => {
    if (!step || !pane || !after || !before || !acted) return null;
    return foldStepMotion({ op: step.op, before, after, action: acted.action, report }, pane);
  }, [step, pane, after, before, acted, report]);
}
