/**
 * What Edit says when it refolds a figure with a chosen layer order
 * (`implementation-plans/layer-order-dialog.md`, row H4), once the store has
 * written what it keeps (`refoldOristudioCpFoldedFigure`'s `onLayerOrder`),
 * in the words the Diagram says them for a step (`stepCaptureActions.ts`).
 *
 * - Drawn, it says nothing: the figure shows the order, and when some
 *   constraints were left out the Properties pane's flag says so, with
 *   Review… (D10, D14).
 * - Kept (D10): the figure keeps its picture, flagged, and is told so once.
 * - Lost: nothing was checked or written; offline gets the connection's
 *   sentence, a crash a neutral one, since it may be a defect.
 *
 * Copy only: `t` with literal keys, so the extractor sees every string.
 */
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import type { FoldedFigureLayerOrderRefold } from './foldedFigureLayerOrderState';

/** Tell the user what a refold of figure `name` came to, when there is something to tell. */
export function sayFoldedFigureLayerOrderRefold(outcome: FoldedFigureLayerOrderRefold, name: string, t: TFunction): void {
  switch (outcome.kind) {
    case 'applied':
      return;
    case 'kept':
      toast.message(
        outcome.attention.count === 0
          ? t('toasts:layerOrder.refoldKeptChosenOrder', '{{name}}’s chosen layer order needs attention, so it keeps its picture.', {
              name,
            })
          : t('toasts:layerOrder.refoldKept', '{{name}}’s layer constraints need attention, so it keeps its picture.', {
              name,
            })
      );
      return;
    case 'lost':
      toast.error(
        outcome.cause === 'load'
          ? t(
              'toasts:layerOrder.refoldLostLoad',
              'Layer order couldn’t load, so {{name}} wasn’t refolded. Check your connection, then try again.',
              { name }
            )
          : t('toasts:layerOrder.refoldLost', 'Layer order stopped unexpectedly, so {{name}} wasn’t refolded.', { name })
      );
      return;
  }
}
