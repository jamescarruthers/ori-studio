/**
 * The title block's text column, set (`implementation-plans/
 * diagram-title-block.md`, Phase 1c: Zach's J1b), in mm from the page's top
 * left, down the column `titleBlockParts` leaves left of the art:
 *
 * - the subtitle, small, bold, upper case and tracked, its capitals' top on
 *   the block's, and a rule from after it to the column's end — none, and
 *   the band moves up, where there is no subtitle;
 * - the band, a rectangle the composer fills in the paper's colour, with the
 *   title in it, bold, as large as fits its width;
 * - the credits, a row of columns from the left margin, each a label over its
 *   value and as wide as the wider, with a divider in each gutter; a row
 *   wider than the band wraps to another. A credit with no value prints
 *   nothing and keeps no room, on the page or the Pages view (Zach,
 *   2026-10-15);
 * - the note (the Page pane's Description), plain text wrapped to the column,
 *   its spaces kept as typed — an indent, a run of spaces, a blank line —
 *   as a text editor's pre-wrap keeps them (Zach, 2026-10-15), cut with "…"
 *   where it would run past the block's foot.
 *
 * J1b's sizes are A4 portrait's. Where the block is shorter than the subtitle,
 * band and credits need, all of the column is set smaller by one scale, down
 * to {@link LEAST_SCALE}; what still has no room is not printed. Nothing here
 * changes the block, so nothing here moves a step.
 *
 * Pure.
 */
