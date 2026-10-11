import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../../lib/geometry';
import { COARSE_POINTER_QUERY } from '../../platform/pointerSurface';
import type { CpOverlayView } from '../CreasePatternWebglCanvas';
import type { UserBounds } from '../renderer/camera';
import type { ReglRendererOptions } from '../renderer/reglRenderer';
import {
  CP_LINE_HIT_MIN_CSS,
  CP_LINE_HIT_MIN_CSS_COARSE,
  CP_POINT_HIT_MIN_CSS,
  CP_POINT_HIT_MIN_CSS_COARSE,
} from '../snapRadius';
import type { CpSurface, CpSurfaceHitRadii, UseCpSurfaceOptions } from './useCpSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The renderer is stubbed whole: this file is about the surface's lifecycle,
 * camera and press, which `ReferencesCpView.test.tsx` covers only through what
 * one user draws. The stub keeps each construction's options so a test can
 * lose and restore the context it was built on.
 */
const regl = vi.hoisted(() => ({
  built: [] as ReglRendererOptions[],
  fail: null as Error | null,
  dispose: vi.fn(),
}));
vi.mock('../renderer/reglRenderer', () => ({
  createReglRenderer: (_canvas: HTMLCanvasElement, options: ReglRendererOptions = {}) => {
    if (regl.fail) throw regl.fail;
    regl.built.push(options);
    return new Proxy(
      {},
      { get: (_target, key) => (key === 'dispose' ? regl.dispose : () => undefined) }
    );
  },
}));
const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('../../monitoring', () => monitoring);

const { useCpSurface } = await import('./useCpSurface');

const VIEWPORT = { left: 0, top: 0, width: 400, height: 400 };
/** Model space is user space here, so a press lands where the camera says. */
const IDENTITY = (point: Point): Point => point;
const BOUNDS: UserBounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

/** What the harness last rendered, written from an effect rather than during render. */
const seen: { surface: CpSurface<number> | null } = { surface: null };

function Harness(props: Partial<UseCpSurfaceOptions<number>>) {
  const surface = useCpSurface<number>({
    modelToSvg: IDENTITY,
    contentBounds: BOUNDS,
    framingKey: 'doc-1',
    wheelGesture: 'zoom',
    // Tiny, so the pointer-precision floors decide the hit radii.
    snapRadius: 0.01,
    hitTest: () => null,
    sameHit: (a, b) => a === b,
    onPick: () => undefined,
    strokeWidths: ({ ratio }) => ({ strokeWidthPx: ratio }),
    errorSurface: 'test:webgl',
    ...props,
  });
  const { canvasRef } = surface;
  useEffect(() => {
    seen.surface = surface;
  });
  return <canvas ref={canvasRef} />;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function stubWebgl({ lost = false } = {}): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    getExtension: () => ({ loseContext: () => {} }),
    isContextLost: () => lost,
  } as unknown as RenderingContext);
}

function mount(props: Partial<UseCpSurfaceOptions<number>> = {}): HTMLCanvasElement {
  act(() => root?.render(<Harness {...props} />));
  const canvas = container?.querySelector('canvas') ?? null;
  if (!canvas) throw new Error('no canvas');
  return canvas;
}

function surface(): CpSurface<number> {
  if (!seen.surface) throw new Error('not mounted');
  return seen.surface;
}

function click(canvas: HTMLCanvasElement, clientX: number, clientY: number): void {
  const init = { pointerId: 1, pointerType: 'mouse', button: 0, clientX, clientY };
  act(() => {
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', init));
  });
}

