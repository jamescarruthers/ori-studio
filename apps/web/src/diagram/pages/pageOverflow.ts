import type { DiagramPagesLayout, LayoutPage } from './diagramPageLayout';

/**
 * What a flow page reports of the steps that no longer fit the places its
 * held arrangement keeps for them (`implementation-plans/diagram-flow-packing.md`,
 * Decision 3): their numbers, in print order — each one's own new picture
 * or caption, which Re-pack Page gives room — and whether the page's boxes
 * fit its area at all, false only for a page no plan fitted even at the
 * least scale, which a re-pack cannot mend. Pure.
 */
export interface PageOverflow {
  steps: number[];
  fits: boolean;
}

/** Page `page`'s overflow, or null for a page that has none to report (and every grid page). */
export function pageOverflow(page: Pick<LayoutPage, 'cells' | 'packing'>): PageOverflow | null {
  const steps = page.cells.filter((cell) => cell.overflow).map((cell) => cell.number);
  const fits = page.packing?.fits ?? true;
  return steps.length > 0 || !fits ? { steps, fits } : null;
}

/**
 * Every page's overflow in a layout, as the export dialog lists it: the
 * steps that no longer fit their places, and the pages that cannot hold
 * their steps, each by what the Pages view captions it — the number it
 * prints, or its place when it prints none.
 */
export function layoutOverflow(layout: Pick<DiagramPagesLayout, 'pages'>): { steps: number[]; unfitPages: number[] } {
  const steps: number[] = [];
  const unfitPages: number[] = [];
  layout.pages.forEach((page, index) => {
    const overflow = pageOverflow(page);
    if (!overflow) return;
    steps.push(...overflow.steps);
    if (!overflow.fits) unfitPages.push(page.pageNumberAt ? page.number : index + 1);
  });
  return { steps, unfitPages };
}
