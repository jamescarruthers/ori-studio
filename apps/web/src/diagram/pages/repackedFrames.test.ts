import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  isTurn,
  PAGE_SETTINGS,
  setPageSetup,
  setStepBreakBefore,
  stepsOf,
  type DiagramArrangedStep,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { readDiagram, writeDiagram } from '../document/diagramFile';
import { cpStep } from '../document/diagramSteps.fixtures';
import type { DiagramPagesLayout, LayoutCell } from './diagramPageLayout';
import { layoutDiagram } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { adoptPacking, adoptPageArrangements, followPageArrangements, repackPages } from './pageArrangements';
import { pageOffset } from './pagePlacement';
import { flowSlot, keepsMovedFrame, placedIn } from './repackedFrames';
import { settlePlaces } from './stepPlaces';

/**
 * A frame moved by hand on a flow page packed afresh (Zach, 2026-10-15,
 * replacing his rule of 2026-10-13): kept while its step keeps its place — its
 * page, its band, and its place along the band as the band reads — and sent
 * home when any of them changes, drawn so by the layout of a page packed
 * afresh, before any adoption, and cleared by the adoption of exactly those
 * frames. Everything inside the step's box stays.
 */

const at = (band: number, x: number, bend = false): DiagramArrangedStep => ({
  box: [x, 0, 10, 10],
  scale: { frameMm: 10 },
  band,
  ...(bend ? { bend: true as const } : {}),
});
const arrangement = (steps: Record<string, DiagramArrangedStep>): DiagramPageArrangement => ({ signature: 'pack-3:old', k: 1, steps });

describe('flowSlot', () => {
  it('reads a step’s place along its band as the band reads: an even band from the left, an odd one from the right', () => {
    const page = arrangement({ a: at(0, 0), b: at(0, 20), c: at(1, 40), d: at(1, 20), e: at(1, 0), f: at(0, 40, true) });
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => flowSlot(page, id))).toEqual([
      { band: 0, bend: false, along: 0 },
      { band: 0, bend: false, along: 1 },
      { band: 1, bend: false, along: 0 },
      { band: 1, bend: false, along: 1 },
      { band: 1, bend: false, along: 2 },
      { band: 0, bend: true, along: 0 },
    ]);
    expect(flowSlot(page, 'x')).toBeNull();
  });
});

describe('keepsMovedFrame', () => {
  const stored = {
    a: arrangement({ a: at(0, 0), b: at(0, 20), c: at(0, 40, true), f: at(1, 40), g: at(1, 20) }),
    d: arrangement({ d: at(0, 0), e: at(2, 0) }),
  };

  it('keeps a step in the same place: its band, its place along it, in a bend there or not as before — wherever its home is now', () => {
    const now = arrangement({ a: at(0, 3), b: at(0, 31), c: at(0, 44, true), f: at(1, 52), g: at(1, 17) });
    for (const id of ['a', 'b', 'c', 'f', 'g']) expect(keepsMovedFrame(stored, 'a', id, now), id).toBe(true);
  });

  it('sends home a step whose place along its band changed: a step put in before it, or one before it gone', () => {
    const putIn = arrangement({ a: at(0, 0), n: at(0, 20), b: at(0, 40), f: at(1, 40), g: at(1, 20) });
    expect(keepsMovedFrame(stored, 'a', 'a', putIn)).toBe(true);
    expect(keepsMovedFrame(stored, 'a', 'b', putIn)).toBe(false);
    const gone = arrangement({ b: at(0, 0), f: at(1, 40), g: at(1, 20) });
    expect(keepsMovedFrame(stored, 'a', 'b', gone)).toBe(false);
    // A swap moves both.
    const swapped = arrangement({ a: at(0, 20), b: at(0, 0), f: at(1, 40), g: at(1, 20) });
    expect(keepsMovedFrame(stored, 'a', 'a', swapped)).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'b', swapped)).toBe(false);
  });

  it('reads an odd band from the right: a step put in at its left end moves none, one at its right end moves both', () => {
    const left = arrangement({ f: at(1, 40), g: at(1, 20), h: at(1, 0) });
    expect(keepsMovedFrame(stored, 'a', 'f', left)).toBe(true);
    expect(keepsMovedFrame(stored, 'a', 'g', left)).toBe(true);
    const right = arrangement({ h: at(1, 60), f: at(1, 40), g: at(1, 20) });
    expect(keepsMovedFrame(stored, 'a', 'f', right)).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'g', right)).toBe(false);
  });

  it('sends home a step whose band changed, or that went into or out of a bend', () => {
    expect(keepsMovedFrame(stored, 'a', 'b', arrangement({ b: at(1, 20) }))).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'a', arrangement({ a: at(0, 0, true) }))).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'c', arrangement({ c: at(0, 40) }))).toBe(false);
  });

  it('sends home a step last held on another page: one whose arrangement is not the one under its page’s first step', () => {
    expect(keepsMovedFrame(stored, 'a', 'e', arrangement({ e: at(2, 0) }))).toBe(false);
    expect(keepsMovedFrame(stored, 'x', 'b', arrangement({ b: at(0, 20) }))).toBe(false);
    expect(placedIn(stored, 'e')).toBe(true);
  });

  it('keeps a step no stored arrangement places: no place is known to have changed', () => {
    expect(placedIn(stored, 'new')).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'new', arrangement({ new: at(3, 0) }))).toBe(true);
    expect(keepsMovedFrame(undefined, 'a', 'b', arrangement({ b: at(3, 0) }))).toBe(true);
  });
});

