import { useSyncExternalStore } from 'react';
import type { FoldPaneId } from './foldPicking';

/**
 * Which of the Fold canvas's two panes a phone shows (plan D14): one at a
 * time, swapped by the `PaneToggle` in Fold's header. The header and the
 * canvas are siblings in the panel, so the choice is held here rather than in
 * either; it is the view's, never the document's, and a reload starts on the
 * folded form, where folding happens.
 */
let shown: FoldPaneId = 'folded';
const listeners = new Set<() => void>();

export function foldPhonePane(): FoldPaneId {
  return shown;
}

export function showFoldPhonePane(pane: FoldPaneId): void {
  if (shown === pane) return;
  shown = pane;
  for (const listener of listeners) listener();
}

/** Show the folded form: where a step plays, the one pane its frames are drawn on. */
export function revealFoldedPane(): void {
  showFoldPhonePane('folded');
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The pane a phone shows, reactively. */
export function useFoldPhonePane(): FoldPaneId {
  return useSyncExternalStore(subscribe, foldPhonePane, () => 'folded');
}
