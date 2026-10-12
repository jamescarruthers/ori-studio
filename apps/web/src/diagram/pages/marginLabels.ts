/**
 * What the Pages view, the Layers pane, the Step pane and the export dialog
 * say about a step placed by hand past the margin (`markOutsideMargin`) —
 * past the paper's edge included, which lies past the margin too: the one
 * thing said of a placement (Zach, 2026-10-12). Steps are listed as every
 * Diagram notice lists them (`formatStepNumbers`); one step or several by
 * how many, as `zoomSplitLabels.ts` decides it.
 *
 * Literal `t()` calls, so the extractor sees each key.
 */
import type { TFunction } from 'i18next';
import { formatStepNumbers } from '../stepNumberList';

/** The tag on such a step: over its box in the Pages view, and on its row in the Layers pane. */
export function outsideMarginTag(t: TFunction): string {
  return t('panels:diagram.placement.outsideMargin', 'Outside margin');
}

/** The Step pane's sentence about the selected step. */
export function outsideMarginNote(t: TFunction): string {
  return t('panels:diagram.placement.marginClash', 'Part of this step crosses the margin.');
}

/** The export notice's sentence about the steps placed past the margin, in `language`. */
export function outsideMarginSentence(numbers: readonly number[], t: TFunction, language: string): string {
  const steps = formatStepNumbers(numbers, language, t);
  return numbers.length === 1
    ? t('dialogs:diagramExport.marginStep', 'Part of step {{steps}} crosses the margin.', { steps })
    : t('dialogs:diagramExport.marginSteps', 'Parts of steps {{steps}} cross the margin.', { steps });
}
