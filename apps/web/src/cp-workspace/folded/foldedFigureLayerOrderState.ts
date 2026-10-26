/**
 * What an Edit folded figure's layer order allows at rest, read from saved
 * data only (`implementation-plans/layer-order-dialog.md`, row H3, approach
 * 5): whether "Layer order…" can open on it and why not, and whether a
 * chosen order holds it. Nothing here asks the engine or the kernel, so the
 * toolbar, the context menu and the Properties pane can ask it on every
 * render, selection and file open.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import { isFolded3dFigure } from './foldedFigureCapabilities';
import { foldedFigureHasLayerOrder } from './foldedFigureState';

/**
 * Why "Layer order…" cannot open on a figure, in the order they are asked:
 *
 * - `3d`: its creases fold in 3D (D13);
 * - `waiting`: a fold, a refold or a step is running, or the figure failed;
 *   disabled with no reason, as every other verb waits;
 * - `undetermined`: its fold found no layer order to choose from (D3);
 * - `newer`: its record is a newer build's, carried as it came (H1's lock);
 * - `no-source`: it has no live fold and no recorded source creases to fold
 *   again, as a figure saved before they were recorded;
 * - `stale`: its creases changed since it was folded. Held until H4 opens
 *   it on the current creases, with a notice that Apply also refolds (D12);
 *   a constrained figure's Refold is held meanwhile too, so H4 replaces both.
 */
export type FoldedFigureLayerOrderBlock = '3d' | 'waiting' | 'undetermined' | 'newer' | 'no-source' | 'stale';

/** Why "Layer order…" cannot open on `figure`, or null when it can. */
export function foldedFigureLayerOrderBlock(
  figure: OristudioCpFoldedFigureEntry,
  { stale }: { stale: boolean }
): FoldedFigureLayerOrderBlock | null {
  if (isFolded3dFigure(figure)) return '3d';
  if (figure.status !== 'ready') return 'waiting';
  const found = foldedFigureHasLayerOrder(figure);
  if (found === null) return 'waiting';
  if (!found) return 'undetermined';
  if (figure.layerOrder?.kind === 'newer') return 'newer';
  // A live fold is its own source (`folded_figure_source`); one reopened from a
  // file is folded again from the creases it was folded from.
  if (figure.handle === null && figure.sourceBounds == null) return 'no-source';
  if (stale) return 'stale';
  return null;
}

/**
 * How a chosen layer order holds a flat figure, read from the record it
 * carries: `record` when this build reads it, `newer` when a newer build's;
 * null for a figure Oriedita's search orders, as every figure did before the
 * dialog, and for a 3D one, whose record waits until it folds flat again
 * (D13).
 */
export function foldedFigureLayerOrderHold(figure: OristudioCpFoldedFigureEntry): 'record' | 'newer' | null {
  if (isFolded3dFigure(figure)) return null;
  return figure.layerOrder?.kind ?? null;
}

/** The record a figure carries, when this build reads it. */
export function foldedFigureLayerOrderRecord(figure: OristudioCpFoldedFigureEntry): LayerOrderRecord | null {
  return figure.layerOrder?.kind === 'record' ? figure.layerOrder.record : null;
}

/**
 * Whether a constrained figure's saved constraints clash, as its record says
 * since an edit (D10, `attention.reason === 'conflict'`): no order fits them
 * all, so there is no solution to step to until they are reviewed, and its
 * ‹ › wait. Read from saved data alone.
 */
export function foldedFigureSolutionsHeldByConflict(figure: OristudioCpFoldedFigureEntry): boolean {
  return foldedFigureLayerOrderRecord(figure)?.attention?.reason === 'conflict';
}

/**
 * Whether Refold is held on `figure` until a refold can keep a chosen layer
 * order (H4). A refold folds Oriedita's search again: it would draw the
 * searched order on a figure that still carries its record, and a reload would
 * then detach the record. The toolbar, the menu and the store all ask this.
 */
export function refoldHeldByLayerOrder(figure: OristudioCpFoldedFigureEntry): boolean {
  return figure.layerOrder != null;
}

/** Why, in the words the toolbar shows and a refused call reports. */
export function refoldHeldByLayerOrderReason(t: TFunction): string {
  return t('panels:foldedFigureActions.refoldLayerOrder', 'Refold can’t keep its layer order yet');
}
