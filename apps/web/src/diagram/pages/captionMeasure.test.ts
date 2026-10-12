import { describe, expect, it } from 'vitest';
import {
  CAPTION_FLOOR_MM,
  captionCeilingMm,
  captionHeightMm,
  captionLinesIn,
  captionStartShift,
  captionWidthForLines,
  narrowestCaptionWidth,
  pinnedCaptionWidth,
  setCaption,
} from './captionMeasure';
import { estimateTextSetter } from './estimateTextSetter';
import { printPaper } from './printPaper';
import { STEP_TEXT_SIZE_MM } from './stepType';

/**
 * A caption's measure as a hand pins it (`diagram-caption-resize.md`): held to
 * the page, and what the Pages view's grips read of it. Measured with the
 * estimate setter, a Latin character 0.52 of the type's 3.2 mm.
 */

const setter = estimateTextSetter;
const LONG = 'Valley fold the flaps inward. Note that the top of each crease does not line up with the top corner of the paper';
const A4 = printPaper({ size: 'a4', orientation: 'landscape', marginMm: 12 });
const charMm = 0.52 * STEP_TEXT_SIZE_MM;

describe('pinnedCaptionWidth', () => {
  it('is null for a caption the layout measures, and a pin held to a short word’s room and the paper inside its margins', () => {
    expect(pinnedCaptionWidth(undefined, A4)).toBeNull();
    expect(pinnedCaptionWidth({ text: [1, 0] }, A4)).toBeNull();
    expect(pinnedCaptionWidth({ textWidth: 64.5 }, A4)).toBe(64.5);
    expect(pinnedCaptionWidth({ textWidth: 2 }, A4)).toBe(CAPTION_FLOOR_MM);
    expect(pinnedCaptionWidth({ textWidth: 900 }, A4)).toBe(297 - 24);
    expect(captionCeilingMm(A4)).toBe(273);
  });
});

describe('a caption’s lines and height', () => {
  it('stands as tall as its lines, and holds the nearest whole number of them in a height, at least one', () => {
    expect(captionHeightMm(0)).toBe(0);
    expect(captionHeightMm(1)).toBeCloseTo(4.7, 9);
    expect(captionHeightMm(4)).toBeCloseTo(4.7 + 3 * 4.1, 9);
    for (const lines of [1, 2, 5, 9]) {
      expect(captionLinesIn(captionHeightMm(lines))).toBe(lines);
      // Past half a line's leading either way, the next number.
      expect(captionLinesIn(captionHeightMm(lines) + 2.1)).toBe(lines + 1);
      expect(captionLinesIn(captionHeightMm(lines) + 2)).toBe(lines);
    }
    expect(captionLinesIn(-40)).toBe(1);
  });
});

describe('narrowestCaptionWidth', () => {
  it('is its widest word, where a line may end, never under the floor', () => {
    expect(narrowestCaptionWidth(LONG, setter)).toBeCloseTo('inward.'.length * charMm, 9);
    expect(narrowestCaptionWidth('Fold up.', setter)).toBe(CAPTION_FLOOR_MM);
    expect(narrowestCaptionWidth('', setter)).toBe(CAPTION_FLOOR_MM);
    // Its own line breaks and runs of spaces as the setter reads them: a hyphen may end a line.
    expect(narrowestCaptionWidth('Squash-fold\nthe   reverse-folded corners', setter)).toBeCloseTo('reverse-'.length * charMm, 9);
    // Ideographs break anywhere: one is a unit.
    expect(narrowestCaptionWidth('谷折りします谷折りします', setter)).toBe(CAPTION_FLOOR_MM);
  });

  it('is wide enough that no word is broken, and any narrower breaks one', () => {
    const least = narrowestCaptionWidth(LONG, setter);
    // A word broken across two lines reads as two.
    const wordsAt = (width: number) => setCaption(LONG, width, setter).map((line) => line.text).join(' ').split(' ').length;
    expect(wordsAt(least)).toBe(LONG.split(' ').length);
    expect(wordsAt(least - 0.5)).toBeGreaterThan(LONG.split(' ').length);
  });
});

describe('captionWidthForLines', () => {
  const least = narrowestCaptionWidth(LONG, setter);
  const most = captionCeilingMm(A4);
  const linesAt = (width: number) => setCaption(LONG, width, setter).length;

  it('is the narrowest width, to a tenth of a mm, at which the caption sets in so many lines', () => {
    for (const lines of [2, 3, 4, 6]) {
      const width = captionWidthForLines(LONG, lines, least, most, setter);
      expect(Math.round(width * 10)).toBe(width * 10);
      expect(linesAt(width), String(lines)).toBeLessThanOrEqual(lines);
      expect(linesAt(width - 0.1), String(lines)).toBeGreaterThan(lines);
    }
    // Fewer lines, wider; the fewest it can take, on one line across the page.
    expect(captionWidthForLines(LONG, 2, least, most, setter)).toBeGreaterThan(captionWidthForLines(LONG, 4, least, most, setter));
    expect(linesAt(captionWidthForLines(LONG, 1, least, most, setter))).toBe(1);
  });

  it('is held to the narrowest a word allows and the page’s width', () => {
    // As many lines as it may have: its widest word's width, to a tenth up.
    expect(captionWidthForLines(LONG, 99, least, most, setter)).toBeCloseTo(Math.ceil(least * 10) / 10, 9);
    // On a narrow page, one line is past it: the page's width, its lines what they come to there.
    expect(captionWidthForLines(LONG, 1, least, 60, setter)).toBe(60);
  });
});

describe('captionStartShift', () => {
  it('never moves a grid caption, and on a flow page moves it only as its box centres a pin past the cap under a wide picture', () => {
    const grid = { cellMm: { x: 0, y: 0, w: 90, h: 60 } };
    expect(captionStartShift(grid, undefined, 80)).toBe(0);
    const typical = { band: 0, cellMm: { x: 0, y: 0, w: 44, h: 60 } };
    for (const to of [12, 40, 90]) expect(captionStartShift(typical, undefined, to)).toBe(0);
    const wide = { band: 1, cellMm: { x: 0, y: 0, w: 74, h: 60 } };
    expect(captionStartShift(wide, undefined, 44)).toBe(0);
    expect(captionStartShift(wide, undefined, 60)).toBeCloseTo(-5, 9);
    expect(captionStartShift(wide, undefined, 120)).toBeCloseTo(-10, 9);
    expect(captionStartShift(wide, 120, 60)).toBeCloseTo(5, 9);
  });
});
