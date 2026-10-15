import { beforeAll, describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  type DiagramDocument,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS, fixtureSubsetter } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import { diagramLayoutSteps, preparedPages } from './diagramPages';
import { layoutDiagramPages } from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { laneFollowsPlacement, markOutsideMargin, outsideMarginSteps, pageOffset, partBox, translateCell } from './pagePlacement';
import { previewPlacement } from './placementPreview';

let subsetter: FontSubsetter;
beforeAll(async () => {
  subsetter = await fixtureSubsetter();
});
function document(place?: DiagramStepPlace): DiagramDocument {
  return setPageSetup(
    insertSteps(
      createDiagram({ title: 'Packing test' }),
      Array.from({ length: 4 }, (_, i) => ({
        ...cpStep(`s${i}`),
        text: `Instruction ${i + 1}`,
        ...(i === 1 && place ? { place } : {}),
      })),
      0,
    ),
    { layout: 'grid', columns: 2, rows: 2 },
  );
}
const prepare = (doc: DiagramDocument) => preparedPages(doc, FIXTURE_FONTS, subsetter);

describe('printed manual placement', () => {
  it('honors a size pin past the room, leaves neighbors unchanged, and retains automatic values', () => {
    const normal = prepare(document());
    const placed = prepare(document({ scale: { mmPerUnit: 130 } }));
    const a = normal.layout.pages[0]!.cells,
      b = placed.layout.pages[0]!.cells;
    expect(b[1]!.mmPerUnit).toBe(130);
    expect(b[1]!.placed?.auto.mmPerUnit).toBeCloseTo(a[1]!.mmPerUnit!, 8);
    for (const i of [0, 2, 3]) {
      expect(b[i]!.mmPerUnit).toBe(a[i]!.mmPerUnit);
      expect(b[i]!.drawMm).toEqual(a[i]!.drawMm);
    }
    expect(b[1]!.drawMm.h).toBeGreaterThan(a[1]!.drawMm.h);
    expect(b[1]!.text.firstBaseline).toBeGreaterThan(a[1]!.text.firstBaseline);
    // Drawn past its room and the margin: said as outside the margin.
    expect(b[1]!.outsideMargin).toBe(true);
  });
  it('keeps a pin of the other picture kind sleeping', () => {
    const auto = prepare(document()).layout.pages[0]!.cells[1]!;
    const cell = prepare(document({ scale: { frameMm: 80 } })).layout.pages[0]!.cells[1]!;
    expect(cell.mmPerUnit).toBe(auto.mmPerUnit);
    expect(cell.drawMm).toEqual(auto.drawMm);
    expect(cell.placed?.pin).toBe('kind');
  });
  it('moves a frame with all its parts, and a part independently in page axes', () => {
    const auto = prepare(document()).layout.pages[0]!.cells[1]!;
    const cell = prepare(document({ frame: [3, 4], text: [-2, 5] })).layout.pages[0]!.cells[1]!;
    expect(cell.numberAt.x).toBeCloseTo(auto.numberAt.x + 3);
    expect(cell.drawMm.y).toBeCloseTo(auto.drawMm.y + 4);
    expect(cell.text.x).toBeCloseTo(auto.text.x + 1);
    expect(cell.text.firstBaseline).toBeCloseTo(auto.text.firstBaseline + 9);
    expect(pageOffset({ frame: [3, 4] }, 'frame', true)).toEqual([-3, 4]);
    expect(pageOffset({ text: [3, 4] }, 'text', true)).toEqual([3, 4]);
  });
  it('composes only or omits a selected part without changing the ordinary page', () => {
    const pages = prepare(document());
    const normal = pages.compose(0).svg;
    const only = pages.compose(0, { only: { stepId: 's1', part: 'text' } }).svg;
    const omit = pages.compose(0, { omit: { stepId: 's1', part: 'text' } }).svg;
    expect(only).toContain('Instruction 2');
    expect(only).not.toContain('Instruction 1');
    expect(omit).not.toContain('Instruction 2');
    expect(omit).toContain('Instruction 1');
    expect(pages.compose(0).svg).toBe(normal);
  });
  it('draws a part’s home where it sits in its moved frame, and the frame’s where the layout puts the step', () => {
    const auto = prepare(document()).layout.pages[0]!.cells[1]!;
    const cell = prepare(document({ frame: [10, 5], picture: [3, -2] })).layout.pages[0]!.cells[1]!;
    const shifted = (box: ReturnType<typeof partBox>, dx: number, dy: number) => ({ ...box, x: box.x + dx, y: box.y + dy });
    expect(cell.homeParts?.frame).toEqual(partBox(auto, 'frame'));
    for (const part of ['number', 'picture', 'text'] as const) {
      const home = cell.homeParts![part];
      expect(home.x).toBeCloseTo(partBox(auto, part).x + 10);
      expect(home.y).toBeCloseTo(partBox(auto, part).y + 5);
    }
    // The picture prints its own offset from that home; the others print at it.
    const picture = partBox(cell, 'picture');
    expect(picture.x).toBeCloseTo(shifted(cell.homeParts!.picture, 3, -2).x);
    expect(picture.y).toBeCloseTo(shifted(cell.homeParts!.picture, 3, -2).y);
    expect(partBox(cell, 'number')).toEqual(cell.homeParts!.number);
  });
  it('previews a move and top-centred resize without mutating the saved layout', () => {
    const pages = prepare(document());
    const original = pages.layout.pages[0]!.cells[1]!;
    const moved = previewPlacement(pages.layout, 's1', 'picture', 7, -2);
    expect(partBox(moved.pages[0]!.cells[1]!, 'picture').x).toBeCloseTo(partBox(original, 'picture').x + 7);
    const resized = previewPlacement(pages.layout, 's1', 'picture', 0, 0, 1.5).pages[0]!.cells[1]!;
    expect(partBox(resized, 'picture').y).toBe(partBox(original, 'picture').y);
    expect(resized.text.firstBaseline - original.text.firstBaseline).toBeCloseTo(partBox(original, 'picture').h * 0.5);
    expect(pages.layout.pages[0]!.cells[1]).toBe(original);
  });
});

