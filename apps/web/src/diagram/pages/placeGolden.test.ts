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

// Each fixture lays out and composes every page twice, including cold packing.
describe('pages with nothing placed', { timeout: 30_000 }, () => {
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

describe('pages as they printed before placement came', { timeout: 30_000 }, () => {
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
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 1": "ddde44f59718b2f8 9a4b83507bf9b3eb 5deb1d72903a8140",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 2": "cdd02e710739fe5d b07ba08a2ed20746 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 1": "1e864dbdb5e62da1 eecf6f078c6c1053 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 2": "8c620804a953406a cbc142eb207a0dfd 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 3": "221fb7ab386cf66a 7940d009824549e8 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 1": "71bafd86447ae5f5 3d1521ca0373cddb 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 2": "0338420173521e76 029c0a1102d3fb16 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 1": "e8c62bac84b09622 a0415b1b7cf55a61 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 2": "b8e643c03b3cdb71 14fb417aa7d3eeb1 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 1": "6e9dc39327de01c5 8c7e0a491c3f8e3f 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 2": "70b2afd5a8c0e069 d166c165bad76d2d 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 3": "1eff2a19ab8e7be7 d07799e499d00e12 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 1": "762034dc73a12f50 762034dc73a12f50 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 2": "8254deff8fc82487 8254deff8fc82487 4f53cda18c2baa0c",
        "grid, two pages · page 1": "55238bffde0a38d1 55238bffde0a38d1 4f53cda18c2baa0c",
        "grid, two pages · page 2": "776e2e1611d8dbc7 776e2e1611d8dbc7 4f53cda18c2baa0c",
        "no steps · page 1": "21be575f25d70a47 21be575f25d70a47 4f53cda18c2baa0c",
      }
    `);
  });
});
