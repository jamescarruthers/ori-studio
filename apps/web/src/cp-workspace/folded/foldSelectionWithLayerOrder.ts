/**
 * "Fold with layer order…" on an Edit selection (`implementation-plans/layer-order-dialog.md`,
 * row H5): fold the creases, open the Layer order dialog on that fold, and
 * make the figure with the order its Apply chose, as one undo entry.
 *
 * - **A fold of the dialog's own.** The press folds the creases as Fold
 *   would, after the same pre-fold check (`prepareOristudioCpLayerOrderFold`),
 *   on a fold no figure holds: nothing appears on the canvas until Apply, and
 *   that fold is let go however the press ends.
 * - **One door.** The dialog is reached through its gateway alone. `applied`
 *   folds the new figure with the order chosen and saves its record;
 *   `unchanged` (Apply on the order it opened on) folds it with Oriedita's
 *   own order, as Fold does, and saves none. `cancelled`, `busy` and
 *   `unavailable` leave the canvas and the history as they were.
 * - **One undo entry,** "Fold model", as Fold's: the figure's fold runs inside
 *   the folded layer's bracket (`foldedFigureGesture`).
 *
 * React-free, as the figures' other verbs are (`foldedFigureVerbs.ts`), so the
 * selection toolbar and the shortcut run the same one.
 */
import type { TFunction } from 'i18next';
import {
  openLayerOrderDialog,
  prefetchLayerOrderDialog,
  type LayerOrderDialogOutcome,
} from '../../layer-order/dialog/layerOrderDialogGateway';
import type { LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { layerOrderSourceOf } from '../../lib/layerOrder/layerOrderSource';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type {
  OristudioCpFoldWithChosenOrder,
  OristudioCpSelectionLayerOrderOpening,
} from '../../store/workspaceStore/types';
import { uprightRotationForView } from '../annotations/annotationTransform';
import { cpOverlayViewStore } from '../cpOverlayViewStore';
import { foldedFigureGesture } from './foldedFigureGesture';
import { editFigureLook, editFigureView, type EditFigureView } from './openFoldedFigureLayerOrder';

/** How a press ended: the dialog's answer, or that it never opened. */
export type SelectionLayerOrderPress = LayerOrderDialogOutcome['kind'] | 'not-opened';

/**
 * What the dialog opens on for the selection's fold (`opening`), on the canvas
 * `view`: the source it folded, with no record yet; the look of the figure
 * Apply makes (D18) — the app's display style, which a new figure follows,
 * front up, turned as a new figure is placed (`rotation`, upright on screen),
 * not see-through; the order Fold would show (D19); and the dialog's name for
 * a selection.
 */
export function selectionLayerOrderRequest(
  opening: Extract<OristudioCpSelectionLayerOrderOpening, { status: 'ready' }>,
  view: EditFigureView,
  rotation: number,
  t: TFunction
): LayerOrderRequest {
  return {
    surface: 'edit_figure',
    source: layerOrderSourceOf(opening.source, opening.model),
    record: null,
    look: editFigureLook(view, { style: view.display, rotation, model: opening.model, xray: false }),
    ...(opening.shown ? { shown: opening.shown } : {}),
    name: t('panels:creasePattern.layerOrderSelectionName', 'Selection'),
  };
}

/**
 * Fold `lineIds` with a layer order chosen in the dialog. Answers how the
 * press ended; only an Apply (`applied`, `unchanged`) makes a figure.
 */
export async function foldSelectionWithLayerOrder(
  lineIds: readonly number[],
  t: TFunction
): Promise<SelectionLayerOrderPress> {
  const store = useWorkspaceStore;
  // The dialog's code, while the creases fold: loads, never spawns.
  prefetchLayerOrderDialog();
  const opening = await store.getState().prepareOristudioCpLayerOrderFold(lineIds);
  // Each way out has said what it had to (`oristudioCpError`), or has nothing to say.
  if (opening.status !== 'ready') return 'not-opened';
  try {
    const request = selectionLayerOrderRequest(opening, editFigureView(store.getState()), newFigureRotation(), t);
    const outcome = await openLayerOrderDialog(request);
    if (outcome.kind === 'applied') {
      const { source, relations, record } = outcome.applied;
      await foldWithChosenOrderAsEntry(opening.lineIds, { source, relations, record }, t);
    } else if (outcome.kind === 'unchanged') {
      await foldWithChosenOrderAsEntry(opening.lineIds, { source: request.source, relations: new Uint32Array(), record: null }, t);
    }
    return outcome.kind;
  } finally {
    await opening.release();
  }
}

/** The new figure's fold, as Fold's own entry: "Fold model", or nothing when it folds nothing. */
function foldWithChosenOrderAsEntry(
  lineIds: readonly number[],
  withOrder: OristudioCpFoldWithChosenOrder,
  t: TFunction
): Promise<boolean | undefined> {
  return foldedFigureGesture.run('verb', t('panels:creasePattern.foldModelAction', 'Fold model'), () =>
    useWorkspaceStore.getState().foldOristudioCpDocument({ startingFaceId: 1, lineIds: [...lineIds], withOrder })
  );
}

/** How far a new figure is turned on the canvas: upright on screen, as a fold places it. */
function newFigureRotation(): number {
  return uprightRotationForView(cpOverlayViewStore.get()?.user ?? null);
}
