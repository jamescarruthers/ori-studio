import { describe, expect, it } from 'vitest';
import type { Point } from '../../../lib/geometry';
import { bookScene, flatSquareLandmarks, flatSquareScene } from '../../canvas/foldCanvas.fixtures';
import { foldPickIndex, type FoldPick } from '../../canvas/foldPicking';
import type { FoldVertexAnalysed, FoldVertexRidge } from '../../engine/foldEngineSquashWire';
import type { FoldScene } from '../../engine/foldEngineWire';
import {
  emergentToFold,
  fanCenterScene,
  fanLayerCount,
  fanSeed,
  incenter,
  landingRidges,
  layerSheetPointAt,
  nearestDirection,
  nearPrecrease,
  petalLine,
  PLACEHOLDER_RAY,
  precreaseAlong,
  ridgeToFold,
  squashTargetToward,
  steppedRidge,
  vertexAskedOp,
  vertexChosenOp,
  vertexStepFrom,
  withRidge,
  type FoldVertexIntent,
  type FoldVertexTaken,
} from './vertexStep';

const p = (x: number, y: number): Point => ({ x, y });

/** The book: the right half (sheet x > ½) folded over the left, on top. */
const book = () => foldPickIndex(bookScene(), null, []);

/** The flat square with a precrease across it at y = ½, from edge to edge. */
function precreasedScene(): FoldScene {
  const scene = flatSquareScene();
  return {
    ...scene,
    creases: [
      ...scene.creases,
      { id: 4, vertices: [4, 5], from: p(0, 0.5), to: p(1, 0.5), kind: 'flat', letter: 'valley', made_at: 1 },
    ],
  };
}

const free = (x: number, y: number, sheet: [number, number] | null = null): FoldPick => ({
  kind: 'free',
  pane: 'folded',
  scene: p(x, y),
  sheet,
});

const point = (x: number, y: number): FoldPick => ({
  kind: 'point',
  provenance: 'vertex',
  sheet: [x, y],
  mark: null,
  scene: p(x, y),
});

const intent = (extra: Partial<FoldVertexIntent>): FoldVertexIntent => ({
  tool: 'squash',
  lineMode: 'crease',
  picks: [],
  candidate: null,
  direction: 'valley',
  fanLayers: null,
  ...extra,
});

const NONE: FoldVertexTaken = { squashTarget: null, emergent: null, ridge: null, order: 0 };

describe('which layer a vertex fold’s click names', () => {
  it('is the one the viewer sees on the direction’s side, or the far one for the paper that stays', () => {
    const index = book();
    // The top layer is the right half, mirrored onto the left.
    expect(layerSheetPointAt(index, p(0.25, 0.5), 'valley')).toEqual([0.75, 0.5]);
    expect(layerSheetPointAt(index, p(0.25, 0.5), 'mountain')).toEqual([0.25, 0.5]);
    expect(layerSheetPointAt(index, p(0.25, 0.5), 'valley', 'far')).toEqual([0.25, 0.5]);
    expect(layerSheetPointAt(index, p(0.25, 0.5), 'mountain', 'far')).toEqual([0.75, 0.5]);
    // Off the paper: nothing.
    expect(layerSheetPointAt(index, p(0.75, 0.5), 'valley')).toBeNull();
  });

  it('builds a squash from its flap, as the direction reads it', () => {
    const index = book();
    const picks = [free(0.25, 0.5)];
    expect(vertexAskedOp(intent({ picks }), index)).toEqual({ kind: 'squash', flap: [0.75, 0.5], direction: 'valley' });
    expect(vertexAskedOp(intent({ picks, direction: 'mountain' }), index)).toEqual({
      kind: 'squash',
      flap: [0.25, 0.5],
      direction: 'mountain',
    });
    // Before the click, nothing; a click off the paper, a refusal under the engine's own code.
    expect(vertexAskedOp(intent({ picks: [] }), index)).toBeNull();
    const off = vertexAskedOp(intent({ picks: [free(0.9, 0.5)] }), index);
    expect(off).toMatchObject({ status: 'refused', refusal: { code: 'point_off_paper' } });
  });
});