import { graphemesOf } from '../../lib/paper/textWrap';
import { wcagContrast } from '../../themes/paperBack';
import { TITLE_BLOCK_ART_SIZE_DEFAULTS } from '../document/pageRanges';
import type { SetLine, TextSetter } from './diagramPageLayout';
import type { PageBox } from './pagePlacement';
import { STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';
import type { TitleBlockGeometry, TitleBlockSizes } from './titleBlockGeometry';

/** A length in pt, in mm. */
const pt = (points: number) => (points * 25.4) / 72;

/** J1b's column on A4 portrait, mm: each size, and each room between parts. */
export const TITLE_BLOCK_TYPE = {
  subtitleMm: pt(7),
  /** A tracked line's room after each letter, as a share of its size. */
  tracking: 0.12,
  /** How far under the block's top the band starts, where there is a subtitle. */
  subtitleRowMm: pt(12.5),
  /** The room between the subtitle's last letter and its rule. */
  ruleGapMm: pt(6),
  bandMm: 22,
  titleMm: 16,
  titleInsetMm: 6,
  /** The credits' first labels' capitals under the band. */
  creditsGapMm: pt(13),
  labelMm: pt(7),
  valueMm: 4.2,
  /** A value's baseline under its label's. */
  valueDropMm: pt(15),
  /** Between two credits' columns, a divider in its middle: J1b's 12 pt, widened (Zach, 2026-10-15). */
  gutterMm: pt(20),
  /** A row's labels' capitals under the row before's values' baseline. */
  rowGapMm: pt(10),
  /** The note's first line's capitals under the last row's values' baseline: twice a row's gap (Zach, 2026-10-15). */
  noteGapMm: pt(20),
} as const;

/**
 * A capital's height, and a descender's depth, as shares of the size: the box of a printed line where no letter
 * reaches past it — what the column's rows are spaced by, and what the Pages view's marks are drawn round.
 */
export const CAP_HEIGHT = 0.714;
export const DESCENT = 0.24;
/**
 * The room between the subtitle's rule, at its capitals' middle, and the band's top — J1b's 10 pt — and so between
 * the band's end, and the rule's, and the crease pattern (Zach, 2026-10-15): one room, measured from the column's
 * own sizes, so that the two stay equal.
 */
export const HEADER_GAP_MM = TITLE_BLOCK_TYPE.subtitleRowMm - (CAP_HEIGHT * TITLE_BLOCK_TYPE.subtitleMm) / 2;
/** The least the title is set at, as a share of its size: past that it is cut with "…". */
const TITLE_LEAST = 0.3;
/** Under this share of its size on one line, the title is set on two, as large as they fit. */
const TITLE_ONE_LINE_LEAST = 0.5;
/** A two-line title's baselines apart, as a share of its size. */
const TITLE_LEADING = 1.1;
/** The least the column is scaled to, in the shortest block. */
export const LEAST_SCALE = 0.5;

/** A credit as the page prints it: its label as printed, and its value's text; a blank value prints nothing. */
export interface TitleBlockCreditText {
  label: string;
  value: string;
}

/** What the title block prints beside the title, as printed, and its art's sizes (`titleBlockLook`). */
export interface TitleBlockLook {
  subtitle: string;
  credits: readonly TitleBlockCreditText[];
  note: string;
  sizes: TitleBlockSizes;
}

/** The words the pages print of their own: the diagram's title (`DiagramDocument.title`), and the title block's. */
export interface DiagramTitles {
  title: string;
  /** None: the title alone, the art at the default sizes. */
  block?: TitleBlockLook;
  /**
   * The room the block's words stand in, mm: as measured at the author's last edit of them
   * (`DiagramTitleBlockContent.room`), held as the file says it; `'measure'` after an edit of them, measured by the
   * layout (`titleBlockTextMm`) and handed back for the store to keep (`DiagramPagesLayout.titleBlockRoom`). None:
   * the block at its share.
   */
  room?: number | 'measure';
}

/** The title block's look where the titles give none: no words of its own, the art at the default sizes. */
export function emptyTitleBlockLook(): TitleBlockLook {
  return { subtitle: '', credits: [], note: '', sizes: TITLE_BLOCK_ART_SIZE_DEFAULTS };
}

/** One credit as set: its label over its value, from `x`, `w` wide; its row's top is its tallest label's top. */
export interface LayoutCredit {
  label: SetLine;
  value: SetLine;
  x: number;
  w: number;
  top: number;
  labelBaseline: number;
  valueBaseline: number;
}

/** The title block as the first page prints it: where each part goes, and its text set. */
export interface LayoutTitleBlock {
  geometry: TitleBlockGeometry;
  /** The column's scale from {@link TITLE_BLOCK_TYPE}: 1 where the block has room for it. */
  scale: number;
  /** The tracked line over the band, from the column's left, and its rule; null with no subtitle. */
  subtitle: {
    line: SetLine;
    sizeMm: number;
    trackingMm: number;
    baseline: number;
    /** From after the line to the band's end, at its capitals' middle; null where the line leaves no room for one. */
    rule: { x1: number; x2: number; y: number } | null;
  } | null;
  /** The band, filled in the paper's colour: across the column, under the subtitle, or at the block's top with none. */
  band: PageBox;
  /** The title, one bold line in the band or two, its capitals centred in it, `baseline` the first's; null with no title. */
  title: { lines: SetLine[]; sizeMm: number; leadingMm: number; x: number; baseline: number } | null;
  /** The credits with a value, row by row, as many as the block has room for; null where none has a value. */
  credits: {
    labelSizeMm: number;
    valueSizeMm: number;
    trackingMm: number;
    columns: LayoutCredit[];
    /** In each gutter, from the row's top to its values' baseline. */
    dividers: { x: number; y1: number; y2: number }[];
    /** Credits with a value that the block has no room for, not printed. */
    cut: number;
  } | null;
  /** The note's lines from the column's left; null with no note. `cut`: some of it is not printed, for want of room. */
  note: { lines: SetLine[]; sizeMm: number; leadingMm: number; top: number; firstBaseline: number; cut: boolean } | null;
}

/** Under this contrast with white the paper's colour is pale: the title and the rules are printed in ink instead. */
const PALE_CONTRAST = 2.5;

/**
 * The block's inks for the paper `paper`: the band, the subtitle's rule and
 * the credits' dividers in the paper's colour — its coloured side, whichever
 * stands further from the white page — or in `band`, the colour its author
 * chose (Zach, 2026-10-15); and the title white on it; on a pale colour the
 * title and the rules in `ink`.
 */
export function titleBlockInks(
  paper: { front: string; back: string },
  ink: string,
  band?: string
): { band: string; title: string; rule: string } {
  const colour = band ?? (wcagContrast(paper.back, WHITE) > wcagContrast(paper.front, WHITE) ? paper.back : paper.front);
  const pale = wcagContrast(colour, WHITE) < PALE_CONTRAST;
  return { band: colour, title: pale ? ink : WHITE, rule: pale ? ink : colour };
}

const WHITE = '#ffffff';

/** The look the title block takes from `titles`. */
export function titleBlockLookOf(titles: DiagramTitles): TitleBlockLook {
  return titles.block ?? emptyTitleBlockLook();
}

/** The column set into `geometry` with the layout's setter. */
export function setTitleBlock(geometry: TitleBlockGeometry, titles: DiagramTitles, setter: TextSetter): LayoutTitleBlock {
  const look = titleBlockLookOf(titles);
  const T = TITLE_BLOCK_TYPE;
  const { column } = geometry;
  const foot = column.y + column.h;
  const subtitle = look.subtitle.trim();
  const { printed, natural, labelAbove } = creditsAtFullSize(look, setter);
  const note = noteText(look);
  // The note's first line, at its tallest letter wherever the line breaks: one line of it at least has room.
  const S = STEP_TEXT_SIZE_MM;
  const noteLine = note === '' ? 0 : Math.max(CAP_HEIGHT * S, setter.ink(setter.line(note, S, 400), S).above) + DESCENT * S;
  const rowsAt = (scale: number) => rowsOf(natural.map((width) => width * scale), T.gutterMm * scale, column.w);
  const fitsAt = (withNote: boolean) => (scale: number) => {
    const rows = rowsAt(scale).map((row) => Math.max(...row.map((at) => labelAbove[at]!)));
    return scale * columnHeight(subtitle !== '', rows, withNote ? noteLine : 0) <= column.h + 1e-9;
  };
  // Where the note's first line cannot have room even at the least scale, the column is scaled as if there were none.
  const scale = largestScale(fitsAt(noteLine > 0 && fitsAt(true)(LEAST_SCALE)));

  const set = setSubtitle(subtitle, column, scale, setter);
  const bandTop = column.y + (set ? T.subtitleRowMm * scale : 0);
  const band = { x: column.x, y: bandTop, w: column.w, h: Math.max(0, Math.min(T.bandMm * scale, foot - bandTop)) };
  const title = setTitle(band, titles.title.trim(), scale, setter);

  const labelSizeMm = T.labelMm * scale;
  const valueSizeMm = T.valueMm * scale;
  const trackingMm = labelSizeMm * T.tracking;
  const firstRowTop = band.y + band.h + T.creditsGapMm * scale;
  const columns: LayoutCredit[] = [];
  const dividers: { x: number; y1: number; y2: number }[] = [];
  let top = firstRowTop;
  for (const row of rowsAt(scale)) {
    const lines = row.map((at) => ({
      label: trackedLine(setter, printed[at]!.label, labelSizeMm, 700, trackingMm, column.w),
      value: setter.line(printed[at]!.value, valueSizeMm, 400, column.w),
    }));
    const above = Math.max(CAP_HEIGHT * labelSizeMm, ...lines.map(({ label }) => setter.ink(label, labelSizeMm).above));
    const labelBaseline = top + above;
    const valueBaseline = labelBaseline + T.valueDropMm * scale;
    // A row the block has no room for is not printed, nor any after it.
    if (valueBaseline + DESCENT * valueSizeMm > foot + 1e-9) break;
    let x = column.x;
    lines.forEach(({ label, value }, k) => {
      const w = Math.min(column.w, Math.max(label.widthMm, value.widthMm));
      columns.push({ label, value, x, w, top, labelBaseline, valueBaseline });
      if (k < lines.length - 1) dividers.push({ x: x + w + (T.gutterMm * scale) / 2, y1: top, y2: valueBaseline });
      x += w + T.gutterMm * scale;
    });
    top = valueBaseline + T.rowGapMm * scale;
  }
  const lastRow = columns.at(-1);
  const cut = printed.length - columns.length;
  // The note under the credits; where a credit with a value has no room, none for the note either.
  const noteTop = cut > 0 ? foot : lastRow ? lastRow.valueBaseline + T.noteGapMm * scale : firstRowTop;

  return {
    geometry,
    scale,
    subtitle: set,
    band,
    title,
    credits: printed.length > 0 ? { labelSizeMm, valueSizeMm, trackingMm, columns, dividers, cut } : null,
    note: setNote(note, column, noteTop, scale, setter),
  };
}

/**
 * How tall the header's words stand at J1b's sizes, the scale 1, in `column`'s width: the subtitle's row, the
 * band, every row of credits and the whole note, with the rooms between them — what the flow's block grows to where
 * its share is shorter (Zach, 2026-10-15: "actually reflow the content"; `grownTitleBlockMm`). The title never
 * counts: it is set to the band.
 */
export function titleBlockTextMm(column: Pick<PageBox, 'w'>, titles: DiagramTitles, setter: TextSetter): number {
  const look = titleBlockLookOf(titles);
  const T = TITLE_BLOCK_TYPE;
  const { natural, labelAbove } = creditsAtFullSize(look, setter);
  const rows = rowsOf(natural, T.gutterMm, column.w).map((row) => Math.max(...row.map((at) => labelAbove[at]!)));
  // The whole note, as `setNote` sets it: its first line's tallest letter, its baselines a leading apart, the last
  // one's descent.
  const note = noteText(look);
  const S = STEP_TEXT_SIZE_MM;
  const lines = note === '' || !(column.w > 0) ? [] : noteLines(setter, note, column.w, S, Number.MAX_SAFE_INTEGER).lines;
  const noteMm = lines[0] ? setter.ink(lines[0], S).above + (lines.length - 1) * STEP_TEXT_LEADING_MM + DESCENT * S : 0;
  return columnHeight(look.subtitle.trim() !== '', rows, noteMm);
}

/**
 * The credits with a value, as printed, and each one's column at J1b's sizes, which scale with it: as wide as the
 * wider of its label, tracked, and its value; and how far its label's ink reaches over its baseline — an accented
 * capital's or an ideograph's past a capital's — which sets its row's baseline, where the row is measured and
 * placed alike.
 */
function creditsAtFullSize(look: TitleBlockLook, setter: TextSetter) {
  const T = TITLE_BLOCK_TYPE;
  const printed = look.credits.map(({ label, value }) => ({ label: label.trim(), value: value.trim() })).filter(({ value }) => value !== '');
  const labels = printed.map(({ label }) => trackedLine(setter, label, T.labelMm, 700, T.labelMm * T.tracking, Number.POSITIVE_INFINITY));
  const natural = printed.map(({ value }, at) => Math.max(labels[at]!.widthMm, setter.line(value, T.valueMm, 400).widthMm));
  const labelAbove = labels.map((label) => Math.max(CAP_HEIGHT * T.labelMm, setter.ink(label, T.labelMm).above));
  return { printed, natural, labelAbove };
}

/**
 * How tall J1b's column is, at its own sizes: a subtitle or none, the band, a row of credits for each of `rows` —
 * how far its labels' ink reaches over their baseline — and `noteLine`, the note's first line or all of it, or none.
 */
function columnHeight(subtitle: boolean, rows: readonly number[], noteLine: number): number {
  const T = TITLE_BLOCK_TYPE;
  const values = rows.reduce((sum, above) => sum + above + T.valueDropMm, 0) + (rows.length - 1) * T.rowGapMm;
  const under = rows.length > 0 ? values + (noteLine > 0 ? T.noteGapMm + noteLine : DESCENT * T.valueMm) : noteLine;
  return (subtitle ? T.subtitleRowMm : 0) + T.bandMm + (under > 0 ? T.creditsGapMm + under : 0);
}

/** The largest scale up to 1 that `fits`, to a thousandth, and never under {@link LEAST_SCALE}. */
function largestScale(fits: (scale: number) => boolean): number {
  if (fits(1)) return 1;
  if (!fits(LEAST_SCALE)) return LEAST_SCALE;
  let [low, high] = [LEAST_SCALE, 1];
  while (high - low > 1e-3) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** Columns of `widths`, row by row, as many on a row as fit `room` with a `gutter` between: each row's indices. One wider than the room has a row of its own. */
function rowsOf(widths: readonly number[], gutter: number, room: number): number[][] {
  const rows: number[][] = [];
  let x = 0;
  widths.forEach((width, index) => {
    const row = rows.at(-1);
    if (row && x + gutter + width <= room + 1e-9) {
      row.push(index);
      x += gutter + width;
    } else {
      rows.push([index]);
      x = width;
    }
  });
  return rows;
}

function setSubtitle(subtitle: string, column: PageBox, scale: number, setter: TextSetter): LayoutTitleBlock['subtitle'] {
  const T = TITLE_BLOCK_TYPE;
  if (subtitle === '' || !(column.w > 0)) return null;
  const sizeMm = T.subtitleMm * scale;
  const trackingMm = sizeMm * T.tracking;
  const line = trackedLine(setter, subtitle, sizeMm, 700, trackingMm, column.w);
  const above = setter.ink(line, sizeMm).above;
  const x1 = column.x + line.widthMm + T.ruleGapMm * scale;
  const x2 = column.x + column.w;
  const rule = x2 - x1 >= T.ruleGapMm * scale ? { x1, x2, y: column.y + above / 2 } : null;
  return { line, sizeMm, trackingMm, baseline: column.y + above, rule };
}

/**
 * The title in the band: bold, as large as fits the band's width less its
 * inset either side, up to J1b's size, its ink inside the band and its
 * capitals centred in it — on one line down to {@link TITLE_ONE_LINE_LEAST}
 * of that size, then on two, down to {@link TITLE_LEAST}, where the second is
 * cut with "…".
 */
function setTitle(band: PageBox, title: string, scale: number, setter: TextSetter): LayoutTitleBlock['title'] {
  const T = TITLE_BLOCK_TYPE;
  const inset = T.titleInsetMm * scale;
  const room = band.w - 2 * inset;
  if (title === '' || !(room > 0) || !(band.h > 0)) return null;
  const max = T.titleMm * scale;
  const half = band.h / 2;
  /** Lines at `sizeMm`, their capitals' block centred in the band. */
  const centred = (lines: SetLine[], sizeMm: number) => {
    const leadingMm = TITLE_LEADING * sizeMm;
    return { lines, sizeMm, leadingMm, x: band.x + inset, baseline: band.y + half + (CAP_HEIGHT * sizeMm - (lines.length - 1) * leadingMm) / 2 };
  };
  const whole = setter.line(title, max, 700);
  const { above, below } = setter.ink(whole, max);
  // A width and an ink are each proportional to the size, so the size that fits one line is read off them at the largest.
  const across = whole.widthMm > 0 ? (max * room) / whole.widthMm : max;
  const up = above / max > CAP_HEIGHT / 2 ? half / (above / max - CAP_HEIGHT / 2) : Number.POSITIVE_INFINITY;
  const down = half / (below / max + CAP_HEIGHT / 2);
  const oneLine = Math.min(max, Math.floor(Math.min(across, up, down) * 100) / 100);
  if (oneLine >= max * TITLE_ONE_LINE_LEAST) return centred([setter.line(title, oneLine, 700, room)], oneLine);
  // Two lines: where the words break moves with the size, so the size is found by halving.
  const twoLines = (sizeMm: number) => setter.paragraph(title, room, sizeMm, 2, 700).lines;
  const fits = (sizeMm: number) => {
    const set = centred(twoLines(sizeMm), sizeMm);
    const first = set.lines[0];
    const last = set.lines.at(-1);
    if (!first || !last || last.ellipsis) return false;
    const top = set.baseline - setter.ink(first, sizeMm).above;
    const bottom = set.baseline + (set.lines.length - 1) * set.leadingMm + setter.ink(last, sizeMm).below;
    return top >= band.y - 1e-9 && bottom <= band.y + band.h + 1e-9;
  };
  let [low, high] = [max * TITLE_LEAST, max];
  if (!fits(low)) return centred(twoLines(low), low);
  while (high - low > 0.01) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return centred(twoLines(low), low);
}

/** The note from `top`, its first line's tallest letter there, on as many lines as the block has room for; the last cut with "…". */
function setNote(note: string, column: PageBox, top: number, scale: number, setter: TextSetter): LayoutTitleBlock['note'] {
  if (note === '' || !(column.w > 0)) return null;
  const sizeMm = STEP_TEXT_SIZE_MM * scale;
  const leadingMm = STEP_TEXT_LEADING_MM * scale;
  const lastBaseline = column.y + column.h - DESCENT * sizeMm;
  const all = noteLines(setter, note, column.w, sizeMm, Number.MAX_SAFE_INTEGER);
  const baselineOf = (lines: readonly SetLine[]) => top + (lines[0] ? setter.ink(lines[0], sizeMm).above : CAP_HEIGHT * sizeMm);
  const room = Math.floor((lastBaseline - baselineOf(all.lines)) / leadingMm + 1e-9) + 1;
  if (room < 1) return { lines: [], sizeMm, leadingMm, top, firstBaseline: baselineOf(all.lines), cut: true };
  const lines = all.lines.length <= room ? all.lines : noteLines(setter, note, column.w, sizeMm, room).lines;
  return { lines, sizeMm, leadingMm, top, firstBaseline: baselineOf(lines), cut: all.lines.length > room };
}

/** The note as set: as typed, its spaces and all; none where it is blank. */
function noteText(look: TitleBlockLook): string {
  return look.note.trim() === '' ? '' : look.note;
}

/** The note's lines, at most `maxLines`: its spaces kept as typed (`pre-wrap`), the one way it is set and measured. */
function noteLines(setter: TextSetter, note: string, widthMm: number, sizeMm: number, maxLines: number) {
  return setter.paragraph(note, widthMm, sizeMm, maxLines, 400, 'pre-wrap');
}

/**
 * A line as the page prints it with `trackingMm` after each letter
 * (`letter-spacing`): its runs placed and its width measured with the room
 * between its letters, and cut with "…" to `maxWidthMm` with it.
 */
export function trackedLine(setter: TextSetter, text: string, sizeMm: number, weight: 400 | 700, trackingMm: number, maxWidthMm: number): SetLine {
  let room = maxWidthMm;
  let line = tracked(setter.line(text, sizeMm, weight, room), trackingMm);
  for (let attempt = 0; attempt < 4 && line.widthMm > maxWidthMm + 1e-9; attempt += 1) {
    room -= line.widthMm - maxWidthMm;
    line = tracked(setter.line(text, sizeMm, weight, room), trackingMm);
  }
  return line;
}

function tracked(line: SetLine, trackingMm: number): SetLine {
  let before = 0;
  const runs = line.runs.map((run) => {
    const at = { ...run, xMm: run.xMm + before * trackingMm };
    before += graphemesOf(run.text).length;
    return at;
  });
  return { ...line, runs, widthMm: line.widthMm + Math.max(0, before - 1) * trackingMm };
}
