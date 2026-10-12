import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { isLockedStep, isTurn, type DiagramDocument, type DiagramStepPlace } from '../document/diagramDocument';
import { FIXTURE_FONTS, fixtureSubsetter } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import { diagramLayoutSteps, preparedPages } from './diagramPages';
import { pageLayoutFixtures } from './pageLayouts.fixtures';

/**
 * The page golden (`implementation-plans/diagram-page-overrides.md`, "Nothing
 * placed, nothing changes"): every fixture's pages, laid out and composed,
 * are the same byte for byte with no placement on any step and with one that
 * moves nothing — every offset zero; and the same as they printed before
 * placement came, held to their stored digests. What holds each new
 * expression of the layout to today's plus a zero offset, or behind a "this
 * step is placed" guard.
 *
 * And the homes golden (`implementation-plans/diagram-flow-pages.md`, Goal):
 * where the layout puts each step — its cell, its number and its text — held
 * to stored digests, page by page. A hand placement is an offset from its
 * step's home, so a home that moves moves every placed step of every diagram
 * saved with one: the layout froze at launch, and this says when it changes.
 */

let subsetter: FontSubsetter;
beforeAll(async () => {
  subsetter = await fixtureSubsetter();
});

const ZERO: DiagramStepPlace = { frame: [0, 0], number: [0, 0], picture: [0, 0], text: [0, 0] };

/** Every step this build reads given a placement that moves nothing, as no edit or file would keep one. */
function zeroPlaced(document: DiagramDocument): DiagramDocument {
  return {
    ...document,
    steps: document.steps.map((entry) => (isTurn(entry) || isLockedStep(entry) ? entry : { ...entry, place: ZERO })),
  };
}

/** Everything a diagram's pages print and the Pages view lays over them. */
function printed(document: DiagramDocument) {
  const pages = preparedPages(document, FIXTURE_FONTS, subsetter);
  return {
    layout: pages.layout,
    missing: pages.missing,
    pages: pages.layout.pages.map((_, index) => ({
      svg: pages.compose(index).svg,
      view: pages.compose(index, { band: false }).svg,
      arrows: pages.zoomArrows(index),
    })),
  };
}

describe('pages with nothing placed', () => {
  it.each(pageLayoutFixtures().map(({ name, document }) => [name, document] as const))(
    'are the same, byte for byte, with no placement and one of zero offsets: %s',
    (_name, document) => {
      const placed = zeroPlaced(document);
      // The layout is handed the placement, for every step this build reads.
      expect(diagramLayoutSteps(placed).filter((step) => step.place !== undefined).length).toBe(
        document.steps.filter((entry) => !isTurn(entry) && !isLockedStep(entry)).length
      );
      const plain = printed(document);
      const zero = printed(placed);
      expect(zero.layout).toEqual(plain.layout);
      expect(zero.missing).toEqual(plain.missing);
      expect(zero.pages.length).toBe(plain.pages.length);
      zero.pages.forEach((page, index) => {
        expect(page.svg).toBe(plain.pages[index]!.svg);
        expect(page.view).toBe(plain.pages[index]!.view);
        expect(page.arrows).toEqual(plain.pages[index]!.arrows);
      });
    }
  );
});

/** A text's digest: its sha256's first 16 hex digits. */
const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

