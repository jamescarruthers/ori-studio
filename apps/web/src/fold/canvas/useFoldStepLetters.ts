import { useCallback, useMemo } from 'react';
import { isLockedStep, type FoldStep } from '../document/foldSequenceDocument';
import type { FoldSessionSnapshot } from '../session/foldSessionState';
import { useFoldNode, useFoldSessionState, type FoldSessionSurface } from '../session/useFoldSession';
import { useFoldStateFrames } from '../sequence/useFoldStateFrames';
import { foldStepLetters, type FoldLetteredReference } from './foldStepLetters';
import type { FoldStateView } from './useFoldStateView';
import type { FoldToolPreview } from './useFoldToolPreview';

const NONE: readonly FoldLetteredReference[] = [];

/**
 * The lettered references the folded pane shows (`foldStepLetters`): the
 * fold being made, once its line is located, on the state on screen it folds
 * from — the step the strip's "Next" card and the Step pane's pending fold
 * describe; else, while no click is in hand, the step on screen, on its
 * landed state — the step the Step pane describes. Each named in the frame
 * its sentence is read in, so the two letter alike.
 */
export function useFoldStepLetters(
  session: FoldSessionSurface,
  view: FoldStateView,
  preview: FoldToolPreview,
  picking: boolean
): readonly FoldLetteredReference[] {
  const { cursorId, scene } = view;
  const selectStep = useCallback(
    (snapshot: FoldSessionSnapshot) =>
      cursorId === null ? null : (snapshot.sequence?.steps.find((step) => step.id === cursorId) ?? null),
    [cursorId]
  );
  const node = useFoldSessionState(selectStep);
  // A step a newer build wrote has no sentence of ours, and no letters.
  const step: FoldStep | null = node && !isLockedStep(node) ? node : null;
  // The state the step on screen folds from: the sheet's for a first step.
  const parent = useFoldNode(step ? step.parent : null);
  const cursorState = session.cursor.state;
  const parentState = step ? (parent?.state ?? null) : null;
  const states = useMemo(() => [cursorState, parentState], [cursorState, parentState]);
  const [cursorFrame, parentFrame] = useFoldStateFrames(states);
  const pendingOp = preview.step?.op ?? null;
  return useMemo(() => {
    if (!scene) return NONE;
    if (pendingOp) return foldStepLetters(pendingOp, cursorFrame ?? null, scene);
    if (picking || !step) return NONE;
    return foldStepLetters(step.op, parentFrame ?? null, scene);
  }, [scene, pendingOp, cursorFrame, picking, step, parentFrame]);
}
