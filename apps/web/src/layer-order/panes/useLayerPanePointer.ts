/**
 * A Layer order pane's pointer, as the inspector hears it
 * (`implementation-plans/layer-order-dialog.md`, row U8; D6): the surface's
 * hover and pick (`PaperPane`, `useCpSurface`) turned into the panes' events,
 * each saying which pane it came from and whether a pointer or a finger made
 * it, and a double tap turned into Fit.
 *
 * How a press came is read off the pane's own pointer events in the capture
 * phase, before the canvas under it handles them, so a pick knows its input
 * by the time the surface reports it. A tap's end that lands soon after and
 * near the last one's is a double tap (`isDoubleTap`): it fits, and the pick
 * its release would make is dropped; the first tap has already picked. A
 * press that moved is a pan, and is no tap.
 *
 * The hover is told only when the face under it changes, not the spot: on
 * the folded paper a face lies over many.
 *
 * No behaviour here depends on DOM focus: the events come from pointers on
 * the pane alone.
 */
import { useMemo, useRef, type PointerEvent } from 'react';
import { useEventCallback } from '../../hooks/useEventCallback';
import type { LayerFace } from '../engine/faceIndex';
import {
  DOUBLE_TAP_SLOP_PX,
  isDoubleTap,
  paneInputOf,
  type LayerPaneHit,
  type LayerPaneId,
  type LayerPaneInput,
  type LayerPanesEvents,
  type LayerPaneTap,
} from './layerPaneInput';

export interface LayerPanePointer {
  /** For the pane's box: how each press came, and its double taps. Stable. */
  readonly capture: {
    readonly onPointerDownCapture: (event: PointerEvent) => void;
    readonly onPointerMoveCapture: (event: PointerEvent) => void;
    readonly onPointerUpCapture: (event: PointerEvent) => void;
  };
  /** For the surface's `onPick`. Stable. */
  readonly onPick: (hit: LayerPaneHit | null) => void;
  /** For the surface's `onHover`. Stable. */
  readonly onHover: (hit: LayerPaneHit | null) => void;
}

export function useLayerPanePointer(
  pane: LayerPaneId,
  events: LayerPanesEvents,
  onDoubleTap: () => void
): LayerPanePointer {
  const input = useRef<LayerPaneInput>('pointer');
  const press = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef<LayerPaneTap | null>(null);
  const dropPick = useRef(false);
  const hovered = useRef<LayerFace | null>(null);

  const onPointerDownCapture = useEventCallback((event: PointerEvent) => {
    input.current = paneInputOf(event.pointerType);
    press.current = { x: event.clientX, y: event.clientY };
    dropPick.current = false;
  });
  const onPointerMoveCapture = useEventCallback((event: PointerEvent) => {
    input.current = paneInputOf(event.pointerType);
  });
  const onPointerUpCapture = useEventCallback((event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    const from = press.current;
    press.current = null;
    if (!from || Math.hypot(event.clientX - from.x, event.clientY - from.y) > DOUBLE_TAP_SLOP_PX) {
      lastTap.current = null;
      return;
    }
    const tap = { at: event.timeStamp, x: event.clientX, y: event.clientY };
    if (isDoubleTap(lastTap.current, tap)) {
      lastTap.current = null;
      dropPick.current = true;
      onDoubleTap();
    } else {
      lastTap.current = tap;
    }
  });

  const onPick = useEventCallback((hit: LayerPaneHit | null) => {
    if (dropPick.current) {
      dropPick.current = false;
      return;
    }
    if (hit) events.onFacePicked?.({ face: hit.face, origin: pane, input: input.current });
    else events.onEmptyPaper?.({ origin: pane, input: input.current });
  });

  const onHover = useEventCallback((hit: LayerPaneHit | null) => {
    const face = hit?.face ?? null;
    if (hovered.current === face) return;
    hovered.current = face;
    events.onFaceHovered?.({ face, origin: pane, input: input.current });
  });

  const capture = useMemo(
    () => ({ onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture }),
    [onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture]
  );
  return { capture, onPick, onHover };
}
