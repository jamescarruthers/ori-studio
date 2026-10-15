import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  createStep,
  createTurn,
  duplicateStep,
  editStepAnnotations,
  indexForStepNumber,
  insertPictureSteps,
  insertSteps,
  isTurn,
  moveStep,
  PAGE_SETTINGS,
  pullReferencesSteps,
  removeStepPicture,
  removeSteps,
  setDiagramStyle,
  setDiagramTitle,
  setLinkedPicture,
  setPageSetup,
  setStepBreakBefore,
  setStepPicture,
  setStepText,
  setUploadPose,
  stepById,
  stepIndex,
  stepToTurn,
  stepsOf,
  turnById,
  withPageArrangements,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramPageSetup,
  type DiagramRasterAsset,
  type DiagramStep,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { cpSource, cpStep, fixedPicture, referencesSource, scenePicture, stepDiagramPicture } from '../document/diagramSteps.fixtures';
import { layoutDiagram } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { flowPagePlan } from './flowLane';
import { followPageArrangements, repackPages } from './pageArrangements';
import { pageLayoutFixtures } from './pageLayouts.fixtures';
import type { PlannedPage } from './pagePlan';
import { cellSlots, pageShape, sameCell, settlePlaces } from './stepPlaces';

/**
 * Which cell each step prints in, and the rules that clear a frame moved by
 * hand. On a grid, Decision 1A's: kept while its step stays in its cell, and
 * sent home when the cell changes, whatever changed it (`implementation-plans/
 * diagram-page-overrides.md`, "When an override clears"), one case per row
 * of the clearing table. In the flow (Zach, 2026-10-13): kept while its step
 * stays on its page and in its band — an edit sends home only the frames of
 * steps it takes off their page, and the band is judged as the page's packing
 * is adopted (`repackedFrames.test.ts`).
 */

describe('cellSlots', () => {
  it.each(pageLayoutFixtures().map(({ name, document }) => [name, document] as const))(
    'puts every step in the cell the layout does: %s',
    (_name, document) => {
      const cells = cellSlots(document);
      const pages = layoutDiagram(document, estimateTextSetter).pages;
      expect(cells.pages).toEqual(pages.map((page) => page.cells.map((cell) => cell.stepId)));
      for (const [index, page] of pages.entries()) {
        page.cells.forEach((cell, k) => expect(cells.slots.get(cell.stepId)).toEqual({ page: index, first: page.cells[0]!.stepId, k }));
      }
      expect(cells.slots.size).toBe(stepsOf(document).length);
    }
  );

  it('keeps a step in its cell while its place on its page holds, the page keeping its number or the step it starts with', () => {
    const two = (ids: readonly string[], page: Partial<DiagramPageSetup> = {}) =>
      cellSlots(setPageSetup(insertSteps(createDiagram(), ids.map((id) => cpStep(id)), 0), { layout: 'grid', columns: 2, rows: 1, ...page }));
    const was = two(['a', 'b', 'c', 'd']);
    expect(sameCell(was, was, 'b')).toBe(true);
    expect(sameCell(was, was, 'gone')).toBe(false);
    // Swapped on its page: another place there.
    expect(sameCell(was, two(['a', 'b', 'd', 'c']), 'd')).toBe(false);
    // b and c swap pages: page two starts with b now but keeps its number, so d is in its cell; c is not.
    expect(sameCell(was, two(['a', 'c', 'b', 'd']), 'd')).toBe(true);
    expect(sameCell(was, two(['a', 'c', 'b', 'd']), 'c')).toBe(false);
    // Another shape or layout is another cell.
    expect(sameCell(was, two(['a', 'b', 'c', 'd'], { columns: 1, rows: 2 }), 'b')).toBe(false);
    expect(sameCell(was, two(['a', 'b', 'c', 'd'], { layout: 'flow' }), 'b')).toBe(false);
  });

  it('follows a page renumbered by a page break, by the step it starts with', () => {
    const steps = ['a', 'b', 'c', 'd'].map((id) => ({ ...cpStep(id), breakBefore: id === 'c' }));
    const before = setPageSetup(insertSteps(createDiagram(), steps, 0), { layout: 'grid', columns: 2, rows: 1 });
    // A step put in at the front adds a page: c's is page three now, and still starts with c.
    const after = insertSteps(before, [cpStep('x')], 0);
    expect(cellSlots(after).slots.get('d')).toEqual({ page: 2, first: 'c', k: 1 });
    expect(sameCell(cellSlots(before), cellSlots(after), 'd')).toBe(true);
    expect(sameCell(cellSlots(before), cellSlots(after), 'b')).toBe(false);
  });

  it('reads the rows a grid page’s title block takes from its plan, not from how many rows it lists', () => {
    const page: PlannedPage = { steps: [0], firstStepId: 'a', ownCount: false, capacity: 9, layoutCount: 9, rows: 3, titleBlockRows: 0, rowCounts: [3], columns: 3 };
    // A page listing fewer rows than it is cut into has no block above its cells unless its plan says so.
    expect(pageShape(page, 'grid')).toBe('3x3');
    expect(pageShape({ ...page, titleBlockRows: 1, rowCounts: [3, 3] }, 'grid')).toBe('3x3-1');
  });
});

