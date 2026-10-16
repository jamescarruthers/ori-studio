import { useCallback, useSyncExternalStore } from 'react';
import { trackDiagramPageSetupChanged } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DEFAULT_PATH_COLOR } from '../document/diagramDocument';
import { livePathColor, pathColorPick, subscribePathColorPick } from './pathColorPick';
import { COLOR_PICK_SETTLE_MS, useSettledColorPick } from './useSettledColorPick';

/** How long a pick of the path's colour must go quiet before it is written (`COLOR_PICK_SETTLE_MS`). */
export const PATH_COLOR_SETTLE_MS = COLOR_PICK_SETTLE_MS;

/** The flow path's colour being picked, or null while none is (`pathColorPick.ts`). */
export function useLivePathColor(): string | null {
  return useSyncExternalStore(subscribePathColorPick, livePathColor, livePathColor);
}

/** Write a pick of the path's colour to the page setup, in its undo session. */
const writePathColor = (color: string, session: number) => useWorkspaceStore.getState().setDiagramPage({ pathColor: color }, { session });
const countPathColor = () => trackDiagramPageSetupChanged('path_color');

/**
 * The Page pane's Path color row, bound: the colour shows as it is picked —
 * in the swatch, and in the Pages view's band, which is all that repaints —
 * and is written to the page setup as the pick settles, one undo step and one
 * count of `path_color` for the whole pick (`useSettledColorPick`). The reset
 * is one of each too.
 */
export function usePathColorPick() {
  const committed = useWorkspaceStore((state) => state.diagram?.page.pathColor ?? DEFAULT_PATH_COLOR);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const { live, onPick, onPickEnd } = useSettledColorPick({ pick: pathColorPick, write: writePathColor, count: countPathColor });

  const onReset = useCallback(() => {
    if (useWorkspaceStore.getState().setDiagramPage({ pathColor: DEFAULT_PATH_COLOR })) {
      trackDiagramPageSetupChanged('path_color');
    }
  }, []);

  return {
    value: live ?? committed,
    readOnly,
    onPick,
    onPickEnd,
    onReset: committed !== DEFAULT_PATH_COLOR ? onReset : undefined,
  };
}
