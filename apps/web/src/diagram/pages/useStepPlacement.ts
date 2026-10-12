import { useWorkspaceStore } from '../../store/workspaceStore';
import { stepsOf, type DiagramStep } from '../document/diagramDocument';
import { placementBlocker } from '../document/stepPlace';
import { printedFrameMm } from './pagePictures';
import { startsPage } from './pagePlan';
import { pageOffset, type PagePart, type PlacementClash } from './pagePlacement';
import { commitPlacement, resetPlacement } from './placementActions';
import { usePrintedLayout } from './printedFrames';

/**
 * The clashes a new page clears: other steps, and the symbols, heading and
 * page number round them. Never the margin, the paper, the path or the step's
 * own parts, which a placement carries to any page.
 */
const NEW_PAGE_CLEARS: ReadonlySet<PlacementClash['kind']> = new Set(['step', 'glyph']);

/**
 * Whether a step's clash notice offers to start it on a new page (review
 * finding U5): for a clash a new page clears, on a step that does not start
 * a page already, where a break would change nothing.
 */
export function newPageHelps(clashes: readonly PlacementClash[] | undefined, startsAPage: boolean): boolean {
  return !startsAPage && (clashes ?? []).some((clash) => NEW_PAGE_CLEARS.has(clash.kind));
}

export function useStepPlacement(step: DiagramStep) {
  const { pages, document } = usePrintedLayout();
  const currentDocument = useWorkspaceStore((state) => state.diagram);
  const cell =
    document === currentDocument
      ? (pages?.layout.pages.flatMap((page) => page.cells).find((each) => each.stepId === step.id) ?? null)
      : null;
  const selected = useWorkspaceStore((state) =>
    state.diagramSelectedStepId === step.id ? state.diagramPagesPart : null,
  );
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const loadId = useWorkspaceStore((state) => state.diagramLoadId);
  const startsAPage = useWorkspaceStore((state) => {
    const diagram = state.diagram;
    if (!diagram) return false;
    const steps = stepsOf(diagram);
    return startsPage(steps, diagram.page, steps.findIndex((each) => each.id === step.id));
  });
  const blocked = placementBlocker(step);
  const size = cell && document ? printedFrameMm(step, document.assets, document.style, cell) : null;
  const auto = cell?.placed?.auto;
  const autoSize =
    cell && document && auto ? printedFrameMm(step, document.assets, document.style, { ...cell, ...auto }) : size;
  return {
    cell,
    selected,
    size,
    autoSize,
    readOnly,
    blocked,
    disabled: readOnly || blocked !== null || !cell,
    /** Offer "Start step N on a new page" with the clashes ({@link newPageHelps}). */
    offerNewPage: newPageHelps(cell?.clashes, startsAPage),
    startOnNewPage() {
      useWorkspaceStore.getState().setDiagramStepBreakBefore(step.id, true);
    },
    select(part: PagePart) {
      useWorkspaceStore.getState().selectDiagramPagesPart(part);
    },
    offset(part: PagePart) {
      return pageOffset(step.place, part, cell?.rightToLeft ?? false);
    },
    setOffset(part: PagePart, axis: 0 | 1, value: number) {
      const offset: [number, number] = [...(step.place?.[part] ?? [0, 0])];
      offset[axis] = part === 'frame' && axis === 0 && cell?.rightToLeft ? -value : value;
      commitPlacement(step.id, { [part]: offset }, 'pane', { loadId });
    },
    setSize(mm: number) {
      if (!cell || !size || step.zoom) return;
      if (autoSize !== null && Math.abs(mm - autoSize) < 0.05) {
        resetPlacement(step.id, 'scale');
        return;
      }
      const factor = mm / size;
      commitPlacement(
        step.id,
        {
          scale:
            cell.mmPerUnit !== null
              ? { mmPerUnit: cell.mmPerUnit * factor }
              : { frameMm: (cell.frameMm ?? size) * factor },
        },
        'pane',
        { loadId },
      );
    },
    reset: (part: Parameters<typeof resetPlacement>[1]) => resetPlacement(step.id, part),
  };
}
