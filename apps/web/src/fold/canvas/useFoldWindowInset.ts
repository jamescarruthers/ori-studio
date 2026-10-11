import { useLayoutEffect, useMemo, useState } from 'react';
import type { CpSurfaceInset } from '../../cp-workspace/surface/useCpSurface';

/** The part of a `DOMRect` the inset reads. */
export interface FoldInsetRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * How far up from the pane's bottom edge a window over it reaches, CSS px:
 * from its top edge down, within the pane. Nothing for a window beside the
 * pane rather than over it, or one with no box (not laid out yet).
 */
export function coveredFromBottom(pane: FoldInsetRect, cover: FoldInsetRect): number {
  const overlaps = cover.right > pane.left && cover.left < pane.right && cover.bottom > pane.top;
  if (!overlaps || cover.bottom <= cover.top) return 0;
  return Math.max(0, Math.min(pane.bottom - pane.top, pane.bottom - cover.top));
}

/**
 * The inset a phone's Fold pane fits its paper within (`useCpSurface`'s
 * `inset`): the bottom of the viewport the tool window covers, its bar
 * included, so the paper stays in view above the window rather than centred
 * under it. Followed as the window opens, closes and animates between, and as
 * the viewport changes size; null off a phone, where the window sits over the
 * corner of the crease pattern and the paper keeps the whole pane.
 *
 * Whole px, so a sub-pixel reflow is not a new inset to fit to.
 */
export function useFoldWindowInset(
  viewport: HTMLElement | null,
  frame: HTMLElement | null,
  enabled: boolean
): CpSurfaceInset | null {
  const [bottom, setBottom] = useState(0);

  useLayoutEffect(() => {
    if (!enabled || !viewport || !frame) {
      setBottom(0);
      return undefined;
    }
    const measure = () => setBottom(Math.round(coveredFromBottom(viewport.getBoundingClientRect(), frame.getBoundingClientRect())));
    measure();
    // jsdom has no ResizeObserver; the inset is then measured once.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    // The window's height moves as it opens and closes; its top is what the paper keeps above.
    observer?.observe(frame);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [viewport, frame, enabled]);

  return useMemo(() => (bottom > 0 ? { top: 0, right: 0, bottom, left: 0 } : null), [bottom]);
}
