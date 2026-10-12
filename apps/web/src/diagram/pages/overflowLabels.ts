/**
 * What the Pages view, the Layers pane and the export dialog say about a
 * flow step that no longer fits the place its page keeps for it, and a page
 * that cannot hold its steps at all (`pageOverflow.ts`): one step or several
 * by how many, as `zoomSplitLabels.ts` decides it, listed as every Diagram
 * notice lists them (`formatStepNumbers`).
 *
 * Literal `t()` calls, so the extractor sees each key.
 */
import type { TFunction } from 'i18next';
import { formatStepNumbers } from '../stepNumberList';

/** The tag on such a step: on its box in the Pages view, and on its row in the Layers pane. */
export function overflowTag(t: TFunction): string {
  return t('panels:diagram.packing.noLongerFits', 'No longer fits');
}

/** The Pages view's notice about page `page` (as it is captioned): which of its steps no longer fit their places. */
export function pageOverflowSentence(numbers: readonly number[], page: number, t: TFunction, language: string): string {
  const steps = formatStepNumbers(numbers, language, t);
  return numbers.length === 1
    ? t('panels:diagram.packing.overflowStep', 'Step {{steps}} on page {{page}} no longer fits its place.', { steps, page })
    : t('panels:diagram.packing.overflowSteps', 'Steps {{steps}} on page {{page}} no longer fit their places.', {
        steps,
        page,
      });
}

/** The Pages view's notice about a page no plan fits, even at the least scale: a re-pack cannot mend it. */
export function pageUnfitSentence(page: number, t: TFunction): string {
  return t(
    'panels:diagram.packing.pageUnfit',
    'Page {{page}} can’t hold its steps, even at the smallest size. Give it fewer steps.',
    { page }
  );
}

/** The export notice's sentence about the steps that no longer fit their places. */
export function exportOverflowSentence(numbers: readonly number[], t: TFunction, language: string): string {
  const steps = formatStepNumbers(numbers, language, t);
  return numbers.length === 1
    ? t(
        'dialogs:diagramExport.overflowStep',
        'Step {{steps}} no longer fits its place, and prints past it. Re-pack its page to give it room.',
        { steps }
      )
    : t(
        'dialogs:diagramExport.overflowSteps',
        'Steps {{steps}} no longer fit their places, and print past them. Re-pack their pages to give them room.',
        { steps }
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