it('keeps the ribbon over moved pictures and keeps both sides of the spine level', () => {
  const doc = setPageSetup(
    insertSteps(
      createDiagram(),
      Array.from({ length: 14 }, (_, i) => cpStep(`s${i}`)),
      0,
    ),
    { layout: 'flow', stepsPerPage: 7 },
  );
  const base = prepare(doc).layout;
  const cell = base.pages[0]!.cells.at(-1)!;
  const moved = previewPlacement(base, cell.stepId, 'frame', -9, -7);
  const left = moved.pages[0]!,
    right = moved.pages[1]!;
  const centre = { x: cell.drawMm.x + cell.drawMm.w / 2 - 9, y: cell.drawMm.y + cell.drawMm.h / 2 - 7 };
  expect(left.band!.curves.some((c) => Math.hypot(c.to.x - centre.x, c.to.y - centre.y) <= base.bandWidthMm / 4 + 1e-8)).toBe(true);
  expect(left.flow!.handoverOut).toBe(right.flow!.handoverIn);
  expect(left.band!.curves.at(-1)!.to.y).toBe(right.band!.from.y);
});

it('draws the lane again as a step is dragged only on its page and the pages its lane meets over the spine and the page turn', () => {
  const doc = setPageSetup(
    insertSteps(
      createDiagram(),
      Array.from({ length: 28 }, (_, i) => cpStep(`s${i}`)),
      0,
    ),
    { layout: 'flow', stepsPerPage: 7 },
  );
  const base = prepare(doc).layout;
  // Pages 1–2 and 3–4 are spreads, a page turn between them: a step on page 3 moves the lane on pages 2, 3 and 4 only.
  expect(base.pages.map((page) => page.side)).toEqual(['left', 'right', 'left', 'right']);
  const moved = previewPlacement(base, base.pages[2]!.cells[3]!.stepId, 'picture', -6, 4);
  expect(moved.pages[0]!.band).toBe(base.pages[0]!.band);
  // Page 2 meets page 3's lane over the page turn at its first step, which did not move: drawn again, as it was.
  expect(moved.pages[1]!.band).toEqual(base.pages[1]!.band);
  expect(moved.pages[2]!.band).not.toEqual(base.pages[2]!.band);
  expect(moved.pages[3]!.band).not.toBe(base.pages[3]!.band);
  expect(moved.pages[2]!.flow!.handoverOut).toBe(moved.pages[3]!.flow!.handoverIn);
  // Page 3's first step moved: the lane leaves page 2 at the height it now comes into page 3 at.
  const first = previewPlacement(base, base.pages[2]!.cells[0]!.stepId, 'picture', 0, 6);
  expect(first.pages[0]!.band).toBe(base.pages[0]!.band);
  expect(first.pages[1]!.flow!.handoverOut).toBeCloseTo(base.pages[1]!.flow!.handoverOut! + 3, 9);
  expect(first.pages[1]!.flow!.handoverOut).toBe(first.pages[2]!.flow!.handoverIn);
  expect(first.pages[1]!.band!.curves.at(-1)!.to.y).toBe(first.pages[2]!.band!.from.y);
});