/** The frame every step is moved by, its parts' offsets, its caption's measure and a size pin with it. */
const PLACE: DiagramStepPlace = { frame: [3, -2], number: [1, 0], text: [0, 1.5], textWidth: 28, scale: { frameMm: 22 } };
const { frame: _frame, ...INSIDE } = PLACE;

/** Nine crease-pattern steps on one flow page with no title block, packed and held, each step's frame moved by hand. */
function heldPage(): DiagramDocument {
  const steps = Array.from({ length: 9 }, (_, index) => ({ ...cpStep(`s${index}`), text: index % 2 ? 'Fold the corner up to the centre line.' : 'Fold.' }));
  const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 9,
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
  });
  const placed = { ...base, steps: base.steps.map((entry) => (isTurn(entry) ? entry : { ...entry, place: PLACE })) };
  return adoptPageArrangements(placed, layoutDiagram(placed, estimateTextSetter).packed ?? {});
}

/** The page's one stored arrangement, and the step it is stored under. */
const storedOf = (document: DiagramDocument) => Object.entries(document.pageArrangements!)[0]!;

/** The steps the page's arrangement puts along `band`, out of its bend, in reading order. */
function alongBand(document: DiagramDocument, band: number): string[] {
  const [, kept] = storedOf(document);
  return stepsOf(document)
    .map((step) => step.id)
    .filter((id) => kept.steps[id]!.band === band && !kept.steps[id]!.bend);
}

/** `document` with the places of `a` and `b` swapped in its page's arrangement, signed `signature` if given. */
function withSwapped(document: DiagramDocument, a: string, b: string, signature?: string): DiagramDocument {
  const [first, kept] = storedOf(document);
  const steps = { ...kept.steps, [a]: kept.steps[b]!, [b]: kept.steps[a]! };
  return { ...document, pageArrangements: { [first]: { ...kept, ...(signature ? { signature } : {}), steps } } };
}

const framed = (document: DiagramDocument) => stepsOf(document).filter((step) => step.place?.frame).map((step) => step.id);

