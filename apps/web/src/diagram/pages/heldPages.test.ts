import { describe, expect, it } from 'vitest';
import { face, sceneOf } from '../../lib/paper/paperScene.fixtures';
import {
  createDiagram,
  createTurn,
  editStepAnnotations,
  insertSteps,
  isLockedStep,
  PAGE_SETTINGS,
  removeStepPicture,
  removeSteps,
  setLinkedPicture,
  setPageSetup,
  setStepBreakBefore,
  setStepPicture,
  setStepText,
  stepHasPicture,
  stepIndex,
  stepsOf,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramPlaceScale,
  type DiagramRasterAsset,
  type DiagramScenePicture,
  type KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { readDiagram, storedSceneJson, writeDiagram } from '../document/diagramFile';
import { cpSource, cpStep } from '../document/diagramSteps.fixtures';
import { PACKER_VERSION } from './flowArrangement';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { LayoutCell, LayoutPage } from './diagramPageLayout';
import { layoutDiagram } from './diagramPages';
import { flowLane } from './flowLane';
import { fontTextSetter } from './fontTextSetter';
import { setFrameScale } from '../zoom/zoomFrames';
import { zoomReadout } from '../zoom/zoomActions';
import { adoptPageArrangements, followPageArrangements, repackPages } from './pageArrangements';
import { pageLayoutFixtures } from './pageLayouts.fixtures';
import { pastItsBox } from './pageOverflow.fixtures';
import { cellSlots, settlePlaces } from './stepPlaces';
import { setStepPlace } from '../document/stepPlace';
import { captionStartShift } from './captionMeasure';

/**
 * Held means held (`implementation-plans/diagram-flow-packing.md`, Goal and
 * Decisions 1–3, 5): once a flow page is packed and its arrangement adopted,
 * an edit of a caption or a picture moves no step — not another's, and not
 * the edited step's own place — and an edit of the structure packs only the
 * pages whose signature it changed. Every fixture of the page goldens, laid
 * out with the real fonts as the goldens are, and each edit landed as the
 * store's `commit` lands it.
 */

const layOut = (document: DiagramDocument) =>
  layoutDiagram(document, fontTextSetter((key, weight) => FIXTURE_FONTS.font(key, weight)?.metrics ?? null, document.hanStyle));

/** The fixture as the store holds it once the Pages view has laid it out: its flow pages' packing adopted. */
const adopted = (document: DiagramDocument) => adoptPageArrangements(document, layOut(document).packed ?? {});

/** `edited` as the store's `commit` lands it on `before`: arrangements following their pages, frames off their page sent home. */
const committed = (before: DiagramDocument, edited: DiagramDocument) => settlePlaces(before, followPageArrangements(before, edited)).document;

/** Every step's cell, by its id. */
const cellsOf = (document: DiagramDocument) =>
  new Map(layOut(document).pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell] as const)));

/** A step's cell in a layout, by its id. */
const cellOf = (layout: ReturnType<typeof layOut>, stepId: string) =>
  layout.pages.flatMap((page) => page.cells).find((cell) => cell.stepId === stepId)!;

/** Where a step is at home: its frame, its number and its caption's start and measure. */
const home = ({ cellMm, numberAt, text }: LayoutCell) => ({ cellMm, numberAt, text: { x: text.x, widthMm: text.widthMm } });

const LONG = 'Fold the bottom edge up to the top edge, crease firmly, unfold, then fold both sides in to meet the centre line. '.repeat(3);

/** A capture twice as wide as the fixtures' square sheet: a re-pose, the picture's measure kept. */
const WIDE: DiagramScenePicture = {
  kind: 'scene',
  sceneJson: storedSceneJson(
    sceneOf([
      face([
        [
          [0, 0],
          [200, 0],
          [200, 100],
          [0, 100],
        ],
      ]),
    ])
  )!,
  paperScale: 100,
  styleKey: null,
  key: 'scene-wide',
};

