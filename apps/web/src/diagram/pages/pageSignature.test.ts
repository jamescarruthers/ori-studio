import { describe, expect, it } from 'vitest';
import {
  PAGE_SETTINGS,
  createDiagram,
  createTurn,
  editStepAnnotations,
  insertSteps,
  moveStep,
  removeStepPicture,
  setDiagramStyle,
  setDiagramTitle,
  setHanStyle,
  setPageSetup,
  setPageStarts,
  setStepPicture,
  setStepText,
  setTitleBlockContent,
  setTurn,
  stepIndex,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramRasterAsset,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { setStepPlace } from '../document/stepPlace';
import type { PlannedPage } from './pagePlan';
import { PACKER_VERSION } from './flowArrangement';
import { SIGNATURE_VERSION, holdsArrangement, pageSignature, type PageSignatureInput, type SignedStep } from './pageSignature';
import { cellSlots } from './stepPlaces';

/**
 * A flow page's signature (`diagram-flow-packing.md`, Decision 2): what a
 * stored arrangement was packed for. Every input it covers changes it, and
 * nothing it does not — a picture, a caption, a mark, a placement, the band,
 * the style — ever does, so an edit of those keeps every page as packed.
 */

/**
 * Twelve steps `s0`…, five a page, a turn before `s2`: pages s0–s4, s5–s9, s10–s11 (laid out for five). No title
 * block, as every page saved before it, whatever a new diagram has.
 */
function diagram(page: Partial<DiagramPageSetup> = {}): DiagramDocument {
  const steps = Array.from({ length: 12 }, (_, index) => cpStep(`s${index}`));
  const document = insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0);
  const turned = insertSteps(document, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 't0')], 2);
  return setPageSetup(turned, { layout: 'flow', stepsPerPage: 5, titleBlock: PAGE_SETTINGS.titleBlock.legacy, ...page });
}

const signatures = (document: DiagramDocument) => cellSlots(document).signatures;

/** {@link diagram}'s pages' signatures as every build since 2026-10-12 has signed them. */
const FROZEN_SIGNATURES = ['pack-3:8lau4w185srg7', 'pack-3:ka9psdp8lya6', 'pack-3:vp5q451hqxros'];

/** The title block on, at a share of 27%: the first page holds four (`firstPageCapacity`). */
const BLOCK = { titleBlock: { enabled: true, heightShare: 0.27 } } as const;

/** {@link diagram}'s pages' signatures with {@link BLOCK} on, as every build since 2026-10-14 has signed them. */
const FROZEN_BLOCK_SIGNATURES = ['pack-3:ivpnek1lofqkx', 'pack-3:1away4iko9ze1', 'pack-3:fdcnh51dpj3di'];

/** Which pages' signatures differ between two diagrams, by index. */
function changed(before: DiagramDocument, after: DiagramDocument): number[] {
  const [was, now] = [signatures(before), signatures(after)];
  return Array.from({ length: Math.max(was.length, now.length) }, (_, index) => index).filter((index) => was[index] !== now[index]);
}

const RASTER: DiagramRasterAsset = { id: 'asset-1', kind: 'raster', src: 'data:image/png;base64,AA==', widthPx: 20, heightPx: 10, bytes: 24 };

