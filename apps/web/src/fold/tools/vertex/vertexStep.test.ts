import { describe, expect, it } from 'vitest';
import type { Point } from '../../../lib/geometry';
import { bookScene, flatSquareLandmarks, flatSquareScene } from '../../canvas/foldCanvas.fixtures';
import { foldPickIndex, type FoldPick } from '../../canvas/foldPicking';
import type { FoldVertexAnalysed, FoldVertexOrders } from '../../engine/foldEngineSquashWire';
import type { FoldScene } from '../../engine/foldEngineWire';
import { toPoint } from '../../canvas/foldCanvasGeometry';
import { fanRegionAt } from './fanGeometry';
import {
  directionToFold,
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
  parallelSegments,
  petalHingeOf,
  petalRegionKey,
  picksFanStayer,
  picksPetalRegion,
  picksSwivelPivot,
  PLACEHOLDER_RAY,
  squashTargetToward,
  steppedFourth,
  swivelDirectionsOf,
  swivelFoldPick,
  swivelKindsLanding,
  swivelWayToFold,
  vertexAskedOp,
  vertexChosenOp,
  vertexStepFrom,
  withEmergent,
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
  petalHinge: 'crease',
  swivelTarget: 'crease',
  picks: [],
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

describe('a petal fold’s hinge', () => {
  const index = foldPickIndex(precreasedScene(), flatSquareLandmarks(), []);
  const [crease] = index.creasePattern.segments.filter((segment) => segment.segment === 'crease');

  it('is the precrease clicked, or the line through its two ends', () => {
    if (!crease) throw new Error('no precrease');
    expect(petalHingeOf(intent({ tool: 'petal', picks: [crease] }))).toEqual({ kind: 'crease', at: [0.5, 0.5] });
    const ends = [point(0, 0.5), point(1, 0.5)];
    expect(petalHingeOf(intent({ tool: 'petal', petalHinge: 'points', picks: ends }))).toEqual({
      kind: 'points',
      from: [0, 0.5],
      to: [1, 0.5],
    });
    // Before its clicks are in, none.
    expect(petalHingeOf(intent({ tool: 'petal', petalHinge: 'points', picks: ends.slice(0, 1) }))).toBeNull();
  });

  it('builds the petal fold from its hinge and the flap below it, its hinge as it was named', () => {
    if (!crease) throw new Error('no precrease');
    const flap = free(0.5, 0.2, [0.5, 0.2]);
    expect(vertexAskedOp(intent({ tool: 'petal', picks: [crease, flap] }), index)).toEqual({
      kind: 'petal',
      crease: [0.5, 0.5],
      petal: [0.5, 0.2],
      direction: 'valley',
    });
    // By its ends, on no crease necessarily: the fold creases what is missing.
    const ends = [point(0, 0.5), point(1, 0.5)];
    expect(vertexAskedOp(intent({ tool: 'petal', petalHinge: 'points', picks: [...ends, flap] }), index)).toEqual({
      kind: 'petal',
      ends: [
        [0, 0.5],
        [1, 0.5],
      ],
      petal: [0.5, 0.2],
      direction: 'valley',
    });
    // The hinge alone: no op yet.
    expect(vertexAskedOp(intent({ tool: 'petal', petalHinge: 'points', picks: ends }), index)).toBeNull();
  });

  it('picks its flap after the hinge, and again while previewed; the flap named by its layer and its side of the hinge', () => {
    expect(picksPetalRegion('petal', 'crease', 0)).toBe(false);
    expect(picksPetalRegion('petal', 'crease', 1)).toBe(true);
    expect(picksPetalRegion('petal', 'crease', 2)).toBe(true);
    expect(picksPetalRegion('petal', 'points', 1)).toBe(false);
    expect(picksPetalRegion('petal', 'points', 2)).toBe(true);
    expect(picksPetalRegion('rabbit-ear', 'crease', 1)).toBe(false);
    if (!crease) throw new Error('no precrease');
    const hinged = intent({ tool: 'petal', picks: [crease] });
    const below = petalRegionKey(index, hinged, p(0.3, 0.2));
    expect(below).toBe(petalRegionKey(index, hinged, p(0.7, 0.4)));
    expect(below).not.toBe(petalRegionKey(index, hinged, p(0.3, 0.8)));
    // Off the paper, or before the hinge: none.
    expect(petalRegionKey(index, hinged, p(1.5, 0.2))).toBeNull();
    expect(petalRegionKey(index, intent({ tool: 'petal' }), p(0.3, 0.2))).toBeNull();
  });
});

describe('a swivel by its edge', () => {
  const index = book();
  const fold = { kind: 'segment', edge: 6, segment: 'bend', sheet: [[0.5, 0], [0.5, 1]], scene: [p(0.5, 0), p(0.5, 1)] } as const;
  const bottom = { kind: 'segment', edge: 0, segment: 'raw_edge', sheet: [[0, 0], [0.5, 0]], scene: [p(0, 0), p(0.5, 0)] } as const;

  it('is asked with its pivot, the edge it moves and the line that edge lands on, every layer cut', () => {
    const picks = [point(0.25, 0.6), bottom, fold];
    expect(vertexAskedOp(intent({ tool: 'swivel', picks }), index)).toEqual({
      kind: 'swivel',
      via: 'edge',
      pivot: [0.25, 0.6],
      edge: [0.25, 0],
      target: { via: 'crease', at: [0.5, 0.5] },
      seed: { scope: 'all' },
      direction: 'valley',
    });
    // The line through two points.
    const byPoints = vertexAskedOp(
      intent({ tool: 'swivel', swivelTarget: 'points', picks: [point(0.25, 0.6), bottom, point(0, 1), point(0.5, 0.5)] }),
      index
    );
    expect(byPoints).toMatchObject({ target: { via: 'free', through: [[0, 1], [0.5, 0.5]] } });
    // Its target still to click: nothing yet.
    expect(vertexAskedOp(intent({ tool: 'swivel', picks: picks.slice(0, 2) }), index)).toBeNull();
    // A swivel has no given rays and no paper that stays to pick: the edge form computes them.
    expect(fanGiven({ tool: 'swivel', picks })).toBeNull();
    expect(picksFanStayer('swivel', 3)).toBe(false);
  });

  it('is asked by the folded edge its pivot was clicked on, with no seed: the creases meet on that edge', () => {
    const onFold: FoldPick = { kind: 'point', provenance: 'fold', sheet: [0.5, 0.3], mark: null, scene: p(0.5, 0.3), fold };
    const picks = [onFold, bottom, point(0, 1)];
    // The pivot's step takes a folded edge; no other step does.
    expect(picksSwivelPivot('swivel', 0)).toBe(true);
    expect(picksSwivelPivot('swivel', 1)).toBe(false);
    expect(picksSwivelPivot('rabbit-ear', 0)).toBe(false);
    expect(swivelFoldPick({ tool: 'swivel', picks })).toBe(fold);
    expect(swivelFoldPick({ tool: 'swivel', picks: [point(0.5, 0.3)] })).toBeNull();
    expect(
      vertexAskedOp(intent({ tool: 'swivel', swivelTarget: 'crease', picks: [onFold, bottom, bottom] }), index)
    ).toEqual({
      kind: 'swivel',
      via: 'edge',
      fold: [0.5, 0.3],
      edge: [0.25, 0],
      target: { via: 'crease', at: [0.25, 0] },
      direction: 'valley',
    });
  });

  it('tells a target parallel to its edge', () => {
    expect(parallelSegments([p(0, 0), p(1, 0)], [p(0, 1), p(1, 1)])).toBe(true);
    expect(parallelSegments([p(0, 0), p(1, 0)], [p(1, 1), p(0, 1)])).toBe(true);
    expect(parallelSegments([p(0, 0), p(1, 0)], [p(0, 0), p(1, 1)])).toBe(false);
  });
});

describe('a fan’s center and layers', () => {
  it('meets at a rabbit ear’s incenter', () => {
    const center = incenter([p(0, 0), p(1, 0), p(0, 1)]);
    const r = 1 - Math.SQRT1_2;
    expect(center?.x).toBeCloseTo(r, 12);
    expect(center?.y).toBeCloseTo(r, 12);
    expect(fanCenterScene({ tool: 'swivel', picks: [point(0.5, 0.3)] })).toBeNull();
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

  it('asks a rabbit ear with a placeholder fourth ray, the paper that stays named by the region clicked', () => {
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
    // Its layers: the first one from the direction's side, at the incenter.
    const one = vertexAskedOp({ ...clicked, fanLayers: 1 }, index);
    expect(one).toMatchObject({ kind: 'rabbit-ear', seed: { scope: 'depth', layers: 1 } });
  });

  it('picks a rabbit ear’s paper that stays on its next click, and again while its fold is previewed', () => {
    expect(picksFanStayer('rabbit-ear', 2)).toBe(false);
    expect(picksFanStayer('rabbit-ear', 3)).toBe(true);
    expect(picksFanStayer('rabbit-ear', 4)).toBe(true);
    expect(picksFanStayer('squash', 0)).toBe(false);
    expect(picksFanStayer('valley', 2)).toBe(false);
    // Its rays run from its incenter toward its three corners.
    const ear = fanGiven({ tool: 'rabbit-ear', picks: [point(0, 0), point(0.5, 0), point(0, 1)] });
    expect(ear?.rays).toHaveLength(3);
    expect(fanGiven({ tool: 'rabbit-ear', picks: [point(0, 0), point(0.5, 0)] })).toBeNull();
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

  it('offers a swivel’s ridges that land, stores the one taken only when it is not the foot’s, and folds its own when none does', () => {
    const ridges = (emergents: boolean[], ridge = 0): FoldVertexAnalysed => ({
      analysis: {
        kind: 'swivel-by-edge',
        pivot: [0.8, 0.3],
        vertex: [0.8, 0.33],
        meet: [0, 0],
        edge: [
          [0, 0],
          [1, 0],
        ],
        edge_faces: [0],
        foot: [0.8, 0],
        target: { n: [0.7071, -0.7071], d: 0 },
        rotation: 0.78,
        landed: [],
        creases: [],
        ridges: [
          [0, -1],
          [0.5, -0.5],
        ],
        ridge,
        layers: [0],
        regions: [],
      },
      emergents,
      orders: null,
    });
    const base = {
      kind: 'swivel' as const,
      via: 'edge' as const,
      pivot: [0.8, 0.3] as const,
      edge: [0.5, 0] as const,
      target: { via: 'crease' as const, at: [0.5, 0.5] as const },
      seed: { scope: 'all' as const },
      direction: 'valley' as const,
    };
    expect(landingFourths(ridges([true, false]))).toEqual([0]);
    expect(landingFourths(ridges([true, true]))).toEqual([0, 1]);
    // None lands: still folded, by its own ridge, so the engine says why.
    expect(emergentToFold(null, ridges([false, false]))).toBe(0);
    expect(fanHasNoFourth(ridges([false, false]))).toBe(false);
    // The foot's ridge is the default: nothing stored; the end's is stored as its direction.
    expect(withEmergent(base, ridges([true, true]), 0)).toEqual(base);
    expect(withEmergent({ ...base, ridge: [0.5, -0.5] }, ridges([true, true]), 0)).toEqual(base);
    expect(withEmergent(base, ridges([true, true]), 1)).toEqual({ ...base, ridge: [0.5, -0.5] });
    // Taking the other ridge is another fold, asked again for its orders.
    expect(vertexChosenOp(base, ridges([true, true]), { ...NONE, emergent: 1 })).toEqual({
      op: { ...base, ridge: [0.5, -0.5] },
      emergent: 1,
      direction: 'valley',
      kind: null,
      again: true,
    });
    expect(vertexChosenOp(base, ridges([false, false]), NONE)).toEqual({
      op: base,
      emergent: 0,
      direction: 'valley',
      kind: null,
      again: false,
    });
  });

  it('folds a swivel on a folded edge the way that lands, with no ridge, and asks again when that is the other', () => {
    const onFold = {
      kind: 'swivel' as const,
      via: 'edge' as const,
      fold: [0.75, 0.6] as const,
      edge: [1, 0.85] as const,
      target: { via: 'crease' as const, at: [0.75, 0.5] as const },
      direction: 'valley' as const,
    };
    const answer = (directions?: boolean[], kinds?: [boolean, boolean][]): FoldVertexAnalysed => ({
      analysis: {
        kind: 'swivel-by-edge',
        pivot: [0.15, 0.35],
        vertex: [0.15, 0.35],
        meet: [0, 0],
        edge: [
          [0, 0],
          [0.2, 0.2],
        ],
        edge_faces: [18],
        foot: [0.25, 0.25],
        target: { n: [1, 0], d: 0 },
        rotation: Math.PI / 2,
        landed: [],
        creases: [],
        ridges: [],
        ridge: 0,
        layers: [17, 18],
        regions: [],
        fold: {
          edge: [
            [0.2, 0.2],
            [0, 0.7],
          ],
          opens: [
            [0.15, 0.35],
            [0.2, 0.2],
          ],
          faces: [17, 18],
        },
      },
      emergents: [],
      ...(directions ? { directions } : {}),
      ...(kinds ? { kinds } : {}),
      orders: null,
    });
    // No ridge to store, whatever is taken.
    expect(withEmergent(onFold, answer([true, false]), 1)).toEqual(onFold);
    expect(directionToFold('valley', answer([true, false]))).toBe('valley');
    expect(directionToFold('mountain', answer([true, false]))).toBe('valley');
    expect(directionToFold('valley', answer([false, false]))).toBe('valley');
    expect(directionToFold('mountain', answer())).toBe('mountain');
    expect(vertexChosenOp(onFold, answer([true, false]), NONE)).toEqual({
      op: onFold,
      emergent: 0,
      direction: 'valley',
      kind: 'open',
      again: false,
    });
    // Only the other way lands: that way is folded, and asked again.
    expect(vertexChosenOp({ ...onFold, direction: 'mountain' }, answer([true, false]), NONE)).toEqual({
      op: onFold,
      emergent: 0,
      direction: 'valley',
      kind: 'open',
      again: true,
    });
  });

  it('folds a swivel on a folded edge of the kind that lands, the one asked while it does', () => {
    const open = {
      kind: 'swivel' as const,
      via: 'edge' as const,
      fold: [0.75, 0.6] as const,
      edge: [1, 0.85] as const,
      target: { via: 'crease' as const, at: [0.75, 0.5] as const },
      direction: 'valley' as const,
    };
    const inside = { ...open, swivel: 'inside' as const };
    const answer = (kinds: [boolean, boolean][], asked: [boolean, boolean]): FoldVertexAnalysed => ({
      analysis: { kind: 'squash' } as unknown as FoldVertexAnalysed['analysis'],
      emergents: [],
      directions: asked,
      kinds,
      orders: null,
    });
    // The owner's squash: both kinds land, valley only.
    const both = answer(
      [
        [true, false],
        [true, false],
      ],
      [true, false]
    );
    expect(swivelKindsLanding(both)).toEqual([true, true]);
    expect(vertexChosenOp(open, both, NONE)).toMatchObject({ op: open, kind: 'open', again: false });
    expect(vertexChosenOp(inside, both, NONE)).toMatchObject({ op: inside, kind: 'inside', again: false });
    // Only inside lands: asked open, it folds inside, asked again.
    const onlyInside = answer(
      [
        [false, false],
        [true, false],
      ],
      [false, false]
    );
    expect(vertexChosenOp(open, onlyInside, NONE)).toMatchObject({
      op: inside,
      direction: 'valley',
      kind: 'inside',
      again: true,
    });
    // Only open lands, and only the other way: asked inside valley, it folds open mountain.
    const onlyOpenMountain = answer(
      [
        [false, true],
        [false, false],
      ],
      [false, false]
    );
    expect(swivelWayToFold({ kind: 'inside', direction: 'valley' }, 'inside', onlyOpenMountain)).toEqual({
      kind: 'open',
      direction: 'mountain',
    });
    expect(vertexChosenOp(inside, onlyOpenMountain, NONE)).toMatchObject({
      op: { ...open, direction: 'mountain' },
      kind: 'open',
      again: true,
    });
    // None lands: the way asked, which the engine refuses.
    const none = answer(
      [
        [false, false],
        [false, false],
      ],
      [false, false]
    );
    expect(vertexChosenOp(inside, none, NONE)).toMatchObject({ op: inside, kind: 'inside', again: false });
    // An answer with no word on the kinds: the directions of the kind asked.
    expect(swivelDirectionsOf({ ...both, kinds: undefined }, 'open', 'open')).toEqual([true, false]);
    expect(swivelDirectionsOf({ ...both, kinds: undefined }, 'inside', 'open')).toBeNull();
    // Any other fold has no kind.
    expect(swivelKindsLanding(null)).toBeNull();
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
    expect(vertexChosenOp(squash, analysed, NONE)).toEqual({
      op: squash,
      emergent: null,
      direction: 'valley',
      kind: null,
      again: false,
    });
    expect(vertexChosenOp(squash, analysed, { ...NONE, squashTarget: [0, 1] })).toEqual({
      op: { ...squash, target: [0, 1] },
      emergent: null,
      direction: 'valley',
      kind: null,
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