/** A tall photo: a picture of the other measure, fitted to the room its step's box leaves it. */
const PHOTO: DiagramRasterAsset = {
  id: 'asset-held',
  kind: 'raster',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAKCAYAAACjd+KYAAAADklEQVR4nGNgGAWjAAMAAToAAa1HmV0AAAAASUVORK5CYII=',
  widthPx: 10,
  heightPx: 30,
  bytes: 120,
};

const EDITS: readonly { name: string; edit: (document: DiagramDocument, stepId: string) => DiagramDocument; picture: boolean }[] = [
  { name: 'a long caption', edit: (document, id) => setStepText(document, id, LONG), picture: false },
  { name: 'an emptied caption', edit: (document, id) => setStepText(document, id, ''), picture: false },
  { name: 'a wider capture', edit: (document, id) => setLinkedPicture(document, id, { source: cpSource(), picture: WIDE }), picture: true },
  { name: 'a photo', edit: (document, id) => setStepPicture(document, id, PHOTO), picture: true },
];

/** The steps enlarged from an area marked on `stepId`'s picture. */
function enlargedFrom(document: DiagramDocument, stepId: string): Set<string> {
  const areas = new Set(stepsOf(document).find((step) => step.id === stepId)?.annotations.map((annotation) => annotation.id));
  return new Set(stepsOf(document).flatMap((step) => (step.zoom && areas.has(step.zoom.from) ? [step.id] : [])));
}

/** Every step this build reads, page by page. */
function readable(document: DiagramDocument): string[] {
  const ours = new Set(stepsOf(document).filter((step) => !isLockedStep(step)).map((step) => step.id));
  return cellSlots(document).pages.flatMap((ids) => ids.filter((id) => ours.has(id)));
}

/**
 * Every fixture of the page goldens twice: as it is, the title block off, as
 * every file saved before the block reads; and with the block, as a new
 * diagram has it, its first page shorter and every later page holding other
 * steps.
 */
function heldFixtures(): [string, DiagramDocument][] {
  return pageLayoutFixtures().flatMap(({ name, document }): [string, DiagramDocument][] => [
    [name, document],
    [`${name}, with the title block`, setPageSetup(document, { titleBlock: { ...PAGE_SETTINGS.titleBlock.default, enabled: true } })],
  ]);
}

describe('a held page', () => {
  it.each(heldFixtures())(
    'moves no step for an edit of a caption or a picture: %s',
    (name, fixture) => {
      const document = adopted(fixture);
      const flow = document.page.layout === 'flow';
      const before = cellsOf(document);
      const pictured = new Set(stepsOf(document).filter(stepHasPicture).map((step) => step.id));
      const signatures = cellSlots(document).signatures;
      let edits = 0;
      for (const stepId of readable(document)) {
        for (const { name: edit, edit: apply, picture } of EDITS) {
          const edited = apply(document, stepId);
          // An empty caption emptied is no edit.
          if (edited === document) continue;
          edits += 1;
          const landed = committed(document, edited);
          const restructured = cellSlots(landed).signatures.flatMap((signature, page) => (signature === signatures[page] ? [] : [page]));
          if (restructured.length > 0) {
            // A photo filling an enlarged step that waits for its picture drops its window (`startsWhole`): an edit
            // of its page's structure, which packs that page alone, every other drawn as it was.
            const label = `${name}: ${edit} on ${stepId}`;
            expect([edit, stepsOf(document).find((step) => step.id === stepId)?.zoom !== undefined], label).toEqual(['a photo', true]);
            const pages = layOut(landed).pages;
            const page = cellSlots(landed).pages.findIndex((ids) => ids.includes(stepId));
            expect(restructured, label).toEqual([page]);
            for (const [index, each] of pages.entries()) {
              if (index !== page) for (const cell of each.cells) expect(cell, `${label}: ${cell.stepId}`).toEqual(before.get(cell.stepId));
            }
            continue;
          }
          // The edit keeps every page's arrangement: nothing is packed again.
          expect(landed.pageArrangements, `${name}: ${edit} on ${stepId}`).toBe(document.pageArrangements);
          const layout = layOut(landed);
          expect(layout.packed, `${name}: ${edit} on ${stepId}`).toBeUndefined();
          const after = new Map(layout.pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell] as const)));
          const fromEdited = enlargedFrom(document, stepId);
          for (const [id, cell] of before) {
            const label = `${name}: ${id}, ${edit} on ${stepId}`;
            // Every step keeps its home, the edited one too.
            expect(home(after.get(id)!), label).toEqual(home(cell));
            if (!flow) continue;
            // On a flow page every other step is drawn as it was, whole — a step enlarged from the edited one's area
            // too, though what it prints against that area, its read-out, follows the area's new picture. A caption
            // edit draws the step's own picture as it was too; an empty step's placeholder, which only fills the
            // room its box leaves, gives way to it.
            if (fromEdited.has(id)) expect({ ...after.get(id), zoom: { ...after.get(id)!.zoom!, printed: 0 } }, label).toEqual({ ...cell, zoom: { ...cell.zoom!, printed: 0 } });
            else if (id !== stepId) expect(after.get(id), label).toEqual(cell);
            else if (!picture && pictured.has(id)) {
              expect(after.get(id)!.drawMm, label).toEqual(cell.drawMm);
              expect([after.get(id)!.mmPerUnit, after.get(id)!.frameMm], label).toEqual([cell.mmPerUnit, cell.frameMm]);
            }
          }
        }
      }
      // A long caption, a wider capture and a photo are each an edit of every step.
      expect(edits).toBeGreaterThanOrEqual(3 * readable(document).length);
    }
  );
});

