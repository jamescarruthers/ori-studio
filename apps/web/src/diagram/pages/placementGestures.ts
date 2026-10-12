import type { DiagramShortcutId } from '../../keyboard/shortcuts';

/**
 * The Pages view's placement transaction (`usePagePlacement`), as what is
 * outside React reaches it: the Diagram's keys, Escape, and the diagram
 * slice. Store-free, as `lib/pendingEdits.ts` is: the hook registers here and
 * the slice calls {@link flushPlacementNudge}, so the dependency runs one way.
 */
interface PlacementKeys {
  /** A key of the Diagram's: whether the transaction took it. */
  run: (id: DiagramShortcutId) => boolean;
  /** Escape: drop the preview in hand; whether there was one. */
  drop: () => boolean;
  /** Commit a keyboard nudge still in its pause. */
  flush: () => void;
}

let keys: PlacementKeys | null = null;
let flushing = false;

export function registerPlacementKeys(registered: PlacementKeys): () => void {
  keys = registered;
  return () => {
    if (keys === registered) keys = null;
  };
}

export const runPlacementKey = (id: DiagramShortcutId) => keys?.run(id) ?? false;
export const cancelPlacementGesture = () => keys?.drop() ?? false;

/**
 * Commit a keyboard nudge still in its pause, now: before any other edit, an
 * undo or a redo lands on the diagram, so the history holds the nudge the
 * screen showed, and holds it first. The nudge's own commit, which comes back
 * through the slice, does nothing.
 */
export function flushPlacementNudge(): void {
  if (flushing || !keys) return;
  flushing = true;
  try {
    keys.flush();
  } finally {
    flushing = false;
  }
}
