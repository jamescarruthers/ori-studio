import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SETUP, type DiagramPageSetup, type DiagramPaperSize } from '../document/diagramDocument';
import { readFontMetrics, type FontMetrics } from '../fonts/fontMetrics';
import { FOOTER_MM, HEADER_MM } from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { fontTextSetter } from './fontTextSetter';
import type { PageBox } from './pagePlacement';
import { PRINT_PAPER_MM, printPaper } from './printPaper';
import { STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';
import {
  setTitleBlock,
  TITLE_BLOCK_BYLINE_LINES,
  TITLE_BLOCK_TITLE_MM,
  titleBlockGeometry,
  type TitleBlockGeometry,
} from './titleBlockGeometry';

/**
 * Where the first page's title block goes (`implementation-plans/
 * diagram-title-block.md`, sections 2 and 3), and its title and byline set.
 */

const ON = { enabled: true, heightShare: 0.27 };
const setupOf = (patch: Partial<DiagramPageSetup> = {}): DiagramPageSetup => ({
  ...DEFAULT_PAGE_SETUP,
  layout: 'flow',
  titleBlock: ON,
  ...patch,
});
const geometryOf = (patch: Partial<DiagramPageSetup> = {}, head = HEADER_MM, foot = FOOTER_MM) =>
  titleBlockGeometry(setupOf(patch), head, foot)!;

const SIZES = Object.keys(PRINT_PAPER_MM) as DiagramPaperSize[];
const EVERY_PAPER = SIZES.flatMap((size) => (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation })));

const right = (box: PageBox) => box.x + box.w;
const foot = (box: PageBox) => box.y + box.h;
/** The area two boxes share, mm²: none where they only touch. */
const overlap = (a: PageBox, b: PageBox) =>
  Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(foot(a), foot(b)) - Math.max(a.y, b.y));
const inside = (box: PageBox, around: PageBox) => {
  const near = 1e-9;
  expect(box.x).toBeGreaterThanOrEqual(around.x - near);
  expect(box.y).toBeGreaterThanOrEqual(around.y - near);
  expect(right(box)).toBeLessThanOrEqual(right(around) + near);
  expect(foot(box)).toBeLessThanOrEqual(foot(around) + near);
};

