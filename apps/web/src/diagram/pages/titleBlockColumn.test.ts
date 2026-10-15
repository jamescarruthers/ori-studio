import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  TITLE_BLOCK_ART_SIZE_DEFAULTS,
  type DiagramPageSetup,
  type DiagramPaperSize,
} from '../document/diagramDocument';
import { readFontMetrics, type FontMetrics } from '../fonts/fontMetrics';
import { FOOTER_MM, HEADER_MM, type TextSetter } from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { fontTextSetter } from './fontTextSetter';
import type { PageBox } from './pagePlacement';
import { PRINT_PAPER_MM } from './printPaper';
import {
  LEAST_SCALE,
  setTitleBlock,
  titleBlockInks,
  trackedLine,
  type LayoutTitleBlock,
  type TitleBlockCreditText,
  type TitleBlockLook,
} from './titleBlockColumn';
import { titleBlockGeometry } from './titleBlock.fixtures';

/**
 * The title block's text column (`implementation-plans/diagram-title-block.md`,
 * Phase 1c): Zach's J1b, set with the diagram's fonts.
 */

const FONT_DIR = resolve(process.cwd(), 'src/diagram/fonts');
const FONT_FILES: Record<string, string> = {
  'latin-400': 'NotoSans-Regular.ttf',
  'latin-700': 'NotoSans-Bold.ttf',
  'sc-400': 'fixtures/NotoSansSC-Regular.fixture.ttf',
  'sc-700': 'fixtures/NotoSansSC-Bold.fixture.ttf',
};
const METRICS: Record<string, FontMetrics> = Object.fromEntries(
  Object.entries(FONT_FILES).map(([face, file]) => [face, readFontMetrics(new Uint8Array(readFileSync(resolve(FONT_DIR, file))))])
);
const fonts = fontTextSetter((key, weight) => METRICS[`${key}-${weight}`] ?? null, 'sc');
/** Characters the Chinese fixture faces carry. */
const CJK = '将底角向上折至顶角，压实折痕后展开。';

const PT = 72 / 25.4;
const J1B_SETUP: DiagramPageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'flow' };
const CREDITS: TitleBlockCreditText[] = [
  { label: 'AUTHOR', value: 'Traditional' },
  { label: 'RECOMMENDED SIZE', value: '60 cm × 60 cm' },
  { label: 'STEPS', value: '28' },
];
const lookOf = (patch: Partial<TitleBlockLook> = {}): TitleBlockLook => ({
  subtitle: 'ORIGAMI DIAGRAM',
  credits: CREDITS,
  note: '',
  sizes: TITLE_BLOCK_ART_SIZE_DEFAULTS,
  ...patch,
});
const setOf = (patch: Partial<TitleBlockLook> = {}, setup = J1B_SETUP, title = 'Crane', setter: TextSetter = fonts): LayoutTitleBlock => {
  const block = lookOf(patch);
  return setTitleBlock(titleBlockGeometry(setup, HEADER_MM, FOOTER_MM, block.sizes)!, { title, block }, setter);
};

const right = (box: { x: number; w: number }) => box.x + box.w;
const foot = (box: PageBox) => box.y + box.h;
/** Within half a millimetre of J1b's number, in pt. */
const nearJ1b = (mm: number, pt: number, label?: string) => expect(Math.abs(mm * PT - pt) / PT, label).toBeLessThanOrEqual(0.5);

