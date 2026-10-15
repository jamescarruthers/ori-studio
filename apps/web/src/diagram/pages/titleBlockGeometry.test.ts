import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  TITLE_BLOCK_ART_SIZE_DEFAULTS,
  TITLE_BLOCK_ART_SIZE_RANGE,
  type DiagramPageSetup,
  type DiagramPaperSize,
} from '../document/diagramDocument';
import { FOOTER_MM, HEADER_MM } from './diagramPageLayout';
import type { PageBox } from './pagePlacement';
import { PRINT_PAPER_MM, printPaper } from './printPaper';
import { titleBlockBand, titleBlockGeometry, titleBlockParts, type TitleBlockSizes } from './titleBlockGeometry';

/**
 * Where the first page's title block goes (`implementation-plans/
 * diagram-title-block.md`, sections 2 and 3, Phase 1c): the band, which is
 * layout, and the parts in it, which are look.
 */

const ON = { enabled: true, heightShare: 0.27 };
const setupOf = (patch: Partial<DiagramPageSetup> = {}): DiagramPageSetup => ({
  ...DEFAULT_PAGE_SETUP,
  layout: 'flow',
  titleBlock: ON,
  ...patch,
});
const DEFAULTS: TitleBlockSizes = TITLE_BLOCK_ART_SIZE_DEFAULTS;
const geometryOf = (patch: Partial<DiagramPageSetup> = {}, sizes = DEFAULTS, head = HEADER_MM, foot = FOOTER_MM) =>
  titleBlockGeometry(setupOf(patch), head, foot, sizes)!;

const SIZES = Object.keys(PRINT_PAPER_MM) as DiagramPaperSize[];
const EVERY_PAPER = SIZES.flatMap((size) => (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation })));
const { min, max } = TITLE_BLOCK_ART_SIZE_RANGE;
const EVERY_SIZE: TitleBlockSizes[] = [DEFAULTS, ...[min, max].flatMap((modelSize) => [min, max].map((patternSize) => ({ modelSize, patternSize })))];

const right = (box: PageBox) => box.x + box.w;
const foot = (box: PageBox) => box.y + box.h;
/** The area two boxes share, mm²: none where they only touch. */
const overlap = (a: PageBox, b: PageBox) =>
  Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(foot(a), foot(b)) - Math.max(a.y, b.y));
const inside = (box: PageBox, around: PageBox, label?: string) => {
  const near = 1e-9;
  expect(box.x, label).toBeGreaterThanOrEqual(around.x - near);
  expect(box.y, label).toBeGreaterThanOrEqual(around.y - near);
  expect(right(box), label).toBeLessThanOrEqual(right(around) + near);
  expect(foot(box), label).toBeLessThanOrEqual(foot(around) + near);
};

describe('titleBlockBand', () => {
  it('is a band from margin to margin, its share of the printable height tall, in the flow on every paper either way up', () => {
    for (const paper of EVERY_PAPER) {
      const setup = setupOf(paper);
      const { widthMm: W, heightMm: H, marginMm: m } = printPaper(setup);
      expect(titleBlockBand(setup, HEADER_MM, FOOTER_MM), JSON.stringify(paper)).toEqual({
        block: { x: m, y: m, w: W - 2 * m, h: 0.27 * (H - 2 * m) },
        rows: 0,
      });
    }
    // 74 mm on A4 portrait, 50 mm on A4 landscape at 0.27; J1b's 62.79 mm at a new diagram's 0.23.
    expect(titleBlockBand(setupOf(), HEADER_MM, FOOTER_MM)!.block.h).toBeCloseTo(73.71, 2);
    expect(titleBlockBand(setupOf({ orientation: 'landscape' }), HEADER_MM, FOOTER_MM)!.block.h).toBeCloseTo(50.22, 2);
    expect(titleBlockBand(setupOf({ titleBlock: DEFAULT_PAGE_SETUP.titleBlock }), HEADER_MM, FOOTER_MM)!.block.h).toBeCloseTo(62.79, 2);
    // Read from the setup alone: neither the title's tab nor the page numbers move it.
    expect(titleBlockBand(setupOf(), 0, 0)).toEqual(titleBlockBand(setupOf(), HEADER_MM, FOOTER_MM));
  });

  it('takes a grid’s whole rows nearest its share, and the header’s room above them, so every page keeps one cell', () => {
    const grid = (rows: number, head = HEADER_MM) => titleBlockBand(setupOf({ layout: 'grid', columns: 3, rows }), head, FOOTER_MM)!;
    // A4 upright, a 12 mm margin: 273 mm inside it.
    const cell = (rows: number, head = HEADER_MM) => (273 - head - FOOTER_MM) / rows;
    expect([2, 3, 4, 5, 6].map((rows) => grid(rows).rows)).toEqual([1, 1, 1, 1, 2]);
    expect(grid(3).block.h).toBeCloseTo(HEADER_MM + cell(3), 9);
    expect(grid(6).block.h).toBeCloseTo(HEADER_MM + 2 * cell(6), 9);
    // With no tab on any page, no header's room.
    expect(grid(3, 0).block.h).toBeCloseTo(cell(3, 0), 9);
  });

  it('is none where the block is off, or a grid of one row has no room for it', () => {
    expect(titleBlockBand(setupOf({ titleBlock: { enabled: false, heightShare: 0.27 } }), HEADER_MM, FOOTER_MM)).toBeNull();
    expect(titleBlockBand(setupOf({ layout: 'grid', rows: 1 }), HEADER_MM, FOOTER_MM)).toBeNull();
    expect(titleBlockGeometry(setupOf({ layout: 'grid', rows: 1 }), HEADER_MM, FOOTER_MM, DEFAULTS)).toBeNull();
  });
});

