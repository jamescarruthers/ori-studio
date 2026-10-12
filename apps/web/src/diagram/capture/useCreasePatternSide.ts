import { useMemo } from 'react';
import {
  creasePatternSide,
  isLockedStep,
  type DiagramCreasePatternRender,
  type DiagramStep,
} from '../document/diagramDocument';
import { flipCreasePatternCreases, showCreasePatternSide } from './creasePatternSide';

/** The side whose colour a crease pattern's paper is drawn in, its creases flipped or not, and the ways to change them. */
export interface CreasePatternSideField {
  side: 'front' | 'back';
  /** Draw its paper in `side`'s colour, as one undo step, nothing else changed; nothing for the side it is on. */
  choose: (side: 'front' | 'back') => void;
  /**
   * Whether Flip creases is on: on the back, its mountains drawn as valleys
   * and its valleys as mountains. Kept on the front, where it draws nothing
   * and the pane does not offer it.
   */
  flipCreases: boolean;
  /** Turn Flip creases on or off, as one undo step; nothing on the front. */
  setFlipCreases: (on: boolean) => void;
}

/**
 * The side of the paper whose colour a step shown as its crease pattern is
 * drawn in, and on the back whether its creases are flipped, for the Step
 * pane's Front | Back and Flip creases: fields, beside Show as, never Pose's
 * verbs. Null for any other step — one shown folded or simulated, one not
 * linked, a newer build's.
 */
export function useCreasePatternSide(step: DiagramStep | null): CreasePatternSideField | null {
  const render: DiagramCreasePatternRender | null =
    step && !isLockedStep(step) && step.source?.kind === 'cp' && step.source.render.mode === 'crease-pattern'
      ? step.source.render
      : null;
  const stepId = step?.id ?? null;
  return useMemo(
    () =>
      render && stepId !== null
        ? {
            side: creasePatternSide(render),
            choose: (side: 'front' | 'back') => void showCreasePatternSide(stepId, side),
            flipCreases: render.flipCreases === true,
            setFlipCreases: (on: boolean) => void flipCreasePatternCreases(stepId, on),
          }
        : null,
    [render, stepId]
  );
}