describe('the lane between two held pages (Zach’s crane, 2026-10-14: "the end of the ribbon on the 2nd page and the start of the ribbon on the 3rd don’t line up")', () => {
  it('leaves one page and comes into the next at one height, over every spine and every page turn it hands over at, packing nothing', () => {
    let [spines, turns] = [0, 0];
    for (const [name, fixture] of heldFixtures().filter(([, document]) => document.page.layout === 'flow')) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const document = adopted(setPageSetup(fixture, { firstPageSide }));
        const layout = layOut(document);
        // Held as adopted: no page is packed again for the lane.
        expect(layout.packed, name).toBeUndefined();
        const W = layout.paper.widthMm;
        layout.pages.forEach((page, index) => {
          const next = layout.pages[index + 1];
          if (!next || !page.band || !next.band) return;
          const label = `${name}, first page ${firstPageSide}, pages ${index + 1}–${index + 2}`;
          // Off this page at its right edge — the spine of a left page, the outer edge of a right one — and onto
          // the next at its left; a page that ends at its last picture hands over nothing.
          if (page.band.curves.at(-1)!.to.x !== W + 10 || next.band.from.x !== -10) return;
          const [out, into] = [page.band.curves.at(-2)!.to, next.band.curves[0]!.to];
          const plan = page.flow!.plan;
          // The diagram's first page alone on the right reads down from step 1 and leaves at its foot, the next
          // starting at its head: each runs off at its own picture's height.
          if (plan.exit === 'turn' && !plan.up) {
            expect([out.y, into.y], label).toEqual([page.flow!.stops.at(-1)!.y, next.flow!.stops[0]!.y]);
            return;
          }
          expect(into.y, label).toBeCloseTo(out.y, 9);
          if (plan.exit === 'spine') spines += 1;
          else turns += 1;
        });
      }
    }
    expect(spines).toBeGreaterThan(5);
    expect(turns).toBeGreaterThanOrEqual(3);
  });
});