describe('a petal fold’s line H', () => {
  const index = foldPickIndex(precreasedScene(), flatSquareLandmarks(), []);

  it('is the precrease clicked, or the one along the line its ends locate', () => {
    const [crease] = index.creasePattern.segments.filter((segment) => segment.segment === 'crease');
    if (!crease) throw new Error('no precrease');
    expect(petalLine(intent({ tool: 'petal', picks: [crease] }), index)).toEqual({ kind: 'crease', crease: [0.5, 0.5] });
    const ends = [free(0.1, 0.5), free(0.9, 0.5)];
    expect(petalLine(intent({ tool: 'petal', lineMode: 'free', picks: ends }), index)).toEqual({
      kind: 'crease',
      crease: [0.5, 0.5],
    });
    expect(precreaseAlong(index, { n: [0, 1], d: 0.5 })).toEqual([0.5, 0.5]);
  });

  it('runs along no precrease off it, offering the one beside it as the landmark', () => {
    const beside = [free(0.1, 0.51), free(0.9, 0.51)];
    const line = petalLine(intent({ tool: 'petal', lineMode: 'free', picks: beside }), index);
    expect(line).toMatchObject({ kind: 'missing', near: { segment: 'crease', edge: 4 } });
    // Far from every precrease: none is offered.
    expect(nearPrecrease(index, { n: [0, 1], d: 0.8 })).toBeNull();
    // Refused before the engine is asked, in the engine's own words.
    const asked = vertexAskedOp(intent({ tool: 'petal', lineMode: 'free', picks: [...beside, free(0.5, 0.2)] }), index);
    expect(asked).toMatchObject({ status: 'refused', refusal: { code: 'petal_not_precreased', missing: 'line' } });
  });

  it('builds the petal fold from H and the flap below it', () => {
    const ends = [free(0.1, 0.5), free(0.9, 0.5)];
    const asked = vertexAskedOp(intent({ tool: 'petal', lineMode: 'free', picks: [...ends, free(0.5, 0.2, [0.5, 0.2])] }), index);
    expect(asked).toEqual({ kind: 'petal', crease: [0.5, 0.5], petal: [0.5, 0.2], direction: 'valley' });
    // H alone: no op yet.
    expect(vertexAskedOp(intent({ tool: 'petal', lineMode: 'free', picks: ends }), index)).toBeNull();
  });
});

