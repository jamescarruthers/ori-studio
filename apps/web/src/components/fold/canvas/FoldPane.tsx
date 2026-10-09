import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CpRendererUnavailable } from '../../../cp-workspace/CpRendererUnavailable';
import type { CpOverlayView } from '../../../cp-workspace/CreasePatternWebglCanvas';
import { cpCanvasCursor } from '../../../cp-workspace/cpCanvasCursor';
import {
  paperSceneToFoldedGeometry,
  type FoldedSceneInk,
} from '../../../cp-workspace/adapters/cpFoldedToScene';
import type { UserBounds } from '../../../cp-workspace/renderer/camera';
import type { FillGeometry, FoldedGeometry } from '../../../cp-workspace/renderer/types';
import { useCpSurface, type CpSurfaceControls } from '../../../cp-workspace/surface/useCpSurface';
import type { PaperScene } from '../../../lib/paper/paperScene';
import type { PaperStyle } from '../../../lib/paper/paperStyle';
import { ptToDevicePx } from '../../../lib/paper/paperStyle';
import type { WheelGesturePreference } from '../../../lib/wheelGesture';
import { FOLD_UNITS_PER_CP_UNIT, foldUnitToUser } from '../../../fold/canvas/foldCanvasGeometry';
import type { FoldPaneOverlay } from '../../../fold/canvas/foldPaneOverlays';
import { sameFoldHit, type FoldHit, type FoldHitRadii, type FoldPaneId } from '../../../fold/canvas/foldPicking';
import type { FoldPosedSceneSource } from '../../../fold/animation/foldStepPlayback';
import type { Point } from '../../../lib/geometry';
import styles from './FoldCanvas.module.css';

const NOT_POSED: FoldPosedSceneSource = { current: () => null, subscribe: () => () => {} };

const EMPTY_FOLDED: FoldedGeometry = {
  fills: { position: new Float32Array(0), color: new Float32Array(0), count: 0 },
  strokes: { a: new Float32Array(0), b: new Float32Array(0), color: new Float32Array(0), widthMul: new Float32Array(0), count: 0 },
};

/** The crease width the preview channel's strokes are measured from, CSS px: the edge pen's at the default style. */
const OVERLAY_STROKE_CSS = 1.2;

export interface FoldPaneProps {
  pane: FoldPaneId;
  /** What the pane paints, through the shared painter; null before the state's scene is in. */
  scene: PaperScene | null;
  /** The user's paper style: every pen and colour the painter reads. */
  style: PaperStyle;
  /** The surface the style is read through, and the per-face overrides (a refusal's faces). */
  ink: FoldedSceneInk;
  /** A tint over the paper, in the pane's frame: the moving set of a located fold. */
  tint?: FillGeometry | null;
  /**
   * Where the pane's frame is shown: the folded pane's display offset
   * (`foldedDisplayOffset`), so the model turns about the sheet's middle.
   * The pane's frame stays what it is for everything it is handed.
   */
  offset?: Point;
  /** What the camera fits, in user space. */
  contentBounds: UserBounds | null;
  /** The camera refits when this changes: a new sequence or a new sheet, never a fold. */
  framingKey: string;
  wheelGesture: WheelGesturePreference;
  /** The user's snap radius, in Edit's model units. */
  snapRadius: number;
  /** What a click at a point of the pane's frame would take, within the radii there. */
  hitTest: (at: Point, radii: FoldHitRadii) => FoldHit | null;
  onPick: (hit: FoldHit | null) => void;
  /** The tool's feedback over the paper, from what is under the pointer. */
  overlay: (hovered: FoldHit | null) => FoldPaneOverlay;
  /** Theme colours are DOM-resolved; they are read again when this changes. */
  inkKey: string;
  onZoomPercentChange?: (percent: number) => void;
  /** Called when a press on the pane begins: the pane the keyboard's zoom now means. */
  onActivate?: () => void;
  /** The pane's status chip, in its top-left corner. */
  status: ReactNode;
  /** Layers drawn over the canvas through its camera: the fold's arrow, the root chooser. */
  layers?: (view: CpOverlayView) => ReactNode;
  /**
   * A step playing (`useFoldStepPlayback`'s frames): while it has a frame, the
   * pane paints that in place of `scene`, uploaded as each is pushed with no
   * render of its own, and puts down the tool's feedback, the tint, the
   * layers and the hover, which belong to the state at rest.
   */
  posedScene?: FoldPosedSceneSource;
  ariaLabel: string;
}