describe('a caption resized on a held page (`diagram-caption-resize.md`)', () => {
  it.each(heldFixtures())(
    'sets only that caption, every other step byte for byte, and re-packs to hold it: %s',
    (name, fixture) => {
      const document = adopted(fixture);
      const flow = document.page.layout === 'flow';
      const first = layOut(document);
      const before = cellsOf(document);
      // A fixture with no caption (no steps, only enlarged or a newer build's) has none to resize.
      const texted = readable(document).filter((id) => (before.get(id)?.text.lines.length ?? 0) > 0);
      if (texted.length === 0) return;
      for (const stepId of texted) {
        const at = before.get(stepId)!;
        for (const textWidth of [at.text.widthMm + 25, Math.max(14, at.text.widthMm - 10)].map((mm) => Math.round(mm * 10) / 10)) {
          const label = `${name}: ${stepId} at ${textWidth} mm`;
          const landed = committed(document, setStepPlace(document, stepId, { textWidth }));
          // Not structure: every page keeps its arrangement, and nothing is packed again.
          expect(landed.pageArrangements, label).toBe(document.pageArrangements);
          const layout = layOut(landed);
          expect(layout.packed, label).toBeUndefined();
          const after = new Map(layout.pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell] as const)));
          for (const [id, cell] of before) if (id !== stepId) expect(JSON.stringify(after.get(id)), `${label}: ${id}`).toBe(JSON.stringify(cell));
          const cell = after.get(stepId)!;
          expect([cell.cellMm, cell.numberAt, cell.drawMm, cell.mmPerUnit, cell.frameMm], label).toEqual([at.cellMm, at.numberAt, at.drawMm, at.mmPerUnit, at.frameMm]);
          expect(cell.text.widthMm, label).toBeCloseTo(textWidth, 9);
          expect(cell.text.x, label).toBeCloseTo(at.text.x + captionStartShift(at, undefined, textWidth), 9);
          if (flow) expect(layout.pages.map((page) => page.band), label).toEqual(first.pages.map((page) => page.band));
        }
      }
      if (!flow) return;
      // Re-pack Page honours the pin: the step's box holds its caption, its side room either side.
      const stepId = texted[0]!;
      const textWidth = Math.round((before.get(stepId)!.text.widthMm + 25) * 10) / 10;
      const pinned = committed(document, setStepPlace(document, stepId, { textWidth }));
      const page = cellSlots(pinned).pages.findIndex((ids) => ids.includes(stepId));
      const repacked = adopted(committed(pinned, repackPages(pinned, page)));
      const cell = cellsOf(repacked).get(stepId)!;
      expect(cell.cellMm.w, name).toBeGreaterThanOrEqual(textWidth + 4 - 0.01);
      expect(cell.text.x, name).toBeGreaterThanOrEqual(cell.cellMm.x + 1.75 - 0.01);
      expect(cell.text.x + textWidth, name).toBeLessThanOrEqual(cell.cellMm.x + cell.cellMm.w - 1.75 + 0.01);
      expect(pastItsBox(cell), name).toBeNull();
    }
  );
});

