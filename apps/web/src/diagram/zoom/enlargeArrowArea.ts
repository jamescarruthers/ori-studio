/**
 * The area the enlarge arrow before a step leaves, where the pages print one
 * (Revision 2): read from the order as it is (`zoomIndex`), and only before a
 * step that shows its window — none before one seeded with no picture yet.
 *
 * What the layout sizes the arrow by (`diagramPages.ts`), and what a flow
 * page's signature counts (`stepPlaces.ts`): a packed page keeps a gutter for
 * the arrow, as for a turn, so one that comes or goes re-packs its page.
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
