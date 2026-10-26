// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PT_PER_MM, SEAM_STROKE_WIDTH_PT, widestPenPt } from '../../lib/paper/paperSvg';
import {
  createDiagram,
  createStep,
  DEFAULT_PAGE_SETUP,
  insertSteps,
  createTurn,
  PAGE_SETTINGS,
  setPageSetup,
  setTitleBlockContent,
  stepsOf,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramStep,
  type DiagramTitleBlockContentPatch,
  type KnownDiagramAsset,
} from '../document/diagramDocument';
import {
  cpStep,
  fixedPicture,
  referencesStep,
  scenePicture,
  SENT_MODEL,
  stepDiagramPicture,
  stepsIn,
} from '../document/diagramSteps.fixtures';
import { readDiagram, storedSceneJson, writeDiagram } from '../document/diagramFile';
import { face, sceneOf } from '../../lib/paper/paperScene.fixtures';
import { DIAGRAM_FONT_FAMILY, type DiagramFontKey, type DiagramFontWeight } from '../fonts/diagramFontFaces';
import type { DiagramFonts, LoadedDiagramFont } from '../fonts/diagramFonts';
import { readFontMetrics } from '../fonts/fontMetrics';
import { createFontSubsetter, type FontSubsetter } from '../fonts/fontSubset';
import { layoutDiagramPages, MARKS_FLOOR, PAGE_NUMBER_SIZE_MM, pictureExtent, pictureFit, STEP_TEXT_SIZE_MM } from './diagramPageLayout';
import { DEFAULT_PAPER_STYLE, PEN_WIDTH_RANGE } from '../../lib/paper/paperStyle';
import { estimateTextSetter } from './estimateTextSetter';
import { diagramFontTexts, diagramLayoutSteps, layoutDiagram, preparedPages } from './diagramPages';
import { composeDiagramPage } from './composeDiagramPage';
import { cellPicture, layoutPicture, wholePicture } from './pagePictures';
import { modelRoom, type ModelRoom } from './titleBlockContent';
import { composeEveryPage } from '../export/diagramPdf';
import { diagramSheetFile } from '../export/diagramSheet';
import { diagramPrintRequest } from '../print/printDiagram';
import { diagramSurfaceStyle } from '../pictures/diagramPaperStyle';
import { composedPageUrl } from './useDiagramPages';

const FONT_DIR = resolve(process.cwd(), 'src/diagram/fonts');
const FILES: Partial<Record<string, string>> = {
  'latin-400': 'NotoSans-Regular.ttf',
  'latin-700': 'NotoSans-Bold.ttf',
  'sc-400': 'fixtures/NotoSansSC-Regular.fixture.ttf',
  'sc-700': 'fixtures/NotoSansSC-Bold.fixture.ttf',
};
const FONTS: DiagramFonts = {
  font(key: DiagramFontKey, weight: DiagramFontWeight): LoadedDiagramFont | null {
    const file = FILES[`${key}-${weight}`];
    if (!file) return null;
    const bytes = new Uint8Array(readFileSync(resolve(FONT_DIR, file)));
    return { key, weight, family: DIAGRAM_FONT_FAMILY[key], tier: 'common', bytes, metrics: readFontMetrics(bytes) };
  },
  unavailable: [],
};

let subsetter: FontSubsetter;
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  subsetter = await createFontSubsetter(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')));
});

/** An upload with its own ids, as the sanitizer leaves them: under the asset's id. */
const UPLOAD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20">' +
  '<defs><linearGradient id="asset-up-g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
  '<rect id="asset-up-r" width="40" height="20" fill="url(#asset-up-g)"/><use href="#asset-up-r"/></svg>';
const UPLOAD: KnownDiagramAsset = { id: 'asset-up', kind: 'svg', svg: UPLOAD_SVG, widthPx: 40, heightPx: 20, bytes: 1 };

/** A new diagram with no title block: but for the block's own cases, these are pages as composed before it. */
const unblockedDiagram = (options: Parameters<typeof createDiagram>[0]) =>
  setPageSetup(createDiagram(options), { titleBlock: PAGE_SETTINGS.titleBlock.legacy });

function uploadStep(id: string): DiagramStep {
  return {
    ...createStep(() => id),
    source: { kind: 'upload', assetId: UPLOAD.id, rotationQuarterTurns: 0, mirrored: false },
    picture: { kind: 'asset', assetId: UPLOAD.id, paperScale: null, key: `asset:${UPLOAD.id}` },
    text: 'Swivel the flap.',
  };
}

