import type { TFunction } from 'i18next';
import type {
  FoldedFigurePlacement,
  OristudioCpFoldedFigureDisplayStyle,
  OristudioCpFoldedFigureModel,
} from '../../engine/oristudioCpTypes';
import { ANALYTICS_EVENTS, bucketCount, COUNT_BUCKETS, track } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { FoldedFigureCamera } from './folded3dCamera';
import { foldedFigureCapabilities } from './foldedFigureCapabilities';
import { foldedFigureGesture } from './foldedFigureGesture';
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

/**
 * The face folding holds fixed. Oriedita lets this be chosen and the kernel still
 * takes it per fold, but the product does not offer the choice: the picker was the
 * only thing that ever set it, so every fold was already from face 1.
 */
const FOLD_STARTING_FACE_ID = 1;

/**
 * Fold these creases into a new figure, as one entry: the viewport bar, `G` and
 * the selection toolbar all fold through here. A fold that is refused, fails or
 * is stopped leaves the figures as it found them, so it records nothing.
 */
export function foldCreases(
  lineIds: readonly number[],
  t: TFunction
): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.foldModelAction', 'Fold model'),
    () =>
      useWorkspaceStore.getState().foldOristudioCpDocument({
        startingFaceId: FOLD_STARTING_FACE_ID,
        lineIds: [...lineIds],
      })
  );
}

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

/** On to the next layer order, or past the last back to the first, as one entry. */
export function showAnotherFoldedSolution(id: string, t: TFunction): Promise<boolean | undefined> {
  return foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.anotherSolutionAction', 'Show another solution'),
    () => useWorkspaceStore.getState().foldAnotherOristudioCpFigure(id)
  );
}

/**
 * Back one layer order on a flat figure, by fold case, as one entry: the
 * kernel restarts the enumeration and replays it to the case before
 * (`foldOristudioCpFigureToCase`), as the Diagram's ‹ goes back. Counted as
 * Another solution is (`fold solution cycled`), with the solutions known
 * once it lands. Refused on the first, and on a 3D figure, which has no
 * numbered solutions to go back to.
 */
export function showPreviousFoldedSolution(id: string, t: TFunction): Promise<boolean | undefined> {
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
