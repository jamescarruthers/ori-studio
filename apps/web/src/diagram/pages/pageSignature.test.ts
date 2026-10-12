import { describe, expect, it } from 'vitest';
import {
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
  setTurn,
  stepIndex,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramRasterAsset,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { setStepPlace } from '../document/stepPlace';
import type { PlannedPage } from './pagePlan';
import { PACKING_VERSION, pageSignature, type PageSignatureInput, type SignedStep } from './pageSignature';
import { cellSlots } from './stepPlaces';

/**
 * A flow page's signature (`diagram-flow-packing.md`, Decision 2): what a
 * stored arrangement was packed for. Every input it covers changes it, and
 * nothing it does not — a picture, a caption, a mark, a placement, the band,
 * the style — ever does, so an edit of those keeps every page as packed.
 */

/** Twelve steps `s0`…, five a page, a turn before `s2`: pages s0–s4, s5–s9, s10–s11 (laid out for five). */
function diagram(page: Partial<DiagramPageSetup> = {}): DiagramDocument {
  const steps = Array.from({ length: 12 }, (_, index) => cpStep(`s${index}`));
  const document = insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0);
  const turned = insertSteps(document, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 't0')], 2);
  return setPageSetup(turned, { layout: 'flow', stepsPerPage: 5, ...page });
}

const signatures = (document: DiagramDocument) => cellSlots(document).signatures;

/** Which pages' signatures differ between two diagrams, by index. */
function changed(before: DiagramDocument, after: DiagramDocument): number[] {
  const [was, now] = [signatures(before), signatures(after)];
  return Array.from({ length: Math.max(was.length, now.length) }, (_, index) => index).filter((index) => was[index] !== now[index]);
}

const RASTER: DiagramRasterAsset = { id: 'asset-1', kind: 'raster', src: 'data:image/png;base64,AA==', widthPx: 20, heightPx: 10, bytes: 24 };

describe('pageSignature', () => {
  it('is a short string, tagged with the packing’s version, the same every time it is asked', () => {
    const [first] = signatures(diagram());
    expect(first).toMatch(new RegExp(`^${PACKING_VERSION}:[0-9a-z]+$`));
    expect(first!.length).toBeLessThan(32);
    expect(signatures(diagram())).toEqual(signatures(diagram()));
    // Each page its own.
    expect(new Set(signatures(diagram())).size).toBe(3);
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

    it('the turns before each step, and after the last on the last page — but not which way a turn turns', () => {
      const before = diagram();
      const turn = (id: string, at: number) => insertSteps(before, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => id)], at);
      // Before s7, on page two.
      expect(changed(before, turn('t1', stepIndex(before, 's7')))).toEqual([1]);
      // Before a page’s first step: its own turns, though they print where the page before ends.
      expect(changed(before, turn('t1', stepIndex(before, 's5')))).toEqual([1]);
      // A second turn where one already stands.
      expect(changed(before, turn('t1', stepIndex(before, 's2')))).toEqual([0]);
      // After the diagram’s last step.
      expect(changed(before, turn('t1', before.steps.length))).toEqual([2]);
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
      // Ten steps fill two pages; an eleventh starts a third, after which page two is no longer the last.
      const ten = setPageSetup(insertSteps(createDiagram({ title: 'Crane' }), Array.from({ length: 10 }, (_, index) => cpStep(`s${index}`)), 0), {
        layout: 'flow',
        stepsPerPage: 5,
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
    ])('%s', (_label, after) => {
      expect(after).not.toBe(before);
      expect(changed(before, after)).toEqual([]);
    });
  });
});
