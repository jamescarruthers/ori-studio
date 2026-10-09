import { useId, useMemo } from 'react';
import type { CpOverlayView } from '../../../cp-workspace/CreasePatternWebglCanvas';
import { referencesMarkupTokens } from '../../../cp-workspace/references/usePaperStyleTokens';
import type { FoldActionGeometry } from '../../../fold/engine/foldEngineWire';
import { convexHull, type Point } from '../../../lib/geometry';
import { applyPaperStylePolicy, PAPER_STYLE_POLICIES } from '../../../lib/paper/paperStyleResolve';
import { PT_TO_CSS_PX, type PaperStyle } from '../../../lib/paper/paperStyle';
import { createDiagramRenderContext, diagramShapes } from '../../../lib/stepDiagram/DiagramPrimitives';
import { diagramInlineInk } from '../../../lib/stepDiagram/diagramColors';
import { canvasDiagramInk, canvasDiagramPens, CP_CREASE_WIDTH_FACTOR } from '../../../lib/stepDiagram/diagramInk';
import {
  createOverlayProjector,
  foldArrowArc,
  type SheetPoint,
} from '../../../lib/stepDiagram/stepDiagramGeometry';
import type { StepDiagramPrimitive } from '../../../lib/stepDiagram/stepDiagramModel';
import styles from './FoldCanvas.module.css';

/**
 * A located fold's arrow over the folded pane (plan D11): from the grip on
 * the moving paper to where the fold puts it, drawn by the step diagram's own
 * primitives (`lib/stepDiagram`) — a valley's filled head or a mountain's
 * hollow one, and a precrease's out-and-back — in the paper style's arrow
 * pen, through the pane's camera. The fold line itself is painted with the
 * paper (`withFoldLine`); the renderer has no curve or arrowhead, so the
 * arrow is this one SVG over it, as References' marks are.
 */
export function FoldActionLayer({
  action,
  view,
  style,
  outline,
  ground,
}: {
  action: FoldActionGeometry | null;
  /** The pane's camera: its frame → CSS px of the canvas box. */
  view: CpOverlayView;
  style: PaperStyle;
  /** The paper in the pane's frame: where the arrow takes the style's ink rather than the ground's. */
  outline: readonly Point[];
  /** The canvas's ground, as a CSS colour: what an arrow off the paper is inked against. */
  ground: string;
}) {
  const id = useId();
  const seen = useMemo(() => applyPaperStylePolicy(style, PAPER_STYLE_POLICIES.fold), [style]);
  const model = useMemo(() => {
    const grip = action?.grip;
    if (!action || !grip) return null;
    const hull = convexHull(outline);
    const centre: SheetPoint = hull.length
      ? [hull.reduce((sum, p) => sum + p.x, 0) / hull.length, hull.reduce((sum, p) => sum + p.y, 0) / hull.length]
      : [grip.at.x, grip.at.y];
    const out = foldArrowArc([grip.at.x, grip.at.y], [grip.image.x, grip.image.y], centre);
    if (!out) return null;
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const width = xs.length ? Math.max(...xs) - Math.min(...xs) : 1;
    const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 1;
    const primitive: StepDiagramPrimitive =
      action.kind === 'precrease' ? { kind: 'fold-arrow', out } : { kind: 'one-way-arrow', out, fold: action.direction };
    return { primitives: [primitive], sheet: { width, height, centre }, hull };
  }, [action, outline]);

  const context = useMemo(() => {
    if (!model) return null;
    // The pen every diagram stroke is measured from: the style's edge pen, as
    // References' view measures its own.
    const lineWidth = (seen.edges.width * PT_TO_CSS_PX) / CP_CREASE_WIDTH_FACTOR;
    const project = createOverlayProjector(
      view,
      canvasDiagramInk(lineWidth),
      canvasDiagramPens(lineWidth, seen.arrows.width * PT_TO_CSS_PX)
    );
    return createDiagramRenderContext(model.primitives, model.sheet, project, {
      outline: model.hull.map((p): SheetPoint => [p.x, p.y]),
      id: `fold-action-${id}`,
      back: false,
      inline: diagramInlineInk({ ...referencesMarkupTokens(seen), '--bg-primary': ground }),
    });
  }, [model, view, seen, id, ground]);

  if (!model || !context) return null;
  return (
    // Over the canvas, under anything that takes a press.
    <svg className={styles.layer} aria-hidden="true" data-fold-action="">

      {diagramShapes(model.primitives, context)}
    </svg>
  );
}