function diagram(): DiagramDocument {
  const steps = [
    { ...cpStep('step-cp'), text: 'Fold in half, then unfold.' },
    referencesStep('step-sent'),
    uploadStep('step-up-1'),
    uploadStep('step-up-2'),
    { ...createStep(() => 'step-empty'), text: '将底角向上折至顶角，压实折痕后展开。' },
    { ...createStep(() => 'step-fixed'), source: null, picture: fixedPicture() },
  ];
  const document = insertSteps(unblockedDiagram({ title: 'Crane · 千纸鹤', hanStyle: 'sc' }), steps, 0);
  return { ...document, assets: { [UPLOAD.id]: UPLOAD } };
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

/** A scene of the fixture's paper folded tall: 60 × 140 px at the fixture's 100 px per unit. */
function tallSceneJson(): string {
  return storedSceneJson(sceneOf([face([[[30, 0], [60, 70], [30, 140], [0, 70]]])]))!;
}

describe('composeDiagramPage', () => {
  it('writes a well-formed page in pt, the size of the paper', () => {
    const pages = preparedPages(diagram(), FONTS, subsetter);
    const page = pages.compose(0);
    const document = parse(page.svg);
    expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(page.widthPt).toBeCloseTo(210 * PT_PER_MM, 6);
    expect(document.documentElement.getAttribute('width')).toBe(`${Math.round(210 * PT_PER_MM * 1000) / 1000}pt`);
  });

  it('gives every id on the page once, though two cells draw one upload', () => {
    const svg = preparedPages(diagram(), FONTS, subsetter).compose(0).svg;
    const ids = [...svg.matchAll(/\sid="([^"]*)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    // Every reference names an id on the page.
    for (const [, reference] of svg.matchAll(/(?:href="#|url\(#)([^")]*)/g)) expect(ids).toContain(reference);
  });

  it('embeds each face it sets, cut to its characters, and names no other', () => {
    const svg = preparedPages(diagram(), FONTS, subsetter).compose(0).svg;
    const faces = [...svg.matchAll(/@font-face\{font-family:'([^']*)';font-weight:(\d+);[^}]*base64,([^)]*)\)/g)];
    const embedded = new Map(faces.map(([, family, weight, data]) => [`${family}|${weight}`, data!]));
    expect([...embedded.keys()].sort()).toEqual(['Noto Sans SC|400', 'Noto Sans SC|700', 'Noto Sans|400', 'Noto Sans|700']);
    const document = parse(svg);
    for (const text of document.querySelectorAll('text')) {
      const weight = text.getAttribute('font-weight');
      for (const span of text.querySelectorAll('tspan')) {
        const family = /^'([^']*)'/.exec(span.getAttribute('font-family') ?? '')![1]!;
        const data = embedded.get(`${family}|${weight}`);
        expect(data, `${family} ${weight}`).toBeDefined();
        const metrics = readFontMetrics(Uint8Array.from(atob(data!), (c) => c.charCodeAt(0)));
        for (const character of span.textContent ?? '') {
          if (character !== ' ') expect(metrics.has(character.codePointAt(0)!), character).toBe(true);
        }
      }
    }
    // References' letters are set in the page's font, not the screen's.
    expect(svg).not.toContain('Inter');
  });

  it('sets a callout’s words as a label’s, loading and embedding each face they need, Han in the diagram’s style', () => {
    const callout = { id: 'c-1', kind: 'callout' as const, from: [0.2, 0.8] as [number, number], to: [0.6, 0.3] as [number, number], text: 'Repeat 将底角' };
    const step = { ...cpStep('step-callout'), annotations: [callout], annotatedPictureKey: cpStep('step-callout').picture!.key };
    const document = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [step], 0);
    // The faces a page loads: its words' Han in the diagram's style.
    expect(diagramFontTexts(document)).toContainEqual({ text: '将底角', weight: 400, cjk: 'sc' });
    const pages = preparedPages(document, FONTS, subsetter);
    expect(pages.missing).toEqual([]);
    const svg = pages.compose(0).svg;
    const faces = [...svg.matchAll(/@font-face\{font-family:'([^']*)';font-weight:(\d+);[^}]*base64,([^)]*)\)/g)];
    const embedded = new Map(faces.map(([, family, weight, data]) => [`${family}|${weight}`, data!]));
    const page = parse(svg);
    const words = [...page.querySelectorAll('text')].find((text) => text.textContent === 'Repeat 将底角')!;
    expect(words).toBeDefined();
    // In its box: the rect drawn just before its words.
    expect(words.previousElementSibling?.tagName).toBe('rect');
    for (const span of words.querySelectorAll('tspan')) {
      const family = /^'([^']*)'/.exec(span.getAttribute('font-family') ?? '')![1]!;
      const data = embedded.get(`${family}|400`);
      expect(data, family).toBeDefined();
      const metrics = readFontMetrics(Uint8Array.from(atob(data!), (c) => c.charCodeAt(0)));
      for (const character of span.textContent ?? '') {
        if (character !== ' ') expect(metrics.has(character.codePointAt(0)!), character).toBe(true);
      }
    }
    expect([...words.querySelectorAll('tspan')].map((span) => span.getAttribute('font-family'))).toEqual([
      `'Noto Sans', sans-serif`,
      `'Noto Sans SC', sans-serif`,
    ]);
  });

  it('keeps an empty step’s number and text, and draws nothing in its picture box', () => {
    const pages = preparedPages(diagram(), FONTS, subsetter);
    const cell = pages.layout.pages[0]!.cells[4]!;
    const group = parse(pages.compose(0).svg).querySelectorAll('svg > g')[4]!;
    expect(group.querySelector('svg, path, line, polygon, image')).toBeNull();
    const texts = [...group.querySelectorAll('text')].map((text) => text.textContent);
    expect(texts[0]).toBe('5');
    expect(texts[1]).toBe(cell.text.lines.map((line) => line.text).join(''));
  });

  it('places every run where the line set it, and right-aligns a right-hand page’s number by its width', () => {
    const onTheRight = diagram();
    const pages = preparedPages({ ...onTheRight, page: { ...onTheRight.page, firstPageSide: 'right' } }, FONTS, subsetter);
    const { layout } = pages;
    const document = parse(pages.compose(0).svg);
    const title = document.querySelector('svg > text')!;
    const spans = [...title.querySelectorAll('tspan')];
    expect(spans.map((span) => span.textContent)).toEqual(layout.title!.line.runs.map((run) => run.text));
    layout.title!.line.runs.forEach((run, index) => {
      expect(Number(spans[index]!.getAttribute('x'))).toBeCloseTo((layout.title!.textAt.x + run.xMm) * PT_PER_MM, 2);
    });
    const number = [...document.querySelectorAll('svg > text')].at(-1)!;
    const at = layout.pages[0]!.pageNumberAt!;
    expect(number.textContent).toBe('1');
    expect(at.anchor).toBe('end');
    const one = FONTS.font('latin', 700)!.metrics;
    const widthMm = (one.advance('1'.codePointAt(0)!) * PAGE_NUMBER_SIZE_MM) / one.unitsPerEm;
    const x = Number(number.querySelector('tspan')!.getAttribute('x'));
    expect(x).toBeCloseTo((at.x - widthMm) * PT_PER_MM, 2);
  });

  it('draws the linked pattern and the sent step at one scale: one pattern unit, one size', () => {
    const document = diagram();
    for (const step of stepsIn(document).slice(0, 2)) {
      expect(layoutPicture(step, document.assets, document.style)).toMatchObject({ kind: 'paper' });
    }
    expect(layoutPicture(stepsIn(document)[2]!, document.assets, document.style)).toMatchObject({ kind: 'fit' });
    const pages = preparedPages(document, FONTS, subsetter);
    const [cp, sent] = pages.layout.pages[0]!.cells;
    expect(cp!.mmPerUnit).not.toBeNull();
    expect(sent!.mmPerUnit).toBe(cp!.mmPerUnit);
  });

  /** Each scene's paper on a composed page, the first face its painter draws: its width in pt. */
  const paperWidths = (svg: string) =>
    [...svg.matchAll(/<g stroke-linejoin="round">\s*<path d="([^"]*)"/g)].map((match) => {
      const xs = [...match[1]!.matchAll(/[ML](-?[\d.]+),/g)].map((each) => Number(each[1]));
      return Math.max(...xs) - Math.min(...xs);
    });
  /**
   * Rooms of many shapes: a new diagram's flow page; squat and narrow ones a
   * grid's own columns and rows cut; and flow pages packed small, from many
   * steps on a small sheet, and of an uneven count. (Thirty a page on A5 on
   * its side is more than its boxes, each at least its caption's least
   * measure across, can hold at any scale.)
   */
  const SETUPS: Partial<DiagramPageSetup>[] = [
    {},
    { layout: 'grid', orientation: 'landscape', columns: 3, rows: 5 },
    { layout: 'grid', size: 'a5', columns: 4, rows: 1 },
    { layout: 'grid', size: 'a5', orientation: 'landscape', columns: 3, rows: 6 },
    { layout: 'grid', size: 'letter', columns: 2, rows: 6 },
    { layout: 'grid', columns: 5, rows: 6 },
    { stepsPerPage: 20, size: 'a5', orientation: 'landscape' },
    { stepsPerPage: 7 },
  ];
  const setupName = (setup: Partial<DiagramPageSetup>) => JSON.stringify(setup);

  /** Four steps of one paper: an arrow bulging over the top edge of the second, a push from far off the fourth. */
  const reaching = () => {
    const over: DiagramStep = {
      ...cpStep('step-2'),
      annotations: [{ id: 'a', kind: 'valley-arrow', from: [0.2, 0.004], to: [0.8, 0.004], bend: 0.05 }],
    };
    const far: DiagramStep = {
      ...cpStep('step-4'),
      annotations: [{ id: 'b', kind: 'push-arrow', from: [-0.5, 0.5], to: [0.2, 0.5] }],
    };
    return insertSteps(unblockedDiagram({ title: 'Crane', hanStyle: 'sc' }), [cpStep('step-1'), over, cpStep('step-3'), far], 0);
  };

  it('fits each step, the paper one scale whatever their marks reach a little past, on any page', () => {
    const made = reaching();
    for (const setup of SETUPS) {
      const document: DiagramDocument = { ...made, page: { ...made.page, ...setup } };
      const pages = preparedPages(document, FONTS, subsetter);
      const widths = paperWidths(pages.compose(0).svg);
      expect(widths, setupName(setup)).toHaveLength(4);
      expect(widths[1]! / widths[0]!, setupName(setup)).toBeCloseTo(1, 3);
      expect(widths[2]! / widths[0]!, setupName(setup)).toBeCloseTo(1, 3);
      // The far push is never drawn larger; on a square cell it fits only well under the others' scale.
      expect(widths[3]!, setupName(setup)).toBeLessThanOrEqual(widths[0]! * 1.001);
      if (Object.keys(setup).length === 0) expect(widths[3]!).toBeLessThan(widths[0]! * 0.8);
    }
  });

  it('lays out a diagram saved with One scale as Fit each', () => {
    const made = reaching();
    const saved = JSON.parse(JSON.stringify(writeDiagram(made)));
    const read = readDiagram({ ...saved, page: { ...saved.page, scale: 'paper' } })!;
    expect(read.readOnly).toBe(false);
    const pages = preparedPages(read.document, FONTS, subsetter);
    expect(pages.layout).toEqual(preparedPages(made, FONTS, subsetter).layout);
    // One scale drew every step at the far push's scale; Fit each draws only that step smaller.
    const widths = paperWidths(pages.compose(0).svg);
    expect(widths[2]! / widths[0]!).toBeCloseTo(1, 3);
    expect(widths[3]!).toBeLessThan(widths[0]! * 0.8);
  });

  it('keeps every picture and its marks inside the room the layout drew for it, at any scale and page', () => {
    // Letters on all four sides of a References sheet, which reach further the smaller it is drawn.
    const four = stepDiagramPicture(false, {
      ...SENT_MODEL,
      primitives: [
        ...SENT_MODEL.primitives,
        { kind: 'label', at: [1, 0.5], text: 'B', style: 'normal' },
        { kind: 'label', at: [0.5, 0], text: 'C', style: 'normal' },
        { kind: 'label', at: [0.5, 1], text: 'D', style: 'normal' },
      ],
    });
    const lettered: DiagramStep = { ...referencesStep('step-2'), picture: four, text: 'Fold the corner to the line.' };
    const arrowed: DiagramStep = {
      ...cpStep('step-3'),
      annotations: [{ id: 'a', kind: 'fold-unfold-arrow', from: [0.1, 0.02], to: [0.9, 0.02], bend: 0.134 }],
    };
    const long: DiagramStep = { ...referencesStep('step-4'), picture: four, text: Array(12).fill('Fold the corner to the line.').join(' ') };
    // Captures with no paper scale, drawn by their frames: a push in from the left, an arrow over the top (review).
    const unscaled = (id: string, annotations: DiagramStep['annotations']): DiagramStep => {
      const step = cpStep(id);
      return { ...step, picture: { ...(step.picture as Extract<DiagramStep['picture'], { kind: 'scene' }>), paperScale: null }, annotations };
    };
    const pushed = unscaled('step-5', [{ id: 'p', kind: 'push-arrow', from: [-0.5, 0.5], to: [0.2, 0.5] }]);
    const over = unscaled('step-6', [{ id: 'f', kind: 'fold-unfold-arrow', from: [0.1, 0.02], to: [0.9, 0.02], bend: 0.134 }]);
    // Enlarged steps (Revision 2), each its window: a circle cut at the sheet's edge, its marks on it, after
    // the step with its area; a rounded rectangle turned in its window, drawn whole.
    const area = { ...cpStep('step-7'), annotations: [{ id: 'area', kind: 'zoom' as const, from: [1, 0.5] as [number, number], to: [1, 0.5] as [number, number], radius: 0.3 }] };
    const cut: DiagramStep = {
      ...cpStep('step-8'),
      zoom: { from: 'area', shape: 'circle', frame: { centre: [1, 0.5], radius: 0.3 } },
      annotations: [
        { id: 'v', kind: 'valley-line', from: [0.1, 0.5], to: [0.9, 0.5] },
        { id: 'l', kind: 'label', from: [0.3, 0.2], to: [0.3, 0.2], text: 'A' },
      ],
      text: 'Fold the corner down.',
    };
    const turned: DiagramStep = {
      ...cpStep('step-9'),
      zoom: { from: 'area', shape: 'rounded', frame: { centre: [0.5, 0.5], size: [0.5, 0.3], angle: 30 } },
    };
    const made = insertSteps(
      createDiagram({ title: 'Crane', hanStyle: 'sc' }),
      [cpStep('step-1'), lettered, arrowed, long, pushed, over, area, cut, turned],
      0
    );
    let enlarged = 0;
    let floored = 0;
    let framed = 0;
    for (const setup of SETUPS) {
      const document: DiagramDocument = { ...made, page: { ...made.page, ...setup } };
      const layout = layoutDiagram(document, estimateTextSetter);
      for (const cell of layout.pages.flatMap((page) => page.cells)) {
        const step = stepsIn(document).find((each) => each.id === cell.stepId)!;
        const picture = cellPicture(step, document.assets, document.style, cell, 'c-', { hanStyle: 'sc', runs: estimateTextSetter.runs })!;
        const room = { x: cell.drawMm.x * PT_PER_MM, y: cell.drawMm.y * PT_PER_MM, w: cell.drawMm.w * PT_PER_MM, h: cell.drawMm.h * PT_PER_MM };
        const name = `${setupName(setup)} ${cell.stepId}`;
        // What the layout found the picture needs, measured at the scale it is drawn at: per pattern
        // unit, or per its frame's longer side when it has no paper.
        const at = cell.mmPerUnit ?? cell.frameMm;
        if (at === null) continue;
        const needs = layoutPicture(step, document.assets, document.style, cell.mmPerUnit === null ? { frameMm: at } : { mmPerUnit: at })!;
        if (cell.mmPerUnit === null) framed += 1;
        if (needs.kind === 'zoom') enlarged += 1;
        const fits =
          needs.width * at + needs.marks.width <= cell.drawMm.w * (1 + 1e-3) &&
          needs.height * at + needs.marks.height <= cell.drawMm.h * (1 + 1e-3);
        if (fits) {
          // Within a hair: the marks were measured at the scale the picture is drawn at.
          const hair = 0.002 * Math.max(room.w, room.h);
          expect(picture.boundsPt.x, name).toBeGreaterThanOrEqual(room.x - hair);
          expect(picture.boundsPt.y, name).toBeGreaterThanOrEqual(room.y - hair);
          expect(picture.boundsPt.x + picture.boundsPt.width, name).toBeLessThanOrEqual(room.x + room.w + hair);
          expect(picture.boundsPt.y + picture.boundsPt.height, name).toBeLessThanOrEqual(room.y + room.h + hair);
        } else {
          // A room its letters cannot fit: where its marks lie fits the share of it the floor leaves, and
          // the letters reach out.
          const share = 1 - MARKS_FLOOR;
          const across = needs.width * at <= cell.drawMm.w * share * (1 + 1e-3);
          const down = needs.height * at <= cell.drawMm.h * share * (1 + 1e-3);
          expect(across && down, name).toBe(true);
          expect(Math.max(needs.width * at / (cell.drawMm.w * share), needs.height * at / (cell.drawMm.h * share)), name).toBeCloseTo(1, 2);
          floored += 1;
        }
      }
    }
    // The small setups' long instruction leaves its References step a room its letters cannot fit.
    expect(floored).toBeGreaterThan(0);
    // Fit each drew the captures with no paper at frames of its own.
    expect(framed).toBeGreaterThanOrEqual(2 * SETUPS.length);
    // And every enlarged step its window, by what it prints.
    expect(enlarged).toBe(2 * SETUPS.length);
  });

  /** How far laying the pages out again, each step measured at the scale it is drawn at, moves a step's scale. */
  const unsettled = (document: DiagramDocument, layout: ReturnType<typeof layoutDiagram>) => {
    const cells = layout.pages.flatMap((page) => page.cells);
    const measures = new Map(
      cells.map((each) => [each.stepId, each.mmPerUnit !== null ? { mmPerUnit: each.mmPerUnit } : { frameMm: each.frameMm! }])
    );
    const again = layoutDiagramPages(
      diagramLayoutSteps(document, (id) => measures.get(id) ?? null),
      document.page,
      { title: document.title },
      estimateTextSetter
    ).pages.flatMap((page) => page.cells);
    return Math.max(
      0,
      ...cells.map((each, index) => {
        const [was, now] = [each.mmPerUnit ?? each.frameMm, again[index]!.mmPerUnit ?? again[index]!.frameMm];
        return was === null || now === null ? 0 : Math.abs(now / was - 1);
      })
    );
  };

  /** How far a cell's picture, placed, reaches past its room above and below, in mm. */
  const overruns = (document: DiagramDocument, cell: ReturnType<typeof layoutDiagram>['pages'][number]['cells'][number]) => {
    const step = stepsIn(document).find((each) => each.id === cell.stepId)!;
    const placed = cellPicture(step, document.assets, document.style, cell, 'c-', { hanStyle: 'sc', runs: estimateTextSetter.runs })!;
    const [top, bottom] = [placed.boundsPt.y / PT_PER_MM, (placed.boundsPt.y + placed.boundsPt.height) / PT_PER_MM];
    return { above: cell.drawMm.y - top, below: bottom - (cell.drawMm.y + cell.drawMm.h), bottom };
  };

  it('draws a paper whose glyph is larger than it as large as lets the glyph be centred on its room, settled, not crept down to its floor (review)', () => {
    // A turn-over turned upright, 11.6 mm tall, in a room 10.2 mm tall: past it at any scale. Its ink is not
    // quite even about its point, so the paper gives up a little of its room to centre it (third review).
    const step: DiagramStep = {
      ...cpStep('step-1'),
      text: Array(3).fill('Fold the corner to the line.').join(' '),
      annotations: [{ id: 't', kind: 'turn-over', from: [0.5, 0.5], to: [0.5, 0.5], axis: 'horizontal' }],
    };
    const made = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [step], 0);
    const document: DiagramDocument = {
      ...made,
      page: { ...made.page, layout: 'grid', size: 'letter', orientation: 'landscape', columns: 3, rows: 7 },
    };
    const layout = layoutDiagram(document, estimateTextSetter);
    const cell = layout.pages[0]!.cells[0]!;
    const needs = layoutPicture(stepsIn(document)[0]!, document.assets, document.style, { mmPerUnit: cell.mmPerUnit! })!;
    expect(pictureExtent(needs, cell.mmPerUnit!).height).toBeGreaterThan(cell.drawMm.h);
    const paper = needs.frame.height * cell.mmPerUnit!;
    expect(paper).toBeLessThanOrEqual(cell.drawMm.h * (1 + 1e-6));
    expect(paper).toBeGreaterThan(cell.drawMm.h * 0.85);
    const { above, below } = overruns(document, cell);
    expect(above).toBeCloseTo(below, 1);
    expect(unsettled(document, layout)).toBeLessThan(1e-3);
  });

  it('centres a glyph larger than its paper off the paper’s middle, rather than hang it all over the instruction (third review)', () => {
    // The glyph at the paper's foot, a room 6.5 mm tall: the paper filled it, and all 5 mm of the glyph's
    // overrun hung below it, over the instruction's first line.
    const once = 'Fold the corner to the line.';
    const made = insertSteps(
      createDiagram({ title: 'Crane', hanStyle: 'sc' }),
      [
        {
          ...cpStep('step-1'),
          text: Array(3).fill(once).join(' '),
          annotations: [{ id: 't', kind: 'turn-over', from: [0.5, 0.95], to: [0.5, 0.95], axis: 'horizontal' }],
        },
        cpStep('step-2'),
        cpStep('step-3'),
      ],
      0
    );
    const document: DiagramDocument = {
      ...made,
      page: { ...made.page, layout: 'grid', size: 'a5', orientation: 'landscape', columns: 3, rows: 5 },
    };
    const cell = layoutDiagram(document, estimateTextSetter).pages[0]!.cells[0]!;
    const { above, below, bottom } = overruns(document, cell);
    expect(above).toBeGreaterThan(1);
    expect(above).toBeCloseTo(below, 1);
    // Clear of the instruction's first line by its capitals' height, as the floor left it before.
    expect(cell.text.firstBaseline - bottom).toBeGreaterThan(0.75 * STEP_TEXT_SIZE_MM);
  });

  it('lays out pages that hold every picture with its marks, measured at its scale, at any pen and page (review)', () => {
    const glyph = (id: string, annotation: DiagramStep['annotations'][number], text = ''): DiagramStep => ({
      ...cpStep(id),
      text,
      annotations: [annotation],
    });
    const long = Array(6).fill('Fold the corner to the line.').join(' ');
    const steps: DiagramStep[] = [
      cpStep('step-a'),
      glyph('step-b', { id: 'r', kind: 'rotate', from: [1.3, 0.5], to: [1.3, 0.5], rotate: { amount: 'half', direction: 'cw' } }),
      glyph('step-c', { id: 't', kind: 'turn-over', from: [0.5, 0.5], to: [0.5, 0.5], axis: 'vertical' }, long),
      glyph('step-d', { id: 'p', kind: 'push-arrow', from: [-0.5, 0.5], to: [0.2, 0.5] }),
      glyph('step-e', { id: 'h', kind: 'turn-over', from: [0.5, 0.5], to: [0.5, 0.5], axis: 'horizontal' }, long),
      glyph('step-f', { id: 'f', kind: 'fold-unfold-arrow', from: [0.1, 0.02], to: [0.9, 0.02], bend: 0.134 }),
      { ...referencesStep('step-g'), text: long },
    ];
    const made = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), steps, 0);
    const heavy = { style: { ...DEFAULT_PAPER_STYLE, arrows: { ...DEFAULT_PAPER_STYLE.arrows, width: PEN_WIDTH_RANGE.max } } };
    const setups: Partial<DiagramPageSetup>[] = [
      ...SETUPS,
      { layout: 'grid', size: 'letter', orientation: 'landscape', columns: 3, rows: 7 },
      { layout: 'grid', columns: 5, rows: 1 },
      { layout: 'grid', size: 'a5', orientation: 'landscape', columns: 2, rows: 2 },
    ];
    for (const style of [made.style, heavy]) {
      for (const setup of setups) {
        const document: DiagramDocument = { ...made, style, page: { ...made.page, ...setup } };
        const layout = layoutDiagram(document, estimateTextSetter);
        for (const cell of layout.pages.flatMap((page) => page.cells)) {
          const at = cell.mmPerUnit ?? cell.frameMm;
          if (at === null) continue;
          const step = stepsIn(document).find((each) => each.id === cell.stepId)!;
          const measure = cell.mmPerUnit !== null ? { mmPerUnit: at } : { frameMm: at };
          const fit = pictureFit(layoutPicture(step, document.assets, document.style, measure), cell.drawMm.w, cell.drawMm.h);
          expect(fit! / at, `${style === heavy ? 'heavy' : 'default'} ${setupName(setup)} ${cell.stepId}`).toBeGreaterThan(1 - 1e-3);
        }
      }
    }
  });

  it('draws a picture at the largest scale it holds its room at, though no scale is its own fit (third review)', () => {
    // A turn-over larger than its paper, off its middle: its reach is flat until the paper outgrows it, then grows,
    // so measured below that it fits the room and above it half of it. The passes cycled and kept 53% of the room.
    const turned = (at: [number, number]): DiagramStep => ({
      ...cpStep('step-1'),
      text: Array(3).fill('Fold the corner to the line.').join(' '),
      annotations: [{ id: 't', kind: 'turn-over', from: at, to: at, axis: 'horizontal' }],
    });
    const largest = (document: DiagramDocument) => {
      const layout = layoutDiagram(document, estimateTextSetter);
      for (const cell of layout.pages.flatMap((page) => page.cells)) {
        const at = cell.mmPerUnit!;
        const step = stepsIn(document).find((each) => each.id === cell.stepId)!;
        const fit = (scale: number) =>
          pictureFit(layoutPicture(step, document.assets, document.style, { mmPerUnit: scale }), cell.drawMm.w, cell.drawMm.h)!;
        // It holds there; drawn at its own scale — its text took its room — not a hundredth larger.
        expect(fit(at) / at, cell.stepId).toBeGreaterThan(1 - 1e-3);
        if (cell.scaleReduced) expect(fit(at * 1.01) / (at * 1.01), cell.stepId).toBeLessThan(1);
      }
    };
    for (const at of [[0.5, 0.95], [0.5, 0.05], [0.95, 0.95]] as [number, number][]) {
      const made = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [turned(at)], 0);
      largest({ ...made, page: { ...made.page, size: 'letter', orientation: 'landscape', columns: 3, rows: 6 } });
    }
    // Two such pictures whose measures cycled out of step, so no pass held both: the last was returned unchecked.
    const both = insertSteps(
      createDiagram({ title: 'Crane', hanStyle: 'sc' }),
      [
        { ...turned([0.5, 0.95]), text: 'Fold the corner to the line.' },
        {
          ...referencesStep('step-2'),
          text: 'Fold the corner to the line.',
          annotations: [{ id: 't', kind: 'turn-over', from: [0.5, 0.95], to: [0.5, 0.95], axis: 'horizontal' }],
        },
      ],
      0
    );
    largest({ ...both, page: { ...both.page, size: 'a5', orientation: 'portrait', columns: 3, rows: 6 } });
  });

  it('keeps a sheet in its room when its letters cannot fit there, annotated or not, every picture held (review)', () => {
    // Letters on one side of a References sheet keep their pt size: in a room a few mm tall the
    // layout lets them reach out (MARKS_FLOOR), and the sheet must stay in the room.
    const long = Array(12).fill('Fold the corner to the line.').join(' ');
    const above = stepDiagramPicture(false, {
      ...SENT_MODEL,
      primitives: [
        { kind: 'sheet', width: 1, height: 1 },
        { kind: 'line', from: [0, 0.5], to: [1, 0.5], style: 'valley' },
        { kind: 'label', at: [0.5, 1], text: 'D', style: 'normal' },
      ],
    });
    const cases: [string, DiagramStep][] = [
      [
        'a letter above, annotated',
        { ...referencesStep('step-1'), picture: above, text: long, annotations: [{ id: 'v', kind: 'valley-line', from: [0, 0], to: [1, 1] }] },
      ],
      ['a letter above', { ...referencesStep('step-1'), picture: above, text: long }],
      ['the card’s own, a letter to the left', { ...referencesStep('step-1'), text: long }],
    ];
    let floored = 0;
    for (const [what, lettered] of cases) {
      const made = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [lettered, cpStep('step-2'), cpStep('step-3')], 0);
      for (const setup of [...SETUPS, { layout: 'grid' as const, size: 'a5' as const, orientation: 'landscape' as const, columns: 3, rows: 5 }]) {
        const document: DiagramDocument = { ...made, page: { ...made.page, ...setup } };
        const layout = layoutDiagram(document, estimateTextSetter);
        const cell = layout.pages[0]!.cells[0]!;
        const step = stepsIn(document)[0]!;
        const needs = layoutPicture(step, document.assets, document.style, { mmPerUnit: cell.mmPerUnit! })!;
        if (pictureExtent(needs, cell.mmPerUnit!).height > cell.drawMm.h + 1e-3) floored += 1;
        const picture = cellPicture(step, document.assets, document.style, cell, 'c-', { hanStyle: 'sc', runs: estimateTextSetter.runs })!;
        // The sheet: the first face its painter draws, in the room the layout drew, never a neighbour's.
        const face = /<g stroke-linejoin="round">\s*<path d="([^"]*)"/.exec(picture.markup)![1]!;
        const shift = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(picture.markup.slice(0, picture.markup.indexOf('<g stroke-linejoin')));
        const [dx, dy] = shift ? [Number(shift[1]), Number(shift[2])] : [0, 0];
        const xs = [...face.matchAll(/[ML](-?[\d.]+),/g)].map((each) => Number(each[1]) + dx);
        const ys = [...face.matchAll(/,(-?[\d.]+)/g)].map((each) => Number(each[1]) + dy);
        const name = `${what}, ${setupName(setup)}`;
        expect(Math.min(...xs), name).toBeGreaterThanOrEqual(cell.drawMm.x * PT_PER_MM - 0.05);
        expect(Math.max(...xs), name).toBeLessThanOrEqual((cell.drawMm.x + cell.drawMm.w) * PT_PER_MM + 0.05);
        expect(Math.min(...ys), name).toBeGreaterThanOrEqual(cell.drawMm.y * PT_PER_MM - 0.05);
        expect(Math.max(...ys), name).toBeLessThanOrEqual((cell.drawMm.y + cell.drawMm.h) * PT_PER_MM + 0.05);
        // Held: every picture, measured at the scale it is drawn at, fits the room drawn for it. (A sheet whose
        // letter takes over from its margin near its scale can leave the passes between two scales; the
        // layout keeps the one that holds.)
        for (const each of layout.pages.flatMap((page) => page.cells)) {
          const shown = stepsIn(document).find((candidate) => candidate.id === each.stepId)!;
          const measured = layoutPicture(shown, document.assets, document.style, { mmPerUnit: each.mmPerUnit! });
          expect(pictureFit(measured, each.drawMm.w, each.drawMm.h)! / each.mmPerUnit!, `${name} ${each.stepId}`).toBeGreaterThan(1 - 1e-3);
        }
      }
    }
    // The small setups' long instruction leaves the sheet a room its letters cannot fit, in every case.
    expect(floored).toBeGreaterThanOrEqual(cases.length);
  });

  it('draws a taller model at the run’s scale, taller than its box, its instruction below it', () => {
    // The bird base after the square base, as on Zach's crane: the same paper, folded taller.
    const tall: DiagramStep = { ...cpStep('step-2'), picture: { ...scenePicture('tall'), sceneJson: tallSceneJson() }, text: 'Petal fold.' };
    const document = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [cpStep('step-1'), tall], 0);
    const { layout } = preparedPages(document, FONTS, subsetter);
    const [square, bird] = layout.pages[0]!.cells;
    expect(bird!.mmPerUnit).toBe(square!.mmPerUnit);
    expect(bird!.drawMm.h).toBeGreaterThan(bird!.pictureMm.size);
    expect(bird!.text.firstBaseline).toBeGreaterThan(bird!.drawMm.y + bird!.drawMm.h);
  });

  it('draws a turn between two steps in the gutter, centred on its place, and numbers the steps on (D22)', () => {
    const document = diagram();
    const turned = insertSteps(document, [createTurn({ kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } })], 2);
    const plain = preparedPages(document, FONTS, subsetter).compose(0).svg;
    const pages = preparedPages(turned, FONTS, subsetter);
    const [turn] = pages.layout.pages[0]!.turns;
    expect(turn).toBeDefined();
    const svg = pages.compose(0).svg;
    const page = parse(svg);
    expect(page.querySelector('parsererror')).toBeNull();
    expect(svg.length).toBeGreaterThan(plain.length);
    // The glyph's "1/4" is set in the diagram's own font, and the page embeds its digits.
    const fraction = [...page.querySelectorAll('text')].find((text) => text.textContent === '1/4');
    expect(fraction?.getAttribute('font-family')).toContain(DIAGRAM_FONT_FAMILY.latin);
    let embedded: ReadonlyMap<string, string> = new Map();
    composeDiagramPage({
      layout: pages.layout,
      page: pages.layout.pages[0]!,
      steps: new Map(stepsOf(turned).map((step) => [step.id, step])),
      assets: turned.assets,
      style: turned.style,
      hanStyle: turned.hanStyle,
      setter: pages.setter,
      titleBlock: pages.titleBlock,
      embedFonts: (usage) => {
        embedded = usage;
        return '';
      },
    });
    const digits = [...embedded.values()].join('');
    for (const character of '1/4') expect(digits).toContain(character);
    // Nothing on the page but the glyph sets a "/".
    const plainUsage = new Map<string, string>();
    composeDiagramPage({
      layout: preparedPages(document, FONTS, subsetter).layout,
      page: preparedPages(document, FONTS, subsetter).layout.pages[0]!,
      steps: new Map(stepsOf(document).map((step) => [step.id, step])),
      assets: document.assets,
      style: document.style,
      hanStyle: document.hanStyle,
      setter: pages.setter,
      titleBlock: pages.titleBlock,
      embedFonts: (usage) => {
        for (const [face, characters] of usage) plainUsage.set(face, characters);
        return '';
      },
    });
    expect([...plainUsage.values()].join('')).not.toContain('/');
    // The third step is still number 3: the turn takes no number.
    expect(pages.layout.pages[0]!.cells.map((cell) => cell.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('draws the flow band at the page setup’s width and in its colour', () => {
    /** The page's paths in the band's ink, behind everything else. */
    const bands = (page: Partial<DiagramDocument['page']>) => {
      const document: DiagramDocument = { ...diagram(), page: { ...DEFAULT_PAGE_SETUP, layout: 'flow', ...page } };
      const pages = preparedPages(document, FONTS, subsetter);
      const svg = parse(pages.compose(0).svg);
      const ink = pages.layout.bandInk;
      return {
        paths: [...svg.querySelectorAll('path')].filter((path) => path.getAttribute('stroke') === ink),
        layout: pages.layout,
      };
    };
    const plain = bands({});
    expect(plain.layout.bandInk).toBe('#ecece8');
    expect(plain.paths).toHaveLength(1);
    expect(Number(plain.paths[0]!.getAttribute('stroke-width'))).toBeCloseTo(plain.layout.bandWidthMm * PT_PER_MM, 2);
    const chosen = bands({ pathWidthMm: 12, pathColor: '#d6e8f5' });
    expect(chosen.paths).toHaveLength(1);
    expect(Number(chosen.paths[0]!.getAttribute('stroke-width'))).toBeCloseTo(12 * PT_PER_MM, 2);
    expect(bands({ showPath: false }).paths).toHaveLength(0);
  });

  it('turns a turn-over side to side round on a flow row read right to left, to lead to the step after it', () => {
    // Two to a row: steps 3 and 4 are read right to left.
    const made = diagram();
    const document: DiagramDocument = { ...made, page: { ...made.page, layout: 'flow', stepsPerPage: 6 } };
    const over = () => createTurn({ kind: 'turn-over', axis: 'vertical' });
    const upright = createTurn({ kind: 'turn-over', axis: 'horizontal' });
    // Before steps 2 and 4, and a turn top to bottom beside the one before step 4.
    const turned = insertSteps(insertSteps(document, [over(), upright], 3), [over()], 1);
    const pages = preparedPages(turned, FONTS, subsetter);
    const turns = pages.layout.pages[0]!.turns;
    expect(turns.map((turn) => [turn.turn, turn.rightToLeft])).toEqual([
      [{ kind: 'turn-over', axis: 'vertical' }, false],
      [{ kind: 'turn-over', axis: 'vertical' }, true],
      [{ kind: 'turn-over', axis: 'horizontal' }, true],
    ]);
    const svg = pages.compose(0).svg;
    expect(parse(svg).querySelector('parsererror')).toBeNull();
    // One glyph mirrored, about the place it is printed at.
    const mirrors = [...svg.matchAll(/<g transform="matrix\(-1 0 0 1 ([\d.]+) 0\)">/g)].map((match) => Number(match[1]));
    expect(mirrors).toEqual([expect.closeTo(2 * turns[1]!.at.x * PT_PER_MM, 3)]);
  });
});

describe('the title block on the first page (`diagram-title-block.md`, section 6)', () => {
  const ON = { enabled: true, heightShare: 0.27 };
  const NOTE = 'Design: 将底角\nPaper: 15 cm';
  const TITLE = 'Crane · 千纸鹤';
  /** Nine linked steps on a flow, the block on and a note: page 1 holds seven, and the last step is Auto's model. */
  function blockDiagram(content: DiagramTitleBlockContentPatch = {}, last: DiagramStep = cpStep('step-9')): DiagramDocument {
    const steps = [...Array.from({ length: 8 }, (_, index) => cpStep(`step-${index + 1}`)), last].map((step) => ({ ...step, text: 'Fold in half.' }));
    const made = insertSteps(createDiagram({ title: TITLE, hanStyle: 'sc' }), steps, 0);
    return setTitleBlockContent({ ...made, page: { ...made.page, layout: 'flow', titleBlock: ON } }, { note: NOTE, ...content });
  }
  type Box = { x: number; y: number; w: number; h: number };
  /** Each line of the page with both ends in `box`, mm: its ends, its pen, and whether it is dashed. */
  const linesIn = (svg: string, box: Box) =>
    [...parse(svg).querySelectorAll('line')].flatMap((line) => {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.getAttribute(name)) / PT_PER_MM) as [number, number, number, number];
      const inside = (x: number, y: number) => x >= box.x - 0.01 && x <= box.x + box.w + 0.01 && y >= box.y - 0.01 && y <= box.y + box.h + 0.01;
      if (!inside(x1, y1) || !inside(x2, y2)) return [];
      const pen = { stroke: line.getAttribute('stroke'), width: Number(line.getAttribute('stroke-width')), dashed: line.hasAttribute('stroke-dasharray') };
      return [{ ends: [x1, y1, x2, y2], ...pen }];
    });
  const textsOf = (svg: string) => [...parse(svg).querySelectorAll('svg > text')].map((text) => text.textContent);
  /** The model as the block draws it into `room`. */
  /** The model drawn as the first page draws it: in its room (`modelRoom`), or in `box` from its bottom right. */
  const modelOf = (document: DiagramDocument, room: Box | ModelRoom | null = null, pages = preparedPages(document, FONTS, subsetter)) => {
    const { box, align } =
      room === null ? modelRoom(pages.layout.pages[0]!.titleBlock!.geometry, pages.titleBlock!) : 'box' in room ? room : { box: room, align: { x: 1, y: 1 } };
    return wholePicture(pages.titleBlock!.model.step!, document.assets, document.style, box, 'title-block-', {
      hanStyle: document.hanStyle,
      runs: pages.setter.runs,
    }, align)!;
  };

  it('draws the pattern in its square in the style’s solid fold pens, its edge in the edge pen, and no aux line', () => {
    const thumbnail = {
      viewBox: '0 0 100 100',
      strokes: [
        { x1: 0, y1: 0, x2: 100, y2: 0, role: 'edge' as const },
        { x1: 0, y1: 50, x2: 100, y2: 50, role: 'mountain' as const },
        { x1: 50, y1: 0, x2: 50, y2: 100, role: 'valley' as const },
        { x1: 0, y1: 0, x2: 100, y2: 100, role: 'aux' as const },
      ],
    };
    const linked = cpStep('step-9');
    const document = blockDiagram({ model: { kind: 'none' } }, { ...linked, source: { ...linked.source!, thumbnail } } as DiagramStep);
    const pages = preparedPages(document, FONTS, subsetter);
    const { pattern: square } = pages.layout.pages[0]!.titleBlock!.geometry;
    const pens = diagramSurfaceStyle(document.style);
    const drawn = linesIn(pages.compose(0).svg, square);
    // Fitted by its ink, as a step's picture is: half the widest pen inside the square's edges.
    const ink = Math.max(widestPenPt(pens), SEAM_STROKE_WIDTH_PT) / 2 / PT_PER_MM;
    const at = (x: number, y: number) => [square.x + ink + (x / 100) * (square.w - 2 * ink), square.y + ink + (y / 100) * (square.h - 2 * ink)];
    const near = (ends: readonly number[]) => ends.map((value) => expect.closeTo(value, 2));
    expect(drawn.map(({ ends }) => ends)).toEqual(
      [[...at(0, 0), ...at(100, 0)], [...at(0, 50), ...at(100, 50)], [...at(50, 0), ...at(50, 100)]].map(near)
    );
    expect(drawn.map(({ stroke, width, dashed }) => [stroke, width, dashed])).toEqual([
      [pens.edges.color, pens.edges.width, false],
      [pens.mountainFolds.color, pens.mountainFolds.width, false],
      [pens.valleyFolds.color, pens.valleyFolds.width, false],
    ]);
  });

  it('keeps the pattern’s ink in its square, so in the margin, whatever its pens', () => {
    const edges = [
      { x1: 0, y1: 0, x2: 100, y2: 0, role: 'edge' as const },
      { x1: 100, y1: 0, x2: 100, y2: 100, role: 'edge' as const },
      { x1: 0, y1: 100, x2: 100, y2: 100, role: 'edge' as const },
      { x1: 0, y1: 0, x2: 0, y2: 100, role: 'edge' as const },
      { x1: 0, y1: 0, x2: 100, y2: 100, role: 'valley' as const },
    ];
    const linked = cpStep('step-9');
    const made = blockDiagram({ model: { kind: 'none' } }, { ...linked, source: { ...linked.source!, thumbnail: { viewBox: '0 0 100 100', strokes: edges } } } as DiagramStep);
    const style = DEFAULT_PAPER_STYLE;
    const heavy = { ...made, style: { style: { ...style, edges: { ...style.edges, width: PEN_WIDTH_RANGE.max } } } };
    for (const document of [made, heavy]) {
      const pages = preparedPages(document, FONTS, subsetter);
      const { pattern: square } = pages.layout.pages[0]!.titleBlock!.geometry;
      const drawn = linesIn(pages.compose(0).svg, square);
      expect(drawn).toHaveLength(edges.length);
      const reach = (key: 'min' | 'max', a: number, b: number, width: number) => Math[key](a, b) + ((key === 'min' ? -1 : 1) * width) / 2 / PT_PER_MM;
      const ink = {
        left: Math.min(...drawn.map(({ ends: [x1, , x2], width }) => reach('min', x1, x2, width))),
        top: Math.min(...drawn.map(({ ends: [, y1, , y2], width }) => reach('min', y1, y2, width))),
        right: Math.max(...drawn.map(({ ends: [x1, , x2], width }) => reach('max', x1, x2, width))),
        bottom: Math.max(...drawn.map(({ ends: [, y1, , y2], width }) => reach('max', y1, y2, width))),
      };
      // To the SVG's thousandth of a pt.
      const within = 1e-3;
      expect(ink.left).toBeGreaterThanOrEqual(square.x - within);
      expect(ink.top).toBeGreaterThanOrEqual(square.y - within);
      expect(ink.right).toBeLessThanOrEqual(square.x + square.w + within);
      expect(ink.bottom).toBeLessThanOrEqual(square.y + square.h + within);
      // Its widest pen its edge's: the edge's ink on the square's, filling it.
      if (document === heavy) {
        expect([ink.left, ink.top, ink.right, ink.bottom]).toEqual(
          [square.x, square.y, square.x + square.w, square.y + square.h].map((value) => expect.closeTo(value, 2))
        );
      }
    }
  });

  it('stands the model on the pattern’s lower-left corner, covering it, with none of its marks; over the pattern’s square where there is none', () => {
    const callout = { id: 'c-1', kind: 'callout' as const, from: [0.2, 0.8] as [number, number], to: [0.6, 0.3] as [number, number], text: 'Repeat behind' };
    const marked = { ...cpStep('step-9'), annotations: [callout], annotatedPictureKey: cpStep('step-9').picture!.key };
    const document = blockDiagram({}, marked);
    const pages = preparedPages(document, FONTS, subsetter);
    const { geometry } = pages.layout.pages[0]!.titleBlock!;
    const svg = pages.compose(0).svg;
    const model = modelOf(document, { box: geometry.model, align: geometry.modelAlign }, pages);
    // Its picture alone: the step's callout is on its own page, not here.
    expect(svg).toContain(model.markup);
    expect(textsOf(svg)).not.toContain('Repeat behind');
    // Back to front: the band and its words, the pattern, the model — on top of everything in the block, where it
    // stands on the band (Zach, 2026-10-15).
    const [patternLine] = linesIn(svg, geometry.pattern);
    const patternAt = svg.indexOf(`x2="${Math.round(patternLine!.ends[2]! * PT_PER_MM * 1000) / 1000}"`);
    expect(patternAt).toBeGreaterThan(-1);
    expect(svg.indexOf('>Crane')).toBeGreaterThan(-1);
    expect(svg.indexOf('>Crane')).toBeLessThan(patternAt);
    expect(patternAt).toBeLessThan(svg.indexOf(model.markup));
    // Over the pattern's lower-left corner: the corner as far into its drawing as into its box, but for its pens' ink.
    const corner = { x: geometry.pattern.x, y: geometry.pattern.y + geometry.pattern.h };
    const drawn = { x: model.boundsPt.x / PT_PER_MM, y: model.boundsPt.y / PT_PER_MM, w: model.boundsPt.width / PT_PER_MM, h: model.boundsPt.height / PT_PER_MM };
    expect((corner.x - drawn.x) / drawn.w).toBeCloseTo(geometry.modelAlign.x, 1);
    expect((corner.y - drawn.y) / drawn.h).toBeCloseTo(geometry.modelAlign.y, 1);
    // No pattern: the model at its own size in the pattern's place, on the band's right and its foot, clear of the column.
    const alone = blockDiagram({ pattern: { kind: 'none' } }, marked);
    const alonePages = preparedPages(alone, FONTS, subsetter);
    const room = { ...geometry.model, x: geometry.block.x + geometry.block.w - geometry.model.w, y: geometry.block.y + geometry.block.h - geometry.model.h };
    const standing = modelOf(alone, room, alonePages);
    expect(alonePages.compose(0).svg).toContain(standing.markup);
    expect(standing.boundsPt.x / PT_PER_MM).toBeGreaterThanOrEqual(geometry.column.x + geometry.column.w);
  });

  it('draws only the words where there is neither pattern nor model, and keeps the block’s room', () => {
    const document = blockDiagram({ model: { kind: 'none' }, pattern: { kind: 'none' } });
    const pages = preparedPages(document, FONTS, subsetter);
    const { geometry } = pages.layout.pages[0]!.titleBlock!;
    const svg = pages.compose(0).svg;
    expect(linesIn(svg, geometry.pattern)).toEqual([]);
    expect(linesIn(svg, geometry.model)).toEqual([]);
    expect(svg).not.toContain('title-block-');
    expect(textsOf(svg).slice(0, 2)).toEqual([TITLE, 'Design: 将底角Paper: 15 cm']);
    // Every step where it is with both parts shown.
    expect(pages.layout.pages[0]!.cells).toEqual(preparedPages(blockDiagram(), FONTS, subsetter).layout.pages[0]!.cells);
  });

  it('prints the title large and the note in the diagram’s fonts, embedded, and no title tab on the first page, but on the next', () => {
    const document = blockDiagram();
    expect(diagramFontTexts(document)).toContainEqual({ text: NOTE, weight: 400 });
    const pages = preparedPages(document, FONTS, subsetter);
    expect(pages.missing).toEqual([]);
    const { title, note } = pages.layout.pages[0]!.titleBlock!;
    const svg = pages.compose(0).svg;
    const [heading, credits] = [...parse(svg).querySelectorAll('svg > text')];
    expect(heading!.textContent).toBe(TITLE);
    expect(Number(heading!.getAttribute('font-size'))).toBeCloseTo(title!.sizeMm * PT_PER_MM, 2);
    expect(heading!.getAttribute('font-weight')).toBe('700');
    expect(credits!.getAttribute('font-weight')).toBe('400');
    expect([...credits!.querySelectorAll('tspan')].map((span) => span.textContent)).toEqual(
      note!.lines.flatMap((line) => line.runs.map((run) => run.text))
    );
    // Each face embedded holds every character it sets: the title's Han in bold, the note's in regular.
    const faces = [...svg.matchAll(/@font-face\{font-family:'([^']*)';font-weight:(\d+);[^}]*base64,([^)]*)\)/g)];
    const embedded = new Map(
      faces.map(([, family, weight, data]) => [`${family}|${weight}`, readFontMetrics(Uint8Array.from(atob(data!), (c) => c.charCodeAt(0)))])
    );
    for (const [text, weight] of [[heading!, '700'], [credits!, '400']] as const) {
      for (const span of text.querySelectorAll('tspan')) {
        const family = /^'([^']*)'/.exec(span.getAttribute('font-family') ?? '')![1]!;
        for (const character of span.textContent ?? '') {
          if (character !== ' ') expect(embedded.get(`${family}|${weight}`)?.has(character.codePointAt(0)!), character).toBe(true);
        }
      }
    }
    // The tab: on the second page, not the first.
    expect(svg).not.toMatch(/<rect [^>]*rx=/);
    expect(pages.compose(1).svg).toMatch(/<rect [^>]*rx=/);
  });

  it('neither loads the note’s faces nor works out what the block shows where the first page has no block', () => {
    const off = { ...blockDiagram(), page: { ...blockDiagram().page, titleBlock: { ...ON, enabled: false } } };
    // A Chinese note left in a diagram with the block off asks for no face of its own.
    expect(diagramFontTexts(off).map(({ text }) => text)).not.toContain(NOTE);
    expect(preparedPages(off, FONTS, subsetter).titleBlock).toBeNull();
    // Nor where a grid of one row has no room for it.
    const oneRow = { ...blockDiagram(), page: { ...blockDiagram().page, layout: 'grid' as const, rows: 1 } };
    expect(diagramFontTexts(oneRow).map(({ text }) => text)).not.toContain(NOTE);
    expect(preparedPages(oneRow, FONTS, subsetter).titleBlock).toBeNull();
    expect(preparedPages(blockDiagram(), FONTS, subsetter).titleBlock?.model.step?.id).toBe('step-9');
  });

  it('leaves the block out of a composition of one part, and draws it in the page without one', () => {
    const document = blockDiagram();
    const pages = preparedPages(document, FONTS, subsetter);
    const part = { stepId: 'step-1', part: 'picture' as const };
    expect(textsOf(pages.compose(0, { only: part }).svg)).not.toContain(TITLE);
    const omitted = pages.compose(0, { omit: part }).svg;
    expect(textsOf(omitted)).toContain(TITLE);
    expect(omitted).toContain(modelOf(document, null, pages).markup);
  });

  it('carries the block onto every printed surface: the PDF’s pages, the one-sheet SVG and Print', async () => {
    const document = blockDiagram();
    const pages = preparedPages(document, FONTS, subsetter);
    const model = modelOf(document, null, pages).markup;
    const credits = 'Design: 将底角Paper: 15 cm';
    const pdf = composeEveryPage(document, pages).pages;
    expect(textsOf(pdf[0]!)).toEqual(expect.arrayContaining([TITLE, credits]));
    expect(pdf[0]).toContain(model);
    expect(textsOf(pdf[1]!)).not.toContain(credits);
    const sheet = parse(diagramSheetFile(document, pages, FONTS, subsetter).svg);
    const texts = (index: number) => [...sheet.querySelectorAll(`#page-${index} text`)].map((text) => text.textContent);
    expect(texts(1)).toEqual(expect.arrayContaining([TITLE, credits]));
    expect(texts(2)).not.toContain(credits);
    const print = await diagramPrintRequest(document, async () => pages);
    const printed = new TextDecoder().decode(Uint8Array.from(atob(print.pages[0]!.split(',')[1]!), (c) => c.charCodeAt(0)));
    expect(printed).toBe(pages.compose(0).svg);
    expect(printed).toContain(model);
  });

  it('composes the first page again when the model’s picture changes, though its step is on another page', () => {
    const before = blockDiagram();
    const after = blockDiagram({}, { ...cpStep('step-9'), picture: fixedPicture() });
    const [one, two] = [preparedPages(before, FONTS, subsetter), preparedPages(after, FONTS, subsetter)];
    expect(one.layout.pages[1]!.cells.map((cell) => cell.stepId)).toContain('step-9');
    expect(composedPageUrl(two, 0)).not.toBe(composedPageUrl(one, 0));
    expect(two.compose(0).svg).toContain(modelOf(after, null, two).markup);
    expect(two.compose(0).svg).not.toContain(modelOf(before, null, one).markup);
  });
});