/** Each step drawn in its box, at its frame's offset (in its band's reading terms) or at home, the rest of its placement kept. */
function expectDrawn(layout: DiagramPagesLayout, home: ReadonlySet<string>) {
  const page = layout.pages[0]!;
  const packed = Object.values(layout.packed ?? {})[0];
  for (const cell of page.cells) {
    const box = packed ? packed.steps[cell.stepId]!.box : null;
    const [dx, dy] = home.has(cell.stepId) ? [0, 0] : pageOffset(PLACE, 'frame', Boolean(cell.rightToLeft));
    if (box) expect([cell.cellMm.x, cell.cellMm.y], cell.stepId).toEqual([box[0] + dx, box[1] + dy]);
    // A frame sent home leaves the rest of its placement: the layout says so as it will once adopted.
    expect(cell.placed?.offsets, cell.stepId).toEqual(home.has(cell.stepId) ? INSIDE : PLACE);
  }
}

/** A layout's cells, as compared between two diagrams that should draw the same. */
const cellsOf = (layout: DiagramPagesLayout): LayoutCell[] => layout.pages.flatMap((page) => page.cells);

describe('a flow page packed afresh with frames moved by hand', () => {
  it('opened with a stale arrangement: draws the two steps that swapped places along a band at home, before any adoption', () => {
    const held = heldPage();
    const [a, b] = alongBand(held, 0);
    // As another build saved it: signed for another format, two steps of band 0 each where the other is packed now.
    const opened = withSwapped(held, a!, b!, 'pack-2:old');
    const layout = layoutDiagram(opened, estimateTextSetter);
    expect(layout.pages[0]!.packing!.packed).toBe(true);
    expectDrawn(layout, new Set([a!, b!]));
    // Adopted: exactly those two go home, and the diagram draws as it did — a read-only one, never adopted, or an
    // export, draws the same.
    const { document, settled } = adoptPacking(opened, layout.packed!);
    expect(settled).toBe(2);
    expect(framed(document)).toEqual(framed(held).filter((id) => id !== a && id !== b));
    const adopted = layoutDiagram(document, estimateTextSetter);
    expect(adopted.packed).toBeUndefined();
    expect(cellsOf(adopted)).toEqual(cellsOf(layout));
  });

  it('re-packed (Re-pack Page): the same, judged against the arrangement the page held, an odd band’s read from the right', () => {
    // Held as an older packer packed it: two steps of band 1 — read right to left — each where the other is packed now.
    const fresh = heldPage();
    const [a, b] = alongBand(fresh, 1);
    const held = withSwapped(fresh, a!, b!);
    expect(layoutDiagram(held, estimateTextSetter).packed).toBeUndefined();
    // Re-pack Page lands as the store lands an edit: no frame goes in the edit itself.
    const repacked = settlePlaces(held, followPageArrangements(held, repackPages(held, 0)));
    expect(repacked.settled).toBe(0);
    const layout = layoutDiagram(repacked.document, estimateTextSetter);
    expectDrawn(layout, new Set([a!, b!]));
    const { document, settled } = adoptPacking(repacked.document, layout.packed!);
    expect(settled).toBe(2);
    expect(cellsOf(layoutDiagram(document, estimateTextSetter))).toEqual(cellsOf(layout));
    // A page whose steps all keep their places keeps every offset, however its homes move.
    const again = repackPages(document, 0);
    const kept = adoptPacking(again, layoutDiagram(again, estimateTextSetter).packed!);
    expect(kept.settled).toBe(0);
  });

  it('keeps every offset where no arrangement was ever stored: no place is known to have changed', () => {
    const held = heldPage();
    const { pageArrangements: _none, ...never } = held;
    const layout = layoutDiagram(never, estimateTextSetter);
    expectDrawn(layout, new Set());
    expect(adoptPacking(never, layout.packed!).settled).toBe(0);
  });

  it('opened from a saved file, moves nothing: every page held, every frame at its offset', () => {
    const held = heldPage();
    const read = readDiagram(JSON.parse(JSON.stringify(writeDiagram(held))));
    expect(read).not.toBeNull();
    const opened = read!.document;
    const layout = layoutDiagram(opened, estimateTextSetter);
    expect(layout.packed).toBeUndefined();
    expect(layout.pages[0]!.packing!.packed).toBe(false);
    expectDrawn(layout, new Set());
    expect(adoptPacking(opened, {})).toEqual({ document: opened, settled: 0 });
    expect(framed(opened)).toEqual(framed(held));
  });
});

