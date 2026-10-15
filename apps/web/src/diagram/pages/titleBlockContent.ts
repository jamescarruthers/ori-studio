/**
 * What the first page's title block shows (`implementation-plans/
 * diagram-title-block.md`, sections 4 and 5): which step gives the finished
 * model, and which gives the crease pattern, from what the document sets
 * (`DiagramDocument.titleBlockContent`).
 *
 * Each part is Auto, a step chosen, or none. Auto is the last step that can
 * give the part ({@link givesModel}, {@link givesPattern}), so turns, empty
 * steps, a newer build's locked steps and a link whose pattern draws no line
 * are passed over, and a diagram with no linked step has no pattern. A
 * chosen step that is gone — deleted, or now a newer build's — reads as
 * Auto; one that is there but can no longer give its part, its picture
 * removed or its link replaced, gives nothing, which the Pages view says. A
 * part only a newer build reads is not in the content here, so it is Auto
 * too.
 *
 * That a part unsaid is Auto is fixed for good; what Auto finds is a look
 * (`diagram-document-evolution.md`, class (b)): a change to it moves no step,
 * though it changes the picture a saved block shows.
 *
 * The pattern is drawn from its step's stored thumbnail, as a scene for the
 * shared painter ({@link patternScene}); the model in front of it, or in
 * the pattern's place where none is drawn ({@link modelRoom}). The words
 * the block prints of its own are read here too ({@link titleBlockLook}).
 * What prints nothing where it would show, the Pages view marks
 * ({@link missingTitleBlockParts}). Pure.
 */
