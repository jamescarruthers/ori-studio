import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { ColorPick } from './colorPick';

/**
 * How long a pick must go quiet before its colour is written to the document.
 *
 * A picker's closing is not an event to rely on — Chrome keeps the swatch
 * focused after its popup closes, and WebKit reports `change` on every move —
 * so, as a wheel's zoom on a folded figure ends when the wheel goes quiet
 * (`FOLDED_3D_ZOOM_SETTLE_MS`), a pause writes what has been picked so far.
 * Letting go of focus, or the row going away, writes it at once. A pick that
 * goes on after a pause is still the same undo step.
 */
export const COLOR_PICK_SETTLE_MS = 220;

/**
 * Picks, numbered: each one undo step however often it settles. Negative, so
 * that one never meets a text field's session (`usePendingText` numbers those
 * from 1), as `DiagramColorSelect`'s picks do.
 */
let picks = 0;

interface Pick {
  /** The undo session every write of this pick extends. */
  session: number;
  /** The diagram it was picked for: one opened meanwhile takes none of it. */
  loadId: number;
  counted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * A Page pane colour swatch, bound (the path's, the title block's band): the
 * colour shows as it is picked, from `pick` — in the swatch, and in whatever
 * else reads it live — and is written to the diagram as the pick settles
 * ({@link COLOR_PICK_SETTLE_MS}), by `write` with the pick's undo session, so
 * the whole pick is one undo step; `count` counts it once, at its first
 * write. A read-only diagram takes no pick, and a diagram opened meanwhile
 * none of one.
 */
export function useSettledColorPick({
  pick,
  write,
  count,
}: {
  pick: ColorPick;
  /** Write `color` to the diagram in undo session `session`: false where nothing was written. */
  write: (color: string, session: number) => boolean;
  count: () => void;
}) {
  const live = useSyncExternalStore(pick.subscribe, pick.live, pick.live);
  const current = useRef<Pick | null>(null);
  const latest = useRef({ write, count });
  useEffect(() => {
    latest.current = { write, count };
  });

  /** Write what has been picked so far, then drop the live colour. */
  const settle = useCallback(() => {
    const now = current.current;
    if (!now) return;
    if (now.timer !== null) clearTimeout(now.timer);
    now.timer = null;
    const color = pick.live();
    if (color === null) return;
    if (useWorkspaceStore.getState().diagramLoadId === now.loadId && latest.current.write(color, now.session) && !now.counted) {
      now.counted = true;
      latest.current.count();
    }
    // After the store, so no frame shows the colour from before the pick.
    pick.clear();
  }, [pick]);

  const onPick = useCallback(
    (color: string) => {
      const store = useWorkspaceStore.getState();
      if (store.diagramReadOnly) return;
      current.current ??= { session: (picks -= 1), loadId: store.diagramLoadId, counted: false, timer: null };
      pick.publish(color);
      if (current.current.timer !== null) clearTimeout(current.current.timer);
      current.current.timer = setTimeout(settle, COLOR_PICK_SETTLE_MS);
    },
    [pick, settle]
  );

  /** The picker let go of focus: what it picked is written now, and the next move is a new pick. */
  const onPickEnd = useCallback(() => {
    settle();
    current.current = null;
  }, [settle]);

  // A pick still under way when the row goes — the pane closed, the row hidden — is written as it goes.
  useEffect(() => onPickEnd, [onPickEnd]);

  return { live, onPick, onPickEnd };
}