describe('setTitleBlock: J1b on A4 portrait', () => {
  it('sets the subtitle’s capitals on the block’s top, tracked, and its rule from after it to the band’s end at their middle', () => {
    const { subtitle, band, geometry, scale } = setOf();
    expect(scale).toBe(1);
    expect(subtitle!.line.text).toBe('ORIGAMI DIAGRAM');
    expect(subtitle!.sizeMm * PT).toBeCloseTo(7, 6);
    expect(subtitle!.trackingMm / subtitle!.sizeMm).toBeCloseTo(0.12, 9);
    nearJ1b(subtitle!.baseline, 39.02);
    // Its tallest letter on the block's top.
    expect(subtitle!.baseline - fonts.ink(subtitle!.line, subtitle!.sizeMm).above).toBeCloseTo(geometry.block.y, 9);
    // Tracked: the room after each letter but the last is in its width, and in each run's place.
    const plain = fonts.line('ORIGAMI DIAGRAM', subtitle!.sizeMm, 700);
    expect(subtitle!.line.widthMm).toBeCloseTo(plain.widthMm + 14 * subtitle!.trackingMm, 9);
    const { rule } = subtitle!;
    nearJ1b(rule!.x1, 120.49);
    nearJ1b(rule!.y, 36.52);
    expect(rule!.x1).toBeCloseTo(geometry.column.x + subtitle!.line.widthMm + 6 / PT, 9);
    expect(rule!.x2).toBe(right(band));
    expect(rule!.x2).toBe(right(geometry.column));
  });

  it('sets the band under it, 22 mm tall, from the margin to the art, and the title in it at 16 mm, 6 mm in, its capitals centred', () => {
    const { band, title, geometry } = setOf();
    nearJ1b(band.y, 46.52);
    nearJ1b(band.h, 62.36);
    expect(band.x).toBe(geometry.block.x);
    expect(right(band)).toBe(right(geometry.column));
    expect(title!.lines.map(({ text }) => text)).toEqual(['Crane']);
    expect(title!.sizeMm).toBeCloseTo(16, 9);
    nearJ1b(title!.x, 51.02);
    nearJ1b(title!.baseline, 93.89);
    expect(title!.baseline - (0.714 * title!.sizeMm) / 2).toBeCloseTo(band.y + band.h / 2, 9);
  });

  it('sets the credits in a row of columns from the margin, each as wide as its wider part, a divider in each 12 pt gutter', () => {
    const { credits, band, geometry } = setOf();
    const { columns, dividers } = credits!;
    expect(columns.map(({ label, value }) => [label.text, value.text])).toEqual(CREDITS.map(({ label, value }) => [label, value]));
    expect(credits!.labelSizeMm * PT).toBeCloseTo(7, 6);
    expect(credits!.valueSizeMm).toBeCloseTo(4.2, 9);
    // One row: the labels' capitals 13 pt under the band, the values' baselines 15 pt under the labels'.
    for (const column of columns) {
      expect(column.top).toBeCloseTo(foot(band) + 13 / PT, 9);
      nearJ1b(column.labelBaseline, 126.88);
      nearJ1b(column.valueBaseline, 141.88);
      expect(column.w).toBeCloseTo(Math.max(column.label.widthMm, column.value.widthMm), 9);
    }
    expect(columns[0]!.x).toBe(geometry.block.x);
    // Measured: "Traditional" in its face is 60.29 pt (J1b's mock drew its column 66.27 pt wide).
    expect(columns[0]!.w * PT).toBeCloseTo(60.29, 1);
    columns.slice(1).forEach((column, index) => {
      const before = columns[index]!;
      expect(column.x).toBeCloseTo(right(before) + 12 / PT, 9);
      expect(dividers[index]).toEqual({ x: expect.closeTo(right(before) + 6 / PT, 9), y1: column.top, y2: column.valueBaseline });
    });
    expect(dividers).toHaveLength(columns.length - 1);
    expect(credits!.cut).toBe(0);
  });

  it('drops the subtitle’s line and its rule where there is none, and starts the band at the block’s top', () => {
    const plain = setOf();
    const none = setOf({ subtitle: '  ' });
    expect(none.subtitle).toBeNull();
    expect(none.band).toEqual({ ...plain.band, y: none.geometry.block.y });
    const up = plain.band.y - none.band.y;
    expect(up * PT).toBeCloseTo(12.5, 6);
    // The rest moves up with it, and the art stays where it was.
    expect(none.title!.baseline).toBeCloseTo(plain.title!.baseline - up, 9);
    expect(none.credits!.columns[0]!.labelBaseline).toBeCloseTo(plain.credits!.columns[0]!.labelBaseline - up, 9);
    expect(none.geometry).toEqual(plain.geometry);
  });

  it('prints no credit with an empty value, and marks where each would go after the printed ones, for the Pages view', () => {
    const set = setOf({ credits: [{ label: 'AUTHOR', value: '' }, { label: 'RECOMMENDED SIZE', value: ' ' }, { label: 'STEPS', value: '28' }] });
    expect(set.credits!.columns.map(({ label }) => label.text)).toEqual(['STEPS']);
    expect(set.credits!.dividers).toEqual([]);
    const steps = set.credits!.columns[0]!;
    expect(set.emptyCredits.map(({ label }) => label)).toEqual(['AUTHOR', 'RECOMMENDED SIZE']);
    const [author, size] = set.emptyCredits.map(({ box }) => box);
    expect(author!.x).toBeCloseTo(right(steps) + 12 / PT, 9);
    expect(author!.y).toBe(steps.top);
    expect(size!.x).toBeCloseTo(right(author!) + 12 / PT, 9);
    expect(right(size!)).toBeLessThanOrEqual(right(set.geometry.column) + 1e-9);
    // None with a value: each marked from the margin.
    const blank = setOf({ credits: [{ label: 'AUTHOR', value: '' }] });
    expect(blank.credits).toBeNull();
    expect(blank.emptyCredits[0]!.box.x).toBe(blank.geometry.block.x);
  });

  it('wraps the credits to a second row where a row is wider than the band, and marks none where one with a value is cut', () => {
    const many = [...CREDITS, { label: 'DIAGRAMS', value: 'Zachary Marion' }, { label: 'PAPER', value: 'One uncut square of kami' }];
    const { credits, geometry } = setOf({ credits: many });
    const rows = [...new Set(credits!.columns.map(({ top }) => top))];
    expect(rows).toHaveLength(2);
    expect(credits!.columns.map(({ label }) => label.text)).toEqual(many.map(({ label }) => label));
    const second = credits!.columns.filter(({ top }) => top === rows[1]);
    expect(second[0]!.x).toBe(geometry.block.x);
    // Every row inside the band's width, and no divider at a row's end.
    for (const column of credits!.columns) expect(right(column)).toBeLessThanOrEqual(right(geometry.column) + 1e-9);
    expect(credits!.dividers).toHaveLength(many.length - 2);
    // On the shortest block, what has no room is not printed: counted, and no empty credit marked after it.
    const short = setOf({ credits: [...many, ...many, { label: 'NOTE', value: '' }] }, { ...J1B_SETUP, size: 'a5', orientation: 'landscape', titleBlock: { enabled: true, heightShare: 0.15 } });
    expect(short.credits!.cut).toBeGreaterThan(0);
    expect(short.credits!.columns.length + short.credits!.cut).toBe(2 * many.length);
    expect(short.emptyCredits).toEqual([]);
  });

  it('wraps the note to the band’s width under the credits, and cuts it with "…" where it would run past the block’s foot', () => {
    const note = 'Use thin paper.\nThe neck and the tail are reverse folded at the same angle, so crease the first well before you match the second to it.';
    const { note: set, credits, geometry, band } = setOf({ note });
    expect(set!.lines.map((line) => line.text)[0]).toBe('Use thin paper.');
    expect(set!.lines.length).toBeGreaterThan(2);
    expect(set!.cut).toBe(false);
    for (const line of set!.lines) expect(line.widthMm).toBeLessThanOrEqual(band.w + 1e-9);
    expect(set!.top).toBeCloseTo(credits!.columns[0]!.valueBaseline + 10 / PT, 9);
    expect(set!.firstBaseline - fonts.ink(set!.lines[0]!, set!.sizeMm).above).toBeCloseTo(set!.top, 9);
    // A long one: as many lines as the block has room for, the last cut, the block as it was.
    const long = setOf({ note: Array.from({ length: 30 }, (_, index) => `Line ${index + 1}`).join('\n') });
    expect(long.note!.cut).toBe(true);
    expect(long.note!.lines.at(-1)!.ellipsis).toBe(true);
    const last = long.note!.firstBaseline + (long.note!.lines.length - 1) * long.note!.leadingMm;
    expect(last + 0.24 * long.note!.sizeMm).toBeLessThanOrEqual(foot(geometry.block) + 1e-9);
    expect(long.geometry).toEqual(geometry);
    expect(long.scale).toBe(1);
    // An empty note prints nothing; no credits: the note where they would start.
    expect(setOf({ note: ' \n ' }).note).toBeNull();
    const alone = setOf({ credits: [], note: 'Use thin paper.' });
    expect(alone.note!.top).toBeCloseTo(foot(alone.band) + 13 / PT, 9);
  });

  it('sets a longer title smaller to fit the band, on two lines rather than under half its size, and cuts it only past that', () => {
    const { title: longer, band } = setOf({}, J1B_SETUP, 'Traditional Crane');
    expect(longer!.lines).toHaveLength(1);
    expect(longer!.sizeMm).toBeLessThan(16);
    expect(longer!.sizeMm).toBeGreaterThanOrEqual(8);
    expect(longer!.lines[0]!.ellipsis).toBe(false);
    expect(longer!.lines[0]!.widthMm).toBeLessThanOrEqual(band.w - 12 + 1e-9);
    expect(longer!.lines[0]!.widthMm).toBeGreaterThan((band.w - 12) * 0.99);
    // One line would be under half its size: two, every word printed, larger than one line could be, inside the band.
    const two = (title: string, setter: TextSetter = fonts) => {
      const set = setOf({}, J1B_SETUP, title, setter);
      const { lines, sizeMm, leadingMm, baseline } = set.title!;
      expect(lines, title).toHaveLength(2);
      expect(lines.map(({ text }) => text).join(' ').replace(/\s+/g, ''), title).toBe(title.replace(/\s+/g, ''));
      expect(lines.some(({ ellipsis }) => ellipsis), title).toBe(false);
      for (const line of lines) expect(line.widthMm, title).toBeLessThanOrEqual(set.band.w - 12 + 1e-9);
      expect(baseline - setter.ink(lines[0]!, sizeMm).above, title).toBeGreaterThanOrEqual(set.band.y - 1e-9);
      expect(baseline + leadingMm + setter.ink(lines[1]!, sizeMm).below, title).toBeLessThanOrEqual(foot(set.band) + 1e-9);
      // Its capitals' block centred in the band.
      expect(baseline + (leadingMm - 0.714 * sizeMm) / 2, title).toBeCloseTo(set.band.y + set.band.h / 2, 9);
      return sizeMm;
    };
    // The review's titles (2026-10-15), each cut to "…" on one line at its least size, 13.6 pt, before.
    const crane = 'The Traditional Japanese Crane, with Flapping Wings and a Long Neck';
    expect(two(crane)).toBeGreaterThan(0.3 * 16 * 1.25);
    expect(two(`${CJK}${CJK.slice(0, 9)}`)).toBeGreaterThan(0.3 * 16 * 1.25);
    // Past two lines at its least size: cut with "…" on the second.
    const longest = setOf({}, J1B_SETUP, Array.from({ length: 6 }, () => crane).join(' ')).title!;
    expect(longest.sizeMm).toBeCloseTo(0.3 * 16, 9);
    expect(longest.lines).toHaveLength(2);
    expect(longest.lines[1]!.ellipsis).toBe(true);
    expect(setOf({}, J1B_SETUP, '   ').title).toBeNull();
  });

  it('sets a Chinese title, labels, values and note in the Chinese faces, inside the column', () => {
    const set = setOf(
      { subtitle: CJK.slice(3, 7), credits: [{ label: CJK.slice(7, 9), value: CJK.slice(0, 3) }], note: `${CJK}${CJK}${CJK}${CJK}` },
      J1B_SETUP,
      `${CJK.slice(0, 3)} Crane`
    );
    expect(set.title!.lines[0]!.runs.some((run) => run.font === 'sc-700')).toBe(true);
    expect(set.subtitle!.line.runs.every((run) => run.font === 'sc-700')).toBe(true);
    expect(set.credits!.columns[0]!.label.runs.every((run) => run.font === 'sc-700')).toBe(true);
    expect(set.credits!.columns[0]!.value.runs.every((run) => run.font === 'sc-400')).toBe(true);
    expect(set.note!.lines.length).toBeGreaterThan(1);
    for (const line of set.note!.lines) {
      expect(line.runs.every((run) => run.font === 'sc-400')).toBe(true);
      expect(line.widthMm).toBeLessThanOrEqual(set.band.w + 1e-9);
    }
  });
});