describe('a picture whose size is pinned by hand (Zach, 2026-10-13)', () => {
  /**
   * Nine crease-pattern steps, `per` a flow page, `s3` with its size pinned at
   * `factor` times the scale it prints at unpinned: the pinned diagram, laid
   * out from no stored arrangement, and the scale the pin asks for.
   */
  const pinnedAt = (factor: number, per: number, page: Partial<DiagramPageSetup> = {}) => {
    const steps = Array.from({ length: 9 }, (_, index) => ({ ...cpStep(`s${index}`), text: 'Fold the corner up.' }));
    const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
      layout: 'flow',
      stepsPerPage: per,
      ...page,
    });
    const auto = cellOf(layOut(base), 's3');
    const scale: DiagramPlaceScale = auto.mmPerUnit !== null ? { mmPerUnit: auto.mmPerUnit * factor } : { frameMm: auto.frameMm! * factor };
    return { base, pinned: setStepPlace(base, 's3', { scale }), pin: scale };
  };
  /** What a pin asks a cell to print at: its scale in the pin's measure. */
  const printedAt = (cell: LayoutCell) => cell.mmPerUnit ?? cell.frameMm;

  it('is packed at its pin, which no page scale changes: a fresh pack gives it a box that holds it', () => {
    const scales = new Set<number>();
    // Pins a page can hold: one no page scale holds is packed as before (below).
    for (const per of [6, 9, 12]) {
      for (const page of [{}, { orientation: 'landscape' as const }]) {
        for (const factor of [0.6, 1.4, 1.8]) {
          const { pinned, pin } = pinnedAt(factor, per, page);
          const layout = layOut(pinned);
          const at = layout.pages.find((each) => each.cells.some((cell) => cell.stepId === 's3'))!;
          scales.add(Math.round(at.packing!.k * 1000));
          const cell = cellOf(layout, 's3');
          const label = `${per} a page ${JSON.stringify(page)}, ×${factor}`;
          // It prints at its pin, and its box holds it there.
          expect(printedAt(cell), label).toBeCloseTo('mmPerUnit' in pin ? pin.mmPerUnit : pin.frameMm, 9);
          expect(pastItsBox(cell), label).toBeNull();
          // Every other step on the page in its box too.
          for (const other of at.cells) expect(pastItsBox(other), `${label}: ${other.stepId}`).toBeNull();
        }
      }
    }
    // Packed at several page scales.
    expect(scales.size).toBeGreaterThan(3);
  });

  it('packs a page whose pins no page scale can hold as it did before, its pinned pictures drawn past their boxes', () => {
    const { base } = pinnedAt(1, 9);
    const before = layOut(base);
    // Every step pinned at four times the size it prints at: no plan holds them at any page scale.
    const pinned = stepsOf(base).reduce((document, step) => {
      const cell = cellOf(before, step.id);
      const scale: DiagramPlaceScale = cell.mmPerUnit !== null ? { mmPerUnit: cell.mmPerUnit * 4 } : { frameMm: cell.frameMm! * 4 };
      return setStepPlace(document, step.id, { scale });
    }, base);
    const layout = layOut(pinned);
    expect(layout.pages[0]!.packing!.fits).toBe(true);
    // The page packed as with no pin, each picture at its pin past its box: every box where it was, but in the first
    // band, which keeps its steps, its row and their sizes, its first step set in as far as its picture needs to
    // start at the area's left edge, or the band's spare width allows (`pack-7`, 2026-10-15).
    const cells = layout.pages[0]!.cells;
    for (const cell of cells) {
      const was = cellOf(before, cell.stepId);
      expect(cell.band, cell.stepId).toBe(was.band);
      if (cell.band === 0) expect({ ...cell.cellMm, x: 0 }, cell.stepId).toEqual({ ...was.cellMm, x: 0 });
      else expect(cell.cellMm, cell.stepId).toEqual(was.cellMm);
      expect(pastItsBox(cell), cell.stepId).toBe('picture');
    }
    // Without a pin the first step stands at the area's left edge. Pins four times the size reach further past it
    // than the band has spare, so the band gives the first step all of it: its steps stand a gutter apart.
    const areaLeft = cellOf(before, 's0').cellMm.x;
    const first = cellOf(layout, 's0');
    expect(first.cellMm.x).toBeGreaterThan(areaLeft);
    expect(first.drawMm.x).toBeLessThan(areaLeft);
    const row = cells.filter((cell) => cell.band === 0 && !cell.bend).sort((a, b) => a.cellMm.x - b.cellMm.x);
    const wasRow = row.map((cell) => cellOf(before, cell.stepId));
    row.slice(1).forEach((cell, j) => {
      const gap = cell.cellMm.x - (row[j]!.cellMm.x + row[j]!.cellMm.w);
      const wasGap = wasRow[j + 1]!.cellMm.x - (wasRow[j]!.cellMm.x + wasRow[j]!.cellMm.w);
      // Each gap before was the gutter and one share of the spare, which the first step now has, every share of it
      // (to the hundredth of a mm an arrangement keeps).
      expect(gap, cell.stepId).toBeLessThan(wasGap);
      expect(first.cellMm.x - areaLeft, cell.stepId).toBeCloseTo((wasGap - gap) * row.length, 1);
    });
  });

  it('re-packs nothing when its pin changes on a held page, drawn past its box, until Re-pack Page makes room', () => {
    const { base, pinned } = pinnedAt(2.4, 9);
    const held = adopted(base);
    // A pin is not structure: the page keeps its arrangement, and nothing is packed.
    const landed = committed(held, setStepPlace(held, 's3', { scale: stepsOf(pinned).find((step) => step.id === 's3')!.place!.scale! }));
    expect(landed.pageArrangements).toBe(held.pageArrangements);
    const layout = layOut(landed);
    expect(layout.packed).toBeUndefined();
    const before = cellsOf(held);
    expect(home(cellOf(layout, 's3'))).toEqual(home(before.get('s3')!));
    expect(pastItsBox(cellOf(layout, 's3'))).toBe('picture');
    // Re-pack Page packs it at its pin: its new box holds it.
    const repacked = adopted(committed(landed, repackPages(landed, 0)));
    expect(repacked.pageArrangements!.s0!.packer).toBe(PACKER_VERSION);
    const cell = cellsOf(repacked).get('s3')!;
    expect(pastItsBox(cell)).toBeNull();
    expect(cell.cellMm.w).toBeGreaterThan(before.get('s3')!.cellMm.w);
  });
});

