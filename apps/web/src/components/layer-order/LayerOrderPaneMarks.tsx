import { useEffect, useMemo, useState } from 'react';
import type { CpOverlayView } from '../../cp-workspace/CreasePatternWebglCanvas';
import { observeResizeDeferred } from '../ui/observeResizeDeferred';
import type { Point } from '../../lib/geometry';
import { insetRing, ringInsetPx } from '../../layer-order/panes/faceRing';
import { placeLabels, type LayerPlacedLabel } from '../../layer-order/panes/layerPaneLabels';
import type { LayerPaneChannels } from '../../layer-order/panes/useLayerOrderPanes';
import styles from './LayerOrderPaneMarks.module.css';

/** The pane's frame → CSS px of its canvas box, through the camera. */
function projector(view: CpOverlayView): (point: Point) => Point {
  const [ox, oy] = view.origin;
  const [ax, ay] = view.ex;
  const [bx, by] = view.ey;
  return ({ x, y }) => ({ x: ox + ax * x + bx * y, y: oy + ay * x + by * y });
}

const pointsOf = (ring: readonly Point[]) => ring.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * What a Layer order pane draws over its canvas, through its camera
 * (`implementation-plans/layer-order-dialog.md`, row U8; D20): the
 * changed spots' one fade, each marked face's ring inside it, and the
 * faces' letters on top.
 *
 * In CSS px rather than on a channel of the canvas, because each of these
 * holds a size on screen at every zoom: a ring sits half its stroke plus a
 * pixel in from its face's edge (`faceRing.ts`), so it never covers a
 * crease's colour, and a letter's chip keeps its size and clears the others
 * (`layerPaneLabels.ts`). The tints are the canvas's (`PaperPane`'s fills).
 *
 * Nothing here takes a pointer: the canvas under it does. Its box is
 * measured, a frame late, only so a letter set beside its face stays on
 * screen.
 */
export function LayerOrderPaneMarks({ pane, view }: { pane: LayerPaneChannels; view: CpOverlayView }) {
  const project = useMemo(() => projector(view), [view]);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!element) return;
    const measure = () =>
      setFrame((was) =>
        was && was.width === element.clientWidth && was.height === element.clientHeight
          ? was
          : { width: element.clientWidth, height: element.clientHeight }
      );
    measure();
    // jsdom has none; the box is then measured once.
    if (typeof ResizeObserver === 'undefined') return;
    return observeResizeDeferred(element, measure);
  }, [element]);
  const rings = useMemo(
    () =>
      pane.rings.flatMap(({ face, ring, ink, widthPx }) => {
        const inner = insetRing(ring.map(project), ringInsetPx(widthPx));
        return inner ? [{ face, points: pointsOf(inner), ink, widthPx }] : [];
      }),
    [pane.rings, project]
  );
  const flash = useMemo(
    () => (pane.flash ? { n: pane.flash.n, polygons: pane.flash.spots.map((spot) => pointsOf(spot.map(project))) } : null),
    [pane.flash, project]
  );
  const labels: LayerPlacedLabel[] = useMemo(
    () => placeLabels(pane.labels, pane.labelSpots, pane.letterOf, project, frame),
    [pane.labels, pane.labelSpots, pane.letterOf, project, frame]
  );

  return (
    <div ref={setElement} className={styles.marks} aria-hidden="true" data-layer-order-marks={pane.id}>
      <svg className={styles.layer}>
        {flash && (
          // Keyed by the flash, so each one fades from the start.
          <g key={flash.n} className={styles.flash} data-layer-order-flash={flash.n}>
            {flash.polygons.map((points, k) => (
              <polygon key={k} points={points} />
            ))}
          </g>
        )}
        {rings.map(({ face, points, ink, widthPx }) => (
          <polygon
            key={face}
            className={styles.ring}
            data-ink={ink}
            data-layer-order-ring={face}
            points={points}
            strokeWidth={widthPx}
          />
        ))}
      </svg>
      {labels.map((label) => (
        <span
          key={label.face}
          className={styles.label}
          data-tone={label.tone}
          data-under={label.under || undefined}
          data-off={label.off || undefined}
          data-layer-order-letter={label.text}
          style={{
            left: label.x - label.width / 2,
            top: label.y - label.height / 2,
            width: label.width,
            height: label.height,
          }}
        >
          {label.tone === 'danger' && <span className={styles.dot} />}
          {label.text}
        </span>
      ))}
    </div>
  );
}
