/**
 * The verbs of a Diagram step linked to a Fold step (plan D17), bound to the
 * store: Refresh, Show as, its pose, its crease pattern's paper side, and the
 * way back to its step in Fold. Each capture goes through the store's
 * `captureDiagramFoldStep`, one undo step, and says what the user needs told.
 *
 * Store-bound, React-free.
 */
import { toast } from 'sonner';
import { trackDiagramSourceOpened } from '../../analytics';
import { foldStepTree } from '../../fold/document/foldStepTree';
import i18n from '../../i18n';
import { humanizeError } from '../../lib/toastMessages';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramFoldCaptureOutcome } from '../../store/workspaceStore/diagramFoldCapture';
import {
  creasePatternSide,
  isLockedStep,
  renderToShowAs,
  showAsOf,
  stepById,
  withCreasePatternSide,
  type DiagramCpRender,
  type DiagramFoldStepSource,
  type DiagramShowAs,
} from '../document/diagramDocument';
import { replacedEdited, undoNewest } from '../references/cardMarksToast';
import { linkedFoldSequence } from './foldStepLink';

/** The Fold step a step is linked to, while it is one this build may change; null otherwise. */
function foldSourceOf(stepId: string): DiagramFoldStepSource | null {
  const { diagram, diagramReadOnly } = useWorkspaceStore.getState();
  const step = diagram ? stepById(diagram, stepId) : null;
  if (!step || isLockedStep(step) || diagramReadOnly || step.source?.kind !== 'fold-step') return null;
  return step.source;
}

/** Capture the step again from its Fold step in `render`, and say what came of it. Whether it was captured. */
async function captureAs(
  stepId: string,
  source: DiagramFoldStepSource,
  render: DiagramCpRender,
  label: string,
  joinEntry?: object
): Promise<DiagramFoldCaptureOutcome> {
  const { sequence, step, moment } = source;
  const outcome = await useWorkspaceStore
    .getState()
    .captureDiagramFoldStep(stepId, { sequence, step, moment, render, label, ...(joinEntry ? { joinEntry } : {}) });
  sayFoldCaptureOutcome(outcome);
  return outcome;
}

/**
 * Capture a Fold step's picture again from its step as it is now, in its
 * pose — after the sequence changed upstream, or to anchor its faces.
 * `joinEntry` folds it into Refresh all's one undo entry.
 */
export function refreshDiagramFoldStep(
  stepId: string,
  { label = 'Refresh picture', joinEntry }: { label?: string; joinEntry?: object } = {}
): Promise<DiagramFoldCaptureOutcome> | null {
  const source = foldSourceOf(stepId);
  return source ? captureAs(stepId, source, source.render, label, joinEntry) : null;
}

/** Show a Fold step's step another way (D19): its crease pattern, or folded, in the pose that way last had. */
export async function showFoldStepAs(stepId: string, way: DiagramShowAs): Promise<boolean> {
  const source = foldSourceOf(stepId);
  if (!source || way === 'simulated') return false;
  if (showAsOf(source.render) === way) return true;
  // A Fold step's fold starts as Fold shows it: no spread, its layer order the sequence's.
  const outcome = await captureAs(stepId, source, renderToShowAs(source, way), showAsLabel(way));
  return outcome.status === 'captured';
}

/**
 * A copy of a Fold step's step after it, shown the other way (D19): its
 * crease pattern, then its folded form, in two presses. One undo step: the
 * capture folds into the duplicate's, and a capture that does not land takes
 * the copy with it. The copy's id, or null.
 */
export async function duplicateFoldStepAs(stepId: string, way: DiagramShowAs): Promise<string | null> {
  const source = foldSourceOf(stepId);
  if (!source || way === 'simulated') return null;
  const copyId = useWorkspaceStore.getState().duplicateDiagramStep(stepId);
  if (copyId === null || showAsOf(source.render) === way) return copyId;
  const duplicated = useWorkspaceStore.getState().diagramHistory.past.at(-1);
  const outcome = await captureAs(copyId, source, renderToShowAs(source, way), 'Duplicate step', duplicated);
  if (outcome.status !== 'captured') {
    const now = useWorkspaceStore.getState();
    if (duplicated !== undefined && now.diagramHistory.past.at(-1) === duplicated) now.undoDiagram();
    return null;
  }
  return copyId;
}

function showAsLabel(way: DiagramShowAs): string {
  return way === 'crease-pattern' ? 'Show as Crease Pattern' : 'Show as Folded';
}

/** The pose verbs a Fold step takes: the picture turned a quarter, turned over, or back as it was linked. */
export type FoldStepPoseVerb = 'rotate-left' | 'rotate-right' | 'turn-over' | 'reset';

/**
 * A render posed by `verb`: a quarter turn either way; a flat fold turned
 * over — its front at the opposite turn, mirrored (Turn Over, 12d) — or a
 * crease pattern's paper on its other side's colour; and reset, upright and
 * from the front.
 */
