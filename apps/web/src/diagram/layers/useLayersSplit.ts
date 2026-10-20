import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clampLayersListHeight } from './layersSplit';

/**
 * The Layers pane's separator, bound (`layersSplit.ts`): the list's height a
 * drag set, or null while it has not been dragged — as tall as its rows, up
 * to half the pane. A double click lets it go back to that.
 */
export function useLayersSplit() {
  const [height, setHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; y: number; height: number; room: number } | null>(null);

  return {
    containerRef,
    listRef,
    /** The list's height a drag left it; null for its own. */
    height,
    separator: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        const list = listRef.current;
        const container = containerRef.current;
        if (event.button !== 0 || !list || !container) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        // The room both regions share: the pane less everything that is neither of them.
        const inspector = container.clientHeight - list.offsetTop - list.offsetHeight - event.currentTarget.offsetHeight;
        drag.current = {
          pointerId: event.pointerId,
          y: event.clientY,
          height: list.offsetHeight,
          room: list.offsetHeight + Math.max(0, inspector),
        };
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        setHeight(clampLayersListHeight(current.height + event.clientY - current.y, current.room));
      },
      onPointerUp(event: ReactPointerEvent<HTMLElement>) {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      },
      onPointerCancel() {
        drag.current = null;
      },
      onDoubleClick() {
        setHeight(null);
      },
    },
  };
}