describe('titleBlockGeometry', () => {
  it('is a band from margin to margin, its share of the printable height tall, in the flow on every paper either way up', () => {
    for (const paper of EVERY_PAPER) {
      const setup = setupOf(paper);
      const { widthMm: W, heightMm: H, marginMm: m } = printPaper(setup);
      const { block, rows } = titleBlockGeometry(setup, HEADER_MM, FOOTER_MM)!;
      expect(block, JSON.stringify(paper)).toEqual({ x: m, y: m, w: W - 2 * m, h: 0.27 * (H - 2 * m) });
      expect(rows).toBe(0);
    }
    // 74 mm on A4 portrait, 50 mm on A4 landscape: the plan's figures.
    expect(geometryOf().block.h).toBeCloseTo(73.71, 2);
    expect(geometryOf({ orientation: 'landscape' }).block.h).toBeCloseTo(50.22, 2);
    // Read from the setup alone: neither the title's tab nor the page numbers move it.
    expect(geometryOf({}, 0, 0)).toEqual(geometryOf());
  });

  it('stands the pattern square at its right, the model in front of its lower left, the title and byline down its left, inside it', () => {
    for (const paper of EVERY_PAPER) {
      const label = JSON.stringify(paper);
      const { block, title, byline, pattern, model, art } = geometryOf(paper);
      // The pattern: a square as tall as the block, at its right, its foot on the block's.
      expect(pattern.w, label).toBeCloseTo(pattern.h, 9);
      expect(pattern.h, label).toBeCloseTo(block.h, 9);
      expect(right(pattern), label).toBeCloseTo(right(block), 9);
      // The model: in front of the pattern's lower left — reaching into it from its left, its foot on the block's.
      expect(foot(model), label).toBeCloseTo(foot(block), 9);
      expect(model.x, label).toBeLessThan(pattern.x);
      expect(right(model), label).toBeGreaterThan(pattern.x);
      expect(right(model), label).toBeLessThan(right(pattern));
      expect(model.y, label).toBeGreaterThan(pattern.y);
      expect(model.h / pattern.h, label).toBeCloseTo(0.75, 9);
      expect(model.w / model.h, label).toBeLessThanOrEqual(1.25 + 1e-9);
      // The art: the two together.
      expect(art, label).toEqual({ x: model.x, y: pattern.y, w: right(pattern) - model.x, h: pattern.h });
      // The title runs to the art beside it and the byline to the model, each 4 mm short; the byline under the title.
      expect(title.x, label).toBe(block.x);
      expect(right(title), label).toBeCloseTo((model.y < foot(title) ? model.x : pattern.x) - 4, 9);
      expect(right(byline), label).toBeCloseTo(model.x - 4, 9);
      expect(byline.y, label).toBeGreaterThan(foot(title));
      expect(title.h).toBe(TITLE_BLOCK_TITLE_MM.max);
      for (const part of [title, byline, pattern, model, art]) inside(part, block);
    }
  });

  it('keeps the title and the byline clear of the pattern and the model at every share, on every paper and grid', () => {
    const shares = [0.15, 0.27, 0.5];
    const layouts: Partial<DiagramPageSetup>[] = [{ layout: 'flow' }, ...[2, 3, 4, 6].map((rows) => ({ layout: 'grid' as const, columns: 3, rows }))];
    let titleBesideModel = 0;
    for (const paper of EVERY_PAPER) {
      for (const heightShare of shares) {
        for (const layout of layouts) {
          const label = JSON.stringify({ ...paper, heightShare, ...layout });
          const { title, byline, pattern, model } = geometryOf({ ...paper, ...layout, titleBlock: { enabled: true, heightShare } });
          // Text against art, and the title against the byline: no two of them share a point inside.
          for (const [a, b] of [[title, pattern], [title, model], [byline, pattern], [byline, model], [title, byline]] as const) {
            expect(overlap(a, b), label).toBe(0);
          }
          if (model.y < foot(title)) titleBesideModel += 1;
        }
      }
    }
    // The case the review found: a short block, where the model's box reaches up beside the title.
    expect(titleBesideModel).toBeGreaterThan(0);
  });

  it('takes a grid’s whole rows nearest its share, and the header’s room above them, so every page keeps one cell', () => {
    const grid = (rows: number, head = HEADER_MM) => geometryOf({ layout: 'grid', columns: 3, rows }, head);
    // A4 upright, a 12 mm margin: 273 mm inside it.
    const cell = (rows: number, head = HEADER_MM) => (273 - head - FOOTER_MM) / rows;
    expect([2, 3, 4, 5, 6].map((rows) => grid(rows).rows)).toEqual([1, 1, 1, 1, 2]);
    expect(grid(3).block.h).toBeCloseTo(HEADER_MM + cell(3), 9);
    expect(grid(6).block.h).toBeCloseTo(HEADER_MM + 2 * cell(6), 9);
    // With no tab on any page, no header's room.
    expect(grid(3, 0).block.h).toBeCloseTo(cell(3, 0), 9);
    // Two rows give the block half the page: the pattern is held to under half its width, and stays square.
    const two = grid(2);
    expect(two.pattern.w).toBeCloseTo(0.45 * two.block.w, 9);
    expect(two.pattern.h).toBeCloseTo(two.pattern.w, 9);
    expect(foot(two.pattern)).toBeCloseTo(foot(two.block), 9);
    inside(two.model, two.block);
  });

  it('is none where the block is off, or a grid of one row has no room for it', () => {
    expect(titleBlockGeometry(setupOf({ titleBlock: { enabled: false, heightShare: 0.27 } }), HEADER_MM, FOOTER_MM)).toBeNull();
    expect(titleBlockGeometry(setupOf({ layout: 'grid', rows: 1 }), HEADER_MM, FOOTER_MM)).toBeNull();
  });
});

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

