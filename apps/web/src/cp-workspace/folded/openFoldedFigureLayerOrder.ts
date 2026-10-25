/**
 * "Layer order…" on an Edit folded figure (`implementation-plans/layer-order-dialog.md`,
 * row H3): open the Layer order dialog on the fold the figure shows, and
 * commit its Apply as one undo entry.
 *
 * - **On the press, never before.** The fold is read (or, for a figure
 *   reopened from a file, made: `prepareOristudioCpFigureLayerOrder`) only
 *   now, and the dialog's code and its worker only load when it opens
 *   (`layerOrderDialogGateway.ts`).
 * - **One door.** The dialog is reached through its gateway alone, which
 *   answers every open; only `applied` writes. `unchanged`, `cancelled`,
 *   `busy` and `unavailable` leave the figure and the history as they were.
 * - **One undo entry.** Apply runs inside the folded layer's bracket, so it
 *   lands as "Set layer order" — or as nothing, when it changed nothing.
 *
 * React-free, as the figure's other verbs are (`foldedFigureVerbs.ts`), so the
 * toolbar, the context menu and the Properties pane run the same one.
 */
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import {
  openLayerOrderDialog,
  prefetchLayerOrderDialog,
  type LayerOrderDialogOutcome,
} from '../../layer-order/dialog/layerOrderDialogGateway';
import { EDIT_PAPER_FRAME, layerOrderRecordToSource } from '../../lib/layerOrder/paperFrame';
import type { LayerOrderApplied, LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { layerOrderSourceOf } from '../../lib/layerOrder/layerOrderSource';
import { radiansToDegrees, wrapDegrees } from '../../lib/angleUnits';
import type { PaperStyle } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import { useSettingsStore } from '../../store/settingsStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { OristudioCpFigureLayerOrderOpening } from '../../store/workspaceStore/types';
import { effectiveObjectPaperStyle } from '../paper/objectPaperStyle';
import { foldedFigureGesture } from './foldedFigureGesture';
import { releaseFoldedFigureHandle, retainFoldedFigureHandle } from './foldedFigureHandles';
import { foldedFigureLayerOrderRecord } from './foldedFigureLayerOrderState';

/** How a press ended: the dialog's answer, or that it never opened. */
export type FoldedFigureLayerOrderPress = LayerOrderDialogOutcome['kind'] | 'not-opened';

/**
 * What the dialog opens on for `figure`, from the fold its kernel answered
 * (`opening`) and the app's display style:
 *
 * - **the source** that fold folded, with the model the figure folds with;
 * - **its record**, its points in the crease pattern's coordinates (Edit's
 *   frame is the crease pattern's own);
 * - **Edit's look** (approach 3, D18): the figure's effective paper style
 *   (`effectiveObjectPaperStyle`), read through the flat figure's policy,
 *   turned as the figure is turned on the canvas, with X-ray on when the
 *   figure is drawn see-through (Transparent3);
 * - **what it shows** (`shown`), so the dialog opens on the order on the
 *   canvas (D19), and **the figure's name**.
 */
export function foldedFigureLayerOrderRequest(
  figure: OristudioCpFoldedFigureEntry,
  opening: Extract<OristudioCpFigureLayerOrderOpening, { status: 'ready' }>,
  display: PaperStyle
): LayerOrderRequest {
  const record = foldedFigureLayerOrderRecord(figure);
  return {
    source: layerOrderSourceOf(opening.source, opening.model),
    record: record ? layerOrderRecordToSource(record, EDIT_PAPER_FRAME) : null,
    look: {
      style: effectiveObjectPaperStyle(figure, display),
      policy: PAPER_STYLE_POLICIES['folded-flat'],
      // Placement turns the figure clockwise on screen by its rotation, as a
      // Diagram step's `rotationDeg` does.
      turnDeg: wrapDegrees(radiansToDegrees(figure.placement.rotation)),
      xray: figure.displayStyle === 'Transparent3',
    },
    shown: opening.shown,
    name: figure.title,
  };
}

/**
 * Open the Layer order dialog on figure `id`, and commit its Apply. Answers
 * how the press ended; every way but `applied` leaves the figure as it was.
 */
export async function openFoldedFigureLayerOrder(id: string, t: TFunction): Promise<FoldedFigureLayerOrderPress> {
  const store = useWorkspaceStore;
  const figure = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
  if (!figure) return 'not-opened';
  // The dialog's code, while the fold is read or made: loads, never spawns.
  prefetchLayerOrderDialog();
  const opening = await store.getState().prepareOristudioCpFigureLayerOrder(id);
  if (opening.status !== 'ready') {
    if (opening.reason === 'reopen-failed') {
      toast.error(
        t('toasts:layerOrder.reopenFailed', 'Couldn’t refold {{name}} to open it here. Its picture is unchanged.', {
          name: figure.title,
        })
      );
    }
    return 'not-opened';
  }
  try {
    const shown = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id) ?? figure;
    const outcome = await openLayerOrderDialog(
      foldedFigureLayerOrderRequest(shown, opening, useSettingsStore.getState().paperStyle.display)
    );
    if (outcome.kind === 'applied') await applyFoldedFigureLayerOrder(id, outcome.applied, t);
    return outcome.kind;
  } finally {
    await opening.release();
  }
}

/**
 * Commit an Apply on figure `id` as one undo entry, "Set layer order": a new
 * fold with the chosen order, the fold before kept by the entry, so an undo
 * shows the order it draws.
 *
 * The bracket records its entry after the act, and the act lets go of the
 * fold the figure showed — its last live holder — so it is held across the
 * bracket here, for the entry to take before it could be freed.
 */
export async function applyFoldedFigureLayerOrder(
  id: string,
  applied: LayerOrderApplied,
  t: TFunction
): Promise<boolean> {
  const store = useWorkspaceStore;
  const before = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id)?.handle ?? null;
  retainFoldedFigureHandle(before);
  try {
    const done = await foldedFigureGesture.run(
      'verb',
      t('panels:creasePattern.setLayerOrderAction', 'Set layer order'),
      () => store.getState().applyOristudioCpFigureLayerOrder(id, applied)
    );
    return done === true;
  } finally {
    releaseFoldedFigureHandle(before);
  }
}
