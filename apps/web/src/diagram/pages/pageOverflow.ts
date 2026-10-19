import type { DiagramPagesLayout, LayoutPage } from './diagramPageLayout';

/**
 * Whether a flow page's boxes fit its area (`LayoutPage.packing`): false only
 * for a page no plan fitted even at the least scale, drawn overflowing — the
 * automatic layout failing, which a re-pack cannot mend and fewer steps can,
 * so it is said (`implementation-plans/diagram-flow-packing.md`, Decision 3).
 * A held step's own new picture or caption past its box is not: it shows on
 * the page as it prints (Zach, 2026-10-12). True on every grid page. Pure.
 */
export function pageHoldsItsSteps(page: Pick<LayoutPage, 'packing'>): boolean {
  return page.packing?.fits ?? true;
}

/**
 * What a step's card in the Steps view says of its place on the pages: its
 * instruction cut with "…" to fit a grid cell (a flow step's caption is never
 * cut: it prints whole).
 */
export type StepPageFit = 'text-cut';

/** Each step's {@link StepPageFit} on the pages laid out, by its id: none for a step that fits. */
export function stepPageFits(layout: Pick<DiagramPagesLayout, 'pages'> | null | undefined): ReadonlyMap<string, StepPageFit> {
  const fits = new Map<string, StepPageFit>();
  for (const page of layout?.pages ?? []) {
    for (const cell of page.cells) if (cell.textOverflow) fits.set(cell.stepId, 'text-cut');
  }
  return fits;
}

/**
 * The pages that cannot hold their steps (`pageHoldsItsSteps`), as the export
 * dialog lists them: each by what the Pages view captions it — the number it
 * prints, or its place when it prints none.
 */
export function unfitPages(layout: Pick<DiagramPagesLayout, 'pages'>): number[] {
  return layout.pages.flatMap((page, index) => (pageHoldsItsSteps(page) ? [] : [page.pageNumberAt ? page.number : index + 1]));
}
