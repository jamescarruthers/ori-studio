/**
 * A development build's handle on the Layer order dialog's panes, for the
 * browser check (`scripts/layer-order-dialog-check.mjs`): until the
 * inspector drives the panes' marks from its model (U10), the check hands
 * them marks of its own, by role, to photograph each state the boards show.
 *
 * `window.__layerOrderPanes` holds the session's open (its scenes, letters
 * and facts, so the check can name faces by letter and find open pairs), and
 * `show(marks, stacks)` / `clear()`. A production build has none of it:
 * `import.meta.env.DEV` is false there, and the hook answers null.
 */
import { useEffect, useState } from 'react';
import type { LayerFaceMarks, LayerPanesStacks } from '../panes/layerPaneMarks';
import type { LayerOrderSessionOpen } from './layerOrderSession';
import type { LayerOrderSessionStatus } from './useLayerOrderSession';

/** What the check shows on the panes. */
export interface LayerOrderPanesCheck {
  readonly marks?: LayerFaceMarks;
  readonly stacks?: LayerPanesStacks | null;
}

export interface LayerOrderPanesCheckHandle {
  /** The session's open, once it is ready. */
  readonly open: LayerOrderSessionOpen | null;
  show(check: LayerOrderPanesCheck): void;
  clear(): void;
}

declare global {
  interface Window {
    __layerOrderPanes?: LayerOrderPanesCheckHandle;
  }
}

export function useLayerOrderPanesCheck(status: LayerOrderSessionStatus): LayerOrderPanesCheck | null {
  const [check, setCheck] = useState<LayerOrderPanesCheck | null>(null);
  const open = status.kind === 'ready' ? status.open : null;
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const handle: LayerOrderPanesCheckHandle = { open, show: setCheck, clear: () => setCheck(null) };
    window.__layerOrderPanes = handle;
    return () => {
      if (window.__layerOrderPanes === handle) delete window.__layerOrderPanes;
    };
  }, [open]);
  return import.meta.env.DEV ? check : null;
}
