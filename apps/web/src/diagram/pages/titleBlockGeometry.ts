/**
 * Where the first page's title block goes, and its art (`implementation-plans/
 * diagram-title-block.md`, sections 2 and 3, and Phase 1c), in mm from the
 * page's top left.
 *
 * Two answers, kept apart. The band ({@link titleBlockBand}) is layout: a
 * band across the top of the first page, from margin to margin, as tall as
 * the page setup says (`DiagramPageSetup.titleBlock`) — in the flow, its
 * share of the printable height; on a grid, the whole rows nearest that share
 * ({@link blockRows}) and the header's room above them, so that every page
 * keeps one cell. The first page's steps start under it, and nothing else
 * here moves them.
 *
 * The parts ({@link titleBlockParts}) are look, which may change for every
 * file: the crease pattern a square at the band's top right, the finished
 * model standing in front of its lower left on the band's foot, each as
 * large as the content's sizes say, and the text column from the left margin
 * to the art's left edge (`titleBlockColumn.ts` sets it). They read the band
 * and the sizes, never what the block shows, so choosing another model or
 * none reflows nothing. The same on a left page and a right one.
 *
 * Pure.
 */
import type { DiagramPageSetup } from '../document/diagramDocument';
import type { PageBox } from './pagePlacement';
import { blockRows, hasTitleBlock } from './pagePlan';
import { printPaper } from './printPaper';

/** Neither the crease pattern's square nor the model's box is wider than this share of the band: a grid of two rows gives the band half the page. */
const ART_WIDTH_SHARE = 0.45;
/** The model's box: at most this many times as wide as tall (J1b's crane is 1.1), its right edge this share across the pattern. */
const MODEL_ASPECT = 1.1;
const MODEL_RIGHT_SHARE = 0.6;

/** The band: layout, read from the page setup alone. */
export interface TitleBlockBand {
  /** From margin to margin and down from the top margin. */
  block: PageBox;
  /** How many of a grid's rows it takes; none in the flow. */
  rows: number;
}

/** The model's height and the pattern's side, each a share of the band's height (`titleBlockArtSizes`). */
export interface TitleBlockSizes {
  modelSize: number;
  patternSize: number;
}

/** The band and the parts in it. */
export interface TitleBlockGeometry extends TitleBlockBand {
  /** The crease pattern's square, at the band's top right. */
  pattern: PageBox;
  /** The model's box, in front of the pattern's lower left, its foot on the band's. */
  model: PageBox;
  /** The text column: from the left margin to the art's left edge, as tall as the band. */
  column: PageBox;
}

/**
 * The first page's title block band under `setup`, with the header and
 * footer the layout keeps on every page (`headMm`, `footMm`), which a grid's
 * rows are cut under; null where the page has none ({@link hasTitleBlock}).
 */
export function titleBlockBand(setup: DiagramPageSetup, headMm: number, footMm: number): TitleBlockBand | null {
  if (!hasTitleBlock(setup)) return null;
  const { widthMm: W, heightMm: H, marginMm: m } = printPaper(setup);
  const rows = setup.layout === 'flow' ? 0 : blockRows(setup);
  const printable = H - 2 * m;
  const height =
    setup.layout === 'flow'
      ? setup.titleBlock.heightShare * printable
      : headMm + (rows * (printable - headMm - footMm)) / setup.rows;
  return { block: { x: m, y: m, w: W - 2 * m, h: height }, rows };
}

/**
 * The parts of a band at `sizes`: the pattern's square, `patternSize` of the
 * band's height on a side, its top on the band's and its right on the
 * margin; the model's box, `modelSize` of the band's height tall and at most
 * {@link MODEL_ASPECT} as wide, its foot on the band's and its right edge
 * {@link MODEL_RIGHT_SHARE} across the pattern; and the text column to the
 * left of both.
 */
export function titleBlockParts(band: TitleBlockBand, sizes: TitleBlockSizes): TitleBlockGeometry {
  const { block } = band;
  const foot = block.y + block.h;
  const widest = block.w * ART_WIDTH_SHARE;
  const side = Math.min(sizes.patternSize * block.h, widest);
  const pattern = { x: block.x + block.w - side, y: block.y, w: side, h: side };
  const modelH = sizes.modelSize * block.h;
  const modelRight = pattern.x + side * MODEL_RIGHT_SHARE;
  const modelLeft = Math.max(block.x, modelRight - Math.min(modelH * MODEL_ASPECT, widest));
  const model = { x: modelLeft, y: foot - modelH, w: modelRight - modelLeft, h: modelH };
  const artLeft = Math.min(model.x, pattern.x);
  const column = { x: block.x, y: block.y, w: Math.max(0, artLeft - block.x), h: block.h };
  return { ...band, pattern, model, column };
}

/** The band and its parts at once: {@link titleBlockBand}, then {@link titleBlockParts}. */
export function titleBlockGeometry(setup: DiagramPageSetup, headMm: number, footMm: number, sizes: TitleBlockSizes): TitleBlockGeometry | null {
  const band = titleBlockBand(setup, headMm, footMm);
  return band ? titleBlockParts(band, sizes) : null;
}
