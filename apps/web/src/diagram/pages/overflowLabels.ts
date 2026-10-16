/**
 * What the Pages view and the export dialog say about a flow page that
 * cannot hold its steps even at the smallest size (`pageHoldsItsSteps`): the
 * automatic layout failing, not anything placed by hand, and what to do
 * about it. One page or several by how many, as `zoomSplitLabels.ts` decides
 * it.
 *
 * Literal `t()` calls, so the extractor sees each key.
 */
import type { TFunction } from 'i18next';

/** The Pages view's notice about a page no plan fits, even at the least scale: a re-pack cannot mend it. */
export function pageUnfitSentence(page: number, t: TFunction): string {
  return t(
    'panels:diagram.packing.pageUnfit',
    'Page {{page}} can’t hold its steps, even at the smallest size. Give it fewer steps.',
    { page }
  );
}

/** The export notice's sentence about the pages that cannot hold their steps, by how they are captioned. */
export function exportUnfitSentence(pages: readonly number[], t: TFunction, language: string): string {
  const listed = new Intl.ListFormat(language, { type: 'conjunction' }).format(pages.map(String));
  return pages.length === 1
    ? t(
        'dialogs:diagramExport.unfitPage',
        'Page {{pages}} can’t hold its steps, even at the smallest size, and prints past its margins.',
        { pages: listed }
      )
    : t(
        'dialogs:diagramExport.unfitPages',
        'Pages {{pages}} can’t hold their steps, even at the smallest size, and print past their margins.',
        { pages: listed }
      );
}
