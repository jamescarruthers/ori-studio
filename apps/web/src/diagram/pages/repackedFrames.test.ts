import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  isTurn,
  setPageSetup,
  stepsOf,
  type DiagramArrangedStep,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import type { DiagramPagesLayout, LayoutCell } from './diagramPageLayout';
import { layoutDiagram } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { adoptPacking, adoptPageArrangements, followPageArrangements, repackPages } from './pageArrangements';
import { pageOffset } from './pagePlacement';
import { keepsMovedFrame, placedIn } from './repackedFrames';
import { settlePlaces } from './stepPlaces';

/**
 * A frame moved by hand across a re-pack (Zach, 2026-10-13): kept while its
 * step stays on its page and in its band, sent home when either changes —
 * drawn so by the layout of a page packed afresh, before any adoption, and
 * cleared by the adoption of exactly those frames.
 */

const place = (band: number, bend = false): DiagramArrangedStep => ({ box: [0, 0, 10, 10], scale: { frameMm: 10 }, band, ...(bend ? { bend: true as const } : {}) });
const arrangement = (steps: Record<string, DiagramArrangedStep>): DiagramPageArrangement => ({ signature: 'pack-3:old', k: 1, steps });

describe('keepsMovedFrame', () => {
  const stored = { a: arrangement({ a: place(0), b: place(1), c: place(0, true) }), d: arrangement({ d: place(0), e: place(2) }) };

  it('keeps a step that stays in its band on its page, in a bend there or not as before', () => {
    expect(keepsMovedFrame(stored, 'a', 'b', { band: 1 })).toBe(true);
    expect(keepsMovedFrame(stored, 'a', 'c', { band: 0, bend: true })).toBe(true);
  });

  it('sends home a step whose band changed, or that went into or out of a bend', () => {
    expect(keepsMovedFrame(stored, 'a', 'b', { band: 0 })).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'a', { band: 0, bend: true })).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'c', { band: 0 })).toBe(false);
  });

  it('sends home a step last held on another page: one whose arrangement is not the one under its page’s first step', () => {
    expect(keepsMovedFrame(stored, 'a', 'e', { band: 2 })).toBe(false);
    expect(keepsMovedFrame(stored, 'x', 'b', { band: 1 })).toBe(false);
    expect(placedIn(stored, 'e')).toBe(true);
  });

  it('keeps a step no stored arrangement places: no band is known to have changed', () => {
    expect(placedIn(stored, 'new')).toBe(false);
    expect(keepsMovedFrame(stored, 'a', 'new', { band: 3 })).toBe(true);
    expect(keepsMovedFrame(undefined, 'a', 'b', { band: 3 })).toBe(true);
  });
});

/** The frame every step is moved by, its parts' offsets and a pin with it. */
const PLACE: DiagramStepPlace = { frame: [3, -2], number: [1, 0], text: [0, 1.5] };

/** Nine crease-pattern steps on one flow page, packed and held, each step's frame moved by hand. */
function heldPage(): DiagramDocument {
  const steps = Array.from({ length: 9 }, (_, index) => ({ ...cpStep(`s${index}`), text: index % 2 ? 'Fold the corner up to the centre line.' : 'Fold.' }));
  const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), { layout: 'flow', stepsPerPage: 9 });
  const held = adoptPageArrangements(base, layoutDiagram(base, estimateTextSetter).packed ?? {});
  return { ...held, steps: held.steps.map((entry) => (isTurn(entry) ? entry : { ...entry, place: PLACE })) };
}

/** `document`'s page arrangement, its signature and the bands of `moved` changed: one in another band, one into a bend's opposite. */
function withOtherBands(document: DiagramDocument, moved: readonly string[], signature?: string): DiagramDocument {
  const [first, kept] = Object.entries(document.pageArrangements!)[0]!;
  const steps = { ...kept.steps };
  const [a, b] = moved;
  steps[a!] = { ...steps[a!]!, band: steps[a!]!.band === 0 ? 1 : 0 };
  const { bend: _bend, ...unbent } = steps[b!]!;
  steps[b!] = steps[b!]!.bend ? unbent : { ...steps[b!]!, bend: true };
  return { ...document, pageArrangements: { [first]: { ...kept, ...(signature ? { signature } : {}), steps } } };
}