/**
 * Twenty-four crease-pattern steps, six a flow page, each page started by a page break — as a designer who ends each
 * page by hand has them — with no title block, packed and held, each step's frame moved by hand.
 */
function heldPages(): DiagramDocument {
  const steps = Array.from({ length: 24 }, (_, index) => ({
    ...cpStep(`s${index}`),
    text: index % 2 ? 'Fold the corner up to the centre line.' : 'Fold.',
    breakBefore: index > 0 && index % 6 === 0,
  }));
  const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 6,
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
  });
  const placed = { ...base, steps: base.steps.map((entry) => (isTurn(entry) ? entry : { ...entry, place: PLACE })) };
  return adoptPageArrangements(placed, layoutDiagram(placed, estimateTextSetter).packed ?? {});
}

/** Whether the page `first` starts stacks its rows from its foot, as `arrangement` boxes them: band 0 under band 1. */
const stacksUp = (arrangement: DiagramPageArrangement, first: string, next: string): boolean =>
  arrangement.steps[first]!.box[1] > arrangement.steps[next]!.box[1];

describe('a flow page whose rows now stack from its other end (Zach, 2026-10-15)', () => {
  it.each([
    ['the title block turned on', (document: DiagramDocument) => setPageSetup(document, { titleBlock: { enabled: true, heightShare: 0.27 } })],
    ['the first page’s side changed', (document: DiagramDocument) => setPageSetup(document, { firstPageSide: 'right' })],
    ['a page break put in on the first page', (document: DiagramDocument) => setStepBreakBefore(document, 's3', true)],
  ])('%s: every step on the pages it moves to the other side of their spread goes home, all inside its box kept', (_label, edit) => {
    const held = heldPages();
    // Pages s6, s12 and s18 start: a right page, its rows stacked from its foot, then a left one, then a right one.
    const firsts = ['s6', 's12', 's18'];
    expect(firsts.map((first) => stacksUp(held.pageArrangements![first]!, first, `s${Number(first.slice(1)) + 2}`))).toEqual([true, false, true]);
    // The edit lands as the store lands it: arrangements following their pages, frames off their place home.
    const edited = edit(held);
    const landed = settlePlaces(held, followPageArrangements(held, edited));
    const later = stepsOf(held)
      .slice(6)
      .map((step) => step.id);
    expect(framed(landed.document).filter((id) => later.includes(id))).toEqual([]);
    for (const id of later) expect(stepsOf(landed.document).find((step) => step.id === id)!.place, id).toEqual(INSIDE);
    // Packed afresh, each of those pages stacks its rows from its other end: band 0 is where band 2 was. Each step on
    // it keeps its band and its place along it, so an offset made against its old neighbours would land among new ones.
    const layout = layoutDiagram(landed.document, estimateTextSetter);
    for (const first of firsts) {
      const packed = layout.packed![first]!;
      const next = `s${Number(first.slice(1)) + 2}`;
      expect(stacksUp(packed, first, next), first).toBe(!stacksUp(held.pageArrangements![first]!, first, next));
      for (const id of later.filter((each) => Object.hasOwn(packed.steps, each)))
        expect(flowSlot(packed, id), id).toEqual(flowSlot(held.pageArrangements![first]!, id));
    }
    // Drawn at home before any adoption, and the adoption sends nothing more home there: the first page's own steps
    // keep their offsets where they keep their places, s0 among them.
    for (const cell of cellsOf(layout).filter((each) => later.includes(each.stepId))) expect(cell.placed?.offsets, cell.stepId).toEqual(INSIDE);
    const adopted = adoptPacking(landed.document, layout.packed!);
    expect(framed(adopted.document).filter((id) => later.includes(id))).toEqual([]);
    expect(framed(adopted.document)).toContain('s0');
  });
});
