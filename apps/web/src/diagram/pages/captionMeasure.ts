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