describe('setTitleBlock', () => {
  const geometry: TitleBlockGeometry = geometryOf();
  const set = (title: string, byline = '', setter = estimateTextSetter) => setTitleBlock(geometry, { title, byline }, setter);

  it('sets a title that fits on one bold line at its largest size, its capitals’ tops at the block’s top', () => {
    const { title } = set('Crane');
    expect(title!.sizeMm).toBe(TITLE_BLOCK_TITLE_MM.max);
    expect(title!.line.text).toBe('Crane');
    expect(title!.line.ellipsis).toBe(false);
    expect(title!.baseline).toBeCloseTo(geometry.block.y + 0.72 * TITLE_BLOCK_TITLE_MM.max, 9);
  });

  it('keeps a title’s ink in its row, its tallest letter on the block’s top: a capital’s, an accent’s, an ideograph’s', () => {
    // The ink the faces' outlines give, per em: the line's highest top and lowest foot.
    const inkOf = (text: string, face: string) => {
      const glyphs = [...text].flatMap((character) => METRICS[face]!.ink(character.codePointAt(0)!) ?? []);
      return { top: Math.max(...glyphs.map((glyph) => glyph.top)) / 1000, bottom: Math.min(...glyphs.map((glyph) => glyph.bottom)) / 1000 };
    };
    for (const [title, face] of [
      ['Crane', 'latin-700'],
      ['Origami', 'latin-700'],
      ['Élan Ångström', 'latin-700'],
      ['将底角', 'sc-700'],
    ] as const) {
      const set = setTitleBlock(geometry, { title, byline: '' }, fonts).title!;
      const { top, bottom } = inkOf(title, face);
      expect(set.baseline - top * set.sizeMm, title).toBeCloseTo(geometry.block.y, 9);
      expect(set.baseline - bottom * set.sizeMm, title).toBeLessThanOrEqual(foot(geometry.title) + 1e-9);
    }
    // Taller than a capital: set further down than one; and an accent over a descender, smaller, to keep clear of the byline.
    expect(setTitleBlock(geometry, { title: 'Élan', byline: '' }, fonts).title!.baseline).toBeGreaterThan(geometry.block.y + 0.9 * TITLE_BLOCK_TITLE_MM.max);
    expect(setTitleBlock(geometry, { title: CJK.slice(0, 3), byline: '' }, fonts).title!.baseline).toBeGreaterThan(geometry.block.y + 0.82 * TITLE_BLOCK_TITLE_MM.max);
    expect(setTitleBlock(geometry, { title: 'Crane', byline: '' }, fonts).title!.sizeMm).toBe(TITLE_BLOCK_TITLE_MM.max);
    expect(setTitleBlock(geometry, { title: 'Élan Ångström', byline: '' }, fonts).title!.sizeMm).toBeLessThan(TITLE_BLOCK_TITLE_MM.max);
    // Estimated where the fonts are not loaded: a capital's height, an ideograph's.
    expect(set('Crane').title!.baseline).toBeCloseTo(geometry.block.y + 0.72 * TITLE_BLOCK_TITLE_MM.max, 9);
    expect(set('千纸鹤').title!.baseline).toBeCloseTo(geometry.block.y + 0.88 * TITLE_BLOCK_TITLE_MM.max, 9);
  });

  it('sets a longer title smaller, as large as fits its column, and at its least size cuts it with "…"', () => {
    const longer = set('Traditional Crane with Flapping Wings').title!;
    expect(longer.sizeMm).toBeLessThan(TITLE_BLOCK_TITLE_MM.max);
    expect(longer.sizeMm).toBeGreaterThan(TITLE_BLOCK_TITLE_MM.min);
    expect(longer.line.ellipsis).toBe(false);
    expect(longer.line.widthMm).toBeLessThanOrEqual(geometry.title.w);
    // Nearly the whole column: the size is read off the width, to a hundredth of a mm.
    expect(longer.line.widthMm).toBeGreaterThan(geometry.title.w * 0.99);
    const longest = set('The Traditional Japanese Crane, Folded from One Uncut Square, with Its Flapping Wings').title!;
    expect(longest.sizeMm).toBe(TITLE_BLOCK_TITLE_MM.min);
    expect(longest.line.ellipsis).toBe(true);
    expect(longest.line.widthMm).toBeLessThanOrEqual(geometry.title.w);
  });

  it('sets a Chinese title and byline in the Chinese face, with the fonts’ own advances, inside their columns', () => {
    const { title, byline } = set(`${CJK}${CJK}`, `${CJK}\n${CJK}`, fonts);
    expect(title!.line.runs.some((run) => run.font === 'sc-700')).toBe(true);
    expect(title!.line.widthMm).toBeLessThanOrEqual(geometry.title.w);
    expect(byline!.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of byline!.lines) {
      expect(line.runs.every((run) => run.font === 'sc-400')).toBe(true);
      expect(line.widthMm).toBeLessThanOrEqual(geometry.byline.w);
    }
  });

  it('sets the byline in the step text’s size under the title, its author’s lines kept, on four lines at most', () => {
    const { byline } = set('Crane', 'Design: traditional\nDiagrams: Zach\nPaper: 15 cm square');
    expect(byline!.lines.map((line) => line.text)).toEqual(['Design: traditional', 'Diagrams: Zach', 'Paper: 15 cm square']);
    expect(byline!.firstBaseline).toBeCloseTo(geometry.byline.y + 0.72 * STEP_TEXT_SIZE_MM, 9);
    const long = set('Crane', Array.from({ length: 6 }, (_, index) => `Line ${index + 1}`).join('\n')).byline!;
    expect(long.lines).toHaveLength(TITLE_BLOCK_BYLINE_LINES);
    expect(long.lines.at(-1)!.ellipsis).toBe(true);
    // The last line inside the block.
    const last = long.firstBaseline + (TITLE_BLOCK_BYLINE_LINES - 1) * STEP_TEXT_LEADING_MM;
    expect(last).toBeLessThan(foot(geometry.block));
  });

  it('sets fewer byline lines in a block too short for four, and nothing for an empty title or byline: the block keeps its room', () => {
    // The least share on the shortest page: A5 landscape at 15%.
    const short = geometryOf({ size: 'a5', orientation: 'landscape', titleBlock: { enabled: true, heightShare: 0.15 } });
    inside(short.byline, short.block);
    const lines = setTitleBlock(short, { title: 'Crane', byline: 'One\nTwo\nThree\nFour' }, estimateTextSetter).byline!.lines;
    expect(lines.length).toBeLessThan(TITLE_BLOCK_BYLINE_LINES);
    expect(lines.length).toBeGreaterThan(0);
    const empty = set('  ', '');
    expect(empty).toEqual({ geometry, title: null, byline: null });
  });
});