/** An upload's table entry: what a step made from it, or given it, refers to. */
const RASTER: DiagramRasterAsset = { id: 'asset-1', kind: 'raster', src: 'data:image/png;base64,AA==', widthPx: 20, heightPx: 10, bytes: 24 };

/** The placement every step starts with: a frame moved, two parts moved, a pin. */
const PLACE: DiagramStepPlace = { frame: [2, 1], number: [1, 0], text: [0, 1.5], scale: { mmPerUnit: 0.3 } };
const { frame: _frame, ...PARTS } = PLACE;

/**
 * Steps `s0`… on a 3 × 3 grid, each placed: two full pages and a third
 * started by a page break at `s13` — so a shift from page one stops at the
 * end of page two. No title block unless a case asks for one.
 */
function placed(count = 16, page: Partial<DiagramPageSetup> = {}, breaks: readonly number[] = [13]): DiagramDocument {
  const steps = Array.from({ length: count }, (_, index) => ({ ...cpStep(`s${index}`), place: PLACE, breakBefore: breaks.includes(index) }));
  return setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'grid',
    columns: 3,
    rows: 3,
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    ...page,
  });
}

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `s${from + index}`);

/**
 * What settling `after` against `before` did: the steps whose frames went
 * home, in order; checked on the way that it touched nothing else — every
 * pin and part offset, and every step it did not send home, as they were.
 */
function settle(before: DiagramDocument, after: DiagramDocument): string[] {
  const { document, settled } = settlePlaces(before, after);
  const home: string[] = [];
  for (const [index, entry] of document.steps.entries()) {
    const edited = after.steps[index]!;
    if (isTurn(entry) || isTurn(edited)) {
      expect(entry).toBe(edited);
      continue;
    }
    if (entry === edited) continue;
    expect(edited.place?.frame).toBeDefined();
    const { frame: _home, ...rest } = edited.place ?? {};
    expect(entry.place).toEqual(Object.keys(rest).length > 0 ? rest : undefined);
    expect({ ...entry, place: undefined }).toEqual({ ...edited, place: undefined });
    home.push(entry.id);
  }
  expect(settled).toBe(home.length);
  if (settled === 0) expect(document).toBe(after);
  return home;
}

