import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Which view the Fold workspace shows (plan D14): the step on screen, folded
 * and as a crease pattern, or every step of the path as a card. The header's
 * tabs switch it; a double-click on a card goes back to the fold at that
 * step. A view choice, not the document's: neither history nor the file.
 */
export type FoldView = 'fold' | 'steps';

const views = createStore<{ view: FoldView }>(() => ({ view: 'fold' }));

export function useFoldView(): FoldView {
  return useStore(views, (state) => state.view);
}

export function foldView(): FoldView {
  return views.getState().view;
}

export function setFoldView(view: FoldView): void {
  if (views.getState().view !== view) views.setState({ view });
}