const framed = (document: DiagramDocument) => stepsOf(document).filter((step) => step.place?.frame).map((step) => step.id);

/** Each step drawn in its box, at its frame's offset (in its band's reading terms) or at home. */
function expectDrawn(layout: DiagramPagesLayout, home: ReadonlySet<string>) {
  const page = layout.pages[0]!;
  const packed = Object.values(layout.packed ?? {})[0];
  for (const cell of page.cells) {
    const box = packed ? packed.steps[cell.stepId]!.box : null;
    const [dx, dy] = home.has(cell.stepId) ? [0, 0] : pageOffset(PLACE, 'frame', Boolean(cell.rightToLeft));
    if (box) expect([cell.cellMm.x, cell.cellMm.y], cell.stepId).toEqual([box[0] + dx, box[1] + dy]);
    // A frame sent home leaves the rest of its placement: the layout says so as it will once adopted.
    const { frame: _frame, ...parts } = PLACE;
    expect(cell.placed?.offsets, cell.stepId).toEqual(home.has(cell.stepId) ? parts : PLACE);
  }
}

/** A layout's cells, as compared between two diagrams that should draw the same. */
const cellsOf = (layout: DiagramPagesLayout): LayoutCell[] => layout.pages.flatMap((page) => page.cells);

describe('a flow page packed afresh with frames moved by hand', () => {
  it('opened with a stale arrangement: draws a step whose band changed at home and the rest at their offsets, before any adoption', () => {
    const held = heldPage();
    // As another build saved it: signed for another format, two steps in other bands than this build packs them in.
    const opened = withOtherBands(held, ['s2', 's5'], 'pack-2:old');
    const layout = layoutDiagram(opened, estimateTextSetter);
    expect(layout.pages[0]!.packing!.packed).toBe(true);
    expectDrawn(layout, new Set(['s2', 's5']));
    // Adopted: exactly those two go home, and the diagram draws as it did — a read-only one, never adopted, or an
    // export, draws the same.
    const { document, settled } = adoptPacking(opened, layout.packed!);
    expect(settled).toBe(2);
    expect(framed(document)).toEqual(['s0', 's1', 's3', 's4', 's6', 's7', 's8']);
    const adopted = layoutDiagram(document, estimateTextSetter);
    expect(adopted.packed).toBeUndefined();
    expect(cellsOf(adopted)).toEqual(cellsOf(layout));
  });

  it('re-packed (Re-pack Page): the same split, judged against the arrangement the page held', () => {
    // Held as an older packer packed it: two steps in other bands than this build packs them in.
    const held = withOtherBands(heldPage(), ['s1', 's7']);
    expect(layoutDiagram(held, estimateTextSetter).packed).toBeUndefined();
    // Re-pack Page lands as the store lands an edit: no frame goes in the edit itself.
    const repacked = settlePlaces(held, followPageArrangements(held, repackPages(held, 0)));
    expect(repacked.settled).toBe(0);
    const layout = layoutDiagram(repacked.document, estimateTextSetter);
    expectDrawn(layout, new Set(['s1', 's7']));
    const { document, settled } = adoptPacking(repacked.document, layout.packed!);
    expect(settled).toBe(2);
    expect(cellsOf(layoutDiagram(document, estimateTextSetter))).toEqual(cellsOf(layout));
    // A page that keeps every band keeps every offset.
    const again = repackPages(document, 0);
    const kept = adoptPacking(again, layoutDiagram(again, estimateTextSetter).packed!);
    expect(kept.settled).toBe(0);
  });

  it('keeps every offset where no arrangement was ever stored: no band is known to have changed', () => {
    const held = heldPage();
    const { pageArrangements: _none, ...never } = held;
    const layout = layoutDiagram(never, estimateTextSetter);
    expectDrawn(layout, new Set());
    expect(adoptPacking(never, layout.packed!).settled).toBe(0);
  });
});
