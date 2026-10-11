import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { CpSurfaceInset } from '../../cp-workspace/surface/useCpSurface';
import { coveredFromBottom, useFoldWindowInset } from './useFoldWindowInset';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A 375 × 812 phone's Fold viewport, under the strip and over the tab bar. */
const PANE = { left: 0, right: 375, top: 230, bottom: 740 };

describe('coveredFromBottom', () => {
  it('is how far up the pane the window reaches, its top to the pane’s bottom', () => {
    // The capped window, open: 292 px tall, 12 px above the pane's bottom.
    expect(coveredFromBottom(PANE, { left: 79, right: 367, top: 436, bottom: 728 })).toBe(304);
  });

  it('is nothing for a window beside the pane, and the whole pane for one taller than it', () => {
    expect(coveredFromBottom(PANE, { left: 400, right: 688, top: 436, bottom: 728 })).toBe(0);
    expect(coveredFromBottom(PANE, { left: 79, right: 367, top: 0, bottom: 728 })).toBe(510);
    // Not laid out yet: no box.
    expect(coveredFromBottom(PANE, { left: 0, right: 0, top: 0, bottom: 0 })).toBe(0);
  });
});

describe('useFoldWindowInset', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const boxed = (rect: { left: number; right: number; top: number; bottom: number }): HTMLElement => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () =>
      ({ ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }) as DOMRect;
    return element;
  };

  function measure(viewport: HTMLElement | null, frame: HTMLElement | null, enabled: boolean): CpSurfaceInset | null {
    const seen: { inset: CpSurfaceInset | null } = { inset: null };
    function Probe() {
      seen.inset = useFoldWindowInset(viewport, frame, enabled);
      return null;
    }
    host ??= document.createElement('div');
    root ??= createRoot(host);
    act(() => root?.render(<Probe />));
    return seen.inset;
  }

  it('insets a phone’s pane by the bottom the window covers, in whole px', () => {
    const viewport = boxed(PANE);
    const frame = boxed({ left: 79, right: 367, top: 436.4, bottom: 728 });
    expect(measure(viewport, frame, true)).toEqual({ top: 0, right: 0, bottom: 304, left: 0 });
  });

  it('is none off a phone, and none without a window', () => {
    const viewport = boxed(PANE);
    expect(measure(viewport, boxed({ left: 79, right: 367, top: 436, bottom: 728 }), false)).toBeNull();
    expect(measure(viewport, null, true)).toBeNull();
  });
});
