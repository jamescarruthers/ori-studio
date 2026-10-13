import { describe, expect, it } from 'vitest';
import { face, sceneOf } from '../../lib/paper/paperScene.fixtures';
import {
  createTurn,
  editStepAnnotations,
  insertSteps,
  isLockedStep,
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
  type DiagramRasterAsset,
  type DiagramScenePicture,
  type KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { readDiagram, storedSceneJson, writeDiagram } from '../document/diagramFile';
import { cpSource } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { LayoutCell, LayoutPage } from './diagramPageLayout';
import { layoutDiagram } from './diagramPages';
import { fontTextSetter } from './fontTextSetter';
import { setFrameScale } from '../zoom/zoomFrames';
import { zoomReadout } from '../zoom/zoomActions';
import { adoptPageArrangements, dropStalePageArrangements, repackPages } from './pageArrangements';
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

/** `edited` as the store's `commit` lands it on `before`: frames of re-cut cells sent home, stale arrangements let go. */
const committed = (before: DiagramDocument, edited: DiagramDocument) => dropStalePageArrangements(settlePlaces(before, edited).document);

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

/** The first, the middle and the last step this build reads on each page. */
function sampled(document: DiagramDocument): string[] {
  const readable = new Set(stepsOf(document).filter((step) => !isLockedStep(step)).map((step) => step.id));
  return cellSlots(document).pages.flatMap((ids) => {
    const own = ids.filter((id) => readable.has(id));
    return [...new Set([own[0], own[Math.floor(own.length / 2)], own.at(-1)])].filter((id) => id !== undefined);
  });
}

describe('a held page', () => {
  it.each(pageLayoutFixtures().map(({ name, document }) => [name, document] as const))(
    'moves no step for an edit of a caption or a picture: %s',
    (name, fixture) => {
      const document = adopted(fixture);
      const flow = document.page.layout === 'flow';
      const before = cellsOf(document);
      const pictured = new Set(stepsOf(document).filter(stepHasPicture).map((step) => step.id));
      let edits = 0;
      for (const stepId of sampled(document)) {
        for (const { name: edit, edit: apply, picture } of EDITS) {
          const edited = apply(document, stepId);
          // An empty caption emptied is no edit.
          if (edited === document) continue;
          edits += 1;
          const landed = committed(document, edited);
          // The edit keeps every page's arrangement: nothing is packed again.
          expect(landed.pageArrangements, `${name}: ${edit} on ${stepId}`).toBe(document.pageArrangements);
          const layout = layOut(landed);
          expect(layout.packed, `${name}: ${edit} on ${stepId}`).toBeUndefined();
          const after = new Map(layout.pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell] as const)));
          for (const [id, cell] of before) {
            const label = `${name}: ${id}, ${edit} on ${stepId}`;
            // Every step keeps its home, the edited one too.
            expect(home(after.get(id)!), label).toEqual(home(cell));
            if (!flow) continue;
            // On a flow page every other step is drawn as it was, whole. A caption edit draws the step's own picture
            // as it was too; an empty step's placeholder, which only fills the room its box leaves, gives way to it.
            if (id !== stepId) expect(after.get(id), label).toEqual(cell);
            else if (!picture && pictured.has(id)) {
              expect(after.get(id)!.drawMm, label).toEqual(cell.drawMm);
              expect([after.get(id)!.mmPerUnit, after.get(id)!.frameMm], label).toEqual([cell.mmPerUnit, cell.frameMm]);
            }
          }
        }
      }
      // A long caption, a wider capture and a photo are each an edit of every step sampled.
      expect(edits).toBeGreaterThanOrEqual(3 * sampled(document).length);
    }
  );
});

describe('a caption resized on a held page (`diagram-caption-resize.md`)', () => {
  it.each(pageLayoutFixtures().map(({ name, document }) => [name, document] as const))(
    'sets only that caption, every other step byte for byte, and re-packs to hold it: %s',
    (name, fixture) => {
      const document = adopted(fixture);
      const flow = document.page.layout === 'flow';
      const first = layOut(document);
      const before = cellsOf(document);
      // A fixture with no caption sampled (no steps, only enlarged or a newer build's) has none to resize.
      const texted = sampled(document).filter((id) => (before.get(id)?.text.lines.length ?? 0) > 0);
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

  /**
   * A page's band from its first step's picture to its last's: the curves
   * between the lane's first and last stops (the first, on the diagram's
   * first page, where the lane starts).
   */
  const bandThroughSteps = (page: LayoutPage) => {
    const { from, curves } = page.band!;
    const centre = (cell: LayoutCell) => ({ x: cell.pictureMm.x + cell.pictureMm.size / 2, y: cell.drawMm.y + cell.drawMm.h / 2 });
    const stopAt = (cell: LayoutCell) => {
      const { x, y } = centre(cell);
      return from.x === x && from.y === y ? -1 : curves.findIndex(({ to }) => to.x === x && to.y === y);
    };
    const [first, last] = [stopAt(page.cells[0]!), stopAt(page.cells.at(-1)!)];
    expect(last).toBeGreaterThanOrEqual(Math.max(0, first));
    return curves.slice(first + 1, last + 1);
  };

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
          expect([page.cells.map(drawn), page.turns], at).toEqual([was.cells.map(drawn), was.turns]);
          // Its band through its steps as it was. Beside a page packed again, the lane leaving it or coming into it
          // may meet the other page's at another height across their spine (halfway between the two, `spineAt`).
          if (changed[index - 1] || changed[index + 1]) expect(bandThroughSteps(page), at).toEqual(bandThroughSteps(was));
          else expect(page.band, at).toEqual(was.band);
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
