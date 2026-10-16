/**
 * A caption's measure as a hand pins it (`DiagramStepPlace.textWidth`,
 * `implementation-plans/diagram-caption-resize.md`): the width the layout
 * sets its lines at, held to the page; and what the Pages view's grips and
 * the Step pane read of it — the narrowest it may be, the narrowest width at
 * which it sets in a number of lines, and where the layout then starts it.
 *
 * Its height is never asked for: the font's size is fixed, so a caption is as
 * tall as the lines its measure sets it in, and a pinned caption is never cut.
 *
 * Pure: text is measured by the injected setter, as the layout's is.
 */
import { breakOpportunities, graphemesOf } from '../../lib/paper/textWrap';
import type { DiagramStepPlace } from '../document/diagramDocument';
import type { LayoutCell, SetLine, TextSetter } from './diagramPageLayout';
import { captionCentreWidth } from './flowPacking';
import { partBox, type PageBox } from './pagePlacement';
import type { PrintPaper } from './printPaper';
import { STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM, TEXT_DESCENT_MM } from './stepType';

/** The narrowest a caption is ever set, mm: a short word's room. */
export const CAPTION_FLOOR_MM = 10;

/** The widest a caption may be set on `paper`: its width inside the margins. */
export function captionCeilingMm(paper: PrintPaper): number {
  return Math.max(CAPTION_FLOOR_MM, paper.widthMm - 2 * paper.marginMm);
}

/** The measure a step's caption is pinned at, held to the page; null where it is automatic. */
export function pinnedCaptionWidth(place: DiagramStepPlace | undefined, paper: PrintPaper): number | null {
  const pinned = place?.textWidth;
  if (pinned === undefined || !Number.isFinite(pinned) || !(pinned > 0)) return null;
  return Math.min(captionCeilingMm(paper), Math.max(CAPTION_FLOOR_MM, pinned));
}

/** `text` set at `widthMm`, whole. */
export function setCaption(text: string, widthMm: number, setter: TextSetter): SetLine[] {
  return text.trim() === '' ? [] : setter.paragraph(text, widthMm, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines;
}

/** How tall a caption of `lines` lines stands, mm: from its first line's cap height to its last line's descenders (`partBox`). */
export function captionHeightMm(lines: number): number {
  return lines > 0 ? (lines - 1) * STEP_TEXT_LEADING_MM + STEP_TEXT_SIZE_MM + TEXT_DESCENT_MM : 0;
}

/** How many lines a caption `heightMm` tall stands in, to the nearest line: at least one. */
export function captionLinesIn(heightMm: number): number {
  return Math.max(1, Math.round((heightMm - STEP_TEXT_SIZE_MM - TEXT_DESCENT_MM) / STEP_TEXT_LEADING_MM) + 1);
}

/** The text's paragraphs as `setText.ts` sets them: its own lines, runs of white space one space, composed. */
function paragraphsOf(text: string): string[] {
  const trimmed = text.normalize('NFC').trim();
  if (trimmed === '') return [];
  return trimmed.split(/\r\n|\r|\n/).map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim());
}

/**
 * The narrowest a caption may be set without a word broken in it: its widest
 * run between two places a line may end, where the setter ends them
 * (`breakOpportunities`), and never under {@link CAPTION_FLOOR_MM}.
 */
export function narrowestCaptionWidth(text: string, setter: TextSetter): number {
  let widest = 0;
  for (const paragraph of paragraphsOf(text)) {
    const graphemes = graphemesOf(paragraph);
    const allowed = breakOpportunities(graphemes);
    let start = 0;
    for (let at = 1; at <= graphemes.length; at += 1) {
      if (!allowed[at]) continue;
      const unit = graphemes.slice(start, at).join('').trim();
      if (unit !== '') widest = Math.max(widest, setter.line(unit, STEP_TEXT_SIZE_MM, 400).widthMm);
      start = at;
    }
  }
  return Math.max(CAPTION_FLOOR_MM, widest);
}