describe('pageSignature', () => {
  it('is a short string, tagged with the signature’s format, the same every time it is asked', () => {
    const [first] = signatures(diagram());
    expect(first).toMatch(new RegExp(`^${SIGNATURE_VERSION}:[0-9a-z]+$`));
    expect(first!.length).toBeLessThan(32);
    expect(signatures(diagram())).toEqual(signatures(diagram()));
    // Each page its own.
    expect(new Set(signatures(diagram())).size).toBe(3);
  });

  it('keeps its format, so every page saved so far still holds: the same structure signs as it always has', () => {
    // The literal every saved page was signed with, and the digests of this diagram's pages under it. A change
    // here re-packs every saved diagram: it is a new format, which must also accept these
    // (`implementation-plans/diagram-document-evolution.md`). A change to the packing never is one.
    expect(SIGNATURE_VERSION).toBe('pack-3');
    expect(signatures(diagram())).toEqual(FROZEN_SIGNATURES);
  });

  it('keeps its format with the title block on, signed by an entry the first page gains only while it is on', () => {
    // The block's entry is appended, so no page signed without it changes; and these, once saved, hold as these.
    expect(signatures(diagram(BLOCK))).toEqual(FROZEN_BLOCK_SIGNATURES);
    // Off, whatever its share: every page as it was before there was a block.
    expect(signatures(diagram({ titleBlock: { enabled: false, heightShare: 0.4 } }))).toEqual(FROZEN_SIGNATURES);
  });

  it('is never the packer’s: an arrangement holds whatever packer packed it', () => {
    const document = diagram();
    const slots = cellSlots(document);
    const ids = slots.pages[0]!;
    const steps = Object.fromEntries(ids.map((id) => [id, { box: [0, 0, 10, 10] as [number, number, number, number], scale: { frameMm: 10 }, band: 0 }]));
    const stored = { signature: slots.signatures[0]!, k: 1, steps };
    expect(holdsArrangement(stored, slots.signatures[0], ids)).toBe(true);
    expect(holdsArrangement({ ...stored, packer: PACKER_VERSION }, slots.signatures[0], ids)).toBe(true);
    expect(holdsArrangement({ ...stored, packer: 'pack-99' }, slots.signatures[0], ids)).toBe(true);
  });

  describe('changes with everything it covers', () => {
    it('the page’s steps in order: a reorder on it, or another step in a step’s place', () => {
      const before = diagram();
      expect(changed(before, moveStep(before, 's3', stepIndex(before, 's1')))).toEqual([0]);
      // Swapped across the end of page one: both pages are new.
      expect(changed(before, moveStep(before, 's4', stepIndex(before, 's5')))).toEqual([0, 1]);
      // A step put in at the front pushes a step on to every page after it.
      expect(changed(before, insertSteps(before, [cpStep('new')], 0))).toEqual([0, 1, 2]);
    });

    it('the turns before each step but the first — but not which way a turn turns', () => {
      const before = diagram();
      const turn = (id: string, at: number) => insertSteps(before, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => id)], at);
      // Before s7, on page two.
      expect(changed(before, turn('t1', stepIndex(before, 's7')))).toEqual([1]);
      // Before a page’s first step: its own turns, though they print where the page before ends.
      expect(changed(before, turn('t1', stepIndex(before, 's5')))).toEqual([1]);
      // A second turn where one already stands.
      expect(changed(before, turn('t1', stepIndex(before, 's2')))).toEqual([0]);
      // Before the diagram’s first step, or after its last: the pages leave it out (Zach, 12 Oct), so it takes no room.
      expect(changed(before, turn('t1', 0))).toEqual([]);
      expect(changed(before, turn('t1', before.steps.length))).toEqual([]);
      // Over the other axis, or a rotation instead: the same room.
      expect(changed(before, setTurn(before, 't0', { kind: 'turn-over', axis: 'horizontal' }))).toEqual([]);
      expect(changed(before, setTurn(before, 't0', { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } }))).toEqual([]);
      // A newer build’s turn is not drawn, and takes no room.
      const locked = insertSteps(before, [{ ...createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'newer'), unknown: { id: 'newer', kind: 'flip' } }], stepIndex(before, 's7'));
      expect(changed(before, locked)).toEqual([]);
    });

    it('an enlarged step after another, whose arrow keeps a turn’s gutter — but not whether the arrow prints', () => {
      const before = diagram();
      const area = { id: 'area-1', kind: 'zoom' as const, from: [0.5, 0.5] as [number, number], to: [0.5, 0.5] as [number, number], radius: 0.2 };
      const zoom = { from: 'area-1', shape: 'circle' as const, frame: { centre: [0.5, 0.5] as [number, number], radius: 0.2 } };
      const enlarge = (document: DiagramDocument, id: string) => ({
        ...document,
        steps: document.steps.map((entry) => (entry.id === id ? { ...entry, zoom } : entry)),
      });
      // Enlarged, on page two: its gutter is kept, though no area on the step before prints an arrow yet.
      const enlarged = enlarge(before, 's7');
      expect(changed(before, enlarged)).toEqual([1]);
      // The arrow brought by an area on the step before, taken away by its mark deleted or the step's picture
      // removed: marks and pictures, never structure.
      const arrowed = editStepAnnotations(enlarged, 's6', () => [area]);
      expect(changed(enlarged, arrowed)).toEqual([]);
      expect(changed(arrowed, editStepAnnotations(arrowed, 's6', () => []))).toEqual([]);
      expect(changed(arrowed, removeStepPicture(arrowed, 's7'))).toEqual([]);
      // The diagram's first step: no step before it, so no arrow ever prints before it.
      expect(changed(before, enlarge(before, 's0'))).toEqual([]);
    });

    it('its capacity, but not whether that is its own count or the default', () => {
      const before = diagram();
      // Page two holds five by its own count: the same page.
      expect(changed(before, setPageStarts(before, new Map([['s5', { pageSteps: 5 }]])))).toEqual([]);
      // The last page, laid out for five, given six: its steps take other places.
      expect(changed(before, setPageStarts(before, new Map([['s10', { pageSteps: 6 }]])))).toEqual([2]);
      // The default: every page, and one page fewer.
      expect(changed(before, setPageSetup(before, { stepsPerPage: 6 }))).toEqual([0, 1, 2]);
    });

    it('the diagram’s steps per page on a page of its own count too: the cell every step’s reference scale is found in', () => {
      const counted = setPageStarts(diagram(), new Map(['s0', 's5', 's10'].map((id) => [id, { pageSteps: 5 }])));
      // Every page holds five by its own count, so the default neither places a step nor is any page's capacity;
      // it still sizes every picture.
      expect(changed(counted, setPageSetup(counted, { stepsPerPage: 6 }))).toEqual([0, 1, 2]);
    });

    it('whether it is the last page, and whether it hands over at its spine', () => {
      // Ten steps fill two pages; an eleventh starts a third, after which page two is no longer the last. No title
      // block, as in `diagram()`.
      const ten = setPageSetup(insertSteps(createDiagram({ title: 'Crane' }), Array.from({ length: 10 }, (_, index) => cpStep(`s${index}`)), 0), {
        layout: 'flow',
        stepsPerPage: 5,
        titleBlock: PAGE_SETTINGS.titleBlock.legacy,
      });
      expect(changed(ten, insertSteps(ten, [cpStep('s10')], ten.steps.length))).toEqual([1, 2]);
      // All ten on one page; an eleventh makes it a left page that hands over at its spine, and not the last.
      const one = setPageSetup(ten, { stepsPerPage: 10 });
      expect(changed(one, insertSteps(one, [cpStep('s10')], one.steps.length))).toEqual([0, 1]);
    });

    it('the page’s index and side', () => {
      const steps: SignedStep[] = ['a', 'b'].map((id) => ({ id, breakBefore: false, turnsBefore: [], turnsAfter: [] }));
      const page: PlannedPage = { steps: [0, 1], firstStepId: 'a', ownCount: false, capacity: 2, layoutCount: 2, rows: 1, rowCounts: [2], columns: 2 };
      const input = (count: number, patch: Partial<DiagramPageSetup> = {}): PageSignatureInput => ({
        steps,
        pages: Array.from({ length: count }, () => page),
        setup: { ...diagram().page, ...patch },
        title: 'Crane',
      });
      // Pages two and four of five are right pages that turn over: only their index differs.
      expect(pageSignature(input(5), 1)).not.toBe(pageSignature(input(5), 3));
      // The second of two is the last either way: on the right, then on the left.
      expect(pageSignature(input(2), 1)).not.toBe(pageSignature(input(2, { firstPageSide: 'right' }), 1));
      // The second of two is the last; of three, not: on the right either way.
      expect(pageSignature(input(2), 1)).not.toBe(pageSignature(input(3), 1));
      expect(pageSignature(input(2), 1)).toBe(pageSignature(input(2), 1));
    });

    it.each([
      ['paper size', { size: 'letter' }],
      ['orientation', { orientation: 'landscape' }],
      ['margin', { marginMm: 15 }],
      ['title tab', { showTitle: false }],
      ['page numbers', { pageNumbers: { enabled: false, first: 1 } }],
      ['band count', { flowBands: 3 }],
      ['preference for three bands', { flowPreferBands: 0.7 }],
      ['steps in bends', { flowBendSteps: false }],
      ['nesting', { flowNesting: 0.5 }],
      ['scale steadiness', { flowSteadiness: 0.6 }],
    ] as const)('the %s, on every page', (_label, patch) => {
      const before = diagram();
      expect(changed(before, setPageSetup(before, patch as Partial<DiagramPageSetup>))).toEqual([0, 1, 2]);
    });

    it('a title typed where there was none, or cleared, which shows or hides the tab', () => {
      const untitled = setDiagramTitle(diagram(), '');
      expect(changed(untitled, setDiagramTitle(untitled, 'Crane'))).toEqual([0, 1, 2]);
      expect(changed(diagram(), setDiagramTitle(diagram(), '   '))).toEqual([0, 1, 2]);
    });

    it('the title block turned on, or off: the first page by its entry, and every page its steps then move to', () => {
      const before = diagram();
      // The first page holds four: every later page starts a step earlier.
      expect(changed(before, setPageSetup(before, BLOCK))).toEqual([0, 1, 2]);
      expect(changed(diagram(BLOCK), setPageSetup(diagram(BLOCK), { titleBlock: { enabled: false, heightShare: 0.27 } }))).toEqual([0, 1, 2]);
      // A first page of its own count holds as many either way: it alone changes.
      const counted = setPageStarts(before, new Map([['s0', { pageSteps: 5 }]]));
      expect(changed(counted, setPageSetup(counted, BLOCK))).toEqual([0]);
      // Its share: the first page's room, on it alone while its count holds.
      const on = setPageSetup(counted, BLOCK);
      expect(changed(on, setPageSetup(on, { titleBlock: { enabled: true, heightShare: 0.35 } }))).toEqual([0]);
    });
  });

  describe('with the title block on', () => {
    const before = diagram(BLOCK);

    it('leaves the first page as it is when a title is typed or cleared: the block carries it, not a tab', () => {
      const untitled = setDiagramTitle(before, '');
      expect(changed(untitled, setDiagramTitle(untitled, 'Crane'))).toEqual([1, 2]);
      expect(changed(before, setDiagramTitle(before, ' '))).toEqual([1, 2]);
      expect(changed(before, setPageSetup(before, { showTitle: false }))).toEqual([1, 2]);
    });

    it('never changes with what the block shows', () => {
      const shown = setTitleBlockContent(before, { model: { kind: 'none' }, pattern: { kind: 'step', stepId: 's3' }, byline: 'Design: Lang' });
      expect(shown).not.toBe(before);
      expect(changed(before, shown)).toEqual([]);
      expect(changed(before, setDiagramTitle(before, 'Swan'))).toEqual([]);
    });
  });

  describe('never changes with what it does not cover', () => {
    const before = diagram();
    const label = { id: 'label-1', kind: 'label' as const, from: [0.5, 0.5] as [number, number], to: [0.5, 0.5] as [number, number], text: 'A' };
    it.each([
      ['a caption', setStepText(before, 's3', 'Fold the corner up to the top, and unfold.')],
      ['a picture', setStepPicture(before, 's3', RASTER)],
      ['a mark', editStepAnnotations(before, 's3', () => [label])],
      ['a placement', setStepPlace(before, 's3', { frame: [3, 1], text: [0, 2], scale: { mmPerUnit: 0.4 } })],
      ['a caption’s pinned width', setStepPlace(before, 's3', { textWidth: 72 })],
      ['the band’s width', setPageSetup(before, { pathWidthMm: 30 })],
      ['the band’s colour', setPageSetup(before, { pathColor: '#d6e8f5' })],
      ['the band shown', setPageSetup(before, { showPath: false })],
      ['the style', setDiagramStyle(before, { preset: 'default' })],
      ['the Han style', setHanStyle(before, 'jp')],
      ['another title', setDiagramTitle(before, 'Swan')],
      ['the first page number', setPageSetup(before, { pageNumbers: { enabled: true, first: 7 } })],
      ['a grid’s columns and rows', setPageSetup(before, { columns: 5, rows: 2 })],
      ['the share of a title block that is off', setPageSetup(before, { titleBlock: { enabled: false, heightShare: 0.4 } })],
      ['what a title block shows', setTitleBlockContent(before, { model: { kind: 'none' }, byline: 'Design: Lang' })],
    ])('%s', (_label, after) => {
      expect(after).not.toBe(before);
      expect(changed(before, after)).toEqual([]);
    });
  });
});