export function posedFoldRender(render: DiagramCpRender, verb: FoldStepPoseVerb): DiagramCpRender {
  const quarter = (degrees: number) => (((degrees + (verb === 'rotate-left' ? -90 : 90)) % 360) + 360) % 360;
  switch (render.mode) {
    case 'crease-pattern':
      if (verb === 'reset') return { mode: 'crease-pattern', rotationDeg: 0 };
      if (verb === 'turn-over') return withCreasePatternSide(render, creasePatternSide(render) === 'back' ? 'front' : 'back');
      return { ...render, rotationDeg: quarter(render.rotationDeg) };
    case 'folded-flat':
      if (verb === 'reset') {
        const { spread } = render;
        return { mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 1, ...(spread ? { spread } : {}) };
      }
      if (verb === 'turn-over') {
        return { ...render, side: render.side === 'back' ? 'front' : 'back', rotationDeg: (360 - render.rotationDeg) % 360 };
      }
      return { ...render, rotationDeg: quarter(render.rotationDeg) };
    default:
      return render;
  }
}

/** Pose a Fold step's picture by `verb`, as one undo step. Whether it now shows that pose. */
export async function poseDiagramFoldStep(stepId: string, verb: FoldStepPoseVerb): Promise<boolean> {
  const source = foldSourceOf(stepId);
  if (!source) return false;
  const render = posedFoldRender(source.render, verb);
  if (JSON.stringify(render) === JSON.stringify(source.render)) return true;
  const outcome = await captureAs(stepId, source, render, 'Adjust pose');
  return outcome.status === 'captured';
}

/** A Fold step shown as its crease pattern, drawn on the colour of `side`: its paper, nothing else. */
export async function showFoldStepPaperSide(stepId: string, side: 'front' | 'back'): Promise<boolean> {
  const source = foldSourceOf(stepId);
  if (!source || source.render.mode !== 'crease-pattern') return false;
  if (creasePatternSide(source.render) === side) return true;
  const outcome = await captureAs(stepId, source, withCreasePatternSide(source.render, side), 'Adjust pose');
  return outcome.status === 'captured';
}

/**
 * Open a step's Fold step in Fold: the sequence's cursor on it — the active
 * path through it — and Fold on screen. Says why not when the sequence is not
 * the one Fold shows, or the step is gone.
 */
export function openDiagramStepInFold(stepId: string): void {
  const store = useWorkspaceStore.getState();
  const step = store.diagram ? stepById(store.diagram, stepId) : null;
  if (!step || isLockedStep(step) || step.source?.kind !== 'fold-step') return;
  const { sequence, step: foldStepId } = step.source;
  const t = i18n.t.bind(i18n);
  const document = linkedFoldSequence({ sequence }, store.foldSequences);
  // One sequence is shown (plan D7): the first.
  if (!document || store.foldSequences[0]?.document.id !== sequence) {
    toast.error(t('toasts:diagram.fold.sequenceGone', 'That Fold sequence isn’t in this project any more.'));
    return;
  }
  if (!foldStepTree(document.steps).byId.has(foldStepId)) {
    toast.error(t('toasts:diagram.fold.stepGone', 'That step isn’t in the Fold sequence any more.'));
    return;
  }
  store.moveFoldCursor(foldStepId);
  useLayoutStore.getState().activateWorkspace('fold');
  trackDiagramSourceOpened('fold');
}

/**
 * Tell the user what a Fold step's capture came to, when there is something
 * to tell: a picture kept as a bitmap, marks the author had edited that the
 * fold's own replaced (with Undo), or a capture that could not be made and
 * why. One the user moved on from says nothing.
 */
export function sayFoldCaptureOutcome(outcome: DiagramFoldCaptureOutcome): void {
  const t = i18n.t.bind(i18n);
  switch (outcome.status) {
    case 'captured':
      if (outcome.replaced > 0) toast.message(replacedEdited(outcome.replaced), { action: undoNewest() });
      else if (outcome.tooDetailed) {
        toast.message(
          t('toasts:diagram.capture.tooDetailed', 'Too detailed to keep as a drawing, so the step keeps it as an image.')
        );
      }
      return;
    case 'missing':
      toast.error(t('toasts:diagram.fold.missing', 'That step isn’t in the Fold sequence any more, or no longer folds.'));
      return;
    case 'unknown':
      toast.error(
        outcome.why === 'not-shown'
          ? t('toasts:diagram.fold.notShown', 'Fold shows another sequence, so this step can’t be captured now.')
          : outcome.why === 'locked'
            ? t('toasts:diagram.fold.locked', 'That step was made with a newer Ori Studio.')
            : t('toasts:foldIo.unavailable', 'The fold engine stopped before it finished. Try again.')
      );
      return;
    case 'failed':
      toast.error(t('toasts:diagram.capture.failed', 'The picture couldn’t be captured'), {
        description: humanizeError(outcome, t),
      });
      return;
    case 'read-only':
      toast.error(
        t('toasts:diagram.capture.readOnly', 'This diagram was made with a newer Ori Studio and opens read-only.')
      );
      return;
    case 'discarded':
    case 'busy':
      return;
  }
}
