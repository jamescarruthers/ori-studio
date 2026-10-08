import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Point } from '../../lib/geometry';
import type { WheelGesturePreference } from '../../lib/wheelGesture';
import { reportError } from '../../monitoring';
import { useIsCoarsePointerSurface } from '../../platform/pointerSurface';
import type { CpRendererStatus } from '../CpRendererUnavailable';
import type { CpOverlayView } from '../CreasePatternWebglCanvas';
import { cpDpr } from '../cpDpr';
import { cpSizingScales } from '../cpSizingScales';
import {
  cameraZoomForPercent,
  fitUserCamera,
  frameUserCameraOnBounds,
  modelViewFromCamera,
  unprojectDevicePoint,
  userCameraToView,
  zoomUserCameraAt,
  type UserBounds,
  type UserCamera,
} from '../renderer/camera';
import type { CpRenderer } from '../renderer/CpRenderer';
import { readCssVarColor } from '../renderer/cssColor';
import { createReglRenderer } from '../renderer/reglRenderer';
import type { ModelPoint, Rgba, Viewport } from '../renderer/types';
import {
  awaitContextRestore,
  classifyCpWebglFailure,
  cpWebglSupport,
  describeCpWebglGap,
} from '../renderer/webglSupport';
import {
  CP_LINE_HIT_MIN_CSS,
  CP_LINE_HIT_MIN_CSS_COARSE,
  CP_LINE_HIT_RATIO,
  CP_POINT_HIT_MIN_CSS,
  CP_POINT_HIT_MIN_CSS_COARSE,
  CP_POINT_HIT_RATIO,
  cpHitRadiusModel,
} from '../snapRadius';
import { bindCpSurfaceInput, cpCanvasViewport } from './cpSurfaceInput';

/**
 * A props-driven crease-pattern surface on the renderer seam: one canvas, an
 * owned camera, and the gestures that move it.
 *
 * Owns the glue every such surface would otherwise copy from the Edit canvas:
 * the renderer's lifecycle (the support probe, a context lost at start or
 * mid-session, the camera kept across the rebuild), the drawing buffer's size,
 * the camera's first fit and its refit on `framingKey`, pan / pinch / wheel, a
 * click told from a drag, the hover probe, and de-duplicated view and zoom
 * reports. It registers none of the Edit canvas's singletons and publishes into
 * no store.
 *
 * What it does not own is what the surface draws. The caller uploads its own
 * channels from effects keyed on {@link CpSurface.rendererGeneration}, reading
 * {@link CpSurface.rendererRef}, and answers {@link UseCpSurfaceOptions.hitTest}
 * for what a press would take. Which channel carries what — strokes, the folded
 * channel, overlays — is the caller's decision.
 *
 * Call it before the caller's upload effects: within one commit, its effects
 * then build the renderer and fit the camera before anything is uploaded to it.
 */

/** How far from a press a target still answers, model units, at the live zoom. */
export interface CpSurfaceHitRadii {
  /**
   * For a point target (a vertex): the tighter radius, so a line cannot shadow
   * its own endpoint — see `snapRadius.ts`.
   */
  point: number;
  /** For a line target (a crease). */
  line: number;
}

/** One frame's scales, for the pens the caller draws in. */
export interface CpSurfaceFrameScales {
  /** Device pixels per CSS pixel, under the shared cap (`cpDpr`). */
  ratio: number;
  /** The gentle line boost past the fit zoom (`cpSizingScales`). */
  widthBoost: number;
}

/** The stroke widths a frame draws at, device px (`CpRenderFrame`). */
export interface CpSurfaceStrokeWidths {
  strokeWidthPx: number;
  foldedStrokeWidthPx?: number;
}

export interface UseCpSurfaceOptions<Hit> {
  /** Model → SVG user space, the map the camera is built from; a change redraws. */
  modelToSvg: (point: Point) => Point;
  /** What the camera fits, in user space; null before there is anything to frame. */
  contentBounds: UserBounds | null;
  /** The camera refits when this changes (a new document), never on an edit. */
  framingKey: string;
  wheelGesture: WheelGesturePreference;
  /** The user's snap radius, model units; sets the hit radii at the live zoom. */
  snapRadius: number;
  /**
   * What a press at `point` (model space) would take, within `radii`. Asked on
   * release for a click, and once a frame under a passing pointer.
   */
  hitTest: (point: ModelPoint, radii: CpSurfaceHitRadii) => Hit | null;
  /** The same target as a frame ago, by identity rather than position. */
  sameHit: (a: Hit, b: Hit) => boolean;
  /** A click landed: what it hit, or null for bare paper. */
  onPick: (hit: Hit | null) => void;
  /** The widths this frame's strokes draw at. */
  strokeWidths: (scales: CpSurfaceFrameScales) => CpSurfaceStrokeWidths;
  /** Model space → CSS px of the canvas box, each frame it changes. */
  onViewChange?: (view: CpOverlayView) => void;
  /**
   * The zoom as a percentage, for the viewport toolbar's readout. 100% is
   * actual size — one user unit to one CSS pixel — the editor's definition, so
   * the readouts agree about the same pattern. Reported when it changes.
   */
  onZoomPercentChange?: (percent: number) => void;
  /** The `surface` a renderer that fails to start is reported under. */
  errorSurface: string;
}

