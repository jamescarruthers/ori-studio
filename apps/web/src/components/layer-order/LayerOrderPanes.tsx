import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CpSurfaceControls } from '../../cp-workspace/surface/useCpSurface';
import { LAYER_PANE_FLASH_MS, type LayerPaneId } from '../../layer-order/panes/layerPaneInput';
import { NO_FACE_MARKS } from '../../layer-order/panes/layerPaneMarks';
import {
  layerOrderOpeningView,
  useLayerFoldedPane,
  useLayerPaneInks,
  useLayerPatternPane,
} from '../../layer-order/panes/useLayerOrderPanes';
import { useSettingsStore } from '../../store/settingsStore';
import { useThemeStore } from '../../store/themeStore';
import { PictureLoading } from '../ui/PictureLoading';
import type { LayerOrderPanesProps } from './LayerOrderDialogFrame';
import { LayerOrderPane } from './LayerOrderPane';
import { LayerOrderPaneToolbar } from './LayerOrderPaneToolbar';
import styles from './LayerOrderPanes.module.css';

/**
 * The Layer order dialog's two panes (`implementation-plans/layer-order-dialog.md`,
 * row U8; A3 in `Round3`, the states in `Round4-States`, the phone in
 * `Round4-Phone`, the marks in `Round4-Horizon` and `Round5-Compound`): the
 * crease pattern, drawn as Edit draws one, and the folded figure in the
 * host's paper, side by side, each a `PaperPane` on the pipeline Edit's
 * figures, the Diagram and Pose share (approach 3).
 *
 * - **What they show** is the props' ({@link LayerOrderPanesProps}): the
 *   session's status and the host's request, the view (side, X-ray,
 *   Undecided), the faces marked by role and the order a preview shows. They
 *   keep no state of their own but the cameras.
 * - **What a press does** is the inspector's: a pick, a hover or a press on
 *   no paper goes out as an event, with its pane and whether a pointer or a
 *   finger made it. A double tap fits.
 * - **Zoom.** Each pane has its own zoom bar; its Fit frames both. On a
 *   phone (`phonePane`), one pane at a time, switched from the title row,
 *   and nothing floats over it: pinch zooms, a double tap fits (D6).
 * - **The flash** of the spots the last change moved is one 1.6 s fade;
 *   `onFlashEnded` hears when it is over, whichever pane is showing.
 */
