/**
 * What the first page's title block shows (`implementation-plans/
 * diagram-title-block.md`, sections 4 and 5): which step gives the finished
 * model, and which gives the crease pattern, from what the document sets
 * (`DiagramDocument.titleBlockContent`).
 *
 * Each part is Auto, a step chosen, or none. Auto is the last step that can
 * give the part ({@link givesModel}, {@link givesPattern}), so turns, empty
 * steps and a newer build's locked steps are passed over, and a diagram with
 * no linked step has no pattern. A chosen step that is gone — deleted, or
 * now a newer build's — reads as Auto; one that is there but can no longer
 * give its part, its picture removed or its link replaced, gives nothing,
 * which the Pages view says. A part only a newer build reads is not in the
 * content here, so it is Auto too.
 *
 * That a part unsaid is Auto is fixed for good; what Auto finds is a look
 * (`diagram-document-evolution.md`, class (b)): a change to it moves no step,
 * though it changes the picture a saved block shows. Pure.
 */
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import {
  isLockedStep,
  stepById,
  stepsOf,
  type DiagramCpSource,
  type DiagramDocument,
  type DiagramStep,
  type DiagramTitleBlockSource,
} from '../document/diagramDocument';

/** Where a part of the title block comes from: Auto, the step chosen, or none. */
export type TitleBlockPartFrom = 'auto' | 'step' | 'none';

/** The step a part of the title block comes from. */
export interface TitleBlockPart {
  from: TitleBlockPartFrom;
  /** Auto's find or the step chosen; null for none, and where Auto finds no step. */
  step: DiagramStep | null;
}

/** What the title block shows. */
export interface ResolvedTitleBlock {
  /** The step whose picture is the finished model. */
  model: TitleBlockPart;
  /** The step whose link gives the crease pattern, and the pattern's lines: its stored thumbnail, null where it gives none. */
  pattern: TitleBlockPart & { thumbnail: SheetThumbnail | null };
}

/** Whether a step can give the block's model: one of this build's, with a picture. */
export function givesModel(step: DiagramStep): boolean {
  return !isLockedStep(step) && step.picture !== null;
}

/** Whether a step can give the block's crease pattern: one of this build's linked to a crease pattern, whatever it is shown as. */
export function givesPattern(step: DiagramStep): step is DiagramStep & { source: DiagramCpSource } {
  return !isLockedStep(step) && step.source?.kind === 'cp';
}

/** The step Auto finds for the model: the last that can give it; null where none can. */
export function autoModelStep(document: DiagramDocument): DiagramStep | null {
  return lastStep(document, givesModel);
}

/** The step Auto finds for the crease pattern: the last linked to one; null where no step is. */
export function autoPatternStep(document: DiagramDocument): DiagramStep | null {
  return lastStep(document, givesPattern);
}

function lastStep(document: DiagramDocument, gives: (step: DiagramStep) => boolean): DiagramStep | null {
  const steps = stepsOf(document);
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (gives(steps[index]!)) return steps[index]!;
  }
  return null;
}

/** What the first page's title block shows: each part's step, and the pattern's lines. */
export function resolveTitleBlock(document: DiagramDocument): ResolvedTitleBlock {
  const content = document.titleBlockContent;
  const model = resolvePart(document, content?.model, autoModelStep);
  const pattern = resolvePart(document, content?.pattern, autoPatternStep);
  const thumbnail = pattern.step && givesPattern(pattern.step) ? pattern.step.source.thumbnail : null;
  return { model, pattern: { ...pattern, thumbnail } };
}

function resolvePart(
  document: DiagramDocument,
  source: DiagramTitleBlockSource | undefined,
  auto: (document: DiagramDocument) => DiagramStep | null
): TitleBlockPart {
  if (source?.kind === 'none') return { from: 'none', step: null };
  const chosen = source?.kind === 'step' ? stepById(document, source.stepId) : null;
  if (chosen && !isLockedStep(chosen)) return { from: 'step', step: chosen };
  return { from: 'auto', step: auto(document) };
}
