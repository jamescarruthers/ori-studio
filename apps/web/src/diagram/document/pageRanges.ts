/**
 * How many steps a page may hold, by default and by its own count: the
 * ranges the document clamps to and the pagination reads (`pages/pagePlan.ts`).
 *
 * A module of its own, free of imports, so that the pagination — which the
 * layout and the export's geometry load — reads them without loading the
 * whole document model. `diagramDocument.ts` re-exports both.
 */

/** A flow page's steps per page: up to the 5 × 6 a flow page could hold before it took a count, so every one keeps its count. */
export const STEPS_PER_PAGE_RANGE = { min: 2, max: 30 } as const;

/** A page's own count of steps (`DiagramStep.pageSteps`): one step on a page of its own, up to the most a page holds by default. */
export const PAGE_STEPS_RANGE = { min: 1, max: STEPS_PER_PAGE_RANGE.max } as const;