/** The camera verbs a viewport toolbar or a shortcut drives. Stable for the surface's life. */
export interface CpSurfaceControls {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Zoom to a percentage, about the centre. */
  setZoomPercent: (percent: number) => void;
  /** Frame the whole content. */
  fit: () => void;
  /** Point the camera at user-space bounds without zooming out (a jump, not a fit). */
  frameUserBounds: (bounds: UserBounds) => void;
}

export interface CpSurface<Hit> {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The live renderer; null while none is up. */
  rendererRef: RefObject<CpRenderer | null>;
  /**
   * Bumped when a lost context comes back and the renderer is rebuilt. Every
   * upload effect depends on it, so it re-runs against the new renderer.
   */
  rendererGeneration: number;
  /** Why nothing is drawn, for `CpRendererUnavailable`; null while drawing. */
  rendererStatus: CpRendererStatus | null;
  /** What the pointer is over: on hover, or under a finger while it is still a tap. */
  hovered: Hit | null;
  /** A contact is down. */
  dragging: boolean;
  /** Draw a frame now. Stable; a no-op while no renderer is up. */
  render: () => void;
  /** CSS px per user unit at the live camera; null before the first frame. Stable. */
  cssPerUserUnit: () => number | null;
  controls: CpSurfaceControls;
}

const CANVAS_BG_VAR = '--bg-primary';
const FALLBACK_CLEAR: Rgba = [0.157, 0.172, 0.204, 1];
const POINT_OUTLINE_CSS = 1.4;
const ZOOM_STEP = 1.25;

/** The shared CP policy — see `cpDpr.ts`; the editor renders under the same cap. */
const dpr = cpDpr;

/** Everything the imperative handlers read, refreshed every render without re-binding them. */
interface LiveOptions<Hit> extends UseCpSurfaceOptions<Hit> {
  /** The hit floors, in CSS px: fingertip-sized under a coarse pointer. */
  pointFloorCss: number;
  lineFloorCss: number;
}

function sameView(a: CpOverlayView, b: CpOverlayView): boolean {
  return (
    a.origin[0] === b.origin[0] &&
    a.origin[1] === b.origin[1] &&
    a.ex[0] === b.ex[0] &&
    a.ex[1] === b.ex[1] &&
    a.ey[0] === b.ey[0] &&
    a.ey[1] === b.ey[1]
  );
}