describe('an enlarged run on a held page', () => {
  /** The flow fixture with an enlarged run: an area on `step-area`, `step-zoom-1` and `step-zoom-2` enlarged after it. */
  const fixture = () => pageLayoutFixtures().find(({ name }) => name.startsWith('enlarged steps'))!.document;

  it('re-packs nothing for the arrow that a picture or a mark brings or takes away', () => {
    const document = adopted(fixture());
    expect(document.page.layout).toBe('flow');
    const before = cellsOf(document);
    let area: readonly KnownDiagramAnnotation[] = [];
    const withoutArea = editStepAnnotations(document, 'step-area', (annotations) => {
      area = annotations;
      return [];
    });
    const edits: [string, DiagramDocument, DiagramDocument][] = [
      ['the enlarged step’s picture removed', document, removeStepPicture(document, 'step-zoom-1')],
      ['the area deleted', document, withoutArea],
      ['the area put back', withoutArea, editStepAnnotations(withoutArea, 'step-area', () => [...area])],
    ];
    expect(layOut(document).pages[0]!.zoomArrows.length).toBe(1);
    // A step as drawn, less its read-out: an enlarged step is measured against its run's area, which these edits change.
    const drawn = ({ zoom: _readout, ...cell }: LayoutCell) => cell;
    for (const [name, from, edited] of edits) {
      expect(edited, name).not.toBe(from);
      const landed = committed(from, edited);
      // The page keeps its arrangement, and nothing is packed again.
      expect(landed.pageArrangements, name).toBe(document.pageArrangements);
      const layout = layOut(landed);
      expect(layout.packed, name).toBeUndefined();
      for (const page of layout.pages) {
        for (const cell of page.cells) {
          // Every step keeps its home; any but the edited one draws as it did.
          expect(home(cell), `${name}: ${cell.stepId}`).toEqual(home(before.get(cell.stepId)!));
          if (cell.stepId !== 'step-zoom-1' && cell.stepId !== 'step-area')
            expect(drawn(cell), `${name}: ${cell.stepId}`).toEqual(drawn(before.get(cell.stepId)!));
        }
      }
    }
    // With the area gone no arrow prints; its gutter is kept for it.
    expect(layOut(committed(document, withoutArea)).pages[0]!.zoomArrows).toEqual([]);
  });

  it('draws an enlarged step at its own new Size, past its box as a size pin is, every other step as it was', () => {
    const document = adopted(fixture());
    const before = cellsOf(document);
    const was = before.get('step-zoom-2')!;
    expect(zoomReadout(was.zoom!)).toEqual({ kind: 'prints', asked: 2, printed: 2, warn: false });
    /** The read-out's share of the window as printed: one area for the run, so the same at any Size. */
    const perMm = (cell: LayoutCell) => cell.zoom!.printed / cell.frameMm!;
    /** `document` with step-zoom-2 at `size`, landed: nothing re-packed, its layout, and every other step as before. */
    const resized = (size: number | null) => {
      const landed = committed(document, setFrameScale(document, 'step-zoom-2', size));
      expect(landed.pageArrangements, `×${size}`).toBe(document.pageArrangements);
      const layout = layOut(landed);
      expect(layout.packed, `×${size}`).toBeUndefined();
      for (const [id, cell] of before)
        if (id !== 'step-zoom-2') expect(JSON.stringify(cellOf(layout, id)), `×${size}: ${id}`).toBe(JSON.stringify(cell));
      return { landed, cell: cellOf(layout, 'step-zoom-2') };
    };

    // Smaller: its window at 1.25 / 2 of the one kept, in its place.
    const { cell: small } = resized(1.25);
    expect(small.frameMm).toBeCloseTo((was.frameMm! * 1.25) / 2, 9);
    expect(home(small)).toEqual(home(was));
    expect(pastItsBox(small)).toBeNull();
    expect(perMm(small)).toBeCloseTo(perMm(was), 12);
    expect(zoomReadout(small.zoom!)).toEqual({ kind: 'prints', asked: 1.25, printed: 1.25, warn: false });

    // Larger than its box holds: drawn at it all the same, past its box, as a size pinned by hand is
    // (Zach, 2026-10-12) — its home kept, its caption under it, and its read-out the Size asked.
    const { landed: larger, cell: big } = resized(6);
    expect(big.frameMm).toBeCloseTo((was.frameMm! * 6) / 2, 9);
    // Printed against its area to the arrangement's rounding: both are kept to a ten-thousandth of a mm.
    expect(big.zoom).toEqual({ asked: 6, printed: expect.closeTo(6, 4), reduced: false });
    expect(home(big)).toEqual(home(was));
    expect(pastItsBox(big)).toBe('picture');
    expect(big.text.firstBaseline).toBeGreaterThan(big.drawMm.y + big.drawMm.h);
    expect(perMm(big)).toBeCloseTo(perMm(was), 12);
    expect(zoomReadout(big.zoom!)).toEqual({ kind: 'prints', asked: 6, printed: 6, warn: false });

    // Fill, as before: as large as its box's room allows, inside it.
    const { cell: filled } = resized(null);
    expect(filled.zoom!.asked).toBeNull();
    expect(pastItsBox(filled)).toBeNull();
    expect(filled.frameMm!).toBeLessThan(big.frameMm!);

    // Re-pack Page packs it for its Size: its new place holds it, and it prints at it.
    const repacked = adopted(committed(larger, repackPages(larger, 0)));
    const packed = cellOf(layOut(repacked), 'step-zoom-2');
    expect(pastItsBox(packed)).toBeNull();
    expect(repacked.pageArrangements!['step-a']!.steps['step-zoom-2']!.zoomScale).toBe(6);
    expect(zoomReadout(packed.zoom!)).toEqual({ kind: 'prints', asked: 6, printed: 6, warn: false });
  });
});

