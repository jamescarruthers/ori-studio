/**
 * The area the enlarge arrow before a step leaves, where the pages print one
 * (Revision 2): read from the order as it is (`zoomIndex`), and only before a
 * step that shows its window — none before one seeded with no picture yet.
 *
 * What the layout sizes and places the arrow by (`diagramPages.ts`). Not what
 * a flow page's signature counts: whether an arrow prints turns on a mark and
 * a picture, which never re-pack a page, so a packed page keeps the arrow's
 * gutter before every enlarged step after another (`keepsGlyphGutter` in
 * `pages/pageSignature.ts`), and an arrow that comes or goes is drawn in it.
 *
 * Pure.
 */
import { stepsOf, type DiagramDocument, type DiagramStep, type KnownDiagramAnnotation } from '../document/diagramDocument';
import { viewOfStep } from './stepView';
import { zoomAreas } from './zoomCapture';
import { zoomIndex, type ZoomArrowFrom, type ZoomIndex } from './zoomIndex';

/** The arrow before `step`: the step and area it leaves, and that area; null where none prints. */
export function enlargeArrowArea(
  step: DiagramStep,
  document: DiagramDocument,
  index: ZoomIndex = zoomIndex(document)
): { from: ZoomArrowFrom; area: KnownDiagramAnnotation } | null {
  const from = viewOfStep(step).zoom ? (index.arrowFrom.get(step.id) ?? null) : null;
  const areaStep = from ? stepsOf(document).find((each) => each.id === from.stepId) : undefined;
  const area = areaStep ? zoomAreas(areaStep).find((each) => each.id === from!.areaId) : undefined;
  return from && area ? { from, area } : null;
}