it('follows a step with the lane only where its picture was moved or resized, never for its number or its caption alone', () => {
  const placed = (offsets: DiagramStepPlace) => ({ placed: { offsets, pin: null, auto: { mmPerUnit: null, frameMm: null, drawMm: { x: 0, y: 0, w: 1, h: 1 } } } });
  expect(laneFollowsPlacement({})).toBe(false);
  for (const offsets of [{ number: [2, 0] }, { text: [0, 3] }, { textWidth: 60 }, { text: [-4, 0], textWidth: 60 }] as DiagramStepPlace[])
    expect(laneFollowsPlacement(placed(offsets)), JSON.stringify(offsets)).toBe(false);
  for (const offsets of [{ frame: [2, 0] }, { picture: [0, 3] }, { scale: { mmPerUnit: 0.3 } }, { text: [1, 0], picture: [1, 1] }] as DiagramStepPlace[])
    expect(laneFollowsPlacement(placed(offsets)), JSON.stringify(offsets)).toBe(true);
  // On a flow page: the band as it ran, a caption moved and resized and a number moved; not so a picture moved.
  const flow = (place?: DiagramStepPlace) =>
    setPageSetup(
      insertSteps(createDiagram(), Array.from({ length: 7 }, (_, i) => ({ ...cpStep(`s${i}`), text: 'Fold the corner up to the top.', ...(i === 3 && place ? { place } : {}) })), 0),
      { layout: 'flow', stepsPerPage: 7 },
    );
  // The page held as first packed: a caption's pin would otherwise be packed for.
  const untitled = { title: '', byline: '' };
  const held = layoutDiagramPages(diagramLayoutSteps(flow()), flow().page, untitled, estimateTextSetter).packed!;
  const band = (place?: DiagramStepPlace) => layoutDiagramPages(diagramLayoutSteps(flow(place)), flow().page, untitled, estimateTextSetter, held).pages[0]!.band;
  expect(band({ text: [-6, 2], textWidth: 64, number: [1, 0] })).toEqual(band());
  expect(band({ picture: [0, 6] })).not.toEqual(band());
});

it('returns to the identical printed page when a pin and offsets are cleared', () => {
  const doc = document({ scale: { mmPerUnit: 80 }, frame: [3, 4], text: [4, -2] });
  const cleared = { ...doc, steps: doc.steps.map((step) => ({ ...step, place: undefined })) };
  expect(prepare(cleared).compose(0).svg).toBe(prepare(document()).compose(0).svg);
});

