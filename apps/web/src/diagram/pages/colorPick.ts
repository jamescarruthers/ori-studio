/**
 * A colour while it is being picked in a swatch, outside the store
 * (`pathColorPick.ts` says why): published by the picker's moves, read by
 * what shows it live, and dropped after the store has been written
 * (`useSettledColorPick`), so no frame shows the colour from before the pick.
 */
export interface ColorPick {
  /** The colour the picker is at, or null when nothing is being picked. */
  live: () => string | null;
  /** Subscribe to the live colour changing or going away. For `useSyncExternalStore`. */
  subscribe: (listener: () => void) => () => void;
  /** Publish the colour a pick has reached. */
  publish: (color: string) => void;
  /** Drop the live colour — after the store has been written. A no-op, waking nothing, when there was none. */
  clear: () => void;
}

/** A colour pick of its own: one per swatch whose pick is written as it settles. */
export function createColorPick(): ColorPick {
  let live: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    live: () => live,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(color) {
      if (color === live) return;
      live = color;
      notify();
    },
    clear() {
      if (live === null) return;
      live = null;
      notify();
    },
  };
}