describe('setTitleBlock: every paper, share and grid', () => {
  const SIZES = Object.keys(PRINT_PAPER_MM) as DiagramPaperSize[];
  const EVERY_PAPER = SIZES.flatMap((size) => (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation })));
  const layouts: Partial<DiagramPageSetup>[] = [{ layout: 'flow' }, ...[2, 3, 6].map((rows) => ({ layout: 'grid' as const, columns: 3, rows }))];
  const NOTE = 'Use thin paper. The neck and the tail are reverse folded at the same angle, so crease the first well before you match the second.';

  it('scales the column to fit the block, J1b’s sizes where it has room, and prints everything inside the column', () => {
    let scaled = 0;
    for (const paper of EVERY_PAPER) {
      for (const heightShare of [0.15, 0.23, 0.27, 0.5]) {
        for (const layout of layouts) {
          for (const setter of [fonts, estimateTextSetter]) {
            const label = JSON.stringify({ ...paper, heightShare, ...layout, setter: setter === fonts });
            const set = setOf({ note: NOTE }, { ...J1B_SETUP, ...paper, ...layout, titleBlock: { enabled: true, heightShare } }, 'Crane', setter);
            const { column } = set.geometry;
            expect(set.scale, label).toBeGreaterThanOrEqual(LEAST_SCALE);
            expect(set.scale, label).toBeLessThanOrEqual(1);
            if (set.scale < 1) scaled += 1;
            // Top to bottom, each inside the column, none over the next.
            const within = (box: PageBox) => {
              expect(box.x, label).toBeGreaterThanOrEqual(column.x - 1e-9);
              expect(right(box), label).toBeLessThanOrEqual(right(column) + 1e-9);
              expect(box.y, label).toBeGreaterThanOrEqual(column.y - 1e-9);
              expect(foot(box), label).toBeLessThanOrEqual(foot(column) + 1e-9);
            };
            const sub = set.subtitle!;
            within({ x: column.x, y: sub.baseline - fonts.ink(sub.line, sub.sizeMm).above, w: sub.line.widthMm, h: sub.sizeMm });
            within(set.band);
            expect(set.band.y, label).toBeGreaterThan(sub.baseline);
            for (const credit of set.credits?.columns ?? []) {
              within({ x: credit.x, y: credit.top, w: credit.w, h: credit.valueBaseline + 0.24 * set.credits!.valueSizeMm - credit.top });
              expect(credit.top, label).toBeGreaterThan(foot(set.band));
            }
            // At J1b's sizes where the block has room for the three credits.
            if (set.scale === 1) expect(set.credits!.cut, label).toBe(0);
            const note = set.note!;
            if (note.lines.length > 0) {
              const last = note.firstBaseline + (note.lines.length - 1) * note.leadingMm;
              within({ x: column.x, y: note.top, w: Math.max(...note.lines.map((line) => line.widthMm)), h: last + 0.24 * note.sizeMm - note.top });
              expect(note.top, label).toBeGreaterThan(set.credits!.columns.at(-1)!.valueBaseline);
            }
            // A note under credits that are cut is cut too.
            if (set.credits!.cut > 0) expect(note, label).toMatchObject({ lines: [], cut: true });
          }
        }
      }
    }
    // The short blocks: A5 and landscape pages, the least shares.
    expect(scaled).toBeGreaterThan(0);
  });

  it('prints every credit wherever the column is scaled above its least, whatever its labels’ letters (review, 2026-10-15)', () => {
    // The labels a new diagram gets in each catalog that reaches past a capital — an accent, an ideograph — beside
    // English: all with values, and as a new diagram has them, the step count alone.
    const LABELS = [
      ['AUTHOR', 'RECOMMENDED SIZE', 'STEPS'],
      ['AUTEUR', 'TAILLE RECOMMANDÉE', 'ÉTAPES'],
      ['AUTOR', 'EMPFOHLENE GRÖSSE', 'SCHRITTE'],
      ['AUTOR', 'TAMAÑO RECOMENDADO', 'PASOS'],
      [CJK.slice(0, 2), CJK.slice(2, 6), CJK.slice(6, 9)],
    ];
    const VALUES = [
      ['Traditional', '60 cm × 60 cm', '28'],
      ['', '', '28'],
    ];
    let scaled = 0;
    for (const paper of EVERY_PAPER) {
      for (const heightShare of [0.15, 0.23, 0.27, 0.5]) {
        for (const layout of layouts) {
          for (const labels of LABELS) {
            for (const values of VALUES) {
              const credits = labels.map((label, at) => ({ label, value: values[at]! }));
              const set = setOf({ credits }, { ...J1B_SETUP, ...paper, ...layout, titleBlock: { enabled: true, heightShare } });
              const label = JSON.stringify({ ...paper, heightShare, ...layout, labels, values, scale: set.scale });
              if (set.scale < 1) scaled += 1;
              if (set.scale > LEAST_SCALE) expect(set.credits!.cut, label).toBe(0);
            }
          }
        }
      }
    }
    expect(scaled).toBeGreaterThan(0);
  });

  it('prints a note’s first line at least, on every paper either way up at a new diagram’s share (review, 2026-10-15)', () => {
    for (const paper of EVERY_PAPER) {
      for (const layout of layouts) {
        const set = setOf({ note: NOTE }, { ...J1B_SETUP, ...paper, ...layout, titleBlock: { enabled: true, heightShare: 0.23 } });
        const label = JSON.stringify({ ...paper, ...layout, scale: set.scale });
        expect(set.credits!.cut, label).toBe(0);
        expect(set.note!.lines.length, label).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('trackedLine', () => {
  it('places each run after the room its letters take, and measures the line with it, cut to the width with it', () => {
    const tracking = 0.5;
    const plain = fonts.line(`AB${CJK.slice(0, 2)}`, 3, 700);
    const tracked = trackedLine(fonts, `AB${CJK.slice(0, 2)}`, 3, 700, tracking, Number.POSITIVE_INFINITY);
    expect(tracked.widthMm).toBeCloseTo(plain.widthMm + 3 * tracking, 9);
    expect(tracked.runs.map((run) => run.xMm)).toEqual(plain.runs.map((run, index) => run.xMm + (index === 0 ? 0 : 2 * tracking)));
    const cut = trackedLine(fonts, 'RECOMMENDED SIZE', 3, 700, tracking, 20);
    expect(cut.ellipsis).toBe(true);
    expect(cut.widthMm).toBeLessThanOrEqual(20 + 1e-9);
  });
});

describe('titleBlockInks', () => {
  const INK = '#16191c';
  it('fills the band in the paper’s coloured side, the title white on it, and the rules in it', () => {
    // The crane's paper: white on the front, pink behind — J1b's band.
    expect(titleBlockInks({ front: '#ffffff', back: '#d982a5' }, INK)).toEqual({ band: '#d982a5', title: '#ffffff', rule: '#d982a5' });
    expect(titleBlockInks({ front: '#2a4d8f', back: '#ffffff' }, INK)).toEqual({ band: '#2a4d8f', title: '#ffffff', rule: '#2a4d8f' });
  });

  it('prints the title and the rules in ink on a pale paper, white on it under 2.5:1', () => {
    // The Diagram preset's grey back (2.1:1) and a cream.
    expect(titleBlockInks({ front: '#ffffff', back: '#b3b3b3' }, INK)).toEqual({ band: '#b3b3b3', title: INK, rule: INK });
    expect(titleBlockInks({ front: '#ffffff', back: '#f3ead2' }, INK)).toEqual({ band: '#f3ead2', title: INK, rule: INK });
    expect(titleBlockInks({ front: '#ffffff', back: '#ffffff' }, INK)).toEqual({ band: '#ffffff', title: INK, rule: INK });
  });
});
