import { useMemo } from 'react';
import { useIsPhoneSurface } from '../../platform/mobileSurface';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isLockedStep, stepById, stepsOf, type DiagramStep } from '../document/diagramDocument';
import { isPlacedStep, placementBlocker } from '../document/stepPlace';
import { cellClashGroup, type ClashGroup, type PagePart } from './pagePlacement';
import { usePrintedLayout } from './printedFrames';
import { useCurrentDiagramPage } from './useCurrentDiagramPage';

/** A step's parts as Layers lists them under it: its frame is the step's own row. */
export const PAGE_LAYER_PARTS = ['number', 'picture', 'text'] as const;
export type PageLayerPart = (typeof PAGE_LAYER_PARTS)[number];

/** One part's row under the selected step. */
export interface PageLayerPartRow {
  part: PageLayerPart;
  /** Placed by hand: it has an offset of its own. */
  moved: boolean;
  pressed: boolean;
  /** Text, on a step with no instruction: nothing to select. */
  disabled: boolean;
}

/** One step's row in the Pages view's Layers list. */
export interface PageLayerRow {
  step: DiagramStep;
  number: number;
  /** Its instruction, trimmed; empty for none. */
  text: string;
  /** Placed by hand, any part or its size (`isPlacedStep`). */
  moved: boolean;
  /** Its most pressing clash as the pages last laid it out, or null. */
  clash: ClashGroup | null;
  /** The selection, with its frame — or no part, as a step selected by the keys or in the Steps view is. */
  pressed: boolean;
  /** Its parts, while it is the selection and can be placed here; null otherwise. */
  parts: readonly PageLayerPartRow[] | null;
}

/** Whether a step can be placed by hand here: a diagram that can change, a placement this build reads, and no phone. */
const placeable = (step: DiagramStep, readOnly: boolean, phone: boolean) =>
  !readOnly && !phone && placementBlocker(step) === null;

/**
 * The Layers pane in the Pages view: the current page's steps
 * (`useCurrentDiagramPage`) in the order they paint — a later step over an
 * earlier one, so the first at the top, as Annotate lists its marks — each
 * badged when placed by hand and when it clashes, the selected one opening
 * into its parts; and the step whose placement it offers under the list. A
 * press on a row selects as a press on the page does: a step with its whole
 * frame, as the first press there; a part, as the second. Turns are no rows.
 */
export function usePageLayers() {
  const current = useCurrentDiagramPage();
  const document = useWorkspaceStore((state) => state.diagram);
  const selectedId = useWorkspaceStore((state) => state.diagramSelectedStepId);
  const part = useWorkspaceStore((state) => state.diagramPagesPart);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const phone = useIsPhoneSurface();
  const { pages } = usePrintedLayout();
  const rows = useMemo((): readonly PageLayerRow[] => {
    if (!document || !current) return [];
    const steps = stepsOf(document);
    const cells = new Map(pages?.layout.pages.flatMap((page) => page.cells).map((cell) => [cell.stepId, cell] as const));
    return current.page.steps.map((index) => {
      const step = steps[index]!;
      const selected = step.id === selectedId;
      const cell = cells.get(step.id);
      return {
        step,
        number: index + 1,
        text: step.text.trim(),
        moved: isPlacedStep(step),
        clash: cell ? cellClashGroup(cell) : null,
        pressed: selected && (part === null || part === 'frame'),
        parts:
          selected && placeable(step, readOnly, phone)
            ? PAGE_LAYER_PARTS.map((each) => ({
                part: each,
                moved: step.place?.[each] !== undefined,
                pressed: part === each,
                disabled: each === 'text' && !step.text.trim(),
              }))
            : null,
      };
    });
  }, [document, current, pages, selectedId, part, readOnly, phone]);
  const chosen = rows.find((row) => row.step.id === selectedId)?.step ?? null;
  // A newer build's step offers no placement, as the Step pane offered none.
  const selected = chosen && !isLockedStep(chosen) ? chosen : null;
  return {
    /** What the Pages view captions the current page; null with no diagram. */
    pageName: current?.name ?? null,
    rows,
    /** The selected step, when it is on this page and this build can place it: whose placement the pane offers. */
    selected,
    /** Select step `stepId` with its whole frame, as a first press on it on the page does. */
    selectStep(stepId: string) {
      const store = useWorkspaceStore.getState();
      store.selectDiagramStep(stepId);
      const step = store.diagram ? stepById(store.diagram, stepId) : null;
      // On a step the pages cannot place by hand, as there: the step alone.
      if (step && placeable(step, store.diagramReadOnly, phone)) store.selectDiagramPagesPart('frame');
    },
    /** Select a part of the selected step, as a second press on it on the page does. */
    selectPart(chosen: PagePart) {
      useWorkspaceStore.getState().selectDiagramPagesPart(chosen);
    },
  };
}
