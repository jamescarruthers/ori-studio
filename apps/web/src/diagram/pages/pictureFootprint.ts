import { PT_PER_CSS_PX, PT_PER_MM, widestPenPt } from '../../lib/paper/paperSvg';
import { frameOf } from '../annotate/annotationModel';
import { annotationDrawing, annotationReach } from '../annotate/annotationPrimitives';
import type { DiagramDocument, DiagramStep } from '../document/diagramDocument';
import { diagramSurfaceStyle } from '../pictures/diagramPaperStyle';
import { stepAsDrawn, viewFrame, viewGeometry, viewOfStep } from '../zoom/stepView';
import { pictureExtent, type LayoutStep } from './diagramPageLayout';
import { cellPicture, type PictureMeasure } from './pagePictures';
import { convexHull, rectangle, type Polygon } from './pagePolygons';

/** Occupied paper and individual marks, normalized to the measured ink box.
 * Empty corners stay empty, including when a mark reaches past the paper.
 * Raster/upload/zoom sources retain their conservative measured rectangle.
 */
export function pictureFootprints(
  whole: DiagramStep,
  document: DiagramDocument,
  picture: LayoutStep['picture'],
  measure: PictureMeasure,
): Polygon[] | undefined {
  if (!picture || whole.zoom || whole.picture?.kind !== 'scene') return undefined;
  const step = stepAsDrawn(whole),
    view = viewOfStep(step);
  const frame = viewFrame(view, document.assets),
    geometry = viewGeometry(view, document.assets, document.style);
  if (!frame || geometry.kind === 'none') return undefined;
  const scale = measure
    ? 'mmPerUnit' in measure
      ? measure.mmPerUnit
      : measure.frameMm
    : 50 / Math.max(picture.frame.width, picture.frame.height);
  const extent = pictureExtent(picture, scale);
  if (!(extent.width > 0 && extent.height > 0)) return undefined;
  const painted = cellPicture(
    step,
    document.assets,
    document.style,
    {
      pictureMm: { x: 0, y: 0, size: Math.min(extent.width, extent.height) },
      drawMm: { x: 0, y: 0, w: extent.width, h: extent.height },
      mmPerUnit: picture.kind === 'paper' ? scale : null,
      frameMm: picture.kind === 'fit' ? scale : null,
    },
    'footprint-',
    { hanStyle: document.hanStyle, runs: (text, face) => [{ text, face }] },
  );
  if (!painted) return undefined;
  const at = painted.framePt;
  const pad = widestPenPt(diagramSurfaceStyle(document.style)) / 2;
  const paper = convexHull(
    geometry.points.flatMap(({ at: p }) =>
      rectangle(
        at.x + (p[0] / frame.width) * at.width - pad,
        at.y + (p[1] / frame.height) * at.height - pad,
        pad * 2,
        pad * 2,
      ),
    ),
  );
  if (paper.length < 3) return undefined;
  const polygons: Polygon[] = [paper];
  const annotationFrame = frameOf(at.width, at.height);
  if (annotationFrame)
    for (const annotation of step.annotations) {
      const drawing = annotationDrawing(
        [annotation],
        annotationFrame,
        Math.max(at.width, at.height) / PT_PER_CSS_PX,
        document.style,
        geometry.layers,
      );
      const box = annotationReach(drawing, { includeFrame: false, xRays: !!geometry.layers });
      if (box.width > 0 && box.height > 0)
        polygons.push(
          rectangle(
            at.x + box.x * PT_PER_CSS_PX,
            at.y + box.y * PT_PER_CSS_PX,
            box.width * PT_PER_CSS_PX,
            box.height * PT_PER_CSS_PX,
          ),
        );
    }
  return polygons.map((polygon) =>
    polygon.map(({ x, y }) => ({
      x: x / (extent.width * PT_PER_MM),
      y: y / (extent.height * PT_PER_MM),
    })),
  );
}
