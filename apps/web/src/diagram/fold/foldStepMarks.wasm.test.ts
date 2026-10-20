import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creasePatternPaperScene, FOLD_PANE_DISPLAY_DEFAULT } from '../../fold/canvas/foldPaneScenes';
import type { FoldOp, FoldPointRef, FoldRef } from '../../fold/document/foldSequenceDocument';
import { SQUARE_PAPER } from '../../fold/document/foldSequenceDocument';
import { createFoldEngineCalls } from '../../fold/engine/foldEngineCalls';
import { createFoldEngineCompoundCalls } from '../../fold/engine/foldEngineCompoundCalls';
import type { FoldActionGeometry, FoldScene } from '../../fold/engine/foldEngineWire';
import { foldStepCreaseDiagram } from '../../fold/io/foldStepPages';
import { prepareRepeat, type RepeatSourceStep } from '../../fold/repeat/repeatPreparation';
import { foldStateFrame, sheetToScene } from '../../fold/sequence/foldStateFrame';
import type { Point } from '../../lib/geometry';
import { FOLD_PULL_RENDER } from './foldPull';
import { foldStepAction } from './foldStepMarkPlan';
import { foldStepPicture } from './foldStepPicture';

/**
 * A Fold step's marks in the Diagram drawn from the real engine's picture of
 * it and the real states either side: a rabbit ear's every crease and the
 * flap swung over, the circles and arrows the axioms place, and a Repeat's
 * every crease as its crease pattern's instruction. Skipped when the bridge
 * has not been built.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const FIXTURES = resolve(process.cwd(), '../../tests/fixtures/fold-examples');
const available = existsSync(WASM);

async function engine() {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  const raw = new wasm.FoldEngine();
  return { ...createFoldEngineCalls(raw), ...createFoldEngineCompoundCalls(raw) };
}
type Engine = Awaited<ReturnType<typeof engine>>;

function landed<T extends { status: string }>(outcome: T): Extract<T, { status: 'ok' }> {
  if (outcome.status !== 'ok') throw new Error(JSON.stringify(outcome));
  return outcome as Extract<T, { status: 'ok' }>;
}

/** One step of `state`, with its picture and the states either side: an axiom's line at the root nearest `near` (a line's normal). */
function stepOf(calls: Engine, state: number, op: FoldOp, near?: readonly [number, number]) {
  let choices;
  if ('line' in op && op.line.via === 'axiom') {
    const { candidates } = landed(calls.axiomCandidates(state, op.line));
    const score = (n: readonly [number, number]) => (near ? Math.abs(n[0] * near[0] + n[1] * near[1]) : 0);
    choices = { root: [...candidates].sort((a, b) => score(b.line.n) - score(a.line.n))[0]!.line };
  }
  const child = landed(calls.step(state, op, choices));
  const action = landed(calls.stepAction(child.state)).action as FoldActionGeometry;
  const parent = calls.scene(state);
  return { state: child.state, parent, child: calls.scene(child.state), action, summary: child.summary };
}

