import type { TFunction } from 'i18next';
import type {
  FoldedFigurePlacement,
  OristudioCpFoldedFigureDisplayStyle,
  OristudioCpFoldedFigureModel,
} from '../../engine/oristudioCpTypes';
import { toast } from 'sonner';
import { ANALYTICS_EVENTS, bucketCount, COUNT_BUCKETS, track } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { OristudioCpFigureSolutionStep } from '../../store/workspaceStore/types';
import type { FoldedFigureCamera } from './folded3dCamera';
import { foldedFigureCapabilities } from './foldedFigureCapabilities';
import { foldedFigureGesture } from './foldedFigureGesture';
import { foldedFigureLayerOrderHold } from './foldedFigureLayerOrderState';
import { foldedFigureCurrentCase, foldedFigureFrontier } from './foldedFigureState';
import { openFoldedFigureExport } from './openFoldedFigureExport';

/**
 * The folded-figure layer's one-entry setters as React-free functions over the
 * layer's bracket, so the Properties pane, the floating toolbar and the
 * context menu share one implementation without mounting `useFoldedFigures`
 * (single-instance: it needs the panel's document and selection, and owns the
 * orbit and rehydration effects).
 *
 * Every function is `foldedFigureGesture.run('verb', label, …)`; a verb that
 * changed nothing records nothing, and one issued while another owner holds
 * the layer is refused. Export is no entry: saving a file changes nothing. The
 * verbs that need panel-held state — the notice action, the 3D flip through
 * the live orbit camera, refold — stay in the hook and on the floating
 * toolbar.
 */

export function setFoldedFigureDisplayStyle(
  id: string,
  displayStyle: OristudioCpFoldedFigureDisplayStyle,
  t: TFunction
): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.changeFoldedDisplayStyle', 'Change folded display style'),
    () => useWorkspaceStore.getState().setOristudioCpFoldedFigureDisplayStyle(id, displayStyle)
  );
}

/** One discrete model change (side, shadows, anti-alias) as one entry. */
export function updateFoldedFigureModelAsEntry(
  id: string,
  patch: Partial<OristudioCpFoldedFigureModel>,
  t: TFunction
): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.changeFoldedModel', 'Change folded model'),
    () => useWorkspaceStore.getState().updateOristudioCpFoldedFigureModel(id, patch)
  );
}

/**
 * Move a 3D figure's eye, as one entry. Callers spread the figure's current
 * camera so `orient` survives a yaw or pitch edit — which way the model is up
 * is a property of the model, not of one look at it.
 */
export function setFolded3dCamera(
  id: string,
  camera: FoldedFigureCamera,
  t: TFunction
): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:cpProperties.folded.changeView', 'Change folded model view'),
    () => useWorkspaceStore.getState().setOristudioCpFolded3dCamera(id, camera)
  );
}

/** A typed placement edit (scale, rotation) as one entry, under the gesture's own label. */
export function setFoldedFigurePlacementAsEntry(
  id: string,
  patch: Partial<FoldedFigurePlacement>,
  label: string
): Promise<void | undefined> {
  return foldedFigureGesture.run('verb', label, () =>
    useWorkspaceStore.getState().setOristudioCpFoldedFigurePlacement(id, patch)
  );
}

export function deleteFoldedFigure(id: string, t: TFunction): Promise<void | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.deleteFoldedModelAction', 'Delete folded model'),
    () => useWorkspaceStore.getState().deleteOristudioCpFoldedFigure(id)
  );
}

export function duplicateFoldedFigure(id: string, t: TFunction): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.duplicateFoldedModelAction', 'Duplicate folded model'),
    () => useWorkspaceStore.getState().duplicateOristudioCpFoldedFigure(id)
  );
}

/**
 * On to the next layer order, or past the last back to the first, as one
 * entry. On a constrained figure, on to the next solution that fits its
 * constraints instead ({@link stepConstrainedFoldedSolution}).
 */
export function showAnotherFoldedSolution(id: string, t: TFunction): Promise<boolean | undefined> {
  if (isConstrainedFigure(id)) return stepConstrainedFoldedSolution(id, 'next', t);
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.anotherSolutionAction', 'Show another solution'),
    () => useWorkspaceStore.getState().foldAnotherOristudioCpFigure(id)
  );
}

/** Whether figure `id` shows a chosen layer order this build reads: it steps within its constraints (H6). */
function isConstrainedFigure(id: string): boolean {
  const figure = useWorkspaceStore.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
  return figure !== undefined && foldedFigureLayerOrderHold(figure) === 'record';
}

/**
 * Another solution, or back one, on a constrained figure (row H6, D9), as
 * one entry under the same labels as an unconstrained figure's: through the
 * solutions that fit its record, on the host engine's cursor, which the first
 * press makes (`foldedSolutionCursor.ts`). A press that moves nothing writes
 * nothing, and says why when the reason is news ({@link sayFoldedSolutionStep}).
 * `tries` counts the user's Keep trying after running out of time.
 */
