import { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { PAGE_STEPS_RANGE, isStep, stepsOf, type DiagramDocument, type DiagramPageSetup } from '../document/diagramDocument';
import { countHoldsLaterPages, pageStepsRange, type PageStepsRange } from './pageCounts';
import { usePageInView } from './pageInView';
import { paginate, type PlannedPage } from './pagePlan';

/** The page a pane's "this page" means: its index, what it is called, and how the page setup cuts it. */
export interface CurrentDiagramPage {
  /** Its index, from 0, as the layout and the store's page verbs number pages. */
  index: number;
  /** What the Pages view captions it: the number it prints, or its place when it prints none. */
  name: number;
  /** The page as the document's page setup cuts it (`paginate`). */
  page: PlannedPage;
  /** The counts of its own it may be given in the flow (`pageStepsRange`). */
  range: PageStepsRange;
  /** Its own count stays, holding a later page with one still (`countHoldsLaterPages`): it has no Use default. */
  holdsLaterPages: boolean;
}

/** What the Pages view captions page `index`: the number it prints, or its place when it prints none. */
export function pageName(setup: Pick<DiagramPageSetup, 'pageNumbers'>, index: number): number {
  return setup.pageNumbers.enabled ? setup.pageNumbers.first + index : index + 1;
}

/**
 * The page a pane acts on as "this page" (`implementation-plans/diagram-flow-pages.md`,
 * UI): the page in the middle of the Pages view while it shows one; else the
 * page the selected step prints on — a turn's is the page of the step after
 * it, or with none after it the last step's, as the pages print turns; else
 * page 1. Null for no diagram.
 */
export function currentDiagramPage(
  document: DiagramDocument | null,
  inView: number | null,
  selectedId: string | null
): CurrentDiagramPage | null {
  if (!document) return null;
  const steps = stepsOf(document);
  const pages = paginate(steps, document.page);
  const last = pages.length - 1;
  let index = 0;
  if (inView !== null) {
    index = Math.min(Math.max(0, inView), last);
  } else if (selectedId !== null) {
    const at = printedStepIndex(document, steps, selectedId);
    if (at !== null) index = Math.max(0, pages.findIndex((page) => page.steps.includes(at)));
  }
  return {
    index,
    name: pageName(document.page, index),
    page: pages[index]!,
    range: pageStepsRange(document, index) ?? PAGE_STEPS_RANGE,
    holdsLaterPages: countHoldsLaterPages(document, index),
  };
}

/** The index among the steps of the step `id` prints with: itself, or for a turn the step after it, else the last. */
function printedStepIndex(
  document: DiagramDocument,
  steps: readonly { id: string }[],
  id: string
): number | null {
  const at = steps.findIndex((step) => step.id === id);
  if (at >= 0) return at;
  const entry = document.steps.findIndex((each) => each.id === id);
  if (entry < 0 || steps.length === 0) return null;
  const after = document.steps.slice(entry + 1).find(isStep);
  return after ? steps.findIndex((step) => step.id === after.id) : steps.length - 1;
}

/**
 * The current page ({@link currentDiagramPage}) for a dock pane, from the
 * store and the page the Pages view publishes (`pageInView.ts`): the Page
 * pane's count for one page, and Reset This Page.
 */
export function useCurrentDiagramPage(): CurrentDiagramPage | null {
  const document = useWorkspaceStore((state) => state.diagram);
  const pagesShown = useWorkspaceStore((state) => state.diagramView === 'pages');
  const selectedId = useWorkspaceStore((state) => state.diagramSelectedStepId);
  const inView = usePageInView();
  return useMemo(
    () => currentDiagramPage(document, pagesShown ? inView : null, selectedId),
    [document, pagesShown, inView, selectedId]
  );
}