const pt = (x: number, y: number): FoldPointRef => ({ kind: 'point', at: [x, y] });
const edge = (a: [number, number], b: [number, number]): FoldRef => ({ kind: 'edge', a, b });
const all = { scope: 'all' } as const;
const at = (scene: FoldScene, x: number, y: number): Point => {
  const point = sheetToScene(foldStateFrame(scene), [x, y])!;
  return { x: point[0], y: point[1] };
};
const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe.skipIf(!available)('a Fold step’s marks in the Diagram, from the real engine', () => {
  it('draws every crease of a rabbit ear — three valley folds to the corners, the mountain fold to the edge — and the ear swung over', async () => {
    const calls = await engine();
    const whale = JSON.parse(readFileSync(resolve(FIXTURES, 'rabbit-ear-precreased-whale.json'), 'utf8'));
    let state = landed(calls.sheet(whale.paper)).state;
    for (const step of whale.steps) state = landed(calls.step(state, step.op, step.choices)).state;
    const ear = stepOf(calls, state, whale.op);
    // The engine draws one crease of it.
    expect(ear.action.spans).toHaveLength(1);
    const placed = foldStepAction(ear.action, { op: whale.op, parent: ear.parent, child: ear.child });
    const directions = placed.spans.map((span) => span.direction);
    expect(directions.filter((direction) => direction === 'valley')).toHaveLength(3);
    expect(directions.filter((direction) => direction === 'mountain')).toHaveLength(1);
    expect(placed.spans.every((span) => !span.hidden)).toBe(true);
    // Every one meets the others at the incenter; each valley runs on to a corner of the triangle.
    const corners = (whale.op.corners as [number, number][]).map(([x, y]) => at(ear.parent, x, y));
    const ends = placed.spans.flatMap((span) => [span.from, span.to]);
    const centre = ends.find((end) => ends.filter((other) => near(other, end)).length === 4)!;
    expect(centre).toBeDefined();
    for (const span of placed.spans.filter((each) => each.direction === 'valley')) {
      const far = near(span.from, centre) ? span.to : span.from;
      expect(corners.some((corner) => near(corner, far))).toBe(true);
    }
    // The arrow: from the corner that moves — the ear's tip, which its valley ridge runs to — to where it lands.
    const tip = corners.find((corner) => near(corner, placed.grip!.at));
    expect(tip).toBeDefined();
    expect(length(placed.grip!.at, placed.grip!.image)).toBeGreaterThan(0.5);
    const marks = foldStepPicture(
      { shown: ear.parent, own: { scene: ear.child, step: ear.summary.step, sheet: ear.summary.sheet }, moment: 'before', action: placed },
      FOLD_PULL_RENDER
    ).marks;
    // Seen from the back of the paper, as the whale starts: valleys and the mountain, as Lang draws a rabbit ear.
    expect(marks.map((mark) => mark.kind).sort()).toEqual(['mountain-line', 'valley-arrow', 'valley-line', 'valley-line', 'valley-line']);
  });

  it('circles a segment through two points at its ends and draws no arrow; a point onto a point circled and joined', async () => {
    const calls = await engine();
    const sheet = landed(calls.sheet(SQUARE_PAPER)).state;
    const segment: FoldOp = {
      kind: 'precrease', direction: 'valley', line: { via: 'axiom', axiom: 1, inputs: [pt(1, 1), pt(0.5, 0)] },
      moving: [0.9, 0.2], seed: all, extent: { kind: 'segment', from: pt(1, 1), to: pt(0.5, 0) },
    };
    const one = stepOf(calls, sheet, segment);
    const drawn = foldStepAction(one.action, { op: segment, parent: one.parent, child: one.child });
    expect(drawn.grip).toBeNull();
    expect(drawn.rings).toHaveLength(2);
    expect(drawn.rings!.some((ring) => near(ring.at, at(one.parent, 1, 1)))).toBe(true);
    expect(drawn.rings!.some((ring) => near(ring.at, at(one.parent, 0.5, 0)))).toBe(true);
    const marks = foldStepPicture({ shown: one.parent, own: { scene: one.child, step: 1, sheet: one.summary.sheet }, moment: 'before', action: drawn }, FOLD_PULL_RENDER).marks;
    expect(marks.map((mark) => mark.kind)).toEqual(['valley-line', 'circle', 'circle']);

    // The bottom-left corner onto the middle: both circled, the arrow from one to the other.
    const corner: FoldOp = { kind: 'valley', line: { via: 'axiom', axiom: 2, inputs: [pt(0, 0), pt(0.5, 0.5)] }, seed: all };
    const two = stepOf(calls, sheet, corner);
    const placed = foldStepAction(two.action, { op: corner, parent: two.parent, child: two.child });
    expect(near(placed.grip!.at, at(two.parent, 0, 0))).toBe(true);
    expect(near(placed.grip!.image, at(two.parent, 0.5, 0.5))).toBe(true);
    expect(placed.rings!.map((ring) => ring.at)).toEqual([placed.grip!.at, placed.grip!.image]);
    // The corner lands on top: nothing over it there.
    expect(placed.grip!.hidden_image).toBe(0);
  });

  it('puts a bisector’s arrow halfway along the shorter edge, and a parallel one from line to line', async () => {
    const calls = await engine();
    const sheet = landed(calls.sheet(SQUARE_PAPER)).state;
    const diagonal = stepOf(calls, sheet, { kind: 'precrease', direction: 'valley', line: { via: 'axiom', axiom: 2, inputs: [pt(0, 0), pt(1, 1)] }, seed: all });
    // The right edge onto the diagonal from the bottom-right corner: the bisector of its 45°.
    const kite: FoldOp = {
      kind: 'precrease', direction: 'valley', line: { via: 'axiom', axiom: 3, inputs: [edge([1, 0], [1, 1]), edge([1, 0], [0, 1])] },
      moving: [0.95, 0.5], seed: all,
    };
    const bisector = stepOf(calls, diagonal.state, kite, [Math.cos(Math.PI / 8), Math.sin(Math.PI / 8)]);
    const placed = foldStepAction(bisector.action, { op: kite, parent: bisector.parent, child: bisector.child });
    // The edge is 1 long and the diagonal √2: halfway along the edge from the corner, onto the diagonal as far out.
    expect(near(placed.grip!.at, at(bisector.parent, 1, 0.5))).toBe(true);
    expect(near(placed.grip!.image, at(bisector.parent, 1 - 0.5 * Math.SQRT1_2, 0.5 * Math.SQRT1_2))).toBe(true);
    expect(length(placed.grip!.at, placed.grip!.image)).toBeGreaterThan(length(bisector.action.grip!.at, bisector.action.grip!.image));

    // The bottom edge onto the top: from one to the other, the whole way.
    const book: FoldOp = {
      kind: 'precrease', direction: 'valley', line: { via: 'axiom', axiom: 3, inputs: [edge([0, 0], [1, 0]), edge([0, 1], [1, 1])] },
      moving: [0.5, 0.1], seed: all,
    };
    const parallel = stepOf(calls, sheet, book);
    const across = foldStepAction(parallel.action, { op: book, parent: parallel.parent, child: parallel.child });
    expect(length(across.grip!.at, across.grip!.image)).toBeCloseTo(1, 6);
    expect(near(across.grip!.at, at(parallel.parent, 0.5, 0))).toBe(true);
  });

  it('draws every crease a Repeat of several operations made as the instruction of its crease pattern', async () => {
    const calls = await engine();
    const sheet = landed(calls.sheet(SQUARE_PAPER));
    const ops: FoldOp[] = [
      { kind: 'valley', line: { via: 'free', through: [[0, 0.4], [0.4, 0]] }, moving: [0.05, 0.05], seed: all },
      { kind: 'valley', line: { via: 'free', through: [[0.6, 0], [1, 0.4]] }, moving: [0.95, 0.05], seed: all },
    ];
    const steps: RepeatSourceStep[] = [];
    let current = sheet.state;
    for (const [index, op] of ops.entries()) {
      const next = landed(calls.step(current, op));
      steps.push({ id: `source-${index}`, before: current, after: next.state, op });
      current = next.state;
    }
    const recipe = prepareRepeat(calls, { parent: current, steps, axis: { n: [0, 1], d: 0.5 }, source: { first: 'source-0', last: 'source-1', revision: 'test' } });
    if (recipe.status !== 'ready') throw new Error(JSON.stringify(recipe));
    const before = calls.summary(current).step;
    const repeated = landed(calls.step(current, recipe.op));
    const scene = calls.scene(repeated.state);
    const { step } = repeated.summary;
    expect(step - before).toBe(2);
    const instructions = (since?: number) =>
      creasePatternPaperScene(scene, { display: FOLD_PANE_DISPLAY_DEFAULT, sheet: repeated.summary.sheet, step, ...(since !== undefined ? { since } : {}) })
        .items.filter((item) => item.kind === 'line' && item.role.startsWith('diagram-')).length;
    // Its last operation's crease alone, as `made_at === step` drew it; both, from the state before it.
    expect(instructions()).toBe(1);
    expect(instructions(before)).toBe(2);
    const page = foldStepCreaseDiagram(scene.creases, repeated.summary.sheet, step, before);
    expect(page.primitives.filter((primitive) => primitive.kind === 'line' && primitive.style === 'valley')).toHaveLength(2);
  });
});
