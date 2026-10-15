/**
 * Where the first page's title block goes, and each part of it
 * (`implementation-plans/diagram-title-block.md`, sections 2 and 3), in mm
 * from the page's top left; and its title and byline, set.
 *
 * The block is a band across the top of the first page, from margin to
 * margin. How tall it is, is layout, read from the page setup alone
 * (`DiagramPageSetup.titleBlock`): in the flow, its share of the printable
 * height; on a grid, the whole rows nearest that share ({@link blockRows})
 * and the header's room above them, so that every page keeps one cell. The
 * first page's steps start under it.
 *
 * What is inside it is look, which may change for every file, since no step
 * moves when it does: the crease pattern a square at its right as tall as
 * the block, the finished model standing in front of the pattern's lower
 * left, and down the left the title, then the byline. The same on a left
 * page and a right one.
 *
 * Pure.
 */
import type { DiagramPageSetup } from '../document/diagramDocument';
import type { SetLine, TextSetter } from './diagramPageLayout';
import type { PageBox } from './pagePlacement';
import { blockRows, hasTitleBlock } from './pagePlan';
import { printPaper } from './printPaper';
import { STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM, TEXT_DESCENT_MM } from './stepType';

/** The crease pattern's square is as tall as the block, but never wider than this share of it: a grid of two rows gives the block half the page. */
const PATTERN_WIDTH_SHARE = 0.45;
/** The model's box: this share of the pattern's side tall, at most this many times as wide as tall, its right edge this share across the pattern. */
const MODEL_HEIGHT_SHARE = 0.75;
const MODEL_ASPECT = 1.25;
const MODEL_RIGHT_SHARE = 0.6;
/** What the title and the byline keep clear of the art beside them. */
const TEXT_CLEAR_MM = 4;
/** The title: one bold line, the largest size up to `max` that fits its column, down to `min`, and past that cut with "…". */
export const TITLE_BLOCK_TITLE_MM = { max: 10, min: 5 } as const;
/** How far the byline's capitals stand above its first baseline, as a share of its size. */
const CAP_SHARE = 0.72;
/** The room between the largest title's line and the byline's. */
const BYLINE_GAP_MM = 1.5;
/** The byline: the step text's size and leading, on up to this many lines. */
export const TITLE_BLOCK_BYLINE_LINES = 4;

export interface TitleBlockGeometry {
  /** The band, from margin to margin and down from the top margin. */
  block: PageBox;
  /** How many of a grid's rows it takes; none in the flow. */
  rows: number;
  /**
   * Where the title goes: from the block's top, as tall as the largest title,
   * as wide as its column to the art — the pattern, or the model's box where
   * that reaches up beside the title.
   */
  title: PageBox;
  /** Where the byline goes: under the title, as tall as its lines, as wide as its column to the model's box. */
  byline: PageBox;
  /** The crease pattern's square, at the block's right, its foot on the block's: the model's too where no pattern is drawn. */
  pattern: PageBox;
  /** The model's box, in front of the pattern's lower left, its foot on the block's. */
  model: PageBox;
}

/**
 * The first page's title block under `setup`, with the header and footer the
 * layout keeps on every page (`headMm`, `footMm`), which a grid's rows are
 * cut under; null where the page has none ({@link hasTitleBlock}).
 */
export function titleBlockGeometry(setup: DiagramPageSetup, headMm: number, footMm: number): TitleBlockGeometry | null {
  if (!hasTitleBlock(setup)) return null;
  const { widthMm: W, heightMm: H, marginMm: m } = printPaper(setup);
  const rows = setup.layout === 'flow' ? 0 : blockRows(setup);
  const printable = H - 2 * m;
  const height =
    setup.layout === 'flow'
      ? setup.titleBlock.heightShare * printable
      : headMm + (rows * (printable - headMm - footMm)) / setup.rows;
  const block = { x: m, y: m, w: W - 2 * m, h: height };
  const foot = block.y + block.h;
  const side = Math.min(block.h, block.w * PATTERN_WIDTH_SHARE);
  const pattern = { x: block.x + block.w - side, y: foot - side, w: side, h: side };
  const modelH = side * MODEL_HEIGHT_SHARE;
  const modelRight = pattern.x + side * MODEL_RIGHT_SHARE;
  const modelLeft = Math.max(block.x, modelRight - modelH * MODEL_ASPECT);
  const model = { x: modelLeft, y: foot - modelH, w: modelRight - modelLeft, h: modelH };
  const titleH = TITLE_BLOCK_TITLE_MM.max;
  const titleEnd = model.y < block.y + titleH ? model.x : pattern.x;
  const title = { x: block.x, y: block.y, w: Math.max(0, titleEnd - TEXT_CLEAR_MM - block.x), h: titleH };
  const bylineTop = title.y + title.h + BYLINE_GAP_MM;
  const byline = {
    x: block.x,
    y: bylineTop,
    w: Math.max(0, model.x - TEXT_CLEAR_MM - block.x),
    // Its lines, as far as the block has room for them.
    h: Math.max(0, Math.min(STEP_TEXT_SIZE_MM + (TITLE_BLOCK_BYLINE_LINES - 1) * STEP_TEXT_LEADING_MM + TEXT_DESCENT_MM, foot - bylineTop)),
  };
  return { block, rows, title, byline, pattern, model };
}