/**
 * The narrowest width, to a tenth of a mm, from `least` to `most`, at which
 * `text` sets in no more than `lines` lines: the setter breaks lines greedily,
 * so a wider measure never needs more of them, and the width is found by
 * halving. `most` where even that needs more.
 */
export function captionWidthForLines(text: string, lines: number, least: number, most: number, setter: TextSetter): number {
  const fits = (tenths: number) => setCaption(text, tenths / 10, setter).length <= lines;
  let lo = Math.ceil(least * 10 - 1e-6);
  let hi = Math.max(lo, Math.floor(most * 10 + 1e-6));
  if (!fits(hi)) return hi / 10;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo / 10;
}

/**
 * How far the layout moves a caption's left edge when its pin goes from
 * `from` to `to`, each undefined for automatic: on a flow page, by where its
 * box centres it (`captionCentreWidth`); on a grid, never — a grid caption
 * starts where its cell starts its caption, whatever its measure.
 */
export function captionStartShift(cell: Pick<LayoutCell, 'band' | 'cellMm'>, from: number | undefined, to: number | undefined): number {
  if (cell.band === undefined) return 0;
  return (captionCentreWidth(cell.cellMm.w, from) - captionCentreWidth(cell.cellMm.w, to)) / 2;
}

/** A grip on a selected caption's box (`DiagramPagesPlacement`): its left or right edge, or its foot. */
export type CaptionGrip = 'left' | 'right' | 'bottom';

/** What a resize of a caption by its grips starts from, read once as the drag begins ({@link captionStart}). */
export interface CaptionStart {
  /** The caption's box as drawn: from its first line's cap height to its last's descenders, its longest line wide. */
  box: PageBox;
  /** Where its lines start, and the measure they are set at. */
  x: number;
  width: number;
  /** Its pin, as the layout holds it; undefined where its measure is automatic. */
  pinned: number | undefined;
  /** The measure the layout gives it with no pin. */
  auto: number;
  /** Its picture's width: a width a grip snaps to. */
  picture: number;
  /** The narrowest and widest it may be set ({@link narrowestCaptionWidth}, {@link captionCeilingMm}). */
  least: number;
  most: number;
  /** How many lines it sets in: now, at its widest, and at its narrowest. */
  lines: number;
  fewest: number;
  longest: number;
}

/** A caption's {@link CaptionStart}: its cell as laid out, its text, the pages' setter and the paper. */
export function captionStart(cell: LayoutCell, text: string, setter: TextSetter, paper: PrintPaper): CaptionStart {
  const least = narrowestCaptionWidth(text, setter);
  const most = Math.max(least, captionCeilingMm(paper));
  return {
    box: partBox(cell, 'text'),
    x: cell.text.x,
    width: cell.text.widthMm,
    pinned: cell.placed?.offsets.textWidth !== undefined ? cell.text.widthMm : undefined,
    auto: cell.placed?.auto.textWidthMm ?? cell.text.widthMm,
    picture: partBox(cell, 'picture').w,
    least,
    most,
    lines: cell.text.lines.length,
    fewest: setCaption(text, most, setter).length,
    longest: setCaption(text, least, setter).length,
  };
}

/** A caption as a grip has it so far ({@link resizedCaption}). */
export interface CaptionResize {
  /** The measure it is set at. */
  width: number;
  /** What its placement keeps: the width to a tenth of a mm, or null where it is the automatic one. */
  pin: number | null;
  /** The caption as the layout will draw it: its lines at {@link width}, where it then starts. */
  text: LayoutCell['text'];
  /** How far its text offset moves across, mm: the left grip's, which keeps the box's right edge. */
  dx: number;
  /** The width it snapped to: the automatic one, or its picture's. */
  snap?: 'auto' | 'picture';
}