describe('a structural edit', () => {
  /** Where a step prints and how, whatever its number. */
  const drawn = ({ stepId, cellMm, numberAt, pictureMm, drawMm, mmPerUnit, frameMm, text, band, bend }: LayoutCell) => ({
    stepId,
    cellMm,
    numberAt,
    pictureMm,
    drawMm,
    mmPerUnit,
    frameMm,
    text,
    band,
    bend,
  });

  /** Each page, by the step it starts with, and its signature. */
  const signed = (document: DiagramDocument) => {
    const slots = cellSlots(document);
    return slots.pages.map((ids, page) => `${ids[0]} ${slots.signatures[page]}`);
  };

  /** Each flow fixture's steps, and edits of its structure. */
  const STRUCTURAL: readonly { name: string; edit: (document: DiagramDocument) => DiagramDocument }[] = [
    {
      name: 'a turn before the last step',
      edit: (document) => {
        const last = stepsOf(document).at(-1)!;
        return insertSteps(document, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'turn-held')], stepIndex(document, last.id));
      },
    },
    {
      name: 'a page break before the second page’s last step',
      edit: (document) => {
        const second = cellSlots(document).pages[1] ?? [];
        return second.length > 1 ? setStepBreakBefore(document, second.at(-1)!, true) : document;
      },
    },
    { name: 'the first step removed', edit: (document) => removeSteps(document, [stepsOf(document)[0]!.id]) },
    { name: 'less nesting', edit: (document) => setPageSetup(document, { flowNesting: 0.3 }) },
  ];

  it('packs only the pages whose signature it changed, and draws every other page as it was', () => {
    let held = 0;
    let packed = 0;
    for (const { name, document: fixture } of pageLayoutFixtures().filter(({ document }) => document.page.layout === 'flow')) {
      const document = adopted(fixture);
      if (stepsOf(document).length === 0) continue;
      const kept = new Set(signed(document));
      const pagesBefore = new Map(layOut(document).pages.map((page) => [page.cells[0]!.stepId, page] as const));
      for (const { name: edit, edit: apply } of STRUCTURAL) {
        const edited = apply(document);
        if (edited === document) continue;
        const landed = committed(document, edited);
        const label = `${name}: ${edit}`;
        // The pages it changed: a page that starts with another step, or holds another structure.
        const changed = signed(landed).map((page) => !kept.has(page));
        const layout = layOut(landed);
        expect(layout.pages.map((page) => page.packing!.packed), label).toEqual(changed);
        expect(Object.keys(layout.packed ?? {}), label).toEqual(
          layout.pages.filter((_, index) => changed[index]).map((page) => page.cells[0]!.stepId)
        );
        layout.pages.forEach((page, index) => {
          if (changed[index]) {
            packed += 1;
            return;
          }
          held += 1;
          const was = pagesBefore.get(page.cells[0]!.stepId)!;
          const at = `${label}, page ${index + 1}`;
          // Each step where it was and drawn as it was; an edit before the page may renumber them.
          expect(page.cells.map(drawn), at).toEqual(was.cells.map(drawn));
          if (!changed[index - 1] && !changed[index + 1]) {
            expect([page.turns, page.band], at).toEqual([was.turns, was.band]);
            return;
          }
          // Beside a page packed again, the lane leaving it or coming into it may meet the other page's at another
          // height over their spine or page turn (halfway between the two, `handoverHeight`). Through the same stops as before, it
          // is one curve (`flowLane.ts`, "(b4)"), so all of it is drawn again — and a glyph standing at a turn's
          // middle on it with it. Every other glyph stands as it was.
          const stopsOf = ({ handoverIn: _in, handoverOut: _out, ...rest }: NonNullable<LayoutPage['flow']>) => rest;
          expect(stopsOf(page.flow!), at).toEqual(stopsOf(was.flow!));
          const middles = flowLane(page.flow!)!.turns;
          page.turns.forEach((turn, t) => {
            const old = was.turns[t]!;
            expect({ ...turn, at: old.at }, at).toEqual(old);
            if (turn.at.x === old.at.x && turn.at.y === old.at.y) return;
            const k = page.cells.findIndex((cell) => cell.stepId === turn.beforeStepId);
            expect(turn.at, `${at}, ${turn.id}`).toEqual(middles.get(k)?.at);
          });
        });
      }
    }
    // Most structural edits leave most pages held; a packing setting packs every page.
    expect(held).toBeGreaterThan(20);
    expect(packed).toBeGreaterThan(20);
  });

  it('packs only the last page for a turn before the diagram’s last step', () => {
    for (const { name, document: fixture } of pageLayoutFixtures().filter(({ document }) => document.page.layout === 'flow')) {
      const document = adopted(fixture);
      const steps = stepsOf(document);
      if (steps.length === 0) continue;
      const pages = cellSlots(document).pages;
      // A last page of one step holds its turn as the turn before its first step: still only that page.
      const layout = layOut(committed(document, STRUCTURAL[0]!.edit(document)));
      expect(
        layout.pages.map((page) => page.packing!.packed),
        name
      ).toEqual(pages.map((_, index) => index === pages.length - 1));
    }
  });
});

describe('packing', () => {
  it.each(pageLayoutFixtures().map(({ name, document }) => [name, document] as const))(
    'is the same every time, and for the file written and read back: %s',
    (_name, document) => {
      const fresh = () => readDiagram(JSON.parse(JSON.stringify(writeDiagram(document))))!.document;
      const first = layOut(document);
      const again = layOut(fresh());
      expect(again.packed).toEqual(first.packed);
      expect(again.pages.map((page) => page.cells)).toEqual(first.pages.map((page) => page.cells));
    }
  );
});
