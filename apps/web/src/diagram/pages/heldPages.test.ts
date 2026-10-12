import { describe, expect, it } from 'vitest';
import { face, sceneOf } from '../../lib/paper/paperScene.fixtures';
import {
  createTurn,
  insertSteps,
  isLockedStep,
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
} from '../document/diagramDocument';
import { readDiagram, storedSceneJson, writeDiagram } from '../document/diagramFile';
import { cpSource } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { LayoutCell, LayoutPage } from './diagramPageLayout';
import { layoutDiagram } from './diagramPages';
import { fontTextSetter } from './fontTextSetter';
import { adoptPageArrangements, dropStalePageArrangements } from './pageArrangements';
import { pageLayoutFixtures } from './pageLayouts.fixtures';
import { cellSlots, settlePlaces } from './stepPlaces';

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

describe('a structural edit', () => {
  /** Where a step prints and how, whatever its number. */
  const drawn = ({ stepId, cellMm, numberAt, pictureMm, drawMm, mmPerUnit, frameMm, text, band, bend, overflow }: LayoutCell) => ({
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
    overflow,
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