describe('pages as they printed before placement came', () => {
  it('are held to their digests: the page, the Pages view’s page and its arrows, page by page', () => {
    // Taken from the layout at 6f7792459 (Phase 1 changes no page). A change here
    // is a change to what every diagram prints: say why when updating them.
    // - Phase 1b: a flow page takes its steps per page and derives its shape, the
    //   one that prints the largest pictures. Every flow fixture already in that
    //   shape prints as it did (14 of the 16 digests); the enlarged steps' six a
    //   page are 2 × 3 now, not 3 × 2, and the seven-steps fixture is new.
    // 2026-10-08: the flow band is 20 mm wide by default, no longer in proportion
    // to the steps (`diagram-review-fixes.md`, item 1). Every flow page's print
    // changed by its band alone; the Pages view's page and its arrows did not.
    // October 10: balanced packing replaces fixed flow rows; explicit enlarged
    // Size is honored past its old room. Grid fixtures without Size remain unchanged.
    // October 11: occupied shape packing, local symbol clearances and fairer
    // ribbon connectors change flow output; grid rendering remains unchanged.
    // October 11, later (`diagram-flow-pages.md`, Phase 2): packing is gone and
    // flow pages are #436's cells again, cut from each page's plan — balanced
    // rows, odd rows on a left page that hands over, a page laid out for the
    // steps it holds — and the band ends just past the diagram's last step.
    // Every flow fixture changed; the Pages view's pages that only lost their
    // band's end are as Phase 1b printed them (the enlarged steps' page 1, both
    // views, and their page 2, the page break's page 2 and the seven steps'
    // page 3, in the view). Grid fixtures are unchanged.
    // Two fixtures added, no digest changed: pages with their own counts, and a
    // grid's enlarged steps at a Size of 2 and of 6, whose page is #436's byte
    // for byte (checked against #436's build, its fonts loaded in the browser).
    // October 12 (`diagram-flow-packing.md`, Phase 3): flow pages are packed by
    // their steps' shapes into bands, a step may stand in a bend, and the band
    // turns at the page's edge. Every flow fixture changed, both views; grid
    // fixtures are unchanged. Phase 5 rasterised each of the 19 changed flow
    // pages and checked them by eye against the plan's packing and the
    // prototype's look: bands in reading order, steps in bends, the lane
    // meeting the spine and ending at the last box. No digest changed in
    // Phases 4 or 5.
    // Review fixes (`diagram-flow-packing.md`, "Review fixes"): a flow page keeps
    // the enlarge arrow's gutter before every enlarged step after another,
    // printing or not, so the enlarged steps' page 1 packs with a gutter before
    // its Size step and its step waiting for a picture.
    const digests = Object.fromEntries(
      pageLayoutFixtures().flatMap(({ name, document }) =>
        printed(document).pages.map((page, index) => [
          `${name} · page ${index + 1}`,
          [digest(page.svg), digest(page.view), digest(JSON.stringify(page.arrows))].join(' '),
        ])
      )
    );
    expect(digests).toMatchInlineSnapshot(`
      {
        "a newer build’s steps and turns · page 1": "f803ef9681c5a607 f803ef9681c5a607 4f53cda18c2baa0c",
        "a newer build’s steps and turns · page 2": "85e09522e6de28d1 85e09522e6de28d1 4f53cda18c2baa0c",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 1": "e4c84b1a6a208664 beed3f60aeba0731 e9a8112a1fb80c3c",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 2": "7567279ba8e45613 c52f3443c9cecbdb 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 1": "3adc839b90b06e69 d18cb08c628e142e 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 2": "f5faf59273415481 695bf878af508a8f 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 3": "4562bcbee00c20f5 8fbbd3ad574de69a 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 1": "81216da6f2c3d926 10954478bcdf7dcd 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 2": "018335b79929e7db ddb51c3f178d5e25 4f53cda18c2baa0c",
        "flow, a last page with its own count · page 1": "6c05bc9fcdccb4df 343cb88846799ef4 4f53cda18c2baa0c",
        "flow, a last page with its own count · page 2": "fc820bcc1c980690 eb5dfddd74bb4f9a 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 1": "e8b1dca476981867 e302a897a6e66327 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 2": "372d43af6e0189e9 a25af6b03ca9a62c 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 1": "39c2a8aa1cd3ab1b c205bf1605b4f329 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 2": "2300d9f6d2bf08fe 14f01c0aaf840285 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 3": "e008cce09c3949b0 ae83ede599c4b9dc 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 4": "adfded301df7f1ce 05a9e4514c7602d5 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 5": "8a95a046f153d6ed 2873d674b446dad6 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 1": "9c3a128e37951971 95d3863f46483042 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 2": "808c33db5ef46ea1 08c187cc2e2fc8a0 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 3": "01ac4786e9350d57 cd31a506449d1835 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 1": "762034dc73a12f50 762034dc73a12f50 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 2": "8254deff8fc82487 8254deff8fc82487 4f53cda18c2baa0c",
        "grid, enlarged steps at a Size of 2 and of 6 · page 1": "c9b60bfa75923571 c9b60bfa75923571 f2a6c074db74a98c",
        "grid, two pages · page 1": "55238bffde0a38d1 55238bffde0a38d1 4f53cda18c2baa0c",
        "grid, two pages · page 2": "776e2e1611d8dbc7 776e2e1611d8dbc7 4f53cda18c2baa0c",
        "no steps · page 1": "21be575f25d70a47 21be575f25d70a47 4f53cda18c2baa0c",
      }
    `);
  });
});