describe('the title block’s header on the first page (`diagram-title-block.md`, Phase 1c: J1b)', () => {
  const ON = { enabled: true, heightShare: 0.23 };
  const PINK = { style: { ...DEFAULT_PAPER_STYLE, paper: { front: '#ffffff', back: '#d982a5' } } };
  const CREDITS = [
    { label: 'Author', value: 'Traditional' },
    { label: 'Recommended size', value: '' },
    { label: 'Steps', value: { kind: 'step-count' as const } },
  ];
  /** Nine linked steps on a flow under J1b's header: a subtitle, three credits — one with no value — and the paper's colours. */
  function headerDiagram(patch: Partial<DiagramDocument> = {}, credits = CREDITS, subtitle = 'Origami diagram'): DiagramDocument {
    const steps = Array.from({ length: 9 }, (_, index) => ({ ...cpStep(`step-${index + 1}`), text: 'Fold in half.' }));
    const made = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), steps, 0);
    const document = { ...made, page: { ...made.page, layout: 'flow' as const, titleBlock: ON }, ...patch };
    const titled = setTitleBlockContent(document, { subtitle });
    return credits.reduce((done, credit) => setTitleBlockContent(done, { credits: { op: 'add', credit } }), titled);
  }
  const texts = (svg: string) =>
    [...parse(svg).querySelectorAll('svg > text')].map((text) => ({
      text: text.textContent,
      weight: text.getAttribute('font-weight'),
      fill: text.getAttribute('fill'),
      spacing: text.getAttribute('letter-spacing'),
      x: Number(text.querySelector('tspan')?.getAttribute('x')),
      y: Number(text.querySelector('tspan')?.getAttribute('y')),
    }));
  const pt = (mm: number) => Math.round(mm * PT_PER_MM * 1000) / 1000;

  it('draws the band in the paper’s coloured side, the title white on it, the subtitle tracked with its rule, and the credits with a divider between', () => {
    const document = headerDiagram({ style: PINK });
    const pages = preparedPages(document, FONTS, subsetter);
    const block = pages.layout.pages[0]!.titleBlock!;
    const svg = pages.compose(0).svg;
    const { band, subtitle, credits, title } = block;
    const rect = parse(svg).querySelector(`svg > rect[fill="#d982a5"]`)!;
    expect(['x', 'y', 'width', 'height'].map((name) => Number(rect.getAttribute(name)))).toEqual([band.x, band.y, band.w, band.h].map(pt));
    const printed = texts(svg);
    // Back to front: the band, then the words; the subtitle and the labels in capitals, tracked; the value with none
    // not printed; the live count the last step's number.
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('>ORIGAMI DIAGRAM<'));
    expect(printed.slice(0, 6)).toEqual([
      { text: 'ORIGAMI DIAGRAM', weight: '700', fill: '#26292c', spacing: String(pt(subtitle!.trackingMm)), x: pt(band.x), y: pt(subtitle!.baseline) },
      { text: 'Crane', weight: '700', fill: '#ffffff', spacing: null, x: pt(title!.x), y: pt(title!.baseline) },
      { text: 'AUTHOR', weight: '700', fill: '#26292c', spacing: String(pt(credits!.trackingMm)), x: pt(band.x), y: pt(credits!.columns[0]!.labelBaseline) },
      { text: 'Traditional', weight: '400', fill: '#26292c', spacing: null, x: pt(band.x), y: pt(credits!.columns[0]!.valueBaseline) },
      { text: 'STEPS', weight: '700', fill: '#26292c', spacing: String(pt(credits!.trackingMm)), x: pt(credits!.columns[1]!.x), y: pt(credits!.columns[1]!.labelBaseline) },
      { text: '9', weight: '400', fill: '#26292c', spacing: null, x: pt(credits!.columns[1]!.x), y: pt(credits!.columns[1]!.valueBaseline) },
    ]);
    expect(printed.map(({ text }) => text)).not.toContain('RECOMMENDED SIZE');
    // The rule and the one divider, in the paper's colour.
    const rules = linesOf(svg).filter(({ stroke }) => stroke === '#d982a5');
    const { rule } = subtitle!;
    const [divider] = credits!.dividers;
    expect(rules).toEqual([
      { ends: [rule!.x1, rule!.y, rule!.x2, rule!.y].map(pt), width: 0.75, stroke: '#d982a5' },
      { ends: [divider!.x, divider!.y1, divider!.x, divider!.y2].map(pt), width: 0.5, stroke: '#d982a5' },
    ]);
  });

  it('prints the title and the rules in ink on a pale paper, and follows the step count', () => {
    // A new diagram's Diagram style: a white front and a grey back, 2.1:1 against white.
    const document = headerDiagram();
    const svg = preparedPages(document, FONTS, subsetter).compose(0).svg;
    expect(parse(svg).querySelector('svg > rect')!.getAttribute('fill')).toBe(diagramSurfaceStyle(document.style).paper.back);
    expect(texts(svg).find(({ text }) => text === 'Crane')!.fill).toBe('#16191c');
    expect(new Set(linesOf(svg).filter(({ width }) => width === 0.75 || width === 0.5).map(({ stroke }) => stroke))).toEqual(new Set(['#16191c']));
    // One step fewer: the count prints 8.
    const fewer = { ...document, steps: document.steps.slice(0, -1) };
    expect(texts(preparedPages(fewer, FONTS, subsetter).compose(0).svg).map(({ text }) => text)).toContain('8');
  });

  it('draws the band, its rule and dividers in the colour chosen for it, the title white or in ink against it, and follows the paper while none is (Zach, 2026-10-15)', () => {
    const fills = (document: DiagramDocument) => {
      const svg = preparedPages(document, FONTS, subsetter).compose(0).svg;
      return {
        band: parse(svg).querySelector('svg > rect')!.getAttribute('fill'),
        title: texts(svg).find(({ text }) => text === 'Crane')!.fill,
        rules: [...new Set(linesOf(svg).filter(({ width }) => width === 0.75 || width === 0.5).map(({ stroke }) => stroke))],
      };
    };
    // A dark blue chosen on the pink paper: the band, the rule and the divider in it, the title white.
    const pink = headerDiagram({ style: PINK });
    expect(fills(setTitleBlockContent(pink, { bandColor: '#2a4d8f' }))).toEqual({ band: '#2a4d8f', title: '#ffffff', rules: ['#2a4d8f'] });
    // A pale one: the title and the rules in ink, as on a pale paper — the contrast is the chosen colour's.
    expect(fills(setTitleBlockContent(pink, { bandColor: '#f3ead2' }))).toEqual({ band: '#f3ead2', title: '#16191c', rules: ['#16191c'] });
    // On the pale grey Diagram preset, a dark band chosen takes the title white again.
    expect(fills(setTitleBlockContent(headerDiagram(), { bandColor: '#2a4d8f' })).title).toBe('#ffffff');
    // None chosen: the paper's colour, which a new paper colour changes; a chosen band stays as chosen.
    expect(fills(pink).band).toBe('#d982a5');
    const green = { style: { ...DEFAULT_PAPER_STYLE, paper: { front: '#ffffff', back: '#2f9e44' } } };
    expect(fills({ ...pink, style: green }).band).toBe('#2f9e44');
    expect(fills({ ...setTitleBlockContent(pink, { bandColor: '#2a4d8f' }), style: green }).band).toBe('#2a4d8f');
  });

  it('draws nothing in the band where the title is empty, with the flow band or without it (Zach, 2026-10-15)', () => {
    const untitled = { ...headerDiagram({ style: PINK }), title: '' };
    const titled = (svg: string) => texts(svg).filter(({ fill }) => fill === '#ffffff');
    // The title's white on the pink band, where there is one; none where there is not.
    expect(titled(preparedPages(headerDiagram({ style: PINK }), FONTS, subsetter).compose(0).svg)).not.toEqual([]);
    const pages = preparedPages(untitled, FONTS, subsetter);
    expect(titled(pages.compose(0).svg)).toEqual([]);
    expect(titled(pages.compose(0, { band: false }).svg)).toEqual([]);
  });

  it('moves the band up where the subtitle is cleared, and prints neither it nor its rule', () => {
    const shown = preparedPages(headerDiagram({ style: PINK }), FONTS, subsetter);
    const cleared = preparedPages(headerDiagram({ style: PINK }, CREDITS, ''), FONTS, subsetter);
    const [with_, without] = [shown, cleared].map((pages) => pages.layout.pages[0]!.titleBlock!);
    expect(without!.band.y).toBe(without!.geometry.block.y);
    expect(without!.band.y).toBeLessThan(with_!.band.y);
    const svg = cleared.compose(0).svg;
    expect(svg).not.toContain('ORIGAMI DIAGRAM');
    expect(linesOf(svg).filter(({ width }) => width === 0.75)).toEqual([]);
    // The steps where they were.
    expect(cleared.layout.pages[0]!.cells).toEqual(shown.layout.pages[0]!.cells);
  });

  it('loads and embeds the faces the header’s Chinese subtitle, labels, values and note need', () => {
    const han = '将底角向上折至顶角';
    const document = setTitleBlockContent(headerDiagram({ style: PINK }, [{ label: han.slice(0, 2), value: han.slice(2, 5) }], han.slice(5, 9)), {
      note: '压实折痕后展开。',
    });
    expect(diagramFontTexts(document)).toEqual(
      expect.arrayContaining([
        { text: han.slice(5, 9), weight: 700 },
        { text: han.slice(0, 2), weight: 700 },
        { text: han.slice(2, 5), weight: 400 },
        { text: '压实折痕后展开。', weight: 400 },
      ])
    );
    const pages = preparedPages(document, FONTS, subsetter);
    expect(pages.missing).toEqual([]);
    const svg = pages.compose(0).svg;
    const faces = [...svg.matchAll(/@font-face\{font-family:'([^']*)';font-weight:(\d+);[^}]*base64,([^)]*)\)/g)];
    const embedded = new Map(faces.map(([, family, weight, data]) => [`${family}|${weight}`, readFontMetrics(Uint8Array.from(atob(data!), (c) => c.charCodeAt(0)))]));
    for (const text of parse(svg).querySelectorAll('svg > text')) {
      for (const span of text.querySelectorAll('tspan')) {
        const family = /^'([^']*)'/.exec(span.getAttribute('font-family') ?? '')![1]!;
        for (const character of span.textContent ?? '') {
          if (character.trim()) expect(embedded.get(`${family}|${text.getAttribute('font-weight')}`)?.has(character.codePointAt(0)!), character).toBe(true);
        }
      }
    }
    expect(texts(svg).map(({ text }) => text)).toEqual(expect.arrayContaining([han.slice(5, 9), han.slice(0, 2), han.slice(2, 5), '压实折痕后展开。']));
  });
});

/** Each line of a page: its ends and its pen, in pt. */
function linesOf(svg: string) {
  return [...parse(svg).querySelectorAll('svg > line')].map((line) => ({
    ends: ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.getAttribute(name))),
    width: Number(line.getAttribute('stroke-width')),
    stroke: line.getAttribute('stroke'),
  }));
}
