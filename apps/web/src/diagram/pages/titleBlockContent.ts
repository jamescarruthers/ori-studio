/**
 * What the first page's title block shows (`implementation-plans/
 * diagram-title-block.md`, sections 4 and 5): which step gives the finished
 * model, and which gives the crease pattern, from what the document sets
 * (`DiagramDocument.titleBlockContent`).
 *
 * Each part is Auto, a step chosen, or none. Auto is the last step that can
 * give the part ({@link givesModel}, {@link givesPattern}), so turns, empty
 * steps, a newer build's locked steps and a link whose pattern draws no line
 * are passed over, and a diagram with no linked step has no pattern. A chosen step that is gone — deleted, or
 * now a newer build's — reads as Auto; one that is there but can no longer
 * give its part, its picture removed or its link replaced, gives nothing,
 * which the Pages view says. A part only a newer build reads is not in the
 * content here, so it is Auto too.
 *
 * That a part unsaid is Auto is fixed for good; what Auto finds is a look
 * (`diagram-document-evolution.md`, class (b)): a change to it moves no step,
 * though it changes the picture a saved block shows.
 *
 * The pattern is drawn from its step's stored thumbnail, as a scene for the
 * shared painter ({@link patternScene}); the model in front of it, or over
 * the pattern's square too where none is drawn ({@link modelRoom}). What
 * prints nothing where it would show, the Pages view marks
 * ({@link missingTitleBlockParts}). Pure.
 */
import type { SheetStrokeRole, SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import type { PaperLineItem, PaperLineRole, PaperScene } from '../../lib/paper/paperScene';
import type { PageBox } from './pagePlacement';
import type { LayoutTitleBlock, TitleBlockGeometry } from './titleBlockGeometry';
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
  /**
   * The step whose link gives the crease pattern, and the pattern's lines:
   * its stored thumbnail, null where it gives none, and that as the painter
   * draws it ({@link patternScene}), null where it has no line to draw.
   */
  pattern: TitleBlockPart & { thumbnail: SheetThumbnail | null; scene: PaperScene | null };
}

/** Whether a step can give the block's model: one of this build's, with a picture. */
export function givesModel(step: DiagramStep): boolean {
  return !isLockedStep(step) && step.picture !== null;
}

/**
 * Whether a step can give the block's crease pattern: one of this build's
 * linked to a crease pattern, whatever it is shown as, whose stored lines
 * draw something ({@link drawsPattern}).
 */
export function givesPattern(step: DiagramStep): step is DiagramStep & { source: DiagramCpSource } {
  return !isLockedStep(step) && step.source?.kind === 'cp' && drawsPattern(step.source.thumbnail);
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
  return { model, pattern: { ...pattern, thumbnail, scene: thumbnail ? patternScene(thumbnail) : null } };
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

/**
 * The pen each of a thumbnail's lines is drawn in (T-14 A): the pattern's
 * own — its folds in the fold pens, solid, its edge in the edge pen, a crease
 * with no direction yet in the aux pen where the style shows aux lines — and
 * an aux line not at all.
 */
const PATTERN_ROLES: Readonly<Record<SheetStrokeRole, PaperLineRole | null>> = {
  edge: 'edge',
  mountain: 'mountain',
  valley: 'valley',
  unassigned: 'aux',
  aux: null,
};

/**
 * A stored thumbnail as a scene for the shared painter (`paperSceneSvgBody`):
 * its lines in their roles, in its own units, its bounds its box. No paper is
 * filled, so the pattern sits on the page and the model in front covers it
 * with its own. Null where it has no line to draw.
 */
export function patternScene(thumbnail: SheetThumbnail): PaperScene | null {
  const box = thumbnailBox(thumbnail);
  const items = thumbnail.strokes.flatMap((stroke): PaperLineItem[] => {
    const role = PATTERN_ROLES[stroke.role];
    return role
      ? [{ kind: 'line', role, a: [stroke.x1, stroke.y1], b: [stroke.x2, stroke.y2], onBoundary: [false, false], hidden: false }]
      : [];
  });
  if (!box || items.length === 0) return null;
  const { minX, minY, width, height } = box;
  return { bounds: { minX, minY, maxX: minX + width, maxY: minY + height }, sheet: Math.max(width, height), items };
}

/**
 * Whether a thumbnail has a line the block draws, as {@link patternScene}
 * would: the one answer to "is there a pattern" for the page, the Pages
 * view's overlay and the Page pane's choices. A capture that found no line,
 * or only aux lines, has none.
 */
export function drawsPattern(thumbnail: SheetThumbnail): boolean {
  return thumbnailBox(thumbnail) !== null && thumbnail.strokes.some((stroke) => PATTERN_ROLES[stroke.role] !== null);
}

/** A thumbnail's view box, null where it has no size to fit. */
function thumbnailBox(thumbnail: SheetThumbnail): { minX: number; minY: number; width: number; height: number } | null {
  const [minX = 0, minY = 0, width = 0, height = 0] = thumbnail.viewBox.trim().split(/[\s,]+/).map(Number);
  const sheet = Math.max(width, height);
  return sheet > 0 && Number.isFinite(sheet) ? { minX, minY, width, height } : null;
}

/** Where the block's model stands: in front of the pattern's lower left, or over the whole art where no pattern is drawn. */
export function modelRoom(geometry: TitleBlockGeometry, content: ResolvedTitleBlock): PageBox {
  return content.pattern.scene ? geometry.model : geometry.art;
}

/** A part of the title block that prints nothing where it would show ({@link missingTitleBlockParts}). */
export interface MissingTitleBlockPart {
  part: 'title' | 'pattern' | 'model';
  /** Where it would print. */
  box: PageBox;
  /** The step it comes from, which cannot give it; null where Auto finds none, and for the title. */
  step: DiagramStep | null;
}

/**
 * What of the block prints nothing where it would show: the title where the
 * diagram has none; the pattern and the model where they are Auto or a step,
 * and no step gives them — a part set to none is the author's, and is not
 * missing. For the Pages view's overlay, never the page.
 */
export function missingTitleBlockParts(block: LayoutTitleBlock, content: ResolvedTitleBlock): MissingTitleBlockPart[] {
  const { geometry } = block;
  const { model, pattern } = content;
  const missing: MissingTitleBlockPart[] = [];
  if (!block.title) missing.push({ part: 'title', box: geometry.title, step: null });
  if (pattern.from !== 'none' && !pattern.scene) missing.push({ part: 'pattern', box: geometry.pattern, step: pattern.step });
  if (model.from !== 'none' && !model.step?.picture) missing.push({ part: 'model', box: modelRoom(geometry, content), step: model.step });
  return missing;
}
