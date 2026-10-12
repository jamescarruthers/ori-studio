/**
 * The Step pane's Front | Back for a step shown as its crease pattern: the
 * side of the paper whose colour it is drawn on. Choosing the other side
 * fills the paper with that side's colour and changes nothing else — the same
 * lines, turn, mountains and valleys (Zach, 2026-10-06: "I wanted to just
 * change the color of the face and not flip the creases"). It is a pose
 * (`paper-side`), in Pose or not: one undo step, a fingerprint kept as a pose
 * keeps it, the step's marks left where they are and in step with the new
 * picture, counted as the paper's side.
 *
 * On the back, Flip creases under it draws every mountain as a valley and
 * every valley as a mountain, every line where it was: one pattern drawn from
 * the front, its creases read from the back for the steps that show the back
 * (Zach, 2026-10-12). A pose too (`flip-creases`), in every way the side is.
 *
 * Store-bound, React-free.
 */
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  creasePatternSide,
  isLockedStep,
  stepById,
  type DiagramCreasePatternRender,
} from '../document/diagramDocument';
import type { LinkedPoseRequest } from './linkedPose';
import { openLinkedPoseOf } from './openLinkedPose';
import { createPoseController, type PoseControllerListener } from './poseController';
import type { DiagramLinkedPose } from './useDiagramLinkedPose';

/** A crease pattern's paper verbs: the side whose colour it is on, and its creases flipped on its back. */
export type CreasePatternPaperRequest = Extract<LinkedPoseRequest, { verb: 'paper-side' | 'flip-creases' }>;

/** A controller's listener for a verb no view watches: a crease pattern folds nothing to show. */
const UNWATCHED: PoseControllerListener = {
  spatial: () => {},
  solutions: () => {},
  mirrorAxes: () => {},
  preview: () => {},
};

/** The render of a step shown as its crease pattern; null for any other step. */
function shownRender(stepId: string): DiagramCreasePatternRender | null {
  const { diagram } = useWorkspaceStore.getState();
  const step = diagram ? stepById(diagram, stepId) : null;
  if (!step || isLockedStep(step) || step.source?.kind !== 'cp') return null;
  const { render } = step.source;
  return render.mode === 'crease-pattern' ? render : null;
}

/**
 * Whether a step shown as its crease pattern is drawn as `request` asks: on
 * that side's colour, or with Flip creases on or off. Null for any other
 * step, and for Flip creases on a step not on its back, which has no such
 * field.
 */
export function creasePatternPaperShows(stepId: string, request: CreasePatternPaperRequest): boolean | null {
  const render = shownRender(stepId);
  if (!render) return null;
  if (request.verb === 'paper-side') return creasePatternSide(render) === request.side;
  return creasePatternSide(render) === 'back' ? (render.flipCreases === true) === request.on : null;
}

/**
 * Draw a step shown as its crease pattern as `request` asks: nothing when it
 * is already; otherwise as one undo step — through the open step's pose
 * controller while it is open in Pose (`viaOpen`), else through one made for
 * this verb alone and let go once it lands. Whether it is drawn so now.
 */
async function drawPaper(
  stepId: string,
  request: CreasePatternPaperRequest,
  viaOpen: (pose: DiagramLinkedPose) => Promise<boolean>
): Promise<boolean> {
  const shows = creasePatternPaperShows(stepId, request);
  if (shows === null || useWorkspaceStore.getState().diagramReadOnly) return false;
  if (shows) return true;
  const open = openLinkedPoseOf(stepId);
  if (open) return viaOpen(open);
  const controller = createPoseController(stepId, UNWATCHED);
  try {
    await controller.run(request);
  } finally {
    controller.dispose();
  }
  return creasePatternPaperShows(stepId, request) === true;
}

/** Draw a step shown as its crease pattern on the colour of `side`. Whether it is on that side now. */
export function showCreasePatternSide(stepId: string, side: 'front' | 'back'): Promise<boolean> {
  return drawPaper(stepId, { verb: 'paper-side', side }, (open) => open.setSide(side));
}

/**
 * Turn Flip creases on or off for a step shown as its crease pattern on its
 * back; nothing for one on its front. Whether it is on or off as asked now.
 */
export function flipCreasePatternCreases(stepId: string, on: boolean): Promise<boolean> {
  return drawPaper(stepId, { verb: 'flip-creases', on }, (open) => open.setFlipCreases(on));
}