export function useCpSurface<Hit>(options: UseCpSurfaceOptions<Hit>): CpSurface<Hit> {
  const { modelToSvg, framingKey } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CpRenderer | null>(null);
  const cameraRef = useRef<UserCamera | null>(null);
  const preservedCameraRef = useRef<UserCamera | null>(null);
  const fitRequestedRef = useRef(true);
  const renderNowRef = useRef<() => void>(() => undefined);
  const [rendererStatus, setRendererStatus] = useState<CpRendererStatus | null>(null);
  const [rendererGeneration, setRendererGeneration] = useState(0);
  // What the pointer is over, and whether it is dragging — what the cursor
  // and the hover mark need. Both are mirrored in refs the raw handlers read
  // and write, and only pushed into state when the answer changes, so a
  // pointermove along the same crease re-renders nothing (the Edit canvas's
  // `applyCreaseHover` shape, `CreasePatternWebglCanvas.tsx`).
  const [hovered, setHovered] = useState<Hit | null>(null);
  const [dragging, setDragging] = useState(false);
  const hoveredRef = useRef<Hit | null>(null);
  // A fingertip is not a cursor: the hit floors grow under a coarse pointer,
  // and the mark under the finger shows on touch-down rather than on hover.
  const coarse = useIsCoarsePointerSurface();
  const pointFloorCss = coarse ? CP_POINT_HIT_MIN_CSS_COARSE : CP_POINT_HIT_MIN_CSS;
  const lineFloorCss = coarse ? CP_LINE_HIT_MIN_CSS_COARSE : CP_LINE_HIT_MIN_CSS;

  const liveRef = useRef<LiveOptions<Hit>>({ ...options, pointFloorCss, lineFloorCss });
  const lastViewRef = useRef<CpOverlayView | null>(null);
  const lastZoomPercentRef = useRef<number | null>(null);
  // Declared before every effect below, and the caller's effects come after
  // this hook's, so within one commit the handlers and uploads read this
  // render's values.
  useEffect(() => {
    liveRef.current = { ...options, pointFloorCss, lineFloorCss };
  });

  // --- Renderer lifecycle, camera, input -------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const support = cpWebglSupport();
    if (!support.supported) {
      setRendererStatus({ kind: 'unsupported', detail: describeCpWebglGap(support.gap) });
      return;
    }

    let renderer: CpRenderer;
    try {
      renderer = createReglRenderer(canvas, {
        onContextLost: () => {
          preservedCameraRef.current = cameraRef.current;
          setRendererStatus({ kind: 'context-lost' });
        },
        onContextRestored: () => setRendererGeneration((generation) => generation + 1),
      });
    } catch (error) {
      const gap = classifyCpWebglFailure(canvas);
      // Already lost is a loss arriving early, not a gap — same handling as
      // `onContextLost`, and like it not reported. See the editor canvas.
      if (gap === 'context-lost-at-start') {
        preservedCameraRef.current = cameraRef.current;
        setRendererStatus({ kind: 'context-lost' });
        return awaitContextRestore(canvas, () =>
          setRendererGeneration((generation) => generation + 1)
        );
      }
      reportError(error, {
        surface: liveRef.current.errorSurface,
        tags: { webgl_gap: gap ?? 'unclassified' },
      });
      setRendererStatus({
        kind: 'unsupported',
        detail: gap
          ? describeCpWebglGap(gap)
          : error instanceof Error
            ? error.message
            : String(error),
      });
      return;
    }
    setRendererStatus(null);
    rendererRef.current = renderer;

    const ensureCamera = (viewport: Viewport): UserCamera | null => {
      if (preservedCameraRef.current) {
        cameraRef.current = preservedCameraRef.current;
        preservedCameraRef.current = null;
        fitRequestedRef.current = false;
        return cameraRef.current;
      }
      if (cameraRef.current && !fitRequestedRef.current) return cameraRef.current;
      const bounds = liveRef.current.contentBounds;
      if (!bounds) return cameraRef.current;
      fitRequestedRef.current = false;
      cameraRef.current = fitUserCamera(bounds, viewport);
      return cameraRef.current;
    };

    const reportView = (view: CpOverlayView) => {
      const seen = lastViewRef.current;
      if (seen !== null && sameView(seen, view)) return;
      lastViewRef.current = view;
      liveRef.current.onViewChange?.(view);
    };

    const reportZoom = (cam: UserCamera, ratio: number) => {
      const percent = Math.round((cam.zoom / ratio) * 100);
      if (percent === lastZoomPercentRef.current) return;
      lastZoomPercentRef.current = percent;
      liveRef.current.onZoomPercentChange?.(percent);
    };

    const renderNow = () => {
      const ratio = dpr();
      const viewport = cpCanvasViewport(canvas, ratio);
      if (viewport.width === 0 || viewport.height === 0) return;
      const cam = ensureCamera(viewport);
      if (!cam) return;
      const live = liveRef.current;
      const view = modelViewFromCamera(cam, viewport, live.modelToSvg);
      const userView = userCameraToView(cam, viewport);
      const bounds = live.contentBounds;
      const fitZoom = bounds ? fitUserCamera(bounds, viewport).zoom : cam.zoom;
      const { widthBoost, markerScalePx, pointScalePx } = cpSizingScales({
        camZoom: cam.zoom,
        fitZoom,
        ratio,
      });
      // A layer over this canvas draws through the same camera, in CSS
      // pixels rather than device ones.
      reportView({
        origin: [view.origin[0] / ratio, view.origin[1] / ratio],
        ex: [view.ex[0] / ratio, view.ex[1] / ratio],
        ey: [view.ey[0] / ratio, view.ey[1] / ratio],
      });
      reportZoom(cam, ratio);
      renderer.render({
        clearColor: readCssVarColor(canvas, CANVAS_BG_VAR, FALLBACK_CLEAR),
        view,
        userView,
        ...live.strokeWidths({ ratio, widthBoost }),
        userScalePx: cam.zoom,
        markerScalePx,
        pointScalePx,
        constantOutlinePx: POINT_OUTLINE_CSS * ratio,
        markerOutlinePx: POINT_OUTLINE_CSS * markerScalePx,
        // No crowded point layer to fade: a surface here marks the points it
        // means, on the overlay channel, rather than every vertex.
        pointOutlinePx: POINT_OUTLINE_CSS * pointScalePx,
        pointOpacity: 1,
      });
    };
    renderNowRef.current = renderNow;

    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = dpr();
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      renderer.resize({ width, height, dpr: ratio });
      renderNow();
    };
    // jsdom has no ResizeObserver; the size is then applied once.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applySize);
    observer?.observe(canvas);
    applySize();

    const hitAt = (clientX: number, clientY: number): Hit | null => {
      const cam = cameraRef.current;
      if (!cam) return null;
      const ratio = dpr();
      const rect = canvas.getBoundingClientRect();
      const live = liveRef.current;
      const view = modelViewFromCamera(cam, cpCanvasViewport(canvas, ratio), live.modelToSvg);
      const model = unprojectDevicePoint(
        view,
        (clientX - rect.left) * ratio,
        (clientY - rect.top) * ratio
      );
      if (!model) return null;
      // `cpHitRadiusModel` wants CSS px per user unit; the camera zoom is in
      // device px, hence the ratio.
      const zoom = cam.zoom / ratio;
      return live.hitTest(model, {
        point: cpHitRadiusModel(live.snapRadius, zoom, CP_POINT_HIT_RATIO, live.pointFloorCss),
        line: cpHitRadiusModel(live.snapRadius, zoom, CP_LINE_HIT_RATIO, live.lineFloorCss),
      });
    };

    const applyHover = (next: Hit | null) => {
      const prev = hoveredRef.current;
      const same =
        prev === null || next === null ? prev === next : liveRef.current.sameHit(prev, next);
      if (same) return;
      hoveredRef.current = next;
      setHovered(next);
    };

    const unbindInput = bindCpSurfaceInput(canvas, {
      camera: () => cameraRef.current,
      render: renderNow,
      wheelGesture: () => liveRef.current.wheelGesture,
      hitAt,
      hover: applyHover,
      setDragging,
      pick: (hit) => liveRef.current.onPick(hit),
    });

    return () => {
      observer?.disconnect();
      unbindInput();
      renderNowRef.current = () => undefined;
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [rendererGeneration]);

  // --- Framing ---------------------------------------------------------------
  useEffect(() => {
    fitRequestedRef.current = true;
    renderNowRef.current();
  }, [framingKey]);

  // A new map, not a new camera: the content moves in place (a reflection,
  // say) rather than refitting.
  useEffect(() => {
    renderNowRef.current();
  }, [modelToSvg]);

  const render = useCallback(() => renderNowRef.current(), []);
  const cssPerUserUnit = useCallback(() => {
    const cam = cameraRef.current;
    return cam ? cam.zoom / dpr() : null;
  }, []);

  const controls = useMemo<CpSurfaceControls>(() => {
    const viewport = (): Viewport | null => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
      return cpCanvasViewport(canvas, dpr());
    };
    const zoomBy = (factor: number) => {
      const cam = cameraRef.current;
      const vp = viewport();
      if (!cam || !vp) return;
      zoomUserCameraAt(cam, vp, vp.width / 2, vp.height / 2, factor);
      renderNowRef.current();
    };
    return {
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      setZoomPercent: (percent) => {
        const cam = cameraRef.current;
        const vp = viewport();
        if (!cam || !vp) return;
        // The inverse of the zoom report: 100% is one user unit per CSS pixel.
        cam.zoom = cameraZoomForPercent(percent, vp.dpr);
        renderNowRef.current();
      },
      fit: () => {
        fitRequestedRef.current = true;
        renderNowRef.current();
      },
      frameUserBounds: (bounds) => {
        const cam = cameraRef.current;
        const vp = viewport();
        if (!cam || !vp) return;
        cameraRef.current = frameUserCameraOnBounds(
          bounds,
          vp,
          cam,
          liveRef.current.contentBounds
        );
        renderNowRef.current();
      },
    };
  }, []);

  return {
    canvasRef,
    rendererRef,
    rendererGeneration,
    rendererStatus,
    hovered,
    dragging,
    render,
    cssPerUserUnit,
    controls,
  };
}
