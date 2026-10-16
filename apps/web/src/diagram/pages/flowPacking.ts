/**
 * A flow page packed by its steps' shapes (`implementation-plans/
 * diagram-flow-packing.md`, "The packing"): each step takes the width its
 * picture and caption need, the steps are cut into bands that fill the page's
 * height, a step may stand in the bend between two bands, and wide steps nest
 * by rising or dipping in their band.
 *
 * A port of the prototype Zach chose (`packPage`, `layoutPage` and the short
 * last page's stand-ins in the gitignored
 * `artifacts/layout-review/proto2/template.html`), which is the visual
 * reference: at the same inputs this packs the same plan at the same scale and
 * puts every box where the prototype does, but for a page's first band, whose
 * first step stands at the area's left edge where the prototype set it in by
 * half a share of the spare width (Zach, 2026-10-15: step 1 starts at the top
 * left; every later page, a right-hand one entered at its spine included,
 * starts on its left) — or, where its picture prints wider than its box
 * (`PackStep.drawnWidth`), as far in as lets the picture start there. Five
 * things the prototype never met are decided here:
 * a fixed even band count on a left page that hands over at its spine takes
 * the odd count either side that packs larger (Decision 7); a fixed count past
 * the page's steps is held to them; Prefer three bands weighs only in Auto; a
 * step stands in a bend only with a real step after it, never before only a
 * short last page's stand-ins; and a page no plan fits even at the least scale
 * is drawn with its steps shared evenly over whichever band count overflows
 * least, and says so (`fits`).
 *
 * Only a page packed now is placed so: a page held as saved keeps its boxes
 * (`flowArrangement.ts`), so a saved diagram opens as it was.
 *
 * The search is exactly the prototype's, made fast without changing its
 * answer: a caption is set once per step and measure (its measure is the
 * picture's width rounded to a whole mm, so the page scale only ever asks for
 * a couple of dozen), boxes are a few multiplications from there, a split
 * whose band is too wide at any scale is cut off with every split that gives
 * that band more steps, and a plan whose score could not beat the best found
 * so far — bounded by the widths and heights its bands need — is never
 * scaled. The line counts this leans on only fall as a caption's measure
 * widens, as the setter's greedy breaking makes them.
 *
 * Measurement is injected ({@link TextSetter}), as the layout's is.
 *
 * Pure and deterministic: the same input always packs the same way, ties
 * keeping the plan found first.
 */