describe('titleBlockParts', () => {
  it('stands the pattern at the band’s top right and the model in front of its lower left on the band’s foot, each at its size', () => {
    for (const paper of EVERY_PAPER) {
      for (const sizes of EVERY_SIZE) {
        const label = JSON.stringify({ ...paper, ...sizes });
        const { block, pattern, model } = geometryOf(paper, sizes);
        // The pattern: a square, its top on the band's and its right on the margin, its side its share of the band
        // unless that is wider than 0.45 of the band.
        expect(pattern.w, label).toBeCloseTo(pattern.h, 9);
        expect(pattern.w, label).toBeCloseTo(Math.min(sizes.patternSize * block.h, 0.45 * block.w), 9);
        expect(pattern.y, label).toBe(block.y);
        expect(right(pattern), label).toBeCloseTo(right(block), 9);
        // The model: its share of the band tall whatever the pattern's size, its foot on the band's, its right edge
        // 0.6 across the pattern, and at most 1.1 times as wide as tall and 0.45 of the band.
        expect(model.h, label).toBeCloseTo(sizes.modelSize * block.h, 9);
        expect(foot(model), label).toBeCloseTo(foot(block), 9);
        expect(right(model), label).toBeCloseTo(pattern.x + 0.6 * pattern.w, 9);
        expect(model.w / model.h, label).toBeLessThanOrEqual(1.1 + 1e-9);
        expect(model.w, label).toBeLessThanOrEqual(0.45 * block.w + 1e-9);
        for (const part of [pattern, model]) inside(part, block, label);
      }
    }
  });

  it('runs the text column from the left margin to the art’s left edge, the whole band tall, never under the art', () => {
    const layouts: Partial<DiagramPageSetup>[] = [{ layout: 'flow' }, ...[2, 3, 4, 6].map((rows) => ({ layout: 'grid' as const, columns: 3, rows }))];
    for (const paper of EVERY_PAPER) {
      for (const heightShare of [0.15, 0.23, 0.27, 0.5]) {
        for (const layout of layouts) {
          for (const sizes of EVERY_SIZE) {
            const label = JSON.stringify({ ...paper, heightShare, ...layout, ...sizes });
            const { block, column, pattern, model } = geometryOf({ ...paper, ...layout, titleBlock: { enabled: true, heightShare } }, sizes);
            expect(column.x, label).toBe(block.x);
            expect([column.y, column.h], label).toEqual([block.y, block.h]);
            expect(right(column), label).toBeCloseTo(Math.min(model.x, pattern.x), 9);
            expect(overlap(column, pattern), label).toBe(0);
            expect(overlap(column, model), label).toBe(0);
            // Each box at most 0.45 of the band: the column keeps at least a tenth of it.
            expect(column.w, label).toBeGreaterThan(0.1 * block.w);
          }
        }
      }
    }
  });

  it('gives J1b’s art on A4 portrait at a new diagram’s share and sizes, within half a millimetre', () => {
    // J1b, in pt: the pattern's square x 421.27–561.26 from y 34.02; the crane's model drawn 115.02 × 104.99, its
    // right edge at 505.26; the band's right end, the art's left edge, at 390.24.
    const PT = 72 / 25.4;
    const { pattern, model, column } = geometryOf({ titleBlock: DEFAULT_PAGE_SETUP.titleBlock });
    const near = (mm: number, pt: number, what: string) => expect(Math.abs(mm * PT - pt) / PT, what).toBeLessThanOrEqual(0.5);
    near(pattern.x, 421.27, 'pattern x');
    near(pattern.y, 34.02, 'pattern y');
    near(pattern.w, 139.99, 'pattern side');
    near(right(model), 505.26, 'model right');
    near(model.h, 104.99, 'model height');
    near(right(column), 390.24, 'band end');
    // The crane's picture, 539 × 492, fills the model's box from its right: its left on the band's end.
    near(right(model) - (539 / 492) * model.h, 390.24, 'crane left');
  });

  it('reads the band and the sizes alone: the band’s box is the layout’s, whatever the parts', () => {
    const band = titleBlockBand(setupOf(), HEADER_MM, FOOTER_MM)!;
    for (const sizes of EVERY_SIZE) {
      const parts = titleBlockParts(band, sizes);
      expect({ block: parts.block, rows: parts.rows }).toEqual(band);
    }
  });
});