describe('a fan’s center and layers', () => {
  it('meets at a rabbit ear’s incenter, or a swivel’s vertex', () => {
    const center = incenter([p(0, 0), p(1, 0), p(0, 1)]);
    const r = 1 - Math.SQRT1_2;
    expect(center?.x).toBeCloseTo(r, 12);
    expect(center?.y).toBeCloseTo(r, 12);
    expect(fanCenterScene({ tool: 'swivel', picks: [point(0.5, 0.3)] })).toEqual(p(0.5, 0.3));
    expect(fanCenterScene({ tool: 'rabbit-ear', picks: [point(0, 0), point(1, 0)] })).toBeNull();
  });

  it('cuts every layer at the center, or the first few from the direction’s side', () => {
    const index = book();
    const center = p(0.25, 0.5);
    expect(fanLayerCount(index, center)).toBe(2);
    expect(fanSeed(index, center, 'valley', null)).toEqual({ scope: 'all' });
    expect(fanSeed(index, center, 'valley', 2)).toEqual({ scope: 'all' });
    expect(fanSeed(index, center, 'valley', 1)).toEqual({ scope: 'depth', at: [0.75, 0.5], layers: 1 });
    expect(fanSeed(index, center, 'mountain', 1)).toEqual({ scope: 'depth', at: [0.25, 0.5], layers: 1 });
    expect(fanSeed(index, p(0.75, 0.5), 'valley', 1)).toBeNull();
  });

  it('asks a rabbit ear and a swivel with a placeholder fourth ray, the paper that stays read from the far side', () => {
    const index = book();
    const corners = [point(0, 0), point(0.5, 0), point(0, 1)];
    const ear = vertexAskedOp(intent({ tool: 'rabbit-ear', picks: [...corners, free(0.1, 0.5)] }), index);
    expect(ear).toEqual({
      kind: 'rabbit-ear',
      corners: [
        [0, 0],
        [0.5, 0],
        [0, 1],
      ],
      emergent: PLACEHOLDER_RAY,
      seed: { scope: 'all' },
      stayer: [0.1, 0.5],
      direction: 'valley',
    });
    const swivel = vertexAskedOp(
      intent({
        tool: 'swivel',
        fanLayers: 1,
        picks: [point(0.25, 0.5), point(0.5, 0.8), point(0, 0.8), point(0.25, 0), free(0.1, 0.9)],
      }),
      index
    );
    expect(swivel).toMatchObject({
      kind: 'swivel',
      vertex: [0.25, 0.5],
      toward: [
        [0.5, 0.8],
        [0, 0.8],
        [0.25, 0],
      ],
      seed: { scope: 'depth', at: [0.75, 0.5], layers: 1 },
      stayer: [0.1, 0.9],
    });
  });
});

