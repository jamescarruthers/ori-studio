import { describe, expect, it, vi } from 'vitest';
import {
  createDiagram,
  insertSteps,
  isLockedStep,
  setPageSetup,
  stepsOf,
  type DiagramDocument,
  type DiagramStep,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { largestHeld, layoutDiagram, leastOverrunHeld, MEASURE_SETTLED, OVERRUN_SAME_MM, type RoomMeasure } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { packFlowPage } from './flowPacking';
import { pageLayoutFixtures } from './pageLayouts.fixtures';
import { adoptPageArrangements } from './pageArrangements';
import { layoutPicture } from './pagePictures';
import { paginate } from './pagePlan';

// Every measure counted, each as it was.
vi.mock('./pagePictures', async (original) => {
  const actual = await original<typeof import('./pagePictures')>();
  return { ...actual, layoutPicture: vi.fn(actual.layoutPicture) };
});

// And every page packed.
vi.mock('./flowPacking', async (original) => {
  const actual = await original<typeof import('./flowPacking')>();
  return { ...actual, packFlowPage: vi.fn(actual.packFlowPage) };
});

/** A picture's fit as measured at a scale, and every scale it was measured at. */
function measured(fit: (scale: number) => number) {
  const scales: number[] = [];
  return {
    scales,
    fitAt: (scale: number | null) => {
      const at = scale ?? 1;
      scales.push(at);
      return fit(at);
    },
  };
}

describe('largestHeld', () => {
  it('takes a reach of straight pieces at its own fit, in a step or two', () => {
    // Measured anywhere, the fit read is the same: the reach is one line.
    const straight = measured(() => 4.2);
    expect(largestHeld(straight.fitAt)).toBe(4.2);
    expect(straight.scales.length).toBeLessThanOrEqual(3);
    // A reach that curves: each measure's line lands nearer, as Newton's method does.
    const curved = measured((scale) => 3 + 0.2 * Math.sqrt(scale));
    const found = largestHeld(curved.fitAt)!;
    expect(Math.abs(3 + 0.2 * Math.sqrt(found) - found)).toBeLessThan(MEASURE_SETTLED * found);
    expect(curved.scales.length).toBeLessThan(8);
  });

  it('finds where a reach that hides the paper starts to grow, which no scale is its own fit at (third review)', () => {
    // Below 6.6 the reach is flat and fits the room's 10.2; above it, it grows and fits 5.38.
    const knee = measured((scale) => (scale < 6.6 ? 10.2 : 5.38));
    const found = largestHeld(knee.fitAt)!;
    expect(found).toBeLessThan(6.6);
    expect(found).toBeGreaterThan(6.6 * (1 - 2 * MEASURE_SETTLED));
    expect(knee.scales.length).toBeLessThan(40);
  });

  it('returns only a scale found to hold, below one found not to when given', () => {
    // Holding only in patches: whatever it returns, it held there.
    const patchy = (scale: number) => (Math.floor(scale * 3) % 2 === 0 ? 10 : 0.1);
    const found = largestHeld(measured(patchy).fitAt)!;
    expect(patchy(found)).toBeGreaterThanOrEqual(found * (1 - MEASURE_SETTLED));
    // Given a scale it does not hold at, it looks below it.
    const below = largestHeld(measured(() => 4.2).fitAt, 3)!;
    expect(below).toBeLessThan(3);
    expect(below).toBeGreaterThan(3 * (1 - 2 * MEASURE_SETTLED));
    // Holding nowhere: the fit read at the smallest scale tried, never more.
    const nowhere = largestHeld(measured((scale) => scale / 2).fitAt)!;
    expect(nowhere).toBeLessThan(1e-6);
    expect(largestHeld(() => null)).toBeNull();
  });
});

describe('leastOverrunHeld', () => {
  /** A picture as measured at each scale, and every scale it was measured at; a card's measure is the one at `card`. */
  function room(measure: (scale: number) => RoomMeasure, card: number) {
    const scales: number[] = [];
    return {
      scales,
      measureAt: (scale: number | null) => {
        scales.push(scale ?? card);
        return measure(scale ?? card);
      },
    };
  }

  it('takes the largest scale that holds, where its marks hang out of nothing, measuring nothing more', () => {
    const fits = room(() => ({ fit: 4.2, overrun: 0, floor: 2 }), 4.2);
    expect(leastOverrunHeld(fits.measureAt)).toBe(4.2);
    const held = room(() => ({ fit: 4.2, overrun: 0, floor: 2 }), 4.2);
    largestHeld((scale) => held.measureAt(scale)!.fit);
    // The one measure more: how far it hangs out there.
    expect(fits.scales.length).toBe(held.scales.length + 1);
  });

  it('takes a smaller scale whose marks hang out less, where a mark shrinks with the paper (review 4)', () => {
    // The crane's step bd19b22a at a 12 pt pen in a B5 4×4 cell: it holds up to 0.0292 with nothing hanging
    // out, and again near 0.0417 with 1.1 mm out, which a measure there alone takes for the least.
    const bd19 = room((scale) => {
      const overrun = scale <= 0.0292 ? 0 : scale < 0.0355 ? (1.13 * (scale - 0.0292)) / 0.0063 : 1.13 - (0.04 * (scale - 0.0355)) / 0.0062;
      const fit = scale <= 0.0292 ? 0.0292 : scale < 0.0397 ? 0.0292 + 0.5 * (scale - 0.0292) : 0.0417;
      return { fit, overrun: Math.max(0, overrun), floor: 0.0225 };
    }, 0.0417);
    // Measured where it holds, a scale alone says nothing of the region below.
    expect(largestHeld((scale) => bd19.measureAt(scale)!.fit)).toBeCloseTo(0.0417, 6);
    const found = leastOverrunHeld(bd19.measureAt)!;
    // The top of the lower region: it holds there, hanging out as little as the least.
    const there = bd19.measureAt(found)!;
    expect(found).toBeGreaterThan(0.0292 * (1 - 1e-3));
    expect(found).toBeLessThan(0.0292 * (1 + 1e-3));
    expect(there.fit!).toBeGreaterThanOrEqual(found * (1 - MEASURE_SETTLED));
    expect(there.overrun).toBeLessThanOrEqual(OVERRUN_SAME_MM);
    expect(bd19.scales.length).toBeLessThan(40);
  });

  it('keeps the largest scale where its marks hang out as far at every scale down to its floor', () => {
    // Letters larger than the room: shrinking the paper takes nothing of them out of it.
    const letters = room((scale) => ({ fit: 0.0146, overrun: 1.4, floor: scale * 0 + 0.008 }), 0.0146);
    expect(leastOverrunHeld(letters.measureAt)).toBe(0.0146);
  });

  it('takes the largest scale that hangs out no more than the least, where its marks shrink toward the floor', () => {
    // Its heads capped by their arcs: they reach out of the room less the smaller the paper, out of it not at all under 0.02.
    const heads = room((scale) => ({ fit: 0.04, overrun: Math.max(0, 30 * (scale - 0.02)), floor: 0.015 }), 0.04);
    const found = leastOverrunHeld(heads.measureAt)!;
    expect(30 * (found - 0.02)).toBeLessThanOrEqual(OVERRUN_SAME_MM + 1e-9);
    expect(30 * (found - 0.02)).toBeGreaterThan(OVERRUN_SAME_MM * 0.99);
    // Below a scale given, it looks below it only.
    expect(leastOverrunHeld(heads.measureAt, 0.018)).toBeLessThan(0.018);
  });
});

describe('layoutDiagram', () => {
  it('draws a picture that holds its room but hangs out of it alone, smaller, where it hangs out less (review 4)', async () => {
    const actual = await vi.importActual<typeof import('./pagePictures')>('./pagePictures');
    const step: DiagramStep = {
      ...cpStep('step-x'),
      annotations: [{ id: 'a', kind: 'valley-line', from: [0.2, 0.5], to: [0.8, 0.5] }],
    };
    // A grid's cell: a flow step's box is packed round its picture and its marks, which never hang out of it.
    const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), [step], 0), { layout: 'grid' });
    const line = (grows: number, beyond: number) => ({ grows, beyond });
    /** A unit-square paper picture, its marks `beyond` mm past each side across, shrinking as the paper grows. */
    const square = (beyond: number) => ({
      kind: 'paper' as const,
      width: 1 - (beyond > 0 ? 1 : 0),
      height: 1,
      frame: { width: 1, height: 1 },
      marks: { width: 2 * beyond, height: 0 },
      sides: { left: line(beyond > 0 ? -0.5 : 0, beyond), right: line(beyond > 0 ? -0.5 : 0, beyond), top: line(0, 0), bottom: line(0, 0) },
    });
    let marks = (_scale: number | null) => 0;
    vi.mocked(layoutPicture).mockImplementation((entry, assets, style, measure) =>
      entry.id === 'step-x' ? square(marks(measure && 'mmPerUnit' in measure ? measure.mmPerUnit : null)) : actual.layoutPicture(entry, assets, style, measure)
    );
    try {
      const plain = layoutDiagram(document, estimateTextSetter).pages[0]!.cells[0]!;
      const { w, h } = plain.drawMm;
      const room = Math.min(w, h);
      // From 0.7 of the room up, marks that hang 2 mm out of either side whatever the paper's size — the
      // reach of a glyph larger than the paper — and none below it, as an arrowhead capped by its arc.
      const below = 0.7 * room;
      marks = (scale) => (scale === null || scale >= below ? w / 2 + 2 : 0);
      const cell = layoutDiagram(document, estimateTextSetter).pages[0]!.cells[0]!;
      expect(cell.mmPerUnit!).toBeLessThan(below);
      expect(cell.mmPerUnit!).toBeGreaterThan(below * 0.99);
    } finally {
      vi.mocked(layoutPicture).mockImplementation(actual.layoutPicture);
    }
  });

  it('measures each picture once at each scale, however often its search, the layouts and their check ask (review 4)', () => {
    // Pictures whose marks reach past them, so each is searched for in its rooms and checked where drawn.
    const steps: DiagramStep[] = [0, 1, 2, 3].map((index) => ({
      ...cpStep(`step-${index}`),
      annotations: [{ id: 'a', kind: 'valley-arrow', from: [0.2, 0.004 + 0.1 * index], to: [0.8, 0.004], bend: 0.05 }],
    }));
    const document = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), steps, 0);
    vi.mocked(layoutPicture).mockClear();
    layoutDiagram(document, estimateTextSetter);
    const measures = vi.mocked(layoutPicture).mock.calls.map(([step, , , measure]) => `${step.id} ${JSON.stringify(measure)}`);
    expect(measures.length).toBeGreaterThan(steps.length);
    expect(new Set(measures).size).toBe(measures.length);
  });

  it('packs each flow page once, however often it measures, and lays out the same with that packing adopted', () => {
    // Pictures whose marks reach past them, so the pages are measured again at the scales they print at.
    const steps: DiagramStep[] = Array.from({ length: 12 }, (_, index) => ({
      ...cpStep(`step-${index}`),
      annotations: [{ id: 'a', kind: 'valley-arrow', from: [0.2, 0.004 + 0.05 * (index % 4)], to: [0.8, 0.004], bend: 0.05 }],
      text: index % 3 === 0 ? 'Fold the corner up to the top edge, crease firmly, and unfold.' : 'Fold in half.',
    }));
    const document = insertSteps(createDiagram({ title: 'Crane', hanStyle: 'sc' }), steps, 0);
    vi.mocked(packFlowPage).mockClear();
    const first = layoutDiagram(document, estimateTextSetter);
    expect(first.pages).toHaveLength(2);
    expect(vi.mocked(packFlowPage)).toHaveBeenCalledTimes(2);
    expect(Object.keys(first.packed!)).toEqual(['step-0', 'step-9']);
    expect(first.pages.map((page) => page.packing!.packed)).toEqual([true, true]);
    // Adopted, as the store does: every page held, nothing packed, and the pages as they were.
    vi.mocked(packFlowPage).mockClear();
    const held = layoutDiagram(adoptPageArrangements(document, first.packed!), estimateTextSetter);
    expect(vi.mocked(packFlowPage)).not.toHaveBeenCalled();
    expect(held.packed).toBeUndefined();
    expect(held.pages.map((page) => page.packing!.packed)).toEqual([false, false]);
    expect(held.pages.map((page) => [page.cells, page.band, page.turns])).toEqual(first.pages.map((page) => [page.cells, page.band, page.turns]));
  });

  const fixture = (name: string) => pageLayoutFixtures().find((each) => each.name === name)!.document;

  it('paginates a document by the counts its steps keep, and packs each page for what it is laid out for (`diagram-flow-pages.md`)', () => {
    // Step 4 starts a page of four and step 11 one of five; the rest fill 9 a page.
    const document = fixture('flow, pages with their own counts');
    const layout = layoutDiagram(document, estimateTextSetter);
    const steps = stepsOf(document);
    const plan = paginate(steps, document.page);
    expect(layout.pages.map((page) => page.cells.map((cell) => cell.stepId))).toEqual(
      plan.map((page) => page.steps.map((index) => steps[index]!.id))
    );
    expect(layout.pages.map((page) => page.cells.length)).toEqual([3, 4, 3, 5, 5]);
    expect(plan.map((page) => page.ownCount)).toEqual([false, true, false, true, false]);
    layout.pages.forEach((page, index) => {
      // Packed afresh, in bands in reading order, every box on the page.
      expect(page.packing, `page ${index + 1}`).toMatchObject({ packed: true, fits: true });
      const bands = page.cells.map((cell) => cell.band!);
      expect(bands, `page ${index + 1}`).toEqual([...bands].sort((a, b) => a - b));
    });
    expect(Object.keys(layout.packed!)).toEqual(layout.pages.map((page) => page.cells[0]!.stepId));
    // The last page, automatic, is laid out for 9.
    expect(plan.at(-1)!.layoutCount).toBe(9);
    // A grid keeps the counts and does not read them: three pages of 3 × 3, the counts still on their steps.
    const grid = setPageSetup(document, { layout: 'grid', columns: 3, rows: 3 });
    expect(layoutDiagram(grid, estimateTextSetter).pages.map((page) => page.cells.length)).toEqual([9, 9, 2]);
    expect(stepsOf(grid).map((step) => step.pageSteps).filter((count) => count !== undefined)).toEqual([4, 5]);
  });

  it('moves no other step’s home when a caption grows by lines: its cell, its number, its text’s origin', () => {
    const long = 'Fold the bottom edge up to the top edge, crease firmly, unfold, then fold both sides in to meet the centre line. '.repeat(3);
    const homes = (document: DiagramDocument) =>
      new Map(
        layoutDiagram(document, estimateTextSetter).pages.flatMap((page) =>
          page.cells.map(
            (cell) => [cell.stepId, { cell: cell.cellMm, number: cell.numberAt, text: cell.text, draw: cell.drawMm, scale: cell.mmPerUnit ?? cell.frameMm }] as const
          )
        )
      );
    let edits = 0;
    let rescaled = 0;
    for (const fixture of pageLayoutFixtures()) {
      const { name } = fixture;
      // A flow page packed once, and its arrangement adopted, as the store does: then held (`diagram-flow-packing.md`).
      const document = adoptPageArrangements(fixture.document, layoutDiagram(fixture.document, estimateTextSetter).packed ?? {});
      const steps = stepsOf(document).filter((step) => !isLockedStep(step));
      if (steps.length === 0) continue;
      const before = homes(document);
      // The first, a middle and the last step.
      for (const edited of new Set([steps[0]!, steps[Math.floor(steps.length / 2)]!, steps.at(-1)!])) {
        const longer = { ...document, steps: document.steps.map((entry) => (entry.id === edited.id ? { ...edited, text: long } : entry)) };
        const after = homes(longer);
        expect(after.get(edited.id)!.text.lines.length, `${name}: ${edited.id}`).toBeGreaterThan(before.get(edited.id)!.text.lines.length);
        let redrawn = false;
        for (const [stepId, home] of before) {
          const moved = after.get(stepId)!;
          const label = `${name}: ${stepId}, ${edited.id} edited`;
          expect(moved.cell, label).toEqual(home.cell);
          expect(moved.number, label).toEqual(home.number);
          expect(moved.text.x, label).toBe(home.text.x);
          expect(moved.text.widthMm, label).toBe(home.text.widthMm);
          // The edited step's words take room from its own picture.
          if (stepId === edited.id) continue;
          // Another's words stay under its picture as drawn. A picture's run is drawn at the scale every
          // picture in it fits its room at (#436's Fit each), and a picture whose words grow loses the room
          // under its box they took: its run may then draw a little smaller, and its words start higher.
          expect(moved.text.firstBaseline - (moved.draw.y + moved.draw.h), label).toBeCloseTo(home.text.firstBaseline - (home.draw.y + home.draw.h), 9);
          if (moved.scale === home.scale) expect(moved.text.firstBaseline, label).toBe(home.text.firstBaseline);
          else {
            // Only a picture of the edited step's run: drawn at its scale before.
            expect(home.scale, label).toBe(before.get(edited.id)!.scale);
            redrawn = true;
          }
        }
        edits += 1;
        if (redrawn) rescaled += 1;
      }
    }
    expect(edits).toBeGreaterThan(20);
    // Most edits redraw no other picture (6 of the 30 here).
    expect(rescaled).toBeLessThan(edits / 2);
  });
});