beforeEach(() => {
  vi.stubGlobal('devicePixelRatio', 1);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    ...VIEWPORT,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    x: VIEWPORT.left,
    y: VIEWPORT.top,
    toJSON: () => ({}),
  } as DOMRect);
  // jsdom implements neither; the surface only needs them not to throw.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  seen.surface = null;
  regl.built.length = 0;
  regl.fail = null;
  regl.dispose.mockClear();
  monitoring.reportError.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCpSurface camera', () => {
  beforeEach(() => stubWebgl());

  it('fits on mount, keeps a zoom across re-renders, and refits on a new framing key', () => {
    const onZoomPercentChange = vi.fn<(percent: number) => void>();
    mount({ onZoomPercentChange });
    expect(onZoomPercentChange).toHaveBeenCalledTimes(1);
    const fit = onZoomPercentChange.mock.calls[0][0];

    act(() => surface().controls.zoomIn());
    const zoomed = onZoomPercentChange.mock.calls.at(-1)?.[0];
    expect(zoomed).toBe(Math.round((surface().cssPerUserUnit() ?? 0) * 100));
    expect(zoomed).toBeGreaterThan(fit);

    // The same document again — an edit, say — is not a reason to move.
    mount({ onZoomPercentChange });
    expect(onZoomPercentChange).toHaveBeenCalledTimes(2);

    mount({ onZoomPercentChange, framingKey: 'doc-2' });
    expect(onZoomPercentChange).toHaveBeenLastCalledWith(fit);
  });

  it('reports the view once per camera move, not once per redraw', () => {
    const onViewChange = vi.fn();
    mount({ onViewChange });
    expect(onViewChange).toHaveBeenCalledTimes(1);
    act(() => surface().render());
    expect(onViewChange).toHaveBeenCalledTimes(1);
    act(() => surface().controls.zoomOut());
    expect(onViewChange).toHaveBeenCalledTimes(2);
  });

  it('fits above an inset, follows it while the camera is the fit’s, and leaves a camera the user moved', () => {
    const onViewChange = vi.fn<(view: CpOverlayView) => void>();
    // A square sheet, so the height the inset takes is what the fit is limited by.
    const contentBounds: UserBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    // Where the content's middle (50, 50) lands on the 400 × 400 canvas, CSS px.
    const middle = () => {
      const view = onViewChange.mock.calls.at(-1)?.[0];
      if (!view) throw new Error('no view');
      return { x: view.origin[0] + 50 * view.ex[0], y: view.origin[1] + 50 * view.ey[1] };
    };
    const covered = { top: 0, right: 0, bottom: 200, left: 0 };
    mount({ onViewChange, contentBounds, inset: covered });
    // Fitted to the top 400 × 200 and centred on it, not on the canvas.
    expect(middle().x).toBeCloseTo(200);
    expect(middle().y).toBeCloseTo(100);
    expect(surface().cssPerUserUnit()).toBeCloseTo((200 / 100) * 0.7);

    // The window closes: the fit follows, to the whole canvas.
    mount({ onViewChange, contentBounds, inset: null });
    expect(middle().y).toBeCloseTo(200);
    expect(surface().cssPerUserUnit()).toBeCloseTo((400 / 100) * 0.7);

    // Once the user has zoomed, a window opening moves nothing.
    act(() => surface().controls.zoomIn());
    const zoomed = surface().cssPerUserUnit();
    mount({ onViewChange, contentBounds, inset: covered });
    expect(surface().cssPerUserUnit()).toBe(zoomed);
    expect(middle().y).toBeCloseTo(200);
    // Fit asks again, within the inset.
    act(() => surface().controls.fit());
    expect(middle().y).toBeCloseTo(100);
  });

  it('sets a zoom percentage about the centre', () => {
    const onZoomPercentChange = vi.fn<(percent: number) => void>();
    mount({ onZoomPercentChange });
    act(() => surface().controls.setZoomPercent(250));
    expect(onZoomPercentChange).toHaveBeenLastCalledWith(250);
    expect(surface().cssPerUserUnit()).toBeCloseTo(2.5, 6);
  });
});

describe('useCpSurface press', () => {
  beforeEach(() => stubWebgl());

  function radiiOfAClick(): { point: Point; radii: CpSurfaceHitRadii } {
    const hitTest = vi.fn<(point: Point, radii: CpSurfaceHitRadii) => number | null>(() => 7);
    const onPick = vi.fn<(hit: number | null) => void>();
    const canvas = mount({ hitTest, onPick });
    click(canvas, VIEWPORT.width / 2, VIEWPORT.height / 2);
    expect(onPick).toHaveBeenCalledWith(7);
    const [point, radii] = hitTest.mock.calls.at(-1) ?? [];
    if (!point || !radii) throw new Error('no hit test');
    return { point, radii };
  }

  it('asks the caller what a click took, at the model point under it', () => {
    const { point } = radiiOfAClick();
    // The fit camera centres the content.
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(50, 6);
  });

  it('widens the hit floors to a fingertip under a coarse pointer', () => {
    const fine = radiiOfAClick().radii;
    act(() => root?.unmount());
    root = container ? createRoot(container) : null;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === COARSE_POINTER_QUERY,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const coarse = radiiOfAClick().radii;
    expect(coarse.point / fine.point).toBeCloseTo(
      CP_POINT_HIT_MIN_CSS_COARSE / CP_POINT_HIT_MIN_CSS,
      6
    );
    expect(coarse.line / fine.line).toBeCloseTo(
      CP_LINE_HIT_MIN_CSS_COARSE / CP_LINE_HIT_MIN_CSS,
      6
    );
  });
});

describe('useCpSurface renderer lifecycle', () => {
  it('keeps the camera across a lost context and rebuilds the renderer on restore', () => {
    stubWebgl();
    mount();
    act(() => surface().controls.zoomIn());
    const zoomed = surface().cssPerUserUnit();

    act(() => regl.built[0].onContextLost?.());
    expect(surface().rendererStatus).toEqual({ kind: 'context-lost' });

    act(() => regl.built[0].onContextRestored?.());
    expect(regl.dispose).toHaveBeenCalledTimes(1);
    expect(regl.built).toHaveLength(2);
    expect(surface().rendererGeneration).toBe(1);
    expect(surface().rendererStatus).toBeNull();
    expect(surface().rendererRef.current).not.toBeNull();
    expect(surface().cssPerUserUnit()).toBe(zoomed);
  });

  it('reports a renderer that fails to start under the caller’s surface tag', () => {
    stubWebgl();
    const error = new Error('shader did not compile');
    regl.fail = error;
    mount();
    expect(monitoring.reportError).toHaveBeenCalledWith(error, {
      surface: 'test:webgl',
      tags: { webgl_gap: 'unclassified' },
    });
    expect(surface().rendererStatus).toEqual({
      kind: 'unsupported',
      detail: 'shader did not compile',
    });
  });

  it('waits out a context lost at start without reporting it', () => {
    stubWebgl({ lost: true });
    regl.fail = new Error('missing extension');
    const canvas = mount();
    expect(surface().rendererStatus).toEqual({ kind: 'context-lost' });
    expect(monitoring.reportError).not.toHaveBeenCalled();

    regl.fail = null;
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    });
    expect(regl.built).toHaveLength(1);
    expect(surface().rendererStatus).toBeNull();
  });
});
