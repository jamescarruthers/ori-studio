import { beforeAll, describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  type DiagramDocument,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { face, sceneOf } from '../../lib/paper/paperScene.fixtures';
import { storedSceneJson } from '../document/diagramFile';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS, fixtureSubsetter } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import { diagramLayoutSteps, preparedPages } from './diagramPages';
import { layoutDiagramPages } from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { pageOffset, partBox, partPolygons } from './pagePlacement';
import { laneCrosses } from './flowLane';
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
    expect(b[1]!.clashes?.length).toBeGreaterThan(0);
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
  expect(left.flow!.spineOut).toBe(right.flow!.spineIn);
  expect(left.band!.curves.at(-1)!.to.y).toBe(right.band!.from.y);
  // Repeatable adversarial moves: every introduced crossing is reported.
  for (let n = 0; n < 30; n++) {
    const shifted = previewPlacement(base, 's2', 'picture', Math.sin(n * 3.1) * 160, Math.cos(n * 2.7) * 200);
    if (laneCrosses(shifted.pages[0]!.band!))
      expect(shifted.pages[0]!.cells.find((c) => c.stepId === 's2')!.clashes).toContainEqual({ kind: 'path' });
  }
});

it('returns to the identical printed page when a pin and offsets are cleared', () => {
  const doc = document({ scale: { mmPerUnit: 80 }, frame: [3, 4], text: [4, -2] });
  const cleared = { ...doc, steps: doc.steps.map((step) => ({ ...step, place: undefined })) };
  expect(prepare(cleared).compose(0).svg).toBe(prepare(document()).compose(0).svg);
});

it('does not call an empty corner of marked diamond paper an overlap, but detects ink collisions', () => {
  const sceneJson = storedSceneJson(sceneOf([face([[[50, 0], [100, 50], [50, 100], [0, 50]]])]))!;
  const step = { ...cpStep('diamond'), picture: { kind: 'scene' as const, sceneJson, paperScale: 100, styleKey: null, key: 'diamond' },
    annotations: [{ id: 'push', kind: 'push-arrow' as const, from: [.95, .5] as [number, number], to: [.8, .5] as [number, number] }] };
  const doc = setPageSetup(insertSteps(createDiagram(), [step], 0), { layout: 'grid', columns: 1, rows: 1 });
  const pages = prepare(doc), base = pages.layout, cell = base.pages[0]!.cells[0]!;
  const ink = (each: typeof cell) => partPolygons(each, 'picture', pages.footprints);
  expect(ink(cell)).toHaveLength(2);
  const picture = partBox(cell, 'picture'), number = partBox(cell, 'number');
  const preview = (part: 'number' | 'picture', dx: number, dy: number, factor = 1) =>
    previewPlacement(base, step.id, part, dx, dy, factor, pages.footprints).pages[0]!.cells[0]!;
  const empty = preview('number', picture.x + 2 - number.x, picture.y + 2 - number.y);
  expect(empty.clashes?.some(c => c.kind === 'parts') ?? false).toBe(false);
  // Its box alone, without the footprints, calls the empty corner an overlap.
  const boxed = previewPlacement(base, step.id, 'number', picture.x + 2 - number.x, picture.y + 2 - number.y).pages[0]!.cells[0]!;
  expect(boxed.clashes).toContainEqual({ kind: 'parts' });
  const onPaper = preview('number', picture.x + picture.w / 2 - number.x, picture.y + picture.h / 2 - number.y);
  expect(onPaper.clashes).toContainEqual({ kind: 'parts' });
  const moved = preview('picture', 5, 3);
  expect(ink(moved)[0]![0]!.x).toBeCloseTo(ink(cell)[0]![0]!.x + 5);
  expect(ink(moved)[0]![0]!.y).toBeCloseTo(ink(cell)[0]![0]!.y + 3);
  const resized = preview('picture', 0, 0, 1.5);
  const xs = (polygons: ReturnType<typeof ink>) => polygons.flat().map(p => p.x);
  expect(Math.max(...xs(ink(resized))) - Math.min(...xs(ink(resized)))).toBeCloseTo((Math.max(...xs(ink(cell))) - Math.min(...xs(ink(cell)))) * 1.5);
});

it('works a footprint out only for a placed step and one whose box it meets', () => {
  const calls: string[] = [];
  const doc = setPageSetup(
    insertSteps(createDiagram(), Array.from({ length: 4 }, (_, i) => ({ ...cpStep(`s${i}`), ...(i === 1 ? { place: { frame: [1, 0] as [number, number] } } : {}) })), 0),
    { layout: 'grid', columns: 2, rows: 2 },
  );
  const steps = diagramLayoutSteps(doc).map((step) => ({
    ...step,
    footprints: step.footprints && (() => (calls.push(step.id), step.footprints!())),
  }));
  const plain = layoutDiagramPages(steps, doc.page, doc.title, estimateTextSetter);
  // Only the placed step's own: nudged 1 mm, its boxes meet no other step's.
  expect(calls).toEqual(['s1']);
  // Its picture moved onto its neighbour's, the neighbour's too, to tell its paper from its box's corners.
  calls.length = 0;
  const [left, right] = plain.pages[0]!.cells;
  const over = right!.drawMm.x - left!.drawMm.x;
  // A little lower than the neighbour's, clear of its number: its number does not decide the clash first.
  const onto = steps.map((step) => (step.id === 's1' ? { ...step, place: { picture: [-over, 10] as [number, number] } } : step));
  layoutDiagramPages(onto, doc.page, doc.title, estimateTextSetter);
  expect(calls.sort()).toEqual(['s0', 's1']);
});

it('clears an old path warning when a moved step returns to a clear route', () => {
  const doc = setPageSetup(insertSteps(createDiagram(), Array.from({ length: 9 }, (_, i) => cpStep(`s${i}`)), 0), { layout: 'flow', stepsPerPage: 9 });
  const base = prepare(doc).layout;
  base.pages[0]!.cells[1]!.clashes = [{ kind: 'path' }];
  const next = previewPlacement(base, 's1', 'frame', 0, 0);
  expect(next.pages[0]!.cells[1]!.clashes?.some(c => c.kind === 'path') ?? false).toBe(false);
});