export function LayerOrderPanes(props: LayerOrderPanesProps) {
  const { t } = useTranslation();
  const { status, phonePane, request, onFlashEnded } = props;
  const openingView = useMemo(() => layerOrderOpeningView(request), [request]);
  const view = props.view ?? openingView;
  const marks = props.marks ?? NO_FACE_MARKS;
  const stacks = props.stacks ?? null;
  const events = props;

  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const themeKey = useThemeStore((state) => state.currentTheme.name);
  const wheelGesture = useSettingsStore((state) => state.cpWheelGesture);
  const snapRadius = useSettingsStore((state) => state.cpSnapRadius);
  const inks = useLayerPaneInks(root, themeKey);
  const inputs = { status, request, view, marks, stacks, inks, element: root, themeKey };
  const pattern = useLayerPatternPane(inputs);
  const folded = useLayerFoldedPane(inputs);

  // The cameras: each pane's own zoom, and Fit for both.
  const cameras = useRef<Record<LayerPaneId, CpSurfaceControls | null>>({ pattern: null, folded: null });
  const patternCamera = useCallback((controls: CpSurfaceControls | null) => {
    cameras.current.pattern = controls;
  }, []);
  const foldedCamera = useCallback((controls: CpSurfaceControls | null) => {
    cameras.current.folded = controls;
  }, []);
  const fitBoth = useCallback(() => {
    cameras.current.pattern?.fit();
    cameras.current.folded?.fit();
  }, []);
  const [zoom, setZoom] = useState<Record<LayerPaneId, number>>({ pattern: 100, folded: 100 });
  const zoomOf = useCallback(
    (pane: LayerPaneId) => (percent: number) => setZoom((was) => (was[pane] === percent ? was : { ...was, [pane]: percent })),
    []
  );
  const onPatternZoom = useMemo(() => zoomOf('pattern'), [zoomOf]);
  const onFoldedZoom = useMemo(() => zoomOf('folded'), [zoomOf]);

  // The flash ends on the clock, not on its animation: the pane drawing it may not be on screen.
  const flashN = marks.flash?.n ?? null;
  useEffect(() => {
    if (flashN === null || !onFlashEnded) return;
    const timer = setTimeout(() => onFlashEnded(flashN), LAYER_PANE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashN, onFlashEnded]);

  const foldedPlace = status.kind === 'opening' || status.kind === 'ready';
  // Refused or lost, the crease pattern is the one pane, whatever the switch says.
  const one = phonePane === null ? null : foldedPlace ? phonePane : 'crease';
  const wide = phonePane === null;
  const framingKey = request.source.digest;
  const shared = { events, framingKey, wheelGesture, snapRadius, themeKey, onFit: fitBoth };
  const fitLabel = t('dialogs:layerOrder.zoom.fit', 'Fit both views');

  return (
    <div ref={setRoot} className={styles.panes} data-layer-order-panes="">
      {one !== 'folded' && (
        <LayerOrderPane
          ref={patternCamera}
          channels={pattern}
          label={t('dialogs:layerOrder.creasePane', 'Crease pattern')}
          canvasLabel={t('dialogs:layerOrder.creaseCanvas', 'The crease pattern. Pick a face on it; drag to pan, scroll to zoom.')}
          onZoomPercentChange={onPatternZoom}
          {...shared}
        >
          {wide && (
            <LayerOrderPaneToolbar
              label={t('dialogs:layerOrder.zoom.creaseBar', 'Crease pattern view')}
              zoomOutLabel={t('dialogs:layerOrder.zoom.creaseOut', 'Zoom out the crease pattern')}
              zoomInLabel={t('dialogs:layerOrder.zoom.creaseIn', 'Zoom in the crease pattern')}
              resetLabel={t('dialogs:layerOrder.zoom.creaseReset', 'Reset the crease pattern zoom')}
              fitLabel={fitLabel}
              zoomPercent={zoom.pattern}
              onZoomOut={() => cameras.current.pattern?.zoomOut()}
              onZoomIn={() => cameras.current.pattern?.zoomIn()}
              onReset={() => cameras.current.pattern?.setZoomPercent(100)}
              onFit={fitBoth}
            />
          )}
        </LayerOrderPane>
      )}
      {foldedPlace &&
        one !== 'crease' &&
        (folded ? (
          <LayerOrderPane
            ref={foldedCamera}
            channels={folded}
            label={t('dialogs:layerOrder.foldedPane', 'Folded figure')}
            canvasLabel={
              view.side === 'back'
                ? t('dialogs:layerOrder.foldedCanvasBack', 'The folded figure from the back. Pick the face on top; drag to pan, scroll to zoom.')
                : t('dialogs:layerOrder.foldedCanvasFront', 'The folded figure from the front. Pick the face on top; drag to pan, scroll to zoom.')
            }
            onZoomPercentChange={onFoldedZoom}
            {...shared}
          >
            {wide && (
              <LayerOrderPaneToolbar
                label={t('dialogs:layerOrder.zoom.foldedBar', 'Folded figure view')}
                zoomOutLabel={t('dialogs:layerOrder.zoom.foldedOut', 'Zoom out the folded figure')}
                zoomInLabel={t('dialogs:layerOrder.zoom.foldedIn', 'Zoom in the folded figure')}
                resetLabel={t('dialogs:layerOrder.zoom.foldedReset', 'Reset the folded figure zoom')}
                fitLabel={fitLabel}
                zoomPercent={zoom.folded}
                onZoomOut={() => cameras.current.folded?.zoomOut()}
                onZoomIn={() => cameras.current.folded?.zoomIn()}
                onReset={() => cameras.current.folded?.setZoomPercent(100)}
                onFit={fitBoth}
              />
            )}
          </LayerOrderPane>
        ) : (
          <section className={styles.waiting} aria-label={t('dialogs:layerOrder.foldedPane', 'Folded figure')}>
            {status.kind === 'opening' && (
              <span className={styles.loading} role="status" aria-label={t('dialogs:layerOrder.foldedLoading', 'Loading the folded figure')}>
                <PictureLoading />
              </span>
            )}
          </section>
        ))}
    </div>
  );
}