describe('settlePlaces: a frame goes home when its step lands in another cell (Decision 1A)', () => {
  it('its own move: Move Earlier, Move to, a reorder — and the steps it passed, whose cells it took', () => {
    const before = placed();
    expect(settle(before, moveStep(before, 's5', stepIndex(before, 's4')))).toEqual(['s5', 's4']);
    // Moved to be step 2: it, and every step it passed, in their new order.
    expect(settle(before, moveStep(before, 's7', indexForStepNumber(before, 's7', 2)))).toEqual(['s7', ...ids(1, 6)]);
    // Across the page: every step it passed changed cell. Page two starts with another step now, but
    // keeps its number, and s12 its place on it.
    const across = moveStep(before, 's2', stepIndex(before, 's11'));
    expect(settle(before, across).sort()).toEqual(ids(2, 11).sort());
  });

  it('a swap that changes the step a page starts with sends home only the two that swapped', () => {
    const before = placed();
    // Move Earlier on a page's second step.
    expect(settle(before, moveStep(before, 's1', stepIndex(before, 's0')))).toEqual(['s1', 's0']);
    expect(settle(before, moveStep(before, 's10', stepIndex(before, 's9')))).toEqual(['s10', 's9']);
    // Move Later on a page's last step, which then starts the next page.
    expect(settle(before, moveStep(before, 's8', stepIndex(before, 's9')))).toEqual(['s9', 's8']);
  });

  it.each([
    ['a step inserted', (document: DiagramDocument) => insertSteps(document, [createStep(() => 'new')], 2)],
    ['a step duplicated', (document: DiagramDocument) => duplicateStep(document, 's1', () => 'copy')!.document],
    ['a picture uploaded', (document: DiagramDocument) => insertPictureSteps(document, [RASTER], 2, () => 'upload').document],
    [
      'a card pulled from References',
      (document: DiagramDocument) =>
        pullReferencesSteps(document, [{ source: referencesSource(), picture: stepDiagramPicture(), text: 'Fold.' }], { kind: 'after', stepId: 's1' }, { newId: () => 'card' }).document,
    ],
  ])('%s before it, as far as the shift reaches: a page that ends in a page break stops it', (_label, edit) => {
    const before = placed();
    // s2–s8 move along page one; s8 goes to page two, which now starts at it, so all of page two is new.
    expect(settle(before, edit(before))).toEqual(ids(2, 12));
  });

  it.each([
    ['deleted', (document: DiagramDocument) => removeSteps(document, ['s1'])],
    [
      'made into a turn',
      (document: DiagramDocument) => stepToTurn({ ...document, steps: document.steps.map((each) => (each.id === 's1' ? { ...createStep(() => 's1'), place: PLACE } : each)) }, 's1', { kind: 'turn-over', axis: 'vertical' })!.document,
    ],
  ])('a step %s before it, as far as the shift reaches', (_label, edit) => {
    const before = placed();
    expect(settle(before, edit(before))).toEqual(ids(2, 12));
  });

  it('a duplicate’s copy keeps no frame offset: it is a new step, with no cell to keep', () => {
    const before = placed(4, {}, []);
    const { document } = duplicateStep(before, 's3', () => 'copy')!;
    expect(stepById(document, 'copy')!.place).toEqual(PARTS);
    // Even given one, it would go: a step that was in no cell before is not in the one it had.
    const framed = { ...document, steps: document.steps.map((each) => (each.id === 'copy' ? { ...each, place: PLACE } : each)) };
    expect(settle(before, framed)).toEqual(['copy']);
  });

  it('keeps every frame through steps added, deleted or moved after it', () => {
    const before = placed();
    expect(settle(before, insertSteps(before, [createStep(() => 'end')], before.steps.length))).toEqual([]);
    expect(settle(before, removeSteps(before, ['s15']))).toEqual([]);
    // Moved among themselves after the others: only the two that swapped.
    expect(settle(before, moveStep(before, 's15', stepIndex(before, 's14')))).toEqual(['s15', 's14']);
  });

  it('keeps every frame through a turn added, removed or moved: a turn takes no cell', () => {
    const before = placed();
    const turned = insertSteps(before, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'turn')], 3);
    expect(settle(before, turned)).toEqual([]);
    expect(settle(turned, moveStep(turned, 'turn', 10))).toEqual([]);
    expect(settle(turned, removeSteps(turned, ['turn']))).toEqual([]);
  });

  it('a new page started at or before it on its page, or cleared where the shift reaches it', () => {
    const before = placed();
    // At s4: page one ends at s3, and s4–s12 make a new page two, the break at s13 still holding.
    expect(settle(before, setStepBreakBefore(before, 's4', true))).toEqual(ids(4, 12));
    // On the step itself, which then starts the page.
    expect(settle(before, setStepBreakBefore(before, 's11', true))).toEqual(ids(11, 12));
    // Cleared at s13: s13–s15 run on page two.
    expect(settle(before, setStepBreakBefore(before, 's13', false))).toEqual(ids(13, 15));
  });

  it('keeps a frame through a new page started on a later step, or set where a page already starts', () => {
    const before = placed();
    // At s7: s0–s6 stay where they were.
    expect(settle(before, setStepBreakBefore(before, 's7', true))).toEqual(ids(7, 12));
    // s9 starts page two already: saying so moves no step.
    expect(settle(before, setStepBreakBefore(before, 's9', true))).toEqual([]);
  });

  it.each([
    ['the columns change', 'grid', { columns: 4 }],
    ['the rows change', 'grid', { rows: 2 }],
    ['the grid becomes the flow', 'grid', { layout: 'flow' }],
    ['the flow becomes the grid', 'flow', { layout: 'grid' }],
  ] as const)('sends every frame home when %s: every cell changed shape', (_label, layout, patch) => {
    const before = placed(16, { layout });
    expect(settle(before, setPageSetup(before, patch))).toEqual(ids(0, 15));
  });

  it('sends home, when a flow diagram’s steps per page change, only the frames of steps that change page', () => {
    // Nine a page, s13 starting a page: s0–s8 | s9–s12 | s13–s15. At twelve: s0–s11 | s12 | s13–s15. s9–s11 move up
    // to page one; s12 stays on page two by its number, s13–s15 on page three.
    const before = placed(16, { layout: 'flow' });
    expect(settle(before, setPageSetup(before, { stepsPerPage: 12 }))).toEqual(ids(9, 11));
    // 7 and 8 steps are both 3 rows on A4 portrait: s0–s6 | s7–s13 | s14–s15 become s0–s7 | s8–s15.
    const seven = placed(16, { layout: 'flow', stepsPerPage: 7 }, []);
    expect(settle(seven, setPageSetup(seven, { stepsPerPage: 8 }))).toEqual(['s7', 's14', 's15']);
  });

  it.each([
    ['paper size', { size: 'letter' }],
    ['orientation', { orientation: 'landscape' }],
    ['margin', { marginMm: 25 }],
    ['title shown', { showTitle: false }],
    ['page numbers', { pageNumbers: { enabled: false, first: 4 } }],
    ['first page’s side', { firstPageSide: 'right' }],
    ['band count', { flowBands: 3 }],
    ['steps in bends', { flowBendSteps: false }],
    ['scale steadiness', { flowSteadiness: 0.5 }],
  ] as const)('keeps every flow frame when the %s changes: every page is packed afresh, its steps on it, their bands for the layout to judge', (_label, patch) => {
    const before = placed(16, { layout: 'flow' });
    expect(settle(before, setPageSetup(before, patch as Partial<DiagramPageSetup>))).toEqual([]);
  });

  it('keeps a grid page’s frames through the paper, and a flow page’s through the grid’s columns and rows', () => {
    // The grid's shape is its own, whatever the paper.
    const grid = placed(16);
    expect(settle(grid, setPageSetup(grid, { orientation: 'landscape' }))).toEqual([]);
    expect(settle(grid, setPageSetup(grid, { size: 'letter', marginMm: 25 }))).toEqual([]);
    // A flow page's columns and rows say nothing: its steps per page do.
    const before = placed(16, { layout: 'flow' });
    expect(settle(before, setPageSetup(before, { columns: 4, rows: 2 }))).toEqual([]);
  });

  it('sends home every frame on a grid’s first page when the title block comes or goes: its cells move under the block', () => {
    // 3 × 3, s13 starting a page: s0–s8 | s9–s12 | s13–s15. The block takes the first page's top row: s0–s5 move
    // a row down, s6–s8 go on to page two and s9–s12 along it; s13–s15 keep their cells on page three.
    const off = placed(16, { titleBlock: { enabled: false, heightShare: 0.27 } });
    const on = setPageSetup(off, { titleBlock: { enabled: true, heightShare: 0.27 } });
    expect(cellSlots(on).pages.map((page) => page.length)).toEqual([6, 7, 3]);
    expect(settle(off, on)).toEqual(ids(0, 12));
    expect(settle(on, off)).toEqual(ids(0, 12));
    // Without the block, a grid page's shape is its columns and rows, as it always was.
    expect(cellSlots(off).shapes).toEqual(['3x3', '3x3', '3x3']);
  });

  it('keeps a flow page’s frames when a page added after it makes it hand over at its spine: it is packed afresh, its steps on it', () => {
    // Its rows are three either way, but it is no longer the last page, and hands over at its spine: it is packed afresh.
    const one = placed(9, { layout: 'flow' }, []);
    expect(flowPagePlan(0, 1, 'left', 3)).not.toEqual(flowPagePlan(0, 2, 'left', 3));
    expect(settle(one, insertSteps(one, [createStep(() => 'next')], one.steps.length))).toEqual([]);
  });

  it('keeps a flow page’s frames when an edit earlier renumbers it: it is the page that starts with the same step', () => {
    // Breaks at s1 and s3 add two pages in front of the one s4 starts: the fourth now, packed afresh, as a grid's is
    // the same page (above). s1–s3 leave page one for pages of their own.
    const before = placed(16, { layout: 'flow' }, [4, 13]);
    expect(cellSlots(before).slots.get('s5')).toEqual({ page: 1, first: 's4', k: 1 });
    const after = setStepBreakBefore(setStepBreakBefore(before, 's1', true), 's3', true);
    expect(cellSlots(after).slots.get('s5')).toEqual({ page: 3, first: 's4', k: 1 });
    expect(settle(before, after)).toEqual(ids(1, 3));
  });

  it('keeps the frames of the flow page a turn is added to, moved on or taken from: every step stays on its page', () => {
    const before = placed(16, { layout: 'flow' });
    const turned = insertSteps(before, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'turn')], stepIndex(before, 's3'));
    expect(settle(before, turned)).toEqual([]);
    expect(settle(turned, moveStep(turned, 'turn', stepIndex(turned, 's10') - 1))).toEqual([]);
    expect(settle(turned, removeSteps(turned, ['turn']))).toEqual([]);
    expect(settle(before, insertSteps(before, [createTurn({ kind: 'turn-over', axis: 'vertical' }, () => 'end')], before.steps.length))).toEqual([]);
  });

  it('keeps the frames of a flow page Re-pack Page lets go of: they go home only as its packing changes their bands', () => {
    const before = withPageArrangements(placed(16, { layout: 'flow' }), packedFor(placed(16, { layout: 'flow' })));
    expect(settle(before, followPageArrangements(before, repackPages(before, 1)))).toEqual([]);
    expect(settle(before, followPageArrangements(before, repackPages(before, null)))).toEqual([]);
    // Grid pages hold no arrangement: they keep their own rule.
    const grid = placed(16);
    expect(settle(grid, repackPages(grid, null))).toEqual([]);
  });

  it('keeps every flow frame through an edit that leaves every page’s signature alone: a caption, a picture, a mark, a pin, the title', () => {
    const before = placed(16, { layout: 'flow' });
    const label = { id: 'label-1', kind: 'label' as const, from: [0.5, 0.5] as [number, number], to: [0.5, 0.5] as [number, number], text: 'A' };
    const edits = [
      setStepText(before, 's3', 'A much longer instruction that will be cut to its box at last.'),
      setStepPicture(before, 's3', RASTER),
      removeStepPicture(before, 's4'),
      editStepAnnotations(before, 's3', () => [label]),
      setUploadPose(setStepPicture(before, 's3', RASTER), 's3', { rotationQuarterTurns: 1, mirrored: true }),
      setDiagramTitle(before, 'Swan'),
      setDiagramStyle(before, { preset: 'default' }),
      setPageSetup(before, { pageNumbers: { enabled: true, first: 4 } }),
      { ...before, steps: before.steps.map((each) => (each.id === 's5' ? { ...each, place: { frame: [9, 9] as [number, number] } } : each)) },
    ];
    for (const after of edits) {
      expect(after).not.toBe(before);
      expect(settle(before, after)).toEqual([]);
    }
  });

  it('keeps a left page’s frames when a page added or removed after it changes its rows to hand over at its spine', () => {
    // 4 steps print in 2 rows on A4 upright; a left page that hands over at its spine takes an odd number, 3
    // (diagram-flow-pages.md, Decision 4), so it is packed afresh — its steps on it, their bands for the layout.
    const one = placed(4, { layout: 'flow', stepsPerPage: 4 }, []);
    expect(cellSlots(one).shapes).toEqual(['4/2']);
    const added = insertSteps(one, [createStep(() => 'next')], one.steps.length);
    expect(cellSlots(added).shapes).toEqual(['4/3', '4/2']);
    expect(settle(one, added)).toEqual([]);
    const two = placed(5, { layout: 'flow', stepsPerPage: 4 }, []);
    expect(settle(two, removeSteps(two, ['s4']))).toEqual([]);
  });

  it.each([
    ['path width', { pathWidthMm: 30 }],
    ['path colour', { pathColor: '#d6e8f5' }],
    ['path shown', { showPath: false }],
  ] as const)('keeps every flow frame through the %s', (_label, patch) => {
    const before = placed(16, { layout: 'flow' });
    expect(settle(before, setPageSetup(before, patch))).toEqual([]);
  });

  it.each([
    ['paper size', { size: 'letter' }],
    ['margin', { marginMm: 25 }],
    ['title shown', { showTitle: false }],
    ['page numbers', { pageNumbers: { enabled: false, first: 4 } }],
    ['packing', { flowNesting: 0.2, flowBands: 4 }],
  ] as const)('keeps every grid frame through the %s', (_label, patch) => {
    const before = placed();
    expect(settle(before, setPageSetup(before, patch as Partial<DiagramPageSetup>))).toEqual([]);
  });

  it('keeps every frame through the title, the style and an instruction', () => {
    const before = placed();
    expect(settle(before, setDiagramTitle(before, 'Swan'))).toEqual([]);
    expect(settle(before, setDiagramStyle(before, { preset: 'default' }))).toEqual([]);
    expect(settle(before, setStepText(before, 's3', 'A much longer instruction that will be cut to its box at last.'))).toEqual([]);
  });

  it('keeps all of it through a picture refreshed, recaptured, shown as another kind and back, re-posed or annotated', () => {
    const before = placed();
    const steps = (document: DiagramDocument) => stepsOf(document).map((step) => step.place);
    const refreshed = setLinkedPicture(before, 's2', { source: cpSource(), picture: scenePicture('scene-2') });
    const flat = { mode: 'folded-flat' as const, side: 'front' as const, rotationDeg: 0, foldCase: 1 };
    const shownAs = setLinkedPicture(refreshed, 's2', { source: cpSource(flat), picture: fixedPicture('flat-1') });
    const back = setLinkedPicture(shownAs, 's2', { source: cpSource(), picture: scenePicture('scene-3') });
    const label = { id: 'label-1', kind: 'label' as const, from: [0.5, 0.5] as [number, number], to: [0.5, 0.5] as [number, number], text: 'A' };
    const annotated = editStepAnnotations(back, 's2', () => [label]);
    const uploaded = setStepPicture(annotated, 's3', RASTER);
    const posed = setUploadPose(uploaded, 's3', { rotationQuarterTurns: 1, mirrored: true });
    const edits = [before, refreshed, shownAs, back, annotated, uploaded, posed];
    edits.slice(1).forEach((after, index) => {
      expect(after).not.toBe(edits[index]);
      expect(settle(edits[index]!, after)).toEqual([]);
      expect(steps(after)).toEqual(steps(before));
    });
  });

  it('takes the step’s placement with it when it is deleted or made into a turn', () => {
    // The last step, empty so that it can become a turn: no other step changes cell.
    const four = placed(4, {}, []);
    const before = { ...four, steps: four.steps.map((each) => (each.id === 's3' ? { ...createStep(() => 's3'), place: PLACE } : each)) };
    expect(stepById(settlePlaces(before, removeSteps(before, ['s3'])).document, 's3')).toBeNull();
    const turned = stepToTurn(before, 's3', { kind: 'turn-over', axis: 'vertical' }, () => 'turn-3')!.document;
    expect(Object.keys(turnById(settlePlaces(before, turned).document, 'turn-3')!)).not.toContain('place');
  });

  it('keeps all of it, the pin included, when the picture goes, changes kind or the step is enlarged: a pin of another kind sleeps', () => {
    const before = placed();
    const removed = removeStepPicture(before, 's2');
    expect(settle(before, removed)).toEqual([]);
    expect(stepById(removed, 's2')!.place).toEqual(PLACE);
    const uploaded = setStepPicture(before, 's2', RASTER);
    expect(settle(before, uploaded)).toEqual([]);
    expect(stepById(uploaded, 's2')!.place).toEqual(PLACE);
    const enlarged = { ...before, steps: before.steps.map((each) => (each.id === 's2' ? { ...each, zoom: { from: 'area-1', shape: 'circle' as const } } : each)) };
    expect(settle(before, enlarged)).toEqual([]);
  });

  it('touches nothing when no step has its frame moved, however much the cells change', () => {
    const plain = (document: DiagramDocument) => ({
      ...document,
      steps: document.steps.map((each) => (isTurn(each) ? each : { ...each, place: PARTS })),
    });
    const before = plain(placed());
    const after = setPageSetup(insertSteps(before, [createStep(() => 'new')], 0), { columns: 5 });
    expect(settlePlaces(before, after).document).toBe(after);
  });

  it('carries a newer build’s step as it is', () => {
    const locked: DiagramStep = { ...createStep(() => 'locked'), unknown: { id: 'locked', place: { frame: [4, 4] } } };
    const before = insertSteps(placed(), [locked], 0);
    const after = insertSteps(before, [createStep(() => 'new')], 0);
    expect(stepById(settlePlaces(before, after).document, 'locked')).toBe(locked);
  });

  it('sends a newer build’s frame home too, keeping the rest of its placement as it came', () => {
    const newer: DiagramStep = { ...cpStep('newer'), placeNewer: { frame: [3, 3], tilt: 1 } };
    const before = insertSteps(placed(4, {}, []), [newer], 0);
    // In its cell, it is kept as it came.
    const kept = settlePlaces(before, setStepText(before, 's2', 'Fold.'));
    expect(stepById(kept.document, 'newer')).toBe(newer);
    // Moved to another cell, its frame goes home with the others, and is counted.
    const { document, settled } = settlePlaces(before, insertSteps(before, [createStep(() => 'new')], 0));
    expect(stepById(document, 'newer')!.placeNewer).toEqual({ tilt: 1 });
    expect(settled).toBe(5);
  });
});

