import { useMemo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { PAGE_STEPS_RANGE, isStep, stepsOf, type DiagramDocument, type DiagramPageSetup } from '../document/diagramDocument';
import { countHoldsLaterPages, pageStepsRange, type PageStepsRange } from './pageCounts';
import { usePageInView, type PagesInView } from './pageInView';
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
 * UI): the page the user last acted on. While the Pages view shows pages,
 * that is the page last pressed there while it is still on screen; else the
 * selected step's page while that page is on screen; else the page in the
 * middle of the view. With no Pages view, the selected step's page, else
 * page 1. A step's page is the one it prints on — a turn's is the page of
 * the step after it, or with none after it the last step's, as the pages
 * print turns. Null for no diagram.
 */
export function currentDiagramPage(
  document: DiagramDocument | null,
  view: PagesInView | null,
  selectedId: string | null
): CurrentDiagramPage | null {
  if (!document) return null;
  const steps = stepsOf(document);
  const pages = paginate(steps, document.page);
  const last = pages.length - 1;
  const at = selectedId === null ? null : printedStepIndex(document, steps, selectedId);
  const selected = at === null ? null : Math.max(0, pages.findIndex((page) => page.steps.includes(at)));
  let index = selected ?? 0;
  if (view) {
    if (view.pressed !== null) index = view.pressed;
    else if (selected === null || selected < view.first || selected > view.last) index = view.middle;
  }
  index = Math.min(Math.max(0, index), last);
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
  const view = usePageInView();
  return useMemo(
    () => currentDiagramPage(document, pagesShown ? view : null, selectedId),
    [document, pagesShown, view, selectedId]
  );
}
