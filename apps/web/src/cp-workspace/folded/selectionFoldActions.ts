import type { TFunction } from 'i18next';
import type { ControlVerb } from '../../lib/controlVerb';
import type { FoldRoute } from './foldRoute';

/**
 * The selection toolbar's fold verbs, as plain descriptors: Fold, and beside
 * it "Fold with layer order…" (`implementation-plans/layer-order-dialog.md`,
 * row H5, the approved Round 4 board). Only the selection toolbar offers the
 * second, never the viewport bar; a shortcut anyone can bind in Settings is
 * the other way in (`cp.action.fold-with-layer-order`).
 *
 * React-free and store-free: the toolbar binds `fold` and `foldWithLayerOrder`
 * and draws each verb by its `id`.
 */
export type SelectionFoldActionId = 'fold' | 'fold-with-layer-order';

export interface SelectionFoldCommand extends ControlVerb {
  id: SelectionFoldActionId;
}

export interface SelectionFoldActionDeps {
  t: TFunction;
  /** How the selection's creases fold (`resolveFoldRoute`). */
  route: FoldRoute['kind'];
  fold: () => void;
  foldWithLayerOrder: () => void;
}

export function selectionFoldActions(deps: SelectionFoldActionDeps): SelectionFoldCommand[] {
  const { t, route } = deps;
  // A layer order is a flat fold's (D2): creases that fold in 3D can't have one chosen yet.
  const spatial = route === 'spatial';
  return [
    {
      id: 'fold',
      label: t('panels:creasePattern.selectionToolbar.fold', 'Fold'),
      disabled: false,
      run: deps.fold,
    },
    {
      id: 'fold-with-layer-order',
      label: foldWithLayerOrderLabel(t),
      disabled: spatial,
      // A crease selection's words (the board's): "…flat figures" is a figure's.
      ...(spatial
        ? { hint: t('panels:creasePattern.selectionToolbar.foldWithLayerOrder3d', 'Layer order works on flat folds') }
        : {}),
      run: deps.foldWithLayerOrder,
    },
  ];
}

/** The verb's name, on the toolbar's button and in Settings ▸ Shortcuts alike. */
export function foldWithLayerOrderLabel(t: TFunction): string {
  return t('panels:creasePattern.selectionToolbar.foldWithLayerOrder', 'Fold with layer order…');
}
