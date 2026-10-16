import { useEffect, useSyncExternalStore } from 'react';

/**
 * Where the Pages view stands, by page index from 0: what a pane's "this
 * page" is read from while the pages are on screen — the Page pane's count
 * for one page, Reset This Page (`useCurrentDiagramPage`). The Pages view
 * publishes it while it is mounted and laid out (`usePagesView`); a dock pane
 * reads it, as the Layers pane reads the printed frames (`printedFrames.ts`).
 * Null while no Pages view shows a page.
 */
export interface PagesInView {
  /** The page under the middle of the view. */
  middle: number;
  /** The first and the last page any part of which is on screen. */
  first: number;
  last: number;
  /**
   * The page last pressed — its paper, or a step or turn on it — while it is
   * on screen and the selection is still what that press left; else null.
   */
  pressed: number | null;
}

let current: PagesInView | null = null;
const listeners = new Set<() => void>();

const same = (a: PagesInView | null, b: PagesInView | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.middle === b.middle &&
    a.first === b.first &&
    a.last === b.last &&
    a.pressed === b.pressed);

function publish(next: PagesInView | null): void {
  if (same(next, current)) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => current;

/** Publish where the Pages view stands while the caller is mounted: the Pages view. Null while it shows no page. */
export function usePublishPageInView(view: PagesInView | null): void {
  useEffect(() => publish(view), [view]);
  useEffect(() => () => publish(null), []);
}

/** Where the Pages view stands; null while no Pages view shows a page. */
export function usePageInView(): PagesInView | null {
  return useSyncExternalStore(subscribe, read, read);
}
