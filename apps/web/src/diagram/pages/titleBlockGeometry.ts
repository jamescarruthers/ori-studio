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
 * model standing on its lower-left corner, each as large as the content's
 * sizes say ({@link fittedArtSizes}), and the text column from the left
 * margin to the art's left edge, a gutter clear of the pattern
 * (`titleBlockColumn.ts` sets it). They read the band and the sizes, never
 * what the block shows, so choosing another model or none reflows nothing.
 * The same on a left page and a right one.
 *
 * Pure.
 */
import type { DiagramPageSetup } from '../document/diagramDocument';
import type { PageBox } from './pagePlacement';
import { blockRows, hasTitleBlock } from './pagePlan';
import { printPaper } from './printPaper';
import { TITLE_BLOCK_TYPE } from './titleBlockColumn';

/** Neither the crease pattern's square nor the model's box is wider than this share of the band: a grid of two rows gives the band half the page. */
const ART_WIDTH_SHARE = 0.45;
/** The model's box: at most this many times as wide as tall (J1b's crane is 1.1). */
const MODEL_ASPECT = 1.1;
/** Where the pattern's lower-left corner stands in the model's box, as shares of it from its top left: J1b's. */
const MODEL_ANCHOR: PictureAlign = { x: 0.27, y: 0.66 };
/**
 * How far inside the model's picture the pattern's corner stays at the least, as a share of the picture from each
 * side: the sizes that leave it less ({@link fittedArtSizes}) are not drawn, nor offered ({@link artSizeLimits}).
 */
export const MODEL_COVER = 0.2;
/** What the text column keeps clear of the crease pattern: J1b's credits' gutter, 12 pt. */
export const ART_GAP_MM = (12 * 25.4) / 72;
/** How far under the block's top J1b's band reaches, under its subtitle's row: what a model standing higher rises beside. */
const BAND_FOOT_MM = TITLE_BLOCK_TYPE.subtitleRowMm + TITLE_BLOCK_TYPE.bandMm;
/**
 * How far J1b's model rises beside the band, 3.9 pt, its box's corner there clear of the crane's ink: the band ends at
 * the box. A model that rises further has the band end that much further from it, up to {@link ART_GAP_MM}.
 */
const MODEL_RISE_MM = (3.9 * 25.4) / 72;

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

/** Where a picture stands in a box larger than it, as shares of the room it leaves: 0 at the box's left or top, 1 at its right or foot. */
export interface PictureAlign {
  x: number;
  y: number;
}

/** The band and the parts in it. */
export interface TitleBlockGeometry extends TitleBlockBand {
  /** The crease pattern's square, at the band's top right. */
  pattern: PageBox;
  /** The model's box, in front of the pattern, on its lower-left corner. */
  model: PageBox;
  /**
   * Where the pattern's lower-left corner stands in the model's box, as shares of it, and so where the model's
   * picture is set in its box: the corner stands at the same shares of the picture, whatever its shape.
   */
  modelAlign: PictureAlign;
  /** The text column: from the left margin to the model's box, or a gutter short of the pattern, as tall as the band. */
  column: PageBox;
  /**
   * The column's rows under the band — the credits and the note — which the model's box stands beside: as the
   * column, and a gutter short of the box too.
   */
  under: PageBox;
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
 * The parts of a band at `sizes`, as {@link fittedArtSizes} draws them: the
 * pattern's square, `patternSize` of the band's height on a side, its top on
 * the band's and its right on the margin; the model's box, `modelSize` of the
 * band's height tall and at most {@link MODEL_ASPECT} as wide, standing on
 * the pattern's lower-left corner — the corner {@link MODEL_ANCHOR} into it,
 * or as near that as keeps the box in the band; and the text column, to the
 * model's box or {@link ART_GAP_MM} short of the pattern, whichever is
 * nearer — short of the box too, by as far as the model rises beside the band
 * past J1b's ({@link MODEL_RISE_MM}), up to the same gutter.
 */
export function titleBlockParts(band: TitleBlockBand, sizes: TitleBlockSizes): TitleBlockGeometry {
  const { block } = band;
  const foot = block.y + block.h;
  const end = block.x + block.w;
  const widest = block.w * ART_WIDTH_SHARE;
  const { modelSize, patternSize } = fittedArtSizes(sizes);
  const side = Math.min(patternSize * block.h, widest);
  const pattern = { x: end - side, y: block.y, w: side, h: side };
  const corner = { x: pattern.x, y: pattern.y + side };
  const h = modelSize * block.h;
  const w = Math.min(h * MODEL_ASPECT, widest);
  const x = clamp(corner.x - MODEL_ANCHOR.x * w, block.x, end - w);
  const y = clamp(corner.y - MODEL_ANCHOR.y * h, block.y, foot - h);
  const model = { x, y, w, h };
  const modelAlign = { x: (corner.x - x) / w, y: (corner.y - y) / h };
  const rise = block.y + BAND_FOOT_MM - MODEL_RISE_MM - model.y;
  const columnEnd = Math.min(model.x - clamp(rise, 0, ART_GAP_MM), pattern.x - ART_GAP_MM);
  const column = { x: block.x, y: block.y, w: Math.max(0, columnEnd - block.x), h: block.h };
  const under = { ...column, w: Math.max(0, Math.min(columnEnd, model.x - ART_GAP_MM) - block.x) };
  return { ...band, pattern, model, modelAlign, column, under };
}

/**
 * The sizes as the block draws them: as said, unless the pattern is so tall
 * that the model, kept in the band, would leave its lower-left corner less
 * than {@link MODEL_COVER} of its height above its foot — then the pattern
 * is drawn as tall as leaves it that ({@link artSizeLimits}).
 */
export function fittedArtSizes(sizes: TitleBlockSizes): TitleBlockSizes {
  return { modelSize: sizes.modelSize, patternSize: Math.min(sizes.patternSize, artSizeLimits(sizes).patternSize) };
}

/**
 * The largest each size may be with the other as it is, so that the model
 * covers the pattern's lower-left corner: the pattern's foot at least
 * {@link MODEL_COVER} of the model's height above the band's.
 */
export function artSizeLimits(sizes: TitleBlockSizes): TitleBlockSizes {
  return {
    modelSize: Math.min(1, (1 - sizes.patternSize) / MODEL_COVER),
    patternSize: Math.min(1, 1 - MODEL_COVER * sizes.modelSize),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