/** What a layout of a flow `document` might pack, as the store keeps it: every page held, every step in band 0. */
function packedFor(document: DiagramDocument): Record<string, DiagramPageArrangement> {
  const slots = cellSlots(document);
  return Object.fromEntries(
    slots.pages.map((page, index) => [
      page[0]!,
      {
        signature: slots.signatures[index]!,
        k: 1,
        steps: Object.fromEntries(page.map((id, at) => [id, { box: [12 + 40 * at, 30, 38, 60], scale: { frameMm: 30 }, band: 0 }])),
      },
    ])
  );
}

describe('settlePlaces on flow pages packed and held (Zach, 2026-10-13: a frame stays while its step stays on its page and band)', () => {
  /** Twelve flow steps `s0`…, five a page — s0–s4 | s5–s9 | s10–s11 — every frame moved, every page packed and held. */
  const held = () => {
    const before = placed(12, { layout: 'flow', stepsPerPage: 5 }, []);
    return withPageArrangements(before, packedFor(before));
  };
  /** An edit as the store's `commit` lands it: arrangements following their pages, then frames off their page sent home. */
  const landed = (before: DiagramDocument, after: DiagramDocument) => settle(before, followPageArrangements(before, after));

  it('keeps the frames of a page whose structure an edit changes while its steps stay on it; sends home the step it pushes off', () => {
    const document = held();
    // A step put in before s8: page two is s5–s7, the new step and s8; s9 is pushed onto page three.
    const after = insertSteps(document, [cpStep('new')], stepIndex(document, 's8'));
    expect(cellSlots(after).pages).toEqual([ids(0, 4), ['s5', 's6', 's7', 'new', 's8'], ids(9, 11)]);
    expect(landed(document, after)).toEqual(['s9']);
    // Page two keeps its arrangement, which no longer holds it: the layout packs it afresh, and judges the bands.
    const followed = followPageArrangements(document, after);
    expect(followed.pageArrangements!.s5).toBe(document.pageArrangements!.s5);
  });

  it('keeps the frames of a page a step is put in at the start of: its arrangement follows it to its new first step', () => {
    const document = held();
    const after = insertSteps(document, [cpStep('new')], stepIndex(document, 's5'));
    expect(cellSlots(after).pages).toEqual([ids(0, 4), ['new', ...ids(5, 8)], ids(9, 11)]);
    expect(landed(document, after)).toEqual(['s9']);
    expect(Object.keys(followPageArrangements(document, after).pageArrangements!)).toEqual(['s0', 'new', 's9']);
  });

  it('sends home a step pulled back onto the page before, and keeps the rest of its page’s', () => {
    const document = held();
    // s3 removed: s5 is pulled onto page one and s10 onto page two; page two now starts with s6, page three with s11.
    const after = removeSteps(document, ['s3']);
    expect(cellSlots(after).pages).toEqual([['s0', 's1', 's2', 's4', 's5'], ids(6, 10), ['s11']]);
    expect(landed(document, after)).toEqual(['s5', 's10']);
  });

  it('keeps a frame where no arrangement ever placed the step while it stays on the page of its number, or that starts with it', () => {
    // No page packed and adopted: no band is known, and a page is the same page as a grid's is.
    const before = placed(12, { layout: 'flow', stepsPerPage: 5 }, []);
    expect(settle(before, insertSteps(before, [cpStep('new')], stepIndex(before, 's5')))).toEqual(['s9']);
  });
});