/** A length in mm to a ten-thousandth: far finer than any print shows, and clear of rounding in the last bits. */
const mm = (value: number) => Math.round(value * 1e4) / 1e4;

describe('homes as the layout computes them', () => {
  it('are held to their digests: each step’s cell, number and text origin, page by page', () => {
    // Taken at the layout of `diagram-flow-pages.md`, Phase 2. A change here moves
    // where placed steps print in every diagram saved with a placement: say why
    // when updating them.
    // October 12 (`diagram-flow-packing.md`, Phase 3): a flow step's home is its
    // box on its page as packed, and held from then on in the file. Every flow
    // fixture changed (a fresh pack: none holds an arrangement); grid fixtures
    // are unchanged. No diagram with a placement had launched. Held from here:
    // `heldPages.test.ts` shows no caption or picture edit moves a home, on any
    // fixture, once its pages are packed and adopted.
    // Review fixes: the enlarged steps' page 1 keeps an arrow's gutter before
    // each enlarged step after another (a fresh pack; nothing held moved).
    const digests = Object.fromEntries(
      pageLayoutFixtures().flatMap(({ name, document }) =>
        preparedPages(document, FIXTURE_FONTS, subsetter).layout.pages.map((page, index) => [
          `${name} · page ${index + 1}`,
          digest(
            JSON.stringify(
              page.cells.map(({ stepId, cellMm, numberAt, text }) => [
                stepId,
                [cellMm.x, cellMm.y, cellMm.w, cellMm.h].map(mm),
                [numberAt.x, numberAt.y].map(mm),
                [text.x, text.firstBaseline, text.widthMm].map(mm),
              ])
            )
          ),
        ])
      )
    );
    expect(digests).toMatchInlineSnapshot(`
      {
        "a newer build’s steps and turns · page 1": "7c3808646e04671c",
        "a newer build’s steps and turns · page 2": "340f944242881549",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 1": "471f2ab8e380ca83",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 2": "f08f2a468e25e577",
        "flow from the right, across spreads, rows read upward · page 1": "4f0bca842b52a7ef",
        "flow from the right, across spreads, rows read upward · page 2": "08df522a3b034889",
        "flow from the right, across spreads, rows read upward · page 3": "906f9534fc4ba412",
        "flow landscape, an odd row count · page 1": "03088ac492d37755",
        "flow landscape, an odd row count · page 2": "aefd7a63f15d62e0",
        "flow, a last page with its own count · page 1": "84fc2444cdad79d5",
        "flow, a last page with its own count · page 2": "6983723f69ca3cb6",
        "flow, a page break and turns at a row’s end · page 1": "53ac0cd340d6fbb4",
        "flow, a page break and turns at a row’s end · page 2": "bf8f07726014930e",
        "flow, pages with their own counts · page 1": "487989829be15010",
        "flow, pages with their own counts · page 2": "aaf1d741be5f167f",
        "flow, pages with their own counts · page 3": "bb77f259e335bbbf",
        "flow, pages with their own counts · page 4": "b83705f86a33c931",
        "flow, pages with their own counts · page 5": "e7bb148b952fe126",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 1": "818f22dba22bd0b6",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 2": "93808b3c0d3a085a",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 3": "a14008e8ad11a722",
        "grid, a page break, turns and an upload · page 1": "b2981a60e29ba484",
        "grid, a page break, turns and an upload · page 2": "2866f10b51c574cb",
        "grid, enlarged steps at a Size of 2 and of 6 · page 1": "7e2d6a88628ee042",
        "grid, two pages · page 1": "40d6b4db9bf8a7e0",
        "grid, two pages · page 2": "2cf18aff84ac502b",
        "no steps · page 1": "4f53cda18c2baa0c",
      }
    `);
  });
});