describe('the choices a vertex fold takes of what the engine lists', () => {
  const fan = (emergents: boolean[], named: number | null = 0): FoldVertexAnalysed => ({
    analysis: {
      kind: 'rabbit-ear',
      center: [0.3, 0.3],
      given: [
        [-1, -1],
        [1, 0],
        [0, 1],
      ],
      candidates: [
        [1, 1],
        [-1, 0],
        [0, -1],
      ],
      emergent: named,
      layers: [1, 2],
    },
    emergents,
    orders: null,
    ridges: [],
  });
  const ridge = (lands: boolean, given: number | null, orders: number = 0): FoldVertexRidge => ({
    direction: given === null ? [-1, 0] : [1, 0],
    given,
    lands,
    orders:
      orders > 1
        ? {
            count: { orders, exact: true },
            orders: Array.from({ length: orders }, (_, k) => ({ faces: [], orders: [[k, k + 1, 1] as const] })),
            more: false,
          }
        : null,
  });

  it('takes the folder’s fourth ray, else the first that lands, else the engine’s', () => {
    expect(emergentToFold(2, fan([false, true, false]))).toBe(2);
    expect(emergentToFold(null, fan([false, true, true]))).toBe(1);
    expect(emergentToFold(7, fan([false, false, true]))).toBe(2);
    expect(emergentToFold(null, fan([false, false, false], 1))).toBe(1);
    expect(nearestDirection([[1, 0], [0, 1]], [0.2, 0.9])).toBe(1);
    expect(nearestDirection([[1, 0]], [0, 0])).toBeNull();
  });

  it('takes the folder’s ridge, else the first that lands', () => {
    expect(ridgeToFold(null, [])).toBeNull();
    expect(ridgeToFold(null, [ridge(false, 0), ridge(true, null)])).toBe(1);
    expect(ridgeToFold(0, [ridge(false, 0), ridge(true, null)])).toBe(0);
    expect(withRidge({ kind: 'squash', flap: [0, 0], direction: 'valley' }, ridge(true, 0))).toEqual({
      kind: 'squash',
      flap: [0, 0],
      direction: 'valley',
    });
  });

  it('steps only through the ridges the ear lands with', () => {
    expect(landingRidges([ridge(true, 0), ridge(false, null)])).toEqual([0]);
    expect(landingRidges([ridge(true, 0), ridge(true, null)])).toEqual([0, 1]);
    // One that does not land is no choice: nothing to step to.
    expect(steppedRidge([ridge(true, 0), ridge(false, null)], 0, 1)).toBeNull();
    expect(steppedRidge([ridge(true, 0), ridge(true, null)], 0, 1)).toBe(1);
    expect(steppedRidge([ridge(true, 0), ridge(true, null)], 1, 1)).toBe(0);
    expect(steppedRidge([ridge(true, 0), ridge(true, null)], null, -1)).toBe(1);
  });

  it('asks again once the fold is another than the one first asked', () => {
    const base = {
      kind: 'rabbit-ear' as const,
      corners: [
        [0, 0],
        [1, 0],
        [0, 1],
      ] as const,
      emergent: PLACEHOLDER_RAY,
      seed: { scope: 'all' as const },
      stayer: [0.6, 0.35] as const,
      direction: 'valley' as const,
    };
    // The ray the placeholder names lands: the first answer stands, the ray stored as the engine's.
    const same = vertexChosenOp(base, fan([true, true, false], 0), NONE);
    expect(same).toMatchObject({ emergent: 0, again: false, op: { emergent: [1, 1] } });
    const other = vertexChosenOp(base, fan([false, true, false], 0), NONE);
    expect(other).toMatchObject({ emergent: 1, again: true, op: { emergent: [-1, 0] } });
    // A squash aimed off its hinge is another fold; on its hinge it is the one asked.
    const squash = { kind: 'squash' as const, flap: [0.2, 0.2] as const, direction: 'valley' as const };
    const analysed: FoldVertexAnalysed = {
      analysis: {
        kind: 'squash',
        vertex: [0.5, 0.5],
        hinge: { n: [0.7071, -0.7071], d: 0 },
        spine: { n: [0.7071, 0.7071], d: 0.7071 },
        hinge_direction: [-0.7071, -0.7071],
        spine_direction: [-0.7071, 0.7071],
        upper: [1],
        lower: [2],
        upper_crease: { n: [0, 1], d: 0.5 },
        lower_crease: { n: [0, 1], d: 0.5 },
        wedge: -Math.PI / 2,
        share: 0,
      },
      emergents: [],
      orders: null,
      ridges: [],
    };
    expect(vertexChosenOp(squash, analysed, NONE)).toEqual({ op: squash, emergent: null, again: false });
    expect(vertexChosenOp(squash, analysed, { ...NONE, squashTarget: [0, 1] })).toEqual({
      op: { ...squash, target: [0, 1] },
      emergent: null,
      again: true,
    });
    expect(squashTargetToward([0.5, 0.5], [0.5, 1])).toEqual([0, 1]);
    expect(squashTargetToward([0.5, 0.5], [0.5, 0.5])).toBeNull();
  });

  it('builds the step with the ridge taken and the completion of the order taken', () => {
    const op = {
      kind: 'rabbit-ear' as const,
      corners: [
        [0, 0],
        [1, 0],
        [0, 1],
      ] as const,
      emergent: [1, 1] as const,
      seed: { scope: 'all' as const },
      stayer: [0.6, 0.35] as const,
      direction: 'valley' as const,
    };
    const answer = { ...fan([true]), ridges: [ridge(true, 0), ridge(true, null, 3)] };
    const first = vertexStepFrom(op, answer, NONE);
    expect(first.ridge).toBe(0);
    expect(first.step).toEqual({ op: { ...op, ridge: [1, 0] } });
    const second = vertexStepFrom(op, answer, { ...NONE, ridge: 1, order: 2 });
    expect(second.orders).toHaveLength(3);
    expect(second.step).toEqual({ op: { ...op, ridge: [-1, 0] }, choices: { completion: second.orders[2] } });
    // An order index past the list is the last one listed.
    expect(vertexStepFrom(op, answer, { ...NONE, ridge: 1, order: 9 }).order).toBe(second.orders[2]);
  });
});
