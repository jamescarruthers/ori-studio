import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ANALYTICS_EVENTS, track } from '../../analytics';

/**
 * Which view the Fold workspace shows (plan D14): the step on screen, folded
 * and as a crease pattern, or every step of the path as a card. The header's
 * tabs switch it; a double-click on a card goes back to the fold at that
 * step. A view choice, not the document's: neither history nor the file.
 * Every switch is counted (`fold view switched`), as the Diagram's are.
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
  if (views.getState().view === view) return;
  views.setState({ view });
  track(ANALYTICS_EVENTS.foldViewSwitched, { view });
}