import type { DiagramPageSetup } from '../document/diagramDocument';
import type { SetLine, TextSetter } from './diagramPageLayout';
import type { PrintPaper } from './printPaper';
import { STEP_NUMBER_ASCENT_MM, STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';

/** The room between two steps side by side in a band, mm. */
export const STEP_GAP_MM = 5;
/** The least room between two bands, mm. */
export const BAND_GAP_MM = 6;
/** The room kept before a step with turns before it, for their glyphs, mm. */
export const PACKED_TURN_GUTTER_MM = 13;
/** A step's number stands in this much room above its picture, mm. */
export const NUMBER_ROOM_MM = 5;
/** A box is at least this much wider than its picture, mm. */
export const PICTURE_SIDE_MM = 4;
/**
 * The room between a picture and its caption's first line, mm: 3, half as far
 * again as the 2 it was (Zach, 2026-10-13: text "a bit further off the
 * model"). A look: a page held as saved keeps its boxes and its pictures, and
 * its captions stand this far under them (`savedPagesHold.test.ts`); a page
 * packed now gets boxes this much taller for a caption.
 */
export const CAPTION_TOP_MM = 3;
/** A caption is set at its picture's width, rounded to a whole mm and held to this range. */
export const CAPTION_WIDTH_MM = { min: 28, max: 50 } as const;
/** The page scale: never below `min`, which the search starts from, nor above `max`. */
export const PAGE_SCALE = { min: 0.25, max: 1.4 } as const;
/** How many halvings the search for a plan's scale takes. */
export const SCALE_SEARCH_STEPS = 18;
/**
 * How far a page's scale may grow past the page before's at no steadiness:
 * at steadiness `s` it is held to `kPrev × (1 + STEADY_GROWTH × (1 − s))`.
 */
export const STEADY_GROWTH = 0.6;
/** The band count Auto prefers. */
export const PREFERRED_BANDS = 3;
/**
 * What each part of a plan's score weighs: `ln k − preferBands × |B − 3| −
 * bendStep × steps in bends − unevenness × σ(band fills) − steadiness ×
 * |ln(k / kPrev)|`, the first and last scaled by their page settings.
 */
export const PACKING_SCORE = { preferBands: 0.4, bendStep: 0.025, unevenness: 0.6, steadiness: 1.5 } as const;
/** Two scores this near are a tie, which keeps the plan found first. */
export const SCORE_TIE = 1e-9;
/** What the search's bounds leave for rounding, so that a plan they pass over could never have won. */
const BOUND_SLACK = 1e-9;
/** How many times a plan's scale ceiling is brought down to the bands' heights before the plan is scaled or passed over. */
const CEILING_ROUNDS = 3;
/** The room kept under a page's header and over its footer, when shown, mm. */
export const AREA_INSET_MM = { top: 3, bottom: 2 } as const;

/** The packing's five page settings (Decision 7). */
export type FlowPackingSettings = Pick<
  DiagramPageSetup,
  'flowBands' | 'flowPreferBands' | 'flowBendSteps' | 'flowNesting' | 'flowSteadiness'
>;

/** A rectangle on the page, mm, from its top-left. */
export interface PackRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A step as the packing reads it. */
export interface PackStep {
  id: string;
  /**
   * Its picture's size at its reference scale, mm, with what its marks
   * reach: the page scale multiplies it, all but its {@link marks}.
   */
  size: { width: number; height: number };
  /** The part of {@link size} its marks take at their pt size, which no page scale changes. Absent, none. */
  marks?: { width: number; height: number };
  /** Its number as set, mm wide: its box is never narrower. */
  numberWidth: number;
  /** Its caption, set by the page's text setter. */
  text: string;
  /**
   * Its caption's measure, pinned by hand (`DiagramStepPlace.textWidth`), mm:
   * its caption is set at this at every scale, and its box is at least this
   * and the side room wide. Absent, the measure follows its picture's width
   * ({@link captionWidthFor}).
   */
  textWidth?: number;
  /** Turns stand before it, so it keeps their gutter before it in its band. */
  turnsBefore: boolean;
  /**
   * Its picture's width as it prints, mm, where that is more than {@link size}
   * packs it at: a size pinned by hand that no plan could hold, drawn at its
   * pin past its box, centred on it. A page's first step is set in far enough
   * that such a picture starts at the area's left edge. Absent, as packed.
   */
  drawnWidth?: number;
}

/** One flow page to pack. */
export interface FlowPageInput {
  /** Its steps, in reading order. */
  steps: readonly PackStep[];
  /**
   * How many steps it is laid out for (`PlannedPage.layoutCount`): more than
   * it holds only on a short last page, which is packed as a full one, stand-ins
   * shaped like its own steps filling the rest.
   */
  layoutCount: number;
  /** Where its bands go: the page inside its margins, less header and footer ({@link packingArea}). */
  area: PackRect;
  /** Its bands stack from the foot: a right page the lane comes into at its spine. */
  up: boolean;
  /** It hands over at its spine, so it takes an odd number of bands and its last band ends there. */
  handsOver: boolean;
  settings: FlowPackingSettings;
  /** The page before's scale, which steadiness holds this one's to; null on the first page. */
  kPrev: number | null;
}

/** A step as packed: its box, and its number, picture and caption in it. */
export interface PackedStep {
  id: string;
  box: PackRect;
  /** Its picture at the page scale, centred across the box under its number. */
  picture: PackRect;
  /** Its number's baseline, at the box's left. */
  numberAt: { x: number; y: number };
  /** Its caption: where its lines start, its first baseline, the measure it is set at, and its lines. */
  caption: { x: number; firstBaseline: number; widthMm: number; lines: SetLine[] };
  /** Its band, from 0 in reading order; a step in a bend, the band before that bend. */
  band: number;
  /** It stands in the bend after its band, at the page's edge, between that band and the next. */
  bend: boolean;
  /** Its band reads right to left. */
  rightToLeft: boolean;
}

/** A band as packed: its top and height, mm, and which way it reads. */
export interface PackedBand {
  top: number;
  height: number;
  rightToLeft: boolean;
}

/** A page as packed. */
export interface FlowPagePacking {
  /** The page scale, which every step's reference scale is multiplied by. */
  k: number;
  /** The plan: how many steps each band holds, in reading order, and whether a step stands in each bend between two bands. */
  plan: { bands: number[]; bends: boolean[] };
  /** The page's own steps, in reading order: no stand-in. */
  steps: PackedStep[];
  bands: PackedBand[];
  /** Every band fits the area. False only where no plan fits even at the least scale: the page is then drawn overflowing, as large as its overflow allows. */
  fits: boolean;
  /** How the search went, for the debug overlay and the tests. */
  summary: {
    score: number;
    /** The standard deviation of the bands' fills, as shares of the area's width. */
    unevenness: number;
    /** The most the page's scale could be: the largest, held to steadiness. */
    cap: number;
    /** Stand-ins packed after the page's steps. */
    standIns: number;
    /** Plans scaled. */
    plansScaled: number;
    /** Plans passed over unscaled, as fitting nowhere or unable to beat the best; a run of splits cut off together counts once. */
    plansPruned: number;
  };
}

/**
 * Where a flow page's bands may go: the paper inside its margins, less the
 * header and its room under it when shown (`headMm` > 0), and the footer
 * and its room over it when shown.
 */
export function packingArea(paper: PrintPaper, headMm: number, footMm: number): PackRect {
  const { widthMm, heightMm, marginMm } = paper;
  const top = headMm > 0 ? headMm + AREA_INSET_MM.top : 0;
  const bottom = footMm > 0 ? footMm + AREA_INSET_MM.bottom : 0;
  return { x: marginMm, y: marginMm + top, w: widthMm - 2 * marginMm, h: heightMm - 2 * marginMm - top - bottom };
}

/** The measure a caption is set at under a picture `pictureWidth` mm wide. */
export function captionWidthFor(pictureWidth: number): number {
  return Math.round(Math.min(CAPTION_WIDTH_MM.max, Math.max(CAPTION_WIDTH_MM.min, pictureWidth)));
}

/**
 * How wide a caption is taken to be where a box `boxWidth` mm wide centres
 * it (`stepPartsInBox`): the measure the box gives it, read back from its
 * picture's room (`arrangedCaptionWidth`) — whatever the caption's pinned
 * measure (`DiagramStepPlace.textWidth`, `pinned`) — but for a pin past the
 * automatic cap under a picture wider than the cap, which is taken as wide as
 * the pin, up to the picture's room. So a pin keeps the caption's left edge
 * where its box's automatic caption starts (its lines are left-aligned), and
 * never jumps it when first set; it is centred under a wide picture as far
 * as that picture reaches; and a box packed for a pin, its measure and the
 * side room wide, holds it with the side room either side.
 */
export function captionCentreWidth(boxWidth: number, pinned?: number): number {
  const room = boxWidth - PICTURE_SIDE_MM;
  const auto = captionWidthFor(room);
  if (pinned === undefined || pinned <= CAPTION_WIDTH_MM.max || room <= CAPTION_WIDTH_MM.max) return auto;
  return Math.min(pinned, room);
}

/**
 * Where a step's parts go in its box: its number at the top left, its
 * picture centred across under it, and its caption, set at `captionWidth`,
 * centred across under the picture.
 */
export function stepPartsInBox(
  box: PackRect,
  picture: { w: number; h: number },
  captionWidth: number
): { picture: PackRect; numberAt: { x: number; y: number }; caption: { x: number; firstBaseline: number } } {
  return {
    picture: { x: box.x + (box.w - picture.w) / 2, y: box.y + NUMBER_ROOM_MM, w: picture.w, h: picture.h },
    numberAt: { x: box.x, y: box.y + STEP_NUMBER_ASCENT_MM },
    caption: {
      x: box.x + (box.w - captionWidth) / 2,
      firstBaseline: box.y + NUMBER_ROOM_MM + picture.h + CAPTION_TOP_MM + STEP_TEXT_SIZE_MM,
    },
  };
}

/** The band counts a page tries, in order: each group packs on its own, and a later group wins only by packing larger. */
export interface BandGroup {
  counts: number[];
  /** Auto: the preference for three bands counts in the score. */
  prefer: boolean;
}

/**
 * The band counts a page of `n` steps tries: Auto 1–3 for a page of up to
 * four, else 2–5, odd only on a page that hands over at its spine. A fixed
 * count is held to the steps; an even one on such a page tries the odd count
 * either side (Decision 7).
 */
export function bandGroups(bands: FlowPackingSettings['flowBands'], n: number, handsOver: boolean): BandGroup[] {
  if (bands === 'auto') {
    const counts = (n <= 4 ? [1, 2, 3] : [2, 3, 4, 5]).filter((count) => count <= n && (!handsOver || count % 2 === 1));
    return [{ counts, prefer: true }];
  }
  const fixed = Math.max(1, Math.min(bands, n));
  if (!handsOver || fixed % 2 === 1) return [{ counts: [fixed], prefer: false }];
  return [fixed - 1, fixed + 1].filter((count) => count >= 1 && count <= n).map((count) => ({ counts: [count], prefer: false }));
}

/** The best plan of a group, as found. */
interface Best {
  score: number;
  k: number;
  counts: number[];
  bends: boolean[];
}

/** Pack one flow page. */
export function packFlowPage(input: FlowPageInput, setter: TextSetter): FlowPagePacking {
  const { steps, area, settings } = input;
  const real = steps.length;
  const kPrev = input.kPrev !== null && Number.isFinite(input.kPrev) && input.kPrev > 0 ? input.kPrev : null;
  const cap =
    kPrev !== null
      ? Math.max(PAGE_SCALE.min, Math.min(PAGE_SCALE.max, kPrev * (1 + STEADY_GROWTH * (1 - settings.flowSteadiness))))
      : PAGE_SCALE.max;
  if (real === 0) {
    return {
      k: cap,
      plan: { bands: [], bends: [] },
      steps: [],
      bands: [],
      fits: true,
      summary: { score: 0, unevenness: 0, cap, standIns: 0, plansScaled: 0, plansPruned: 0 },
    };
  }

  // The items packed: the page's steps, then stand-ins — cyclic copies of
  // them with no turns before — up to its layout count.
  const n = Math.max(real, Math.floor(input.layoutCount));
  const of = new Int32Array(n);
  const wGrow = new Float64Array(n);
  const wFix = new Float64Array(n);
  const hGrow = new Float64Array(n);
  const hFix = new Float64Array(n);
  const least = new Float64Array(n);
  const gapBefore = new Float64Array(n);
  // A caption's pinned measure, or 0 where it follows its picture.
  const pinned = new Float64Array(n);
  // A picture's width as it prints where more than it packs at, or 0.
  const drawnW = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const s = i % real;
    const step = steps[s]!;
    // Its marks are a part of its size, never more.
    const marksW = Math.min(step.size.width, Math.max(0, step.marks?.width ?? 0));
    const marksH = Math.min(step.size.height, Math.max(0, step.marks?.height ?? 0));
    of[i] = s;
    wGrow[i] = step.size.width - marksW;
    wFix[i] = marksW;
    hGrow[i] = step.size.height - marksH;
    hFix[i] = marksH;
    least[i] = step.numberWidth;
    gapBefore[i] = i < real && step.turnsBefore ? PACKED_TURN_GUTTER_MM : STEP_GAP_MM;
    pinned[i] = step.textWidth !== undefined && Number.isFinite(step.textWidth) && step.textWidth > 0 ? step.textWidth : 0;
    drawnW[i] = step.drawnWidth !== undefined && Number.isFinite(step.drawnWidth) && step.drawnWidth > 0 ? step.drawnWidth : 0;
  }

  // Each step's caption, set once per measure: its lines, and how many.
  const measures = CAPTION_WIDTH_MM.max - CAPTION_WIDTH_MM.min + 1;
  const lineCounts = new Int32Array(real * measures).fill(-1);
  const lineSets: (SetLine[] | undefined)[] = new Array(real * measures);
  const setAt = (s: number, measure: number) => {
    const slot = s * measures + measure - CAPTION_WIDTH_MM.min;
    if (lineCounts[slot]! < 0) {
      const text = steps[s]!.text;
      const set = text.trim() === '' ? null : setter.paragraph(text, measure, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER);
      lineCounts[slot] = set ? set.lines.length : 0;
      lineSets[slot] = set ? set.lines : [];
    }
    return slot;
  };
  const linesAt = (i: number, measure: number) => lineCounts[setAt(of[i]!, measure)]!;
  // A pinned caption, set once at its own measure, whatever the scale.
  const pinnedSets: (SetLine[] | undefined)[] = new Array(real);
  const pinnedSet = (s: number): SetLine[] => {
    let lines = pinnedSets[s];
    if (!lines) {
      const text = steps[s]!.text;
      lines = text.trim() === '' ? [] : setter.paragraph(text, pinned[s]!, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines;
      pinnedSets[s] = lines;
    }
    return lines;
  };

  // A box at page scale k (the prototype's `box`).
  const pictureW = (i: number, k: number) => wGrow[i]! * k + wFix[i]!;
  const pictureH = (i: number, k: number) => hGrow[i]! * k + hFix[i]!;
  // A pinned caption keeps the side room a picture has, in a box no narrower
  // than an automatic caption's least, so its box always holds it where it
  // centres it (`captionCentreWidth`).
  const captionNeeds = (i: number, pw: number) =>
    pinned[i]! > 0 ? Math.max(pinned[i]! + PICTURE_SIDE_MM, CAPTION_WIDTH_MM.min) : captionWidthFor(pw);
  const widthAt = (i: number, k: number) => {
    const pw = pictureW(i, k);
    return Math.max(pw + PICTURE_SIDE_MM, captionNeeds(i, pw), least[i]!);
  };
  const heightAt = (i: number, k: number) => {
    const lines = pinned[i]! > 0 ? pinnedSet(of[i]!).length : linesAt(i, captionWidthFor(pictureW(i, k)));
    return NUMBER_ROOM_MM + pictureH(i, k) + (lines ? CAPTION_TOP_MM + lines * STEP_TEXT_LEADING_MM : 0);
  };

  // The plan being tried: each band's items [start, end), and the step in the bend after it (−1 for none).
  const start = new Int32Array(6);
  const end = new Int32Array(6);
  const seat = new Int32Array(6);
  const counts = new Int32Array(6);
  const bends = new Uint8Array(6);
  let bandCount = 0;
  let seats = 0;
  const cut = () => {
    let i = 0;
    for (let b = 0; b < bandCount; b += 1) {
      start[b] = i;
      i += counts[b]!;
      end[b] = i;
      seat[b] = b < bandCount - 1 && bends[b] ? i++ : -1;
    }
  };

  /**
   * How far the plan overflows at k (the prototype's `fits`): 0 when every
   * band fits the area's width and the bands, with their gaps, its height;
   * else a positive measure of how much they do not, as shares of the area.
   * Its widths and heights are summed in the prototype's order, so it agrees
   * with it to the last bit.
   */
  const overflowAt = (k: number, exact: boolean): number => {
    let over = 0;
    let totalH = 0;
    for (let b = 0; b < bandCount; b += 1) {
      let widths = 0;
      let gaps = 0;
      let tallest = -Infinity;
      for (let i = start[b]!; i < end[b]!; i += 1) {
        widths += widthAt(i, k);
        if (i > start[b]!) gaps += gapBefore[i]!;
        tallest = Math.max(tallest, heightAt(i, k));
      }
      let width = widths + gaps;
      const before = b > 0 ? seat[b - 1]! : -1;
      const after = seat[b]!;
      if (before >= 0) width += widthAt(before, k) + STEP_GAP_MM;
      if (after >= 0) width += widthAt(after, k) + STEP_GAP_MM;
      if (width > area.w) {
        if (!exact) return 1;
        over = Math.max(over, (width - area.w) / area.w);
      }
      totalH += tallest;
    }
    totalH += BAND_GAP_MM * (bandCount - 1);
    return totalH > area.h ? over + (totalH - area.h) / area.h : over;
  };
  const fits = (k: number) => overflowAt(k, false) === 0;

  /** The largest scale the plan fits at, held to the cap, by halving (the prototype's `bestScale`); 0 when it fits at none. */
  const bestScale = (): number => {
    if (!fits(PAGE_SCALE.min)) return 0;
    let lo: number = PAGE_SCALE.min;
    let hi = cap;
    if (fits(hi)) return hi;
    for (let step = 0; step < SCALE_SEARCH_STEPS; step += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  /** How unevenly the bands fill the area's width at k: the standard deviation of their boxes' widths, as shares of it. */
  const unevenAt = (k: number): number => {
    let sum = 0;
    const fills: number[] = [];
    for (let b = 0; b < bandCount; b += 1) {
      let widths = 0;
      for (let i = start[b]!; i < end[b]!; i += 1) widths += widthAt(i, k);
      fills.push(widths / area.w);
    }
    for (const fill of fills) sum += fill;
    const mean = sum / fills.length;
    let spread = 0;
    for (const fill of fills) spread += (fill - mean) ** 2;
    return Math.sqrt(spread / fills.length);
  };

  const steadyWeight = settings.flowSteadiness * PACKING_SCORE.steadiness;
  /** The most a score can be at a scale of at most kHi, for its scale and steadiness alone. */
  const scaleBound = (kHi: number): number => {
    if (kPrev === null) return Math.log(kHi);
    // Up to kPrev the score's scale terms grow; past it they grow only while steadiness weighs less than the scale.
    const k = steadyWeight >= 1 ? Math.min(kHi, kPrev) : kHi;
    return Math.log(k) - steadyWeight * Math.abs(Math.log(k / kPrev));
  };

  /** What a step needs across at any scale (its caption's least measure, its number, its marks and side room), and what of that is fixed as it grows. */
  const widthFloor = new Float64Array(n);
  const widthFixed = new Float64Array(n);
  // floorsBefore[i]: the steps before i at their floors, each with the gutter before it.
  const floorsBefore = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    widthFixed[i] = wFix[i]! + PICTURE_SIDE_MM;
    widthFloor[i] = Math.max(captionNeeds(i, 0), CAPTION_WIDTH_MM.min, least[i]!, widthFixed[i]!);
    floorsBefore[i + 1] = floorsBefore[i]! + widthFloor[i]! + gapBefore[i]!;
  }
  /** The least a band of steps [from, to) is across at any scale, with the steps in the bends either end of it (−1 for none). */
  const bandFloor = (from: number, to: number, before: number, after: number) =>
    floorsBefore[to]! -
    floorsBefore[from]! -
    gapBefore[from]! +
    (before >= 0 ? widthFloor[before]! + STEP_GAP_MM : 0) +
    (after >= 0 ? widthFloor[after]! + STEP_GAP_MM : 0);

  /**
   * The largest scale the plan could fit at, or −1 when it fits at none:
   * never less than the scale the search finds, though the plan need not fit
   * at it.
   *
   * Across, a box is at least its picture and side room. Down, a band at a
   * scale under the ceiling `c` is at least as tall as its tallest step at
   * `c` less what that step's picture loses on the way down — its caption
   * only gains lines as its measure narrows — so where the bands overrun
   * the area at `c`, the ceiling comes down by as much and is tried again.
   */
  const scaleCeiling = (): number => {
    let ceiling = cap;
    for (let b = 0; b < bandCount; b += 1) {
      let fixed = 0;
      let grow = 0;
      for (let i = start[b]!; i < end[b]!; i += 1) {
        fixed += widthFixed[i]! + (i > start[b]! ? gapBefore[i]! : 0);
        grow += wGrow[i]!;
      }
      for (let side = 0; side < 2; side += 1) {
        const beside = side === 0 ? (b > 0 ? seat[b - 1]! : -1) : seat[b]!;
        if (beside < 0) continue;
        fixed += widthFixed[beside]! + STEP_GAP_MM;
        grow += wGrow[beside]!;
      }
      if (grow > 0) ceiling = Math.min(ceiling, (area.w - fixed) / grow);
    }
    for (let round = 0; round < CEILING_ROUNDS && ceiling >= PAGE_SCALE.min; round += 1) {
      let heights = BAND_GAP_MM * (bandCount - 1);
      let grows = 0;
      for (let b = 0; b < bandCount; b += 1) {
        let tallest = -Infinity;
        let grow = 0;
        for (let i = start[b]!; i < end[b]!; i += 1) {
          const height = heightAt(i, ceiling);
          if (height > tallest) {
            tallest = height;
            grow = hGrow[i]!;
          }
        }
        heights += tallest;
        grows += grow;
      }
      const over = heights - area.h;
      if (over <= BOUND_SLACK) break;
      if (!(grows > 0)) return -1;
      ceiling -= over / grows;
    }
    // A hair over, for rounding: the bound must never fall under the scale found.
    return ceiling * (1 + BOUND_SLACK);
  };

  let plansScaled = 0;
  let plansPruned = 0;

  /**
   * Every plan of `B` bands that could fit across at some scale, in the
   * prototype's order: each choice of the bends a step stands in, then each
   * split of the rest into bands, the first band shortest first, and so on.
   * `admit` may pass over a choice of bends whole. A band too wide at any
   * scale passes over every split that starts so, and every split that gives
   * it more steps: a step more only widens it. A step stands in a bend only
   * with a real step after it, which the prototype never asked (its short
   * last page could seat its last step in a bend before only stand-ins).
   */
  const eachPlan = (B: number, admit: () => boolean, visit: () => void) => {
    bandCount = B;
    const maxSeats = settings.flowBendSteps ? B - 1 : 0;
    const split = (part: number, left: number, from: number) => {
      const last = part === B - 1;
      const before = part > 0 && bends[part - 1] ? from - 1 : -1;
      const most = last ? left : left - (B - 1 - part);
      for (let count = last ? left : 1; count <= most; count += 1) {
        const after = !last && bends[part] ? from + count : -1;
        // A step in a bend has a real step after it: on a short last page, never its last step nor a stand-in,
        // which would leave the diagram's last step hanging at the page's edge, its band turning into nothing.
        if (after >= real - 1) break;
        if (bandFloor(from, from + count, before, after) > area.w + BOUND_SLACK) {
          plansPruned += 1;
          break;
        }
        counts[part] = count;
        if (!last) {
          split(part + 1, left - count, from + count + (after >= 0 ? 1 : 0));
          continue;
        }
        cut();
        visit();
      }
    };
    for (let mask = 0; mask < 1 << (B - 1); mask += 1) {
      seats = 0;
      for (let j = 0; j < B - 1; j += 1) {
        bends[j] = (mask >> j) & 1;
        seats += bends[j]!;
      }
      if (seats > maxSeats || n - seats < B || !admit()) continue;
      split(0, n - seats, 0);
    }
  };
  const snapshot = () => ({
    counts: Array.from(counts.subarray(0, bandCount)),
    bends: Array.from(bends.subarray(0, bandCount - 1), Boolean),
  });

  /** The plan of a group that scores best (the prototype's `packPage`); null when none fits. */
  const packGroup = (group: BandGroup): Best | null => {
    let best: Best | null = null;
    const preferWeight = group.prefer ? settings.flowPreferBands * PACKING_SCORE.preferBands : 0;
    // Whether a plan whose scale terms could reach `bound` might still beat the best, less its penalties.
    const mayBeat = (bound: number, penalty: number) => !best || bound - penalty > best.score + SCORE_TIE - BOUND_SLACK;
    for (const B of group.counts) {
      const penalty = () => preferWeight * Math.abs(B - PREFERRED_BANDS) + PACKING_SCORE.bendStep * seats;
      eachPlan(
        B,
        () => {
          // No split of this choice of bends can beat the best, even at the cap.
          const admitted = mayBeat(scaleBound(cap), penalty());
          if (!admitted) plansPruned += 1;
          return admitted;
        },
        () => {
          const ceiling = scaleCeiling();
          if (ceiling < PAGE_SCALE.min || !mayBeat(scaleBound(ceiling), penalty())) {
            plansPruned += 1;
            return;
          }
          plansScaled += 1;
          const k = bestScale();
          if (!k) return;
          const uneven = unevenAt(k);
          const steady = kPrev !== null ? Math.abs(Math.log(k / kPrev)) : 0;
          const score =
            Math.log(k) -
            preferWeight * Math.abs(B - PREFERRED_BANDS) -
            PACKING_SCORE.bendStep * seats -
            PACKING_SCORE.unevenness * uneven -
            steadyWeight * steady;
          if (!best || score > best.score + SCORE_TIE) best = { score, k, ...snapshot() };
        }
      );
    }
    return best;
  };

  /**
   * For a page no plan fits: of each band count it tries, the steps shared
   * out over the bands as evenly as they go, the extra ones on the first
   * bands and none in a bend, at the least scale; the one that overflows the
   * area least, the first on a tie. Drawn as large as that overflow allows:
   * what overflows is mostly the least width a caption keeps, which no scale
   * makes smaller, so the pictures grow until they would overflow more
   * (found by halving, as a plan's scale is).
   */
  const leastOverflow = (all: readonly BandGroup[]): Best => {
    let fewest: { over: number; counts: number[]; bends: boolean[] } | null = null;
    for (const B of all.flatMap((group) => group.counts)) {
      bandCount = B;
      seats = 0;
      bends.fill(0);
      for (let b = 0; b < B; b += 1) counts[b] = Math.floor(n / B) + (b < n % B ? 1 : 0);
      cut();
      const over = overflowAt(PAGE_SCALE.min, true);
      if (!fewest || over < fewest.over) fewest = { over, ...snapshot() };
    }
    const found = fewest ?? { over: 0, counts: [n], bends: [] };
    bandCount = found.counts.length;
    seats = 0;
    bends.fill(0);
    found.counts.forEach((count, b) => (counts[b] = count));
    cut();
    const holds = (k: number) => overflowAt(k, true) <= found.over + BOUND_SLACK;
    let k: number = PAGE_SCALE.min;
    if (holds(cap)) k = cap;
    else {
      let hi = cap;
      for (let step = 0; step < SCALE_SEARCH_STEPS; step += 1) {
        const mid = (k + hi) / 2;
        if (holds(mid)) k = mid;
        else hi = mid;
      }
    }
    return { score: -Infinity, k, counts: found.counts, bends: found.bends };
  };

  const groups = bandGroups(settings.flowBands, n, input.handsOver);
  let chosen: Best | null = null;
  for (const group of groups) {
    const best = packGroup(group);
    if (best && (!chosen || best.k > chosen.k * (1 + SCORE_TIE))) chosen = best;
  }
  // Nothing fits even at the least scale: the plan that overflows least there, as large as that overflow allows.
  const fitsArea = chosen !== null;
  chosen ??= leastOverflow(groups);

  // The plan chosen, placed (the prototype's `layoutPage`).
  const { k } = chosen;
  bandCount = chosen.counts.length;
  chosen.counts.forEach((count, b) => (counts[b] = count));
  chosen.bends.forEach((bend, b) => (bends[b] = bend ? 1 : 0));
  cut();
  const uneven = unevenAt(k);
  const score = fitsArea ? chosen.score : Math.log(k) - PACKING_SCORE.unevenness * uneven;
  const bandHs: number[] = [];
  for (let b = 0; b < bandCount; b += 1) {
    let tallest = -Infinity;
    for (let i = start[b]!; i < end[b]!; i += 1) tallest = Math.max(tallest, heightAt(i, k));
    bandHs.push(tallest);
  }
  const used = bandHs.reduce((sum, height) => sum + height, 0);
  // The spare height shared out: a band's share over and under it, half at the area's top and foot.
  const gap = bandCount > 1 ? Math.max(0, (area.h - used) / bandCount) : 0;
  const tops: number[] = new Array(bandCount);
  let y = area.y + gap / 2;
  for (let v = 0; v < bandCount; v += 1) {
    const b = input.up ? bandCount - 1 - v : v;
    tops[b] = y;
    y += bandHs[b]! + gap;
  }

  const placed: { x: number; y: number; band: number; bend: boolean }[] = new Array(n);
  for (let b = 0; b < bandCount; b += 1) {
    const top = tops[b]!;
    const bandH = bandHs[b]!;
    const rtl = b % 2 === 1;
    const before = b > 0 ? seat[b - 1]! : -1;
    const after = seat[b]!;
    // The columns a step in a bend takes at either end of the band.
    const leftSeat = rtl ? after : before;
    const rightSeat = rtl ? before : after;
    const leftCol = leftSeat >= 0 ? widthAt(leftSeat, k) + STEP_GAP_MM : 0;
    const rightCol = rightSeat >= 0 ? widthAt(rightSeat, k) + STEP_GAP_MM : 0;
    const avail = area.w - leftCol - rightCol;
    // In reading order: each step's own gutter before it, then the spare width shared out evenly — a share after
    // each step, half of one before the first; but the page's first band keeps none before its first step, which
    // stands at the area's left edge (Zach, 2026-10-15: step 1 starts "at the top left of the steps"), or as far
    // in as its picture needs to start there where it prints wider than its box, as much as the spare allows.
    let sum = 0;
    for (let i = start[b]!; i < end[b]!; i += 1) sum = sum + widthAt(i, k) + (i === start[b]! ? 0 : gapBefore[i]!);
    const count = end[b]! - start[b]!;
    const spare = Math.max(0, avail - sum);
    const lead = b === 0 ? Math.min(spare, Math.max(0, (drawnW[start[b]!]! - widthAt(start[b]!, k)) / 2)) : spare / count / 2;
    const space = b === 0 ? (spare - lead) / count : spare / count;
    let cursor = lead;
    for (let i = start[b]!; i < end[b]!; i += 1) {
      const w = widthAt(i, k);
      cursor += i === start[b]! ? 0 : gapBefore[i]!;
      const x = rtl ? area.x + leftCol + avail - cursor - w : area.x + leftCol + cursor;
      cursor += w + space;
      // Every other step rises, the rest dip: by the nesting's share of the room its band leaves it.
      const slack = bandH - heightAt(i, k);
      const dip = (((i - start[b]!) % 2 === 0 ? -1 : 1) * settings.flowNesting * slack) / 2;
      placed[i] = { x, y: top + slack / 2 + dip, band: b, bend: false };
    }
    if (after >= 0) {
      // In the bend, at the band's trailing end, centred between the two bands it joins.
      const w = widthAt(after, k);
      const mid = (top + bandH / 2 + (tops[b + 1]! + bandHs[b + 1]! / 2)) / 2;
      placed[after] = { x: rtl ? area.x : area.x + area.w - w, y: mid - heightAt(after, k) / 2, band: b, bend: true };
    }
  }

  const packedSteps = steps.map((step, i): PackedStep => {
    const at = placed[i]!;
    const pw = pictureW(i, k);
    const pin = pinned[i]! > 0 ? pinned[i]! : null;
    const measure = pin ?? captionWidthFor(pw);
    const box = { x: at.x, y: at.y, w: widthAt(i, k), h: heightAt(i, k) };
    const parts = stepPartsInBox(box, { w: pw, h: pictureH(i, k) }, pin === null ? measure : captionCentreWidth(box.w, pin));
    return {
      id: step.id,
      box,
      picture: parts.picture,
      numberAt: parts.numberAt,
      caption: { ...parts.caption, widthMm: measure, lines: pin === null ? lineSets[setAt(i, measure)]! : pinnedSet(i) },
      band: at.band,
      bend: at.bend,
      rightToLeft: at.band % 2 === 1,
    };
  });

  return {
    k,
    plan: { bands: chosen.counts, bends: chosen.bends },
    steps: packedSteps,
    bands: bandHs.map((height, b) => ({ top: tops[b]!, height, rightToLeft: b % 2 === 1 })),
    fits: fitsArea,
    summary: { score, unevenness: uneven, cap, standIns: n - real, plansScaled, plansPruned },
  };
}