/**
 * One pane of the Fold canvas (plan D13): a WebGL canvas on `useCpSurface`
 * — the renderer's lifecycle, the camera, pan, pinch and wheel, a click told
 * from a drag, the hover probe — painting a paper scene through the shared
 * painter on the folded channel (D11), with the tool's feedback on the
 * overlay channels and its status chip in the corner.
 *
 * Both panes are this component: the folded form's and the crease
 * pattern's differ in what they are handed, never in how they draw. It
 * publishes into no store and registers no singleton; the canvas that mounts
 * it holds the camera verbs through the handle.
 */
export const FoldPane = forwardRef<CpSurfaceControls, FoldPaneProps>(function FoldPane(props, ref) {
  const {
    pane,
    scene,
    style,
    ink,
    tint = null,
    offset,
    contentBounds,
    framingKey,
    wheelGesture,
    snapRadius,
    hitTest,
    onPick,
    overlay,
    inkKey,
    onZoomPercentChange,
    onActivate,
    status,
    layers,
    posedScene = NOT_POSED,
    ariaLabel,
  } = props;
  const [view, setView] = useState<CpOverlayView | null>(null);
  // Re-rendered only as a play starts and ends: the frames between go straight to the renderer.
  const posing = useSyncExternalStore(posedScene.subscribe, () => posedScene.current() !== null);
  const posingRef = useRef(posing);
  useEffect(() => {
    posingRef.current = posing;
  }, [posing]);
  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;
  const modelToSvg = useMemo(
    () => (dx === 0 && dy === 0 ? foldUnitToUser : (point: Point) => foldUnitToUser({ x: point.x + dx, y: point.y + dy })),
    [dx, dy]
  );

  const { canvasRef, rendererRef, rendererGeneration, rendererStatus, hovered, dragging, render, controls } =
    useCpSurface<FoldHit>({
      modelToSvg,
      contentBounds,
      framingKey,
      wheelGesture,
      snapRadius,
      // The surface measures radii in Edit's units; the same share of a Fold sheet.
      // Nothing is picked off a frame in motion: the state at rest is what a tool locates on.
      hitTest: (point, radii) =>
        posingRef.current
          ? null
          : hitTest(point, { point: radii.point * FOLD_UNITS_PER_CP_UNIT, line: radii.line * FOLD_UNITS_PER_CP_UNIT }),
      sameHit: sameFoldHit,
      onPick,
      strokeWidths: ({ ratio, widthBoost }) => ({
        strokeWidthPx: OVERLAY_STROKE_CSS * ratio * widthBoost,
        // A stroke multiplier on the folded channel is pt: device px per pt
        // is the unit, as Edit's canvas draws its figures.
        foldedStrokeWidthPx: ptToDevicePx(1, ratio),
      }),
      onViewChange: setView,
      onZoomPercentChange,
      errorSurface: `fold:${pane}-webgl`,
    });

  useImperativeHandle(ref, () => controls, [controls]);

  // The paper: the scene through the painter, in the user's style — or, while
  // a step plays, each frame it pushes, with the frame's own face fills.
  const geometry = useMemo(() => (scene ? paperSceneToFoldedGeometry(scene, style, ink) : EMPTY_FOLDED), [scene, style, ink]);
  const policy = ink.policy;
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return undefined;
    const paint = () => {
      const frame = posedScene.current();
      renderer.setFolded(frame ? paperSceneToFoldedGeometry(frame.scene, style, { policy, faces: frame.faces }) : geometry);
      render();
    };
    paint();
    return posedScene.subscribe(paint);
  }, [geometry, posedScene, style, policy, rendererGeneration, rendererRef, render]);

  // The moving set over the paper: the overlay fill channel draws above the
  // folded channel, in the pane's frame.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setDiagnosticFills(posing ? null : tint);
    render();
  }, [tint, posing, rendererGeneration, rendererRef, render]);

  // The tool's feedback, which follows the pointer.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const { points, strokes } = posing ? { points: null, strokes: null } : overlay(hovered);
    renderer.setOverlayPoints(points);
    renderer.setPreview(strokes);
    render();
  }, [overlay, hovered, posing, inkKey, rendererGeneration, rendererRef, render]);

  const cursor = cpCanvasCursor({
    panToolActive: false,
    panModifierHeld: false,
    panDragging: dragging,
    creaseHovered: hovered?.pick != null,
  });

  return (
    <div
      className={styles.pane}
      data-fold-pane={pane}
      // The pane takes the focus a press would otherwise leave on a rail
      // button, so Enter commits rather than pressing that button again.
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        onActivate?.();
        if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
      }}
    >
      <canvas
        ref={canvasRef}
        className={styles.surface}
        role="img"
        aria-label={ariaLabel}
        data-testid={`fold-${pane}-canvas`}
        style={cursor ? { cursor } : undefined}
      />
      {view && !posing && layers?.(view)}
      {status}
      {rendererStatus && <CpRendererUnavailable status={rendererStatus} />}
    </div>
  );
});