import type { SheetStrokeRole, SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import type { PaperLineItem, PaperLineRole, PaperScene } from '../../lib/paper/paperScene';
import type { PageBox } from './pagePlacement';
import type { LayoutTitleBlock, TitleBlockLook } from './titleBlockColumn';
import type { TitleBlockGeometry } from './titleBlockGeometry';
import {
  isLockedStep,
  stepById,
  stepNumbers,
  stepsOf,
  titleBlockArtSizes,
  titleBlockStepCount,
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
  /** That step's number, as the pages print it (`stepNumbers`); null with no step. */
  number: number | null;
}

/** What the title block shows. */
export interface ResolvedTitleBlock {
  /** The step whose picture is the finished model. */
  model: TitleBlockPart;
  /**
   * The step whose link gives the crease pattern, and the pattern as the
   * painter draws it: its stored thumbnail's lines ({@link patternScene}),
   * null where it gives none or has no line to draw.
   */
  pattern: TitleBlockPart & { scene: PaperScene | null };
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
  const numbers = stepNumbers(document);
  const model = resolvePart(document, numbers, content?.model, autoModelStep);
  const pattern = resolvePart(document, numbers, content?.pattern, autoPatternStep);
  const scene = pattern.step && givesPattern(pattern.step) ? patternScene(pattern.step.source.thumbnail) : null;
  return { model, pattern: { ...pattern, scene } };
}

function resolvePart(
  document: DiagramDocument,
  numbers: ReadonlyMap<string, number>,
  source: DiagramTitleBlockSource | undefined,
  auto: (document: DiagramDocument) => DiagramStep | null
): TitleBlockPart {
  const part = (from: TitleBlockPartFrom, step: DiagramStep | null): TitleBlockPart => ({
    from,
    step,
    number: step ? (numbers.get(step.id) ?? null) : null,
  });
  if (source?.kind === 'none') return part('none', null);
  const chosen = source?.kind === 'step' ? stepById(document, source.stepId) : null;
  if (chosen && !isLockedStep(chosen)) return part('step', chosen);
  return part('auto', auto(document));
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

/**
 * What the block prints of its own, as it prints it (`titleBlockColumn.ts`):
 * the subtitle and the credits' labels in capitals, each credit's value — the
 * live step count as the number the last numbered step prints — the note,
 * and the art's sizes. One answer for the layout and for the fonts it loads.
 */
export function titleBlockLook(document: DiagramDocument): TitleBlockLook {
  const content = document.titleBlockContent;
  const count = titleBlockStepCount(document);
  return {
    subtitle: printedCapitals(content?.subtitle ?? ''),
    credits: (content?.credits ?? []).map(({ label, value }) => ({
      label: printedCapitals(label),
      value: typeof value === 'string' ? value : String(count),
    })),
    note: content?.note ?? '',
    sizes: titleBlockArtSizes(content),
  };
}

/** Upper case as the page prints it, the same on every machine: Unicode's own mapping, not the reader's locale; CJK unchanged. */
function printedCapitals(text: string): string {
  return text.toUpperCase();
}

/**
 * Where the block's model stands: in front of the pattern's lower left, or
 * at its own size in the pattern's place, on the band's right, where no
 * pattern is drawn — its foot on the band's either way.
 */
export function modelRoom(geometry: TitleBlockGeometry, content: ResolvedTitleBlock): PageBox {
  if (content.pattern.scene) return geometry.model;
  const { block, model } = geometry;
  return { ...model, x: block.x + block.w - model.w };
}

/** A part of the title block that prints nothing where it would show, and why. */
export interface MissingTitleBlockPart {
  /** The title, the pattern or the model; a credit's value; the credits' or the note's end, cut for want of room. */
  part: 'title' | 'pattern' | 'model' | 'value' | 'credits' | 'note';
  /** The step that cannot give it; null where Auto finds none, and for the rest. */
  step: DiagramStep | null;
  /** That step's number, as the pages print it. */
  number: number | null;
  /** A credit's label, as printed, for its value. */
  label?: string;
}

/** A room of the block where what would print there prints nothing ({@link missingTitleBlockParts}). */
export interface TitleBlockPlaceholder {
  /**
   * The title's band; the pattern's square — the model's room too where no
   * pattern is drawn; the model's box; a credit with no value; and where the
   * column is cut.
   */
  room: 'title' | 'square' | 'model' | 'credit' | 'cut';
  /** One for each mark: a credit's is its place among the marked credits. */
  key: string;
  /** Where it is marked: the room, or for the square, what a model drawn in it leaves free ({@link squareMark}). */
  box: PageBox;
  /** What prints nothing there, in the order it would be drawn. */
  missing: MissingTitleBlockPart[];
}

/** The least room across, in mm, a mark's words are set in: two or three lines of them on the Pages view. */
const MARK_ROOM_MM = 10;
/** A capital's height and a descender's depth, as shares of the size: a printed line's box, for a mark. */
const CAPITAL = 0.72;
const DESCENDER = 0.24;

/**
 * What of the block prints nothing where it would show, room by room: the
 * title where the diagram has none; each credit with no value, where the
 * column has room to show it; where the credits or the note are cut; the
 * pattern and the model where they are Auto or a step, and no step gives
 * them — a part set to none is the author's, and is not missing, nor is an
 * empty note. The pattern and a model with no pattern in front of it would
 * print in one square, which is one room; so no two rooms overlap.
 * `drawnModel` is where the model is drawn, null where it is not
 * (`wholePictureRoom`), which the square's mark keeps clear of. For the
 * Pages view's overlay, never the page.
 */
export function missingTitleBlockParts(
  block: LayoutTitleBlock,
  content: ResolvedTitleBlock,
  drawnModel: PageBox | null
): TitleBlockPlaceholder[] {
  const { geometry } = block;
  const { model, pattern } = content;
  const missing = ({ step, number }: TitleBlockPart, part: MissingTitleBlockPart['part']) => ({ part, step, number });
  const square: MissingTitleBlockPart[] = [];
  const front: MissingTitleBlockPart[] = [];
  if (pattern.from !== 'none' && !pattern.scene) square.push(missing(pattern, 'pattern'));
  if (model.from !== 'none' && !model.step?.picture) (pattern.scene ? front : square).push(missing(model, 'model'));
  const unset = { step: null, number: null };
  const cut = cutMark(block);
  return [
    ...(block.title ? [] : [{ room: 'title' as const, key: 'title', box: block.band, missing: [{ part: 'title' as const, ...unset }] }]),
    ...block.emptyCredits.map(({ label, box }, index) => ({
      room: 'credit' as const,
      key: `credit-${index}`,
      box,
      missing: [{ part: 'value' as const, ...unset, label }],
    })),
    ...(cut ? [cut] : []),
    ...(square.length > 0 ? [{ room: 'square' as const, key: 'square', box: squareMark(block, drawnModel, cut), missing: square }] : []),
    ...(front.length > 0 ? [{ room: 'model' as const, key: 'model', box: geometry.model, missing: front }] : []),
  ];
}

/**
 * Where the column is cut: after the last thing printed on the last line of
 * what is cut short — the note's last line, or the last row of credits and
 * the credits marked on it — to the column's end; or, where none of it
 * printed, the column's room under the band.
 */
function cutMark(block: LayoutTitleBlock): TitleBlockPlaceholder | null {
  const { column } = block.geometry;
  const { note, credits, band, emptyCredits } = block;
  const missing: MissingTitleBlockPart[] = [];
  if (credits && credits.cut > 0) missing.push({ part: 'credits', step: null, number: null });
  if (note?.cut) missing.push({ part: 'note', step: null, number: null });
  if (missing.length === 0) return null;
  const foot = column.y + column.h;
  const lastLine = note?.lines.at(-1);
  const lastRow = credits?.columns.at(-1);
  const line = (() => {
    if (note && lastLine) {
      const baseline = note.firstBaseline + (note.lines.length - 1) * note.leadingMm;
      return { x: column.x + lastLine.widthMm, top: baseline - CAPITAL * note.sizeMm, foot: baseline + DESCENDER * note.sizeMm };
    }
    if (lastRow && credits) {
      const onRow = [...credits.columns, ...emptyCredits.map(({ box }) => ({ ...box, top: box.y }))].filter(({ top }) => top === lastRow.top);
      return { x: Math.max(...onRow.map(({ x, w }) => x + w)), top: lastRow.top, foot: lastRow.valueBaseline + DESCENDER * credits.valueSizeMm };
    }
    return { x: column.x, top: band.y + band.h, foot };
  })();
  const x = Math.min(line.x + (line.x > column.x ? CUT_GAP_MM : 0), column.x + column.w);
  return {
    room: 'cut',
    key: 'cut',
    box: { x, y: line.top, w: column.x + column.w - x, h: Math.max(0, Math.min(foot, line.foot) - line.top) },
    missing,
  };
}

/** What a cut's mark keeps clear of the last thing printed before it. */
const CUT_GAP_MM = 1;

/**
 * Where the pattern's square is marked, clear of a model drawn in it
 * (`inSquare`): the square, less the model — the strip it leaves above
 * itself or beside itself, whichever is larger — or, where it leaves no room
 * for words, the column under all it prints and marks; the square itself
 * where neither has room.
 */
function squareMark(block: LayoutTitleBlock, inSquare: PageBox | null, cut: TitleBlockPlaceholder | null): PageBox {
  const { pattern: square, column } = block.geometry;
  if (!inSquare) return square;
  const above = { ...square, h: Math.max(0, inSquare.y - square.y) };
  const beside = { ...square, w: Math.max(0, inSquare.x - square.x) };
  const strip = above.w * above.h >= beside.w * beside.h ? above : beside;
  if (Math.min(strip.w, strip.h) >= MARK_ROOM_MM) return strip;
  const top = Math.max(columnFoot(block), cut ? cut.box.y + cut.box.h : Number.NEGATIVE_INFINITY);
  const under = { x: column.x, y: top, w: column.w, h: column.y + column.h - top };
  return Math.min(under.w, under.h) >= MARK_ROOM_MM ? under : square;
}

/** How far down the column what it prints and marks reaches: the band, the credits, the marked credits and the note. */
function columnFoot(block: LayoutTitleBlock): number {
  const { band, credits, note, emptyCredits } = block;
  const feet = [band.y + band.h];
  const lastRow = credits?.columns.at(-1);
  if (lastRow && credits) feet.push(lastRow.valueBaseline + DESCENDER * credits.valueSizeMm);
  for (const { box } of emptyCredits) feet.push(box.y + box.h);
  if (note && note.lines.length > 0) feet.push(note.firstBaseline + (note.lines.length - 1) * note.leadingMm + DESCENDER * note.sizeMm);
  return Math.max(...feet);
}