describe('what is said of a placement (Zach, 2026-10-12)', () => {
  /** Step `s1` with its frame moved `frame` mm, as laid out; every other step as the layout puts it. */
  const placedAt = (frame: [number, number]) => prepare(document({ frame })).layout.pages[0]!.cells;
  const paper = () => prepare(document()).layout.paper;

  it('says a part past the margin, and a part past the paper’s edge, as outside the margin', () => {
    const { marginMm, widthMm } = paper();
    const home = partBox(prepare(document()).layout.pages[0]!.cells[1]!, 'frame');
    // Nudged inside the margin: nothing to say.
    expect(placedAt([1, 0])[1]!.outsideMargin).toBeUndefined();
    // Its right edge past the margin, still on the paper.
    const pastMargin = widthMm - marginMm - (home.x + home.w) + 1;
    expect(pastMargin + home.x + home.w).toBeLessThan(widthMm);
    expect(placedAt([pastMargin, 0])[1]!.outsideMargin).toBe(true);
    // Past the paper's edge, where it may be clipped out of sight: the same notice.
    expect(placedAt([widthMm, 0])[1]!.outsideMargin).toBe(true);
    // The steps nobody moved stay inside the margin, and nothing is said of them.
    for (const i of [0, 2, 3]) expect(placedAt([widthMm, 0])[i]!.outsideMargin).toBeUndefined();
  });

  it('says it of a step nobody placed whose picture reaches past the margin: a held page keeps the box, not the picture', () => {
    const layout = prepare(document()).layout;
    const { widthMm } = layout.paper;
    const cells = layout.pages[0]!.cells;
    expect(cells[0]!.placed).toBeUndefined();
    // As a new pose might carry it: the picture past the paper's left edge, its step never moved.
    cells[0] = translateCell(cells[0]!, 'picture', -widthMm / 2, 0);
    markOutsideMargin(layout);
    expect(cells[0]!.outsideMargin).toBe(true);
    expect(outsideMarginSteps(layout)).toEqual([cells[0]!.number]);
  });

  it('says nothing of a step placed over another step, over a symbol or the title, or where the path bends round it', () => {
    const cells = prepare(document()).layout.pages[0]!.cells;
    const [left, right] = cells;
    // Step 2's frame laid exactly over step 1's: a plain overlap, inside the margin.
    const onto = placedAt([partBox(left!, 'frame').x - partBox(right!, 'frame').x, 0]);
    expect(partBox(onto[1]!, 'frame').x).toBeCloseTo(partBox(left!, 'frame').x);
    expect(onto[1]!.outsideMargin).toBeUndefined();
    // Nothing else is carried on a cell to be said: no clash of any other kind.
    for (const cell of onto) expect(Object.keys(cell)).not.toContain('clashes');
  });

  it('says it as the drag goes, and lets it go when the part comes back inside the margin', () => {
    const base = prepare(document()).layout;
    const { widthMm } = base.paper;
    const out = previewPlacement(base, 's1', 'picture', widthMm, 0).pages[0]!.cells[1]!;
    expect(out.outsideMargin).toBe(true);
    // Dragged onto its neighbour instead: an overlap, which the page shows as it is.
    const [left, right] = base.pages[0]!.cells;
    const over = previewPlacement(base, 's1', 'frame', left!.cellMm.x - right!.cellMm.x, 0).pages[0]!.cells[1]!;
    expect(over.outsideMargin).toBeUndefined();
    // A step past the margin as laid out, brought back by the drag, is clear again.
    const placedOut = prepare(document({ frame: [widthMm, 0] })).layout;
    expect(placedOut.pages[0]!.cells[1]!.outsideMargin).toBe(true);
    expect(previewPlacement(placedOut, 's1', 'frame', -widthMm, 0).pages[0]!.cells[1]!.outsideMargin).toBeUndefined();
    expect(placedOut.pages[0]!.cells[1]!.outsideMargin).toBe(true);
  });
});
