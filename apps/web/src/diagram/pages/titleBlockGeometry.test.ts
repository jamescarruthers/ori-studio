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
import {
  ART_GAP_MM,
  artSizeLimits,
  fittedArtSizes,
  MODEL_COVER,
  titleBlockBand,
  titleBlockParts,
  type TitleBlockSizes,
} from './titleBlockGeometry';
import { titleBlockGeometry } from './titleBlock.fixtures';

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
  /** Every paper, share and grid, and the size pairs the Page pane's sliders reach, every 5% from 30% to 100%. */
  const LAYOUTS: Partial<DiagramPageSetup>[] = [{ layout: 'flow' }, ...[2, 3, 4, 6].map((rows) => ({ layout: 'grid' as const, columns: 3, rows }))];
  const STOPS = Array.from({ length: 15 }, (_, index) => Math.round(30 + 5 * index) / 100);
  const PAIRS: TitleBlockSizes[] = STOPS.flatMap((modelSize) => STOPS.map((patternSize) => ({ modelSize, patternSize })));
  const sweep = (each: (geometry: ReturnType<typeof geometryOf>, sizes: TitleBlockSizes, label: string) => void) => {
    for (const paper of EVERY_PAPER) {
      for (const heightShare of [0.15, 0.23, 0.27, 0.5]) {
        for (const layout of LAYOUTS) {
          for (const sizes of PAIRS) {
            const label = JSON.stringify({ ...paper, heightShare, ...layout, ...sizes });
            each(geometryOf({ ...paper, ...layout, titleBlock: { enabled: true, heightShare } }, sizes), sizes, label);
          }
        }
      }
    }
  };

  it('stands the pattern at the band’s top right, at its size, and the model in its size’s box inside the band', () => {
    for (const paper of EVERY_PAPER) {
      for (const sizes of EVERY_SIZE) {
        const label = JSON.stringify({ ...paper, ...sizes });
        const { block, pattern, model } = geometryOf(paper, sizes);
        // The pattern: a square, its top on the band's and its right on the margin, its side its share of the band as
        // drawn, unless that is wider than 0.45 of the band.
        const drawn = fittedArtSizes(sizes);
        expect(pattern.w, label).toBeCloseTo(pattern.h, 9);
        expect(pattern.w, label).toBeCloseTo(Math.min(drawn.patternSize * block.h, 0.45 * block.w), 9);
        expect(pattern.y, label).toBe(block.y);
        expect(right(pattern), label).toBeCloseTo(right(block), 9);
        // The model: its share of the band tall whatever the pattern's size, at most 1.1 times as wide as tall and
        // 0.45 of the band.
        expect(model.h, label).toBeCloseTo(sizes.modelSize * block.h, 9);
        expect(model.w / model.h, label).toBeLessThanOrEqual(1.1 + 1e-9);
        expect(model.w, label).toBeLessThanOrEqual(0.45 * block.w + 1e-9);
        for (const part of [pattern, model]) inside(part, block, label);
      }
    }
  });

  it('stands the model on the pattern’s lower-left corner, the corner well inside it, at every size on every paper, share and grid (Zach, 2026-10-15)', () => {
    const failures: string[] = [];
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    sweep(({ block, pattern, model, modelAlign }, _sizes, label) => {
      const corner = { x: pattern.x, y: foot(pattern) };
      // The corner stands at `modelAlign` in the model's box, a fifth of it at least from each side, so that a
      // picture set there at any shape covers it (`modelRoom`).
      if (!near(model.x + modelAlign.x * model.w, corner.x) || !near(model.y + modelAlign.y * model.h, corner.y)) failures.push(`align ${label}`);
      for (const share of [modelAlign.x, modelAlign.y]) {
        if (share < MODEL_COVER - 1e-9 || share > 1 - MODEL_COVER + 1e-9) failures.push(`cover ${share} ${label}`);
      }
      if (model.x < block.x - 1e-9 || model.y < block.y - 1e-9 || right(model) > right(block) + 1e-9 || foot(model) > foot(block) + 1e-9) {
        failures.push(`outside ${label}`);
      }
    });
    expect(failures).toEqual([]);
  });

  it('runs the text column from the left margin to the model’s box, a gutter short of the pattern, never under the art (Zach, 2026-10-15)', () => {
    // J1b's band, under its subtitle's row, reaches 26.4 mm under the block's top; its model rises 3.9 pt beside it.
    const bandFoot = (12.5 * 25.4) / 72 + 22;
    const rise = (3.9 * 25.4) / 72;
    const failures: string[] = [];
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    sweep(({ block, column, under, pattern, model }, _sizes, label) => {
      const end = right(column);
      // The credits and the note, beside the model's box wherever it stands, a gutter short of it.
      if (under.x !== column.x || under.y !== column.y || under.h !== column.h) failures.push(`under rows ${label}`);
      if (!near(right(under), Math.min(end, model.x - ART_GAP_MM))) failures.push(`under ${label}`);
      if (column.x !== block.x || column.y !== block.y || column.h !== block.h) failures.push(`rows ${label}`);
      if (end > Math.min(model.x, pattern.x - ART_GAP_MM) + 1e-9) failures.push(`under the art ${label}`);
      // A model standing beside the band, higher than J1b's, a gutter clear of it; one no higher, the band to its box.
      if (model.y <= block.y + bandFoot - rise - ART_GAP_MM && !near(end, Math.min(model.x, pattern.x) - ART_GAP_MM)) failures.push(`risen ${label}`);
      if (model.y >= block.y + bandFoot - rise && !near(end, Math.min(model.x, pattern.x - ART_GAP_MM))) failures.push(`low ${label}`);
      if (overlap(column, pattern) > 0 || overlap(column, model) > 0) failures.push(`overlap ${label}`);
      // Each box at most 0.45 of the band: the column keeps at least a twentieth of it.
      if (column.w <= 0.05 * block.w) failures.push(`narrow ${label}`);
    });
    expect(failures).toEqual([]);
    // 12 pt: the credits' gutter.
    expect(ART_GAP_MM).toBeCloseTo(4.233, 3);
  });

  it('draws the pattern no taller than leaves the model’s foot under its corner, and offers no size past that', () => {
    for (const sizes of PAIRS) {
      const limits = artSizeLimits(sizes);
      const label = JSON.stringify(sizes);
      // A size within its limit is drawn as said; past it, the pattern is drawn at the limit, never the model.
      expect(fittedArtSizes(sizes), label).toEqual({
        modelSize: sizes.modelSize,
        patternSize: Math.min(sizes.patternSize, limits.patternSize),
      });
      expect(fittedArtSizes(sizes).patternSize + MODEL_COVER * sizes.modelSize, label).toBeLessThanOrEqual(1 + 1e-9);
      // Each limit leaves the other's own range open: the least model and the largest pattern fit together.
      expect(limits.patternSize, label).toBeGreaterThanOrEqual(TITLE_BLOCK_ART_SIZE_RANGE.min);
      if (sizes.patternSize <= limits.patternSize) expect(limits.modelSize, label).toBeGreaterThanOrEqual(sizes.modelSize - 1e-9);
    }
    // With the defaults, the model goes to 100% and the pattern to 88%.
    expect(artSizeLimits(DEFAULTS).modelSize).toBe(1);
    expect(artSizeLimits(DEFAULTS).patternSize).toBeCloseTo(0.882, 9);
  });

  it('gives J1b’s art on A4 portrait at a new diagram’s share and sizes, within a millimetre', () => {
    // J1b, in pt: the pattern's square x 421.27–561.26 from y 34.02; the crane's model drawn 115.02 × 104.99 from
    // x 390.24, y 105.00, the pattern's corner 27% across it and 66% down; the band's right end at 390.24.
    const PT = 72 / 25.4;
    const { pattern, model, modelAlign, column } = geometryOf({ titleBlock: DEFAULT_PAGE_SETUP.titleBlock });
    const near = (mm: number, pt: number, what: string, within = 0.5) => expect(Math.abs(mm * PT - pt) / PT, what).toBeLessThanOrEqual(within);
    near(pattern.x, 421.27, 'pattern x');
    near(pattern.y, 34.02, 'pattern y');
    near(pattern.w, 139.99, 'pattern side');
    near(model.x, 390.24, 'model left');
    near(model.y, 105.0, 'model top', 1);
    near(model.h, 104.99, 'model height');
    near(right(column), 390.24, 'band end');
    expect(modelAlign.x).toBeCloseTo(0.27, 9);
    expect(modelAlign.y).toBeCloseTo(0.66, 9);
  });

  it('reads the band and the sizes alone: the band’s box is the layout’s, whatever the parts', () => {
    const band = titleBlockBand(setupOf(), HEADER_MM, FOOTER_MM)!;
    for (const sizes of EVERY_SIZE) {
      const parts = titleBlockParts(band, sizes);
      expect({ block: parts.block, rows: parts.rows }).toEqual(band);
    }
  });
});
