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

/**
 * The range of the title block's model's and pattern's sizes, as shares of
 * the block's height (`DiagramTitleBlockContent`): past it, a newer build's.
 * Here because the page's layout reads them (`pages/titleBlockColumn.ts`).
 */
export const TITLE_BLOCK_ART_SIZE_RANGE = { min: 0.3, max: 1 } as const;

/**
 * The model's and the pattern's sizes where the content says none: Zach's
 * J1b (2026-10-15), its 49.39 mm pattern and 37.04 mm model as shares of
 * the 62.79 mm block a new diagram gets on A4 portrait, each a third smaller
 * than the first cut's. A look (class (b)): it may change for every file,
 * since no step moves when it does.
 */
export const TITLE_BLOCK_ART_SIZE_DEFAULTS = { modelSize: 0.59, patternSize: 0.79 } as const;