describe('settlePlaces against the printed grid', () => {
  /** Where each step prints: its page, the step that page starts with, and its cell's corner on the page. */
  const printedAt = (document: DiagramDocument) =>
    new Map(
      layoutDiagram(document, estimateTextSetter).pages.flatMap((page, index) =>
        page.cells.map((cell) => [cell.stepId, { page: index, first: page.cells[0]!.stepId, at: `${cell.cellMm.x.toFixed(3)} ${cell.cellMm.y.toFixed(3)}` }] as const)
      )
    );

  it('sends a frame home exactly when its step prints elsewhere on its page, or on a page that is not its own renumbered', () => {
    let seed = 20261007;
    const pick = (count: number) => {
      seed = (seed * 16807) % 2147483647;
      return Math.floor((seed / 2147483647) * count);
    };
    const framed = (document: DiagramDocument) => ({ ...document, steps: document.steps.map((each) => (isTurn(each) ? each : { ...each, place: PLACE })) });
    let before = placed(16, {}, [13]);
    let sentHome = 0;
    let kept = 0;
    for (let round = 0; round < 80; round += 1) {
      const steps = stepsOf(before);
      const id = steps[pick(steps.length)]!.id;
      const edits = [
        () => moveStep(before, id, pick(before.steps.length)),
        () => insertSteps(before, [{ ...cpStep(`new-${round}`), place: PLACE }], pick(before.steps.length + 1)),
        () => (steps.length > 6 ? removeSteps(before, [id]) : moveStep(before, id, 0)),
        () => setStepBreakBefore(before, id, !stepById(before, id)!.breakBefore),
      ];
      const after = edits[pick(edits.length)]!();
      const [was, now] = [printedAt(before), printedAt(after)];
      const { document } = settlePlaces(before, after);
      for (const step of stepsOf(document)) {
        const [from, to] = [was.get(step.id), now.get(step.id)!];
        const same = from !== undefined && from.at === to.at && (from.page === to.page || from.first === to.first);
        expect({ step: step.id, round, kept: step.place?.frame !== undefined }).toEqual({ step: step.id, round, kept: same });
        if (same) kept += 1;
        else sentHome += 1;
      }
      before = framed(document);
    }
    // The walk sent frames home, and kept them through edits too.
    expect(sentHome).toBeGreaterThan(100);
    expect(kept).toBeGreaterThan(500);
  });
});
