import { useEffect, useSyncExternalStore } from 'react';

/**
 * The page in the middle of the Pages view, by its index from 0: the page a
 * pane's "this page" means while the pages are on screen — the Page pane's
 * count for one page, Reset This Page (`useCurrentDiagramPage`). The Pages
 * view publishes it while it is mounted and laid out (`usePagesView`); a
 * dock pane reads it, as the Layers pane reads the printed frames
 * (`printedFrames.ts`). Null while no Pages view shows a page.
 */
let current: number | null = null;
const listeners = new Set<() => void>();

function publish(next: number | null): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => current;

/** Publish `index` as the page in view while the caller is mounted: the Pages view. Null while it shows none. */
export function usePublishPageInView(index: number | null): void {
  useEffect(() => publish(index), [index]);
  useEffect(() => () => publish(null), []);
}

/** The page in the middle of the Pages view, from 0; null while no Pages view shows a page. */
export function usePageInView(): number | null {
  return useSyncExternalStore(subscribe, read, read);
}
