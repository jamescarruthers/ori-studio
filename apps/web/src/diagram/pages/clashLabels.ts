/**
 * What the Pages view and the export dialog say about a placement's clashes
 * (`ClashGroup`): parts that overlap, a step past the paper's edge or past
 * the margin, and the ribbon doubling back, each in words of its own, so a
 * path warning never reads as an overlap, nor the paper's edge as the
 * margin. Steps are listed as every Diagram notice lists them
 * (`formatStepNumbers`); one step or several by how many, as
 * `zoomSplitLabels.ts` decides it.
 *
 * Literal `t()` calls, so the extractor sees each key.
 */
import type { TFunction } from 'i18next';
import { formatStepNumbers } from '../stepNumberList';
import type { ClashGroup } from './pagePlacement';

/** The tag over a clashing step on the Pages view: its most pressing clash (`cellClashGroup`). */
export function clashTag(group: ClashGroup, t: TFunction): string {
  switch (group) {
    case 'overlap':
      return t('panels:diagram.placement.overlaps', 'Overlaps');
    case 'paper':
      return t('panels:diagram.placement.outsidePaper', 'Off the paper');
    case 'margin':
      return t('panels:diagram.placement.outsideMargin', 'Outside margin');
    case 'path':
      return t('panels:diagram.placement.pathWarning', 'Path doubles back');
  }
}

/** The export notice's sentence about the steps with clashes of one group, in `language`. */
export function clashSentence(group: ClashGroup, numbers: readonly number[], t: TFunction, language: string): string {
  const steps = formatStepNumbers(numbers, language, t);
  const one = numbers.length === 1;
  switch (group) {
    case 'overlap':
      return one
        ? t('dialogs:diagramExport.overlapStep', 'Step {{steps}} is placed over another step, a symbol, or its own parts.', { steps })
        : t('dialogs:diagramExport.overlapSteps', 'Steps {{steps}} are placed over other steps, symbols, or their own parts.', {
            steps,
          });
    case 'paper':
      return one
        ? t('dialogs:diagramExport.paperStep', 'Part of step {{steps}} is off the paper.', { steps })
        : t('dialogs:diagramExport.paperSteps', 'Parts of steps {{steps}} are off the paper.', { steps });
    case 'margin':
      return one
        ? t('dialogs:diagramExport.marginStep', 'Part of step {{steps}} crosses the margin.', { steps })
        : t('dialogs:diagramExport.marginSteps', 'Parts of steps {{steps}} cross the margin.', { steps });
    case 'path':
      return one
        ? t('dialogs:diagramExport.pathStep', 'Where step {{steps}} is placed, the path doubles back or crosses itself.', {
            steps,
          })
        : t('dialogs:diagramExport.pathSteps', 'Where steps {{steps}} are placed, the path doubles back or crosses itself.', {
            steps,
          });
  }
}