export function stepConstrainedFoldedSolution(
  id: string,
  direction: 'next' | 'previous',
  t: TFunction,
  { tries = 0 }: { tries?: number } = {}
): Promise<boolean | undefined> {
  const label =
    direction === 'next'
      ? t('panels:creasePattern.anotherSolutionAction', 'Show another solution')
      : t('panels:creasePattern.previousSolutionAction', 'Show previous solution');
  return foldedFigureGesture.run('verb', label, async () => {
    const step = await useWorkspaceStore.getState().stepOristudioCpFigureLayerOrder(id, direction, { tries });
    sayFoldedSolutionStep(step, t, () => void stepConstrainedFoldedSolution(id, direction, t, { tries: tries + 1 }), tries);
    return step.status === 'moved';
  });
}

/**
 * The toast id of a step's message, by how many times the user has kept
 * trying: presses at the same try replace one another, and each Keep trying
 * gets a fresh one. Clicking Keep trying dismisses its toast, and a toast
 * shown again under that id while it leaves is lost in its exit.
 */
function stepToastId(tries: number): string {
  return `layer-order-step-${tries}`;
}

/**
 * What a constrained step that moved nothing says, if anything:
 *
 * - the engine didn't load (offline: check the connection) or stopped;
 * - the record couldn't be checked in time (D10), or no next solution was
 *   found within the step's deadline (an end the count hasn't reached yet,
 *   or a step that ran out): each with Keep trying, which asks again with a
 *   longer deadline (`keepTrying`);
 * - its constraints need attention; or the next solution is too large to save.
 *
 * An end that is final, a Stop, a figure that moved on, or one that can't
 * step now says nothing: the pager shows where it stands, and the rest the
 * user did or already sees. A fold the kernel couldn't draw said so through
 * the store.
 */
export function sayFoldedSolutionStep(
  step: OristudioCpFigureSolutionStep,
  t: TFunction,
  keepTrying: () => void,
  tries = 0
): void {
  const keepTryingAction = {
    label: t('dialogs:layerOrder.keepTrying', 'Keep trying'),
    onClick: keepTrying,
  };
  const toastId = stepToastId(tries);
  switch (step.status) {
    case 'lost':
      toast.error(
        step.cause === 'load'
          ? t(
              'toasts:layerOrder.stepLostLoad',
              'Layer order couldn’t load, so the figure wasn’t changed. Check your connection, then try again.'
            )
          : t('toasts:layerOrder.stepLost', 'Layer order stopped unexpectedly, so the figure wasn’t changed.'),
        { id: toastId }
      );
      return;
    case 'timed_out':
      toast.error(
        step.stage === 'restore'
          ? t(
              'toasts:layerOrder.stepCheckTimedOut',
              'Couldn’t check this figure’s layer constraints in time, so it wasn’t changed.'
            )
          : t('toasts:layerOrder.stepNotFoundInTime', 'Couldn’t find another solution in time, so the figure wasn’t changed.'),
        { id: toastId, action: keepTryingAction }
      );
      return;
    case 'end':
      // Not final: the search for the next ran out before the count got there.
      if (!step.final) {
        toast.error(
          t('toasts:layerOrder.stepNotFoundInTime', 'Couldn’t find another solution in time, so the figure wasn’t changed.'),
          { id: toastId, action: keepTryingAction }
        );
      }
      return;
    case 'unrestored':
      toast.error(
        t(
          'toasts:layerOrder.stepUnrestored',
          'This figure’s layer constraints need attention, so it can’t step through solutions. Open Layer order… to review them.'
        ),
        { id: toastId }
      );
      return;
    case 'too-large':
      toast.error(
        t('errors:cp.layerOrderTooLarge', 'This layer order is too large to save with the figure, so it is unchanged.'),
        { id: toastId }
      );
      return;
    case 'moved':
    case 'not-drawn':
    case 'stopped':
    case 'blocked':
      return;
  }
}

/**
 * Back one layer order on a flat figure, by fold case, as one entry: the
 * kernel restarts the enumeration and replays it to the case before
 * (`foldOristudioCpFigureToCase`), as the Diagram's ‹ goes back. Counted as
 * Another solution is (`fold solution cycled`), with the solutions known
 * once it lands. Refused on the first, and on a 3D figure, which has no
 * numbered solutions to go back to. On a constrained figure, back one
 * solution that fits its constraints instead ({@link stepConstrainedFoldedSolution}).
 */
export function showPreviousFoldedSolution(id: string, t: TFunction): Promise<boolean | undefined> {
  if (isConstrainedFigure(id)) return stepConstrainedFoldedSolution(id, 'previous', t);
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.previousSolutionAction', 'Show previous solution'),
    async () => {
      const store = useWorkspaceStore.getState();
      const figure = store.oristudioCpFoldedFigures.find((entry) => entry.id === id);
      const current = foldedFigureCurrentCase(figure);
      if (!figure || !foldedFigureCapabilities(figure).foldToCase || current <= 1) return false;
      const moved = await store.foldOristudioCpFigureToCase(id, current - 1);
      if (moved) {
        const landed = useWorkspaceStore
          .getState()
          .oristudioCpFoldedFigures.find((entry) => entry.id === id);
        track(ANALYTICS_EVENTS.foldSolutionCycled, {
          direction: 'previous',
          solution_count_bucket: bucketCount(foldedFigureFrontier(landed).cases, COUNT_BUCKETS),
        });
      }
      return moved;
    }
  );
}

/** Open the export dialog on the figure alone: not an undo step, since saving a file changes nothing. */
export function exportFoldedFigure(id: string, t: TFunction): void {
  void openFoldedFigureExport(id, t);
}
