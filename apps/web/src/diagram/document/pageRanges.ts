/**
 * How many steps a page may hold, by default and by its own count, and the
 * ranges of the flow's packing: the ranges the document clamps to and the
 * pagination and a stored arrangement's reader read (`pages/pagePlan.ts`,
 * `pageArrangements.ts`).
 *
 * A module of its own, free of imports, so that the pagination — which the
 * layout and the export's geometry load — reads them without loading the
 * whole document model. `diagramDocument.ts` re-exports them.
 */

/** A flow page's steps per page: up to the 5 × 6 a flow page could hold before it took a count, so every one keeps its count. */
export const STEPS_PER_PAGE_RANGE = { min: 2, max: 30 } as const;

/** A page's own count of steps (`DiagramStep.pageSteps`): one step on a page of its own, up to the most a page holds by default. */
export const PAGE_STEPS_RANGE = { min: 1, max: STEPS_PER_PAGE_RANGE.max } as const;

/**
 * A fixed band count of a packed flow page (`DiagramPageSetup.flowBands`;
 * Auto packs a short page into fewer). Here too because a stored
 * arrangement's bands are read against it (`pageArrangements.ts`).
 */
export const FLOW_BANDS_RANGE = { min: 2, max: 5 } as const;

/** The range of the packing's three weights: `flowPreferBands`, `flowNesting` and `flowSteadiness`. */
export const FLOW_WEIGHT_RANGE = { min: 0, max: 1 } as const;

/**
 * The share of the printable height the first page's title block takes
 * (`DiagramPageSetup.titleBlock`). Here because page 1's capacity is read
 * from it (`pages/pagePlan.ts`).
 */
export const TITLE_BLOCK_SHARE_RANGE = { min: 0.15, max: 0.5 } as const;
