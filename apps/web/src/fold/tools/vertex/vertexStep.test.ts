import { describe, expect, it } from 'vitest';
import type { Point } from '../../../lib/geometry';
import { bookScene, flatSquareLandmarks, flatSquareScene } from '../../canvas/foldCanvas.fixtures';
import { foldPickIndex, type FoldPick } from '../../canvas/foldPicking';
import type { FoldVertexAnalysed, FoldVertexOrders } from '../../engine/foldEngineSquashWire';
import type { FoldScene } from '../../engine/foldEngineWire';
import { toPoint } from '../../canvas/foldCanvasGeometry';
import { isSwivelEdgeOp } from '../../document/foldSequenceDocument';
import { fanRegionAt } from './fanGeometry';
import {
  emergentToFold,
  fanCenterScene,
  fanGiven,
  fanHasNoFourth,
  fanLayerCount,
  fanSeed,
  fanStayerRegion,
  incenter,
  landingFourths,
  layerSheetPointAt,
  nearestDirection,
  nearPrecrease,
  petalLine,
  picksFanStayer,
  PLACEHOLDER_RAY,
  precreaseAlong,
  squashTargetToward,
  steppedFourth,
  vertexAskedOp,
  vertexChosenOp,
  vertexStepFrom,
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

const NONE: FoldVertexTaken = { squashTarget: null, emergent: null, order: 0 };

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

  it('asks a rabbit ear and a swivel with a placeholder fourth ray, the paper that stays named by the region clicked', () => {
    const index = book();
    const corners = [point(0, 0), point(0.5, 0), point(0, 1)];
    const clicked = intent({ tool: 'rabbit-ear', picks: [...corners, free(0.1, 0.5)] });
    const ear = vertexAskedOp(clicked, index);
    expect(ear).toMatchObject({
      kind: 'rabbit-ear',
      corners: [
        [0, 0],
        [0.5, 0],
        [0, 1],
      ],
      emergent: PLACEHOLDER_RAY,
      seed: { scope: 'all' },
      direction: 'valley',
    });
    // Not the point clicked: a point of the same region, half way from the
    // incenter to the paper's edge along its middle, on the farthest layer cut
    // — the left half, which lies where it is.
    const fan = fanGiven(clicked);
    if (!fan || !ear || !('kind' in ear) || ear.kind !== 'rabbit-ear') throw new Error('no fan');
    expect(fanStayerRegion(clicked, fan)).toBe(0);
    expect(ear.stayer[0]).toBeCloseTo(fan.center.x / 2, 12);
    expect(ear.stayer[1]).toBeCloseTo(0.21811, 4);
    expect(fanRegionAt(fan, toPoint(ear.stayer))).toBe(0);
    // Anywhere else in that region names the same paper.
    expect(vertexAskedOp({ ...clicked, picks: [...corners, free(0.05, 0.6)] }, index)).toEqual(ear);
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
    });
    // Straight up the region's middle from the vertex, half way to the edge,
    // on the one layer cut — the top, the right half mirrored.
    if (!swivel || !('kind' in swivel) || swivel.kind !== 'swivel' || isSwivelEdgeOp(swivel)) {
      throw new Error('no swivel by its rays');
    }
    expect(swivel.stayer[0]).toBeCloseTo(0.75, 12);
    expect(swivel.stayer[1]).toBeCloseTo(0.75, 12);
  });

  it('picks a fan’s paper that stays on its next click, and again while its fold is previewed', () => {
    expect(picksFanStayer('rabbit-ear', 2)).toBe(false);
    expect(picksFanStayer('rabbit-ear', 3)).toBe(true);
    expect(picksFanStayer('rabbit-ear', 4)).toBe(true);
    expect(picksFanStayer('swivel', 3)).toBe(false);
    expect(picksFanStayer('swivel', 4)).toBe(true);
    expect(picksFanStayer('squash', 0)).toBe(false);
    expect(picksFanStayer('valley', 2)).toBe(false);
    // The swivel's rays run from its vertex toward its three points.
    const swivel = fanGiven({ tool: 'swivel', picks: [point(0.25, 0.5), point(0.5, 0.8), point(0, 0.8), point(0.25, 0)] });
    expect(swivel?.center).toEqual(p(0.25, 0.5));
    expect(swivel?.rays).toHaveLength(3);
    expect(fanGiven({ tool: 'swivel', picks: [point(0.25, 0.5), point(0.5, 0.8)] })).toBeNull();
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
  });
  const listed = (orders: number): FoldVertexOrders => ({
    count: { orders, exact: true },
    orders: Array.from({ length: orders }, (_, k) => ({ faces: [], orders: [[k, k + 1, 1] as const] })),
    more: false,
  });

  it('offers only the fourth rays that land, takes the folder’s while it does, else the first that does, else none', () => {
    expect(landingFourths(fan([false, true, true]))).toEqual([1, 2]);
    // A candidate the answer says nothing of lands, as far as is known.
    expect(landingFourths(fan([false]))).toEqual([1, 2]);
    expect(landingFourths(null)).toEqual([]);
    expect(emergentToFold(2, fan([false, true, true]))).toBe(2);
    expect(emergentToFold(2, fan([false, true, false]))).toBe(1);
    expect(emergentToFold(null, fan([false, true, true]))).toBe(1);
    expect(emergentToFold(7, fan([false, false, true]))).toBe(2);
    // None lands: nothing to fold, never the engine's own choice refused.
    expect(emergentToFold(null, fan([false, false, false], 1))).toBeNull();
    expect(fanHasNoFourth(fan([false, false, false]))).toBe(true);
    expect(fanHasNoFourth(fan([false, true, false]))).toBe(false);
    expect(nearestDirection([[1, 0], [0, 1]], [0.2, 0.9])).toBe(1);
    expect(nearestDirection([[1, 0]], [0, 0])).toBeNull();
  });

  it('steps through the fourth rays that land, round and round', () => {
    expect(steppedFourth([0, 2], 0, 1)).toBe(2);
    expect(steppedFourth([0, 2], 2, 1)).toBe(0);
    expect(steppedFourth([0, 2], 0, -1)).toBe(2);
    expect(steppedFourth([1], 1, 1)).toBe(1);
    expect(steppedFourth([], null, 1)).toBeNull();
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
    // None lands: no fold to preview, so none to refuse.
    expect(vertexChosenOp(base, fan([false, false, false], 0), NONE)).toBeNull();
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

  it('builds the step with the completion of the order taken, and no ridge: the fourth crease is the ridge', () => {
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
    // One order: nothing to store.
    const one = vertexStepFrom(op, fan([true]), NONE);
    expect(one.step).toEqual({ op });
    expect(one.orders).toEqual([]);
    const answer = { ...fan([true]), orders: listed(3) };
    const first = vertexStepFrom(op, answer, NONE);
    expect(first.step).toEqual({ op, choices: { completion: first.orders[0] } });
    const second = vertexStepFrom(op, answer, { ...NONE, order: 2 });
    expect(second.orders).toHaveLength(3);
    expect(second.step).toEqual({ op, choices: { completion: second.orders[2] } });
    expect(second.step.op).not.toHaveProperty('ridge');
    // An order index past the list is the last one listed.
    expect(vertexStepFrom(op, answer, { ...NONE, order: 9 }).order).toBe(second.orders[2]);
  });
});