/** How a pointer has moved a grip: across and down, mm; how near a width snaps; and whether it may (Alt held, never). */
export interface CaptionMove {
  dx: number;
  dy: number;
  near: number;
  snap: boolean;
}

/**
 * A caption resized by `grip` as far as `move` takes it, from `start`:
 *
 * - **Right**: its box's right edge follows the pointer — as far as the
 *   least and most it may be — its left edge where the layout starts it.
 * - **Left**: its box's left edge follows the pointer; its right edge stays
 *   where it was, its text offset moving across by as much as the layout's
 *   start does not.
 * - **Bottom**: asks for the whole number of lines nearest the pointer's
 *   height, between the fewest and the most it can take, at the narrowest
 *   width that sets it in them ({@link captionWidthForLines}); back at the
 *   lines it had, the width it had. Its left edge where the layout starts it.
 *
 * A width grip snaps, within `near`, to the automatic width (the pin let
 * go) and to the picture's.
 */
export function resizedCaption(
  start: CaptionStart,
  cell: Pick<LayoutCell, 'band' | 'cellMm' | 'text'>,
  grip: CaptionGrip,
  move: CaptionMove,
  text: string,
  setter: TextSetter
): CaptionResize {
  const startAt = (pin: number | null) => start.x + captionStartShift(cell, start.pinned, pin ?? undefined);
  const least = Math.ceil(start.least * 10 - 1e-6) / 10;
  const held = (mm: number) => Math.min(start.most, Math.max(least, Math.round(mm * 10) / 10));
  let width: number;
  let pin: number | null;
  let snap: CaptionResize['snap'];
  if (grip === 'bottom') {
    const lines = Math.min(start.longest, Math.max(start.fewest, captionLinesIn(start.box.h + move.dy)));
    width = lines === start.lines ? start.width : captionWidthForLines(text, lines, start.least, start.most, setter);
    pin = lines === start.lines ? (start.pinned ?? null) : width;
  } else {
    const right = start.box.x + start.box.w;
    // Its line start moves half as far as its width where its box centres a wide pin: the edge still follows the pointer.
    const asked = grip === 'left' ? start.box.w - move.dx : widthReaching(right + move.dx, start, (mm) => startAt(mm) + mm);
    width = Math.min(start.most, Math.max(start.least, asked));
    if (move.snap) {
      const near = [
        { mm: start.auto, snap: 'auto' as const },
        { mm: start.picture, snap: 'picture' as const },
      ].filter(({ mm }) => mm >= start.least && mm <= start.most && Math.abs(mm - width) < move.near);
      const closest = near.sort((a, b) => Math.abs(a.mm - width) - Math.abs(b.mm - width))[0];
      if (closest) ({ mm: width, snap } = closest);
    }
    width = snap === 'auto' ? start.auto : held(width);
    pin = snap === 'auto' ? null : width;
  }
  // A width the automatic one to a tenth of a mm is the automatic one.
  if (pin !== null && Math.abs(pin - start.auto) < 0.05) [width, pin] = [start.auto, null];
  const lines = setCaption(text, width, setter);
  let x = startAt(pin);
  let dx = 0;
  if (grip === 'left') {
    const kept = start.box.x + start.box.w - Math.max(0, ...lines.map((line) => line.widthMm));
    dx = kept - x;
    x = kept;
  }
  return { width, pin, text: { ...cell.text, x, widthMm: width, lines }, dx, ...(snap ? { snap } : {}) };
}

/** The width, between `start`'s least and most, at which a caption's measure reaches `edge` (`reach`, never falling as it widens). */
function widthReaching(edge: number, start: CaptionStart, reach: (width: number) => number): number {
  let [lo, hi] = [start.least, start.most];
  if (reach(lo) >= edge) return lo;
  if (reach(hi) <= edge) return hi;
  for (let step = 0; step < 40; step += 1) {
    const mid = (lo + hi) / 2;
    if (reach(mid) < edge) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