/** The words the pages print of their own: the diagram's title (`DiagramDocument.title`), and the title block's byline. */
export interface DiagramTitles {
  title: string;
  byline: string;
}

/** The title block as the first page prints it: where each part goes, and its title and byline set. */
export interface LayoutTitleBlock {
  geometry: TitleBlockGeometry;
  /** The title, one bold line at `sizeMm`, its baseline `baseline` mm down the page; null with no title. */
  title: { line: SetLine; sizeMm: number; baseline: number } | null;
  /** The byline's lines, at the step text's size, the first's baseline `firstBaseline` mm down the page; null with none. */
  byline: { lines: SetLine[]; firstBaseline: number } | null;
}

/**
 * The block's title and byline, set by the layout's setter: the title on one
 * bold line, as large as its ink fits its row within
 * {@link TITLE_BLOCK_TITLE_MM} — across, and from its tallest letter's top,
 * which stands on the block's (a capital's, an accent's, an ideograph's), to
 * its lowest letter's foot — and cut with "…" at its least size; the byline
 * in the step text's weight and size, its author's line breaks kept, on as many of
 * {@link TITLE_BLOCK_BYLINE_LINES} as the block has room for, the last cut
 * with "…". Text the block has no room for at all is not set. An empty
 * title or byline sets nothing, and the block keeps its room.
 */
export function setTitleBlock(geometry: TitleBlockGeometry, titles: DiagramTitles, setter: TextSetter): LayoutTitleBlock {
  return { geometry, title: setTitle(geometry, titles.title.trim(), setter), byline: setByline(geometry, titles.byline.trim(), setter) };
}

function setTitle(geometry: TitleBlockGeometry, title: string, setter: TextSetter): LayoutTitleBlock['title'] {
  const room = geometry.title;
  if (title === '' || !(room.w > 0)) return null;
  const { max, min } = TITLE_BLOCK_TITLE_MM;
  const whole = setter.line(title, max, 700);
  const { above, below } = setter.ink(whole, max);
  // A width and an ink's height are each proportional to the size, so the size that fits both is read off them at
  // the largest; to a hundredth of a mm, down.
  const across = whole.widthMm > 0 ? (max * room.w) / whole.widthMm : max;
  const down = above + below > 0 ? (max * room.h) / (above + below) : max;
  const sizeMm = Math.max(min, Math.min(max, Math.floor(Math.min(across, down) * 100) / 100));
  const line = setter.line(title, sizeMm, 700, room.w);
  return { line, sizeMm, baseline: room.y + setter.ink(line, sizeMm).above };
}

function setByline(geometry: TitleBlockGeometry, byline: string, setter: TextSetter): LayoutTitleBlock['byline'] {
  const room = geometry.byline;
  if (byline === '' || !(room.w > 0)) return null;
  const firstBaseline = room.y + CAP_SHARE * STEP_TEXT_SIZE_MM;
  const lastBaseline = room.y + room.h - TEXT_DESCENT_MM;
  const maxLines = Math.min(TITLE_BLOCK_BYLINE_LINES, Math.floor((lastBaseline - firstBaseline) / STEP_TEXT_LEADING_MM + 1e-9) + 1);
  if (maxLines < 1) return null;
  const { lines } = setter.paragraph(byline, room.w, STEP_TEXT_SIZE_MM, maxLines);
  return lines.length > 0 ? { lines, firstBaseline } : null;
}
