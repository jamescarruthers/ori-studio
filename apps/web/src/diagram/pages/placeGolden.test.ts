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
    // its Size step and its step waiting for a picture. A step stands in a
    // bend only with a real step after it: the last pages of "flow from the
    // right" and "seven steps a page" no longer end on a step hanging in a
    // bend before stand-ins; their last step starts the next band, the lane
    // turning at the page's edge into it (rasterised and checked by eye). A
    // turn beside a step in a bend stands midway between the two pictures and
    // moves the least way clear of every step's number, picture and caption:
    // four pages' turns move (own counts 2 and 4, seven a page 1 and 2), each
    // off a picture it stood on or against, into the gap between the two
    // boxes (rasterised and checked by eye). No home moved.
    // October 12, later (Zach): a turn prints only between two steps. The grid
    // fixture's turn after its last step is no longer drawn, so its page 2
    // changed, and only that page.
    // 2026-10-12, F2 (`diagram-flow-packing.md`, Reference size): every flow
    // step's reference scale is found in the diagram's one cell (its steps per
    // page's), never its own page's. Seven pages changed, each a page whose own
    // rows were not the default's: "flow from the right" pages 2 and 3 (page 2
    // hands over at its spine, so its rows were odd; it prints its pictures as
    // before, its empty step 7's box taller, and page 3 only its band across
    // the spread), and every page of "pages with their own counts" (counts of
    // 3, 4, 3 and 5 against the default 9: pages 1–4 print their pictures at
    // 1.4 times the 3 × 3 cell's, the packing's largest, 54 mm where they were
    // 59–63, and page 5 at 50 mm where it was 44). Rasterised and checked by
    // eye beside the pages before. Grid fixtures are unchanged.
    // 2026-10-12, later (Zach): an enlarged step's Size is drawn past its room,
    // as a size pinned by hand is. One page changed: the grid's enlarged steps
    // at a Size of 2 and of 6, whose step at 6 prints at six times its area
    // (a 85.92 mm window, drawn 49.12 × 86.10 mm) where #436 held it to its
    // room at 4.89 times (69.99 mm, 48 × 70.17), its caption pushed down under
    // it; every other step on the page, and its arrows, as they were. The flow
    // fixture's Size of 2 fits its room, so its pages are unchanged.
    // 2026-10-13 (Zach, crane steps 3→4): a bend with no step in it keeps its
    // band inside the margin, turning under its rows' end pictures in quarter
    // circles where they stand near it (`flowLane.ts`, `bendKnots`). Sixteen
    // flow pages' bands changed: every fixture page with such a bend (each of
    // them had reached into the margin); two of them also move the turn standing in that bend, with the
    // bend, in the view: "a page break and turns at a row's end" page 1 and
    // "pages with their own counts" page 4. No arrow, home or grid page moved.
    // 2026-10-13 (Zach): a caption stands 3 mm under its picture, 2 before
    // (`CAPTION_TOP_MM`). Every flow fixture page changed: none holds an
    // arrangement, so each is packed afresh with its captioned boxes a
    // millimetre taller (`pack-6`). A page held as saved keeps its boxes and
    // its pictures, only its captions lower (`savedPagesHold.test.ts`). Grid
    // fixtures are unchanged: a grid's caption keeps its 5 mm baseline.
    // 2026-10-14 (Zach, "(b4)" of the crane's turns): the lane is one curve,
    // its curvature continuous, through every picture's centre and each turn's
    // middle; a turn the margin keeps from a round loop stands on it, a row
    // bowing over its next-to-last picture the least that keeps the turn no
    // tighter than 22 mm (`flowLane.ts`). Every flow fixture page's print
    // changed, by its band alone (19 pages); in the view, the two whose turn
    // glyph stands at a turn's middle on the band: "a page break and turns at a
    // row's end" page 1 and "pages with their own counts" page 4. Rasterised
    // and checked by eye beside the pages before, steps in a bend turning round.
    // No arrow, home or grid page moved.
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
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 1": "d5eb3cf15437ce68 2939b687d7986145 f6e2e7dc17088d6f",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 2": "c3592e9491d659df c8696d64f3dd5493 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 1": "63a83072a2856603 735e27f957589a1c 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 2": "7159ce5f30819639 21eaeb22715f64fb 4f53cda18c2baa0c",
        "flow from the right, across spreads, rows read upward · page 3": "15590ca0671813d8 c88060e4dbd69b3c 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 1": "a8ad8df361d5876e 05d154eb8dcf93c0 4f53cda18c2baa0c",
        "flow landscape, an odd row count · page 2": "9679169c2abece9e 0a02ef3ffa917b4d 4f53cda18c2baa0c",
        "flow, a last page with its own count · page 1": "3d0fe575c6195751 5b03f172720324b5 4f53cda18c2baa0c",
        "flow, a last page with its own count · page 2": "ca994bd90f8f849d 5854185bdfa9add3 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 1": "b710f3c611df80d5 ba2bf05a3dfa020d 4f53cda18c2baa0c",
        "flow, a page break and turns at a row’s end · page 2": "40edbd3634eae8a2 fb36e658d1536d3c 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 1": "e303ccc05f6360b3 f17e9a1958a29985 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 2": "c2cb7607904ead88 4e4fd4071b1aa2fa 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 3": "66e55123c460376f 26ab07bbd85aac2d 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 4": "8c9f5a4c32b91ee5 2744d43ed34a380e 4f53cda18c2baa0c",
        "flow, pages with their own counts · page 5": "cadda7089288a13f 550b8d887bc9495a 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 1": "335addb276f5b9ff cb89a60292eff4b1 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 2": "c2e70c37327dd16b 358f31048f7150fc 4f53cda18c2baa0c",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 3": "40ce67984aa58191 b70efde19e4f1870 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 1": "762034dc73a12f50 762034dc73a12f50 4f53cda18c2baa0c",
        "grid, a page break, turns and an upload · page 2": "09fc08ba3982c9d1 09fc08ba3982c9d1 4f53cda18c2baa0c",
        "grid, enlarged steps at a Size of 2 and of 6 · page 1": "bd28d9cef4eb23d5 bd28d9cef4eb23d5 f2a6c074db74a98c",
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
    // each enlarged step after another, and two short last pages put no step
    // in a bend before stand-ins (fresh packs; nothing held moved).
    // 2026-10-12, F2: each flow step's reference scale from the diagram's one
    // cell. The seven pages whose own rows were not the default's moved (fresh
    // packs under `pack-3`; a page stored by `pack-2` is packed afresh, its
    // placed frames sent home): "flow from the right" pages 2 and 3, and
    // every page of "pages with their own counts".
    // 2026-10-12, later (Zach): an enlarged step's Size drawn past its room.
    // The grid's enlarged steps at 2 and 6: step-zoom-6's caption starts
    // under its picture at six times its area (first baseline 206.77 mm, was
    // 190.83); its cell, its number and every other step's home as they were.
    // 2026-10-13 (Zach): a caption 3 mm under its picture, 2 before. Every flow
    // fixture page moved (fresh packs under `pack-6`, boxes with a caption a
    // millimetre taller); a page held as saved keeps every box and picture,
    // and its captions, which are a look, stand a millimetre lower — placed ones
    // with them, keeping their offsets (`savedPagesHold.test.ts`). Grid homes
    // as they were.
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
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 1": "0d2f7c479a4f937b",
        "enlarged steps: a Fill run, a Size, and one waiting for its picture · page 2": "0c84143ec6152281",
        "flow from the right, across spreads, rows read upward · page 1": "6c3a65bec9f9b2e3",
        "flow from the right, across spreads, rows read upward · page 2": "93c3f0bf3e5e3d09",
        "flow from the right, across spreads, rows read upward · page 3": "260bedafce0ba124",
        "flow landscape, an odd row count · page 1": "d7f5c42f7a49b29d",
        "flow landscape, an odd row count · page 2": "981e648014d2e842",
        "flow, a last page with its own count · page 1": "71ec8e4706824ae9",
        "flow, a last page with its own count · page 2": "5a840e65d4c839a1",
        "flow, a page break and turns at a row’s end · page 1": "79c46295f327baa4",
        "flow, a page break and turns at a row’s end · page 2": "ec0a3c6732d1f772",
        "flow, pages with their own counts · page 1": "5affa91cc6485686",
        "flow, pages with their own counts · page 2": "68798a6518fc5008",
        "flow, pages with their own counts · page 3": "46198d28010b17d2",
        "flow, pages with their own counts · page 4": "c0ccf16c865ee743",
        "flow, pages with their own counts · page 5": "f4f1e39875630a38",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 1": "d7a17bda8368d2b4",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 2": "eb2be4592bda2c57",
        "flow, seven steps a page: short last rows, across a spread and a page turn · page 3": "9df2e35b523086d7",
        "grid, a page break, turns and an upload · page 1": "b2981a60e29ba484",
        "grid, a page break, turns and an upload · page 2": "2866f10b51c574cb",
        "grid, enlarged steps at a Size of 2 and of 6 · page 1": "bcebae4d18202957",
        "grid, two pages · page 1": "40d6b4db9bf8a7e0",
        "grid, two pages · page 2": "2cf18aff84ac502b",
        "no steps · page 1": "4f53cda18c2baa0c",
      }
    `);
  });
});
