import { describe, expect, it } from 'vitest';
import { PAPER_TILT_SHADE } from '../../lib/foldMotion/foldHinge';
import type { PaperFaceItem, PaperItem, PaperLineItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldModelLine } from '../document/foldSequenceDocument';
import type { FoldIsometry, FoldMotionLeg } from '../engine/foldEngineWire';
import {
  affineThrough,
  applyAffine,
  crossfadeFrame,
  crossfadeMotion,
  hingeMotion,
  legsMotion,
  poseHinge,
  poseLegs,
  poseTurn,
  turnMotion,
  type SceneAffine,
} from './foldStepPoses';

function face(id: number, side: PaperFaceItem['side'], ring: ScenePoint[], extra: Partial<PaperFaceItem> = {}): PaperFaceItem {
  return { kind: 'face', face: id, side, rings: [ring], outline: 'edge', shade: 1, hidden: false, ...extra };
}

function line(id: number, role: PaperLineItem['role'], a: ScenePoint, b: ScenePoint, extra: Partial<PaperLineItem> = {}): PaperLineItem {
  return { kind: 'line', role, a, b, onBoundary: [false, false], face: id, hidden: false, ...extra };
}

function sceneOf(items: PaperItem[], sheet = 100): PaperScene {
  const points = items.flatMap((item) =>
    item.kind === 'face' ? item.rings.flat() : item.kind === 'line' ? [item.a, item.b] : []
  );
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    sheet,
    items,
  };
}

const LEFT: ScenePoint[] = [
  [0, 0],
  [50, 0],
  [50, 100],
  [0, 100],
];
const RIGHT: ScenePoint[] = [
  [50, 0],
  [100, 0],
  [100, 100],
  [50, 100],
];
/** ℓ: x = 50, in scene px. */
const L = { at: [50, 0] as ScenePoint, along: [0, 1] as ScenePoint };

/**
 * A book fold through two layers, landed: the still layer (face 2) on the
 * left, and the two layers that came over (faces 0 and 1) on top of it, 1 the
 * upper. Each moving face carries a crease, and face 0 a patch run.
 */
function landedBook(): PaperScene {
  return sceneOf([
    face(2, 'front', LEFT),
    face(0, 'back', LEFT),
    line(0, 'mountain', [10, 10], [40, 90]),
    face(1, 'front', LEFT),
    line(1, 'valley', [20, 10], [20, 90]),
    { ...face(1, 'front', [[0, 0], [20, 0], [20, 20]]), group: 'patches-1' },
  ]);
}

const sheetBefore = () => sceneOf([face(0, 'front', [...LEFT.slice(0, 1), [100, 0], [100, 100], [0, 100]])]);

const facesIn = (scene: PaperScene) =>
  scene.items.filter((item): item is PaperFaceItem => item.kind === 'face' && item.group === undefined).map((item) => item.face);

const close = (a: ScenePoint, b: ScenePoint, digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe('a hinge step', () => {
  const book = () => hingeMotion(sheetBefore(), landedBook(), new Set([0, 1]), L, 'mirrored', 'valley');

  it('starts the moving faces mirrored back across ℓ and lands them where the landed scene has them', () => {
    const start = poseHinge(book(), 0);
    const ring = (scene: PaperScene, id: number) =>
      (scene.items.find((item) => item.kind === 'face' && item.face === id && item.group === undefined) as PaperFaceItem).rings[0]!;
    RIGHT.forEach((p, k) => close(ring(start, 0)[k === 0 ? 1 : k === 1 ? 0 : k === 2 ? 3 : 2]!, p));
    const landed = poseHinge(book(), Math.PI);
    LEFT.forEach((p, k) => close(ring(landed, 0)[k]!, p));
    // The paper that stays never moves.
    expect(ring(poseHinge(book(), 1.1), 2)).toEqual(LEFT);
    // Edge-on, the moving faces have no width: all of them on ℓ.
    for (const p of ring(poseHinge(book(), Math.PI / 2), 1)) expect(p[0]).toBeCloseTo(50, 9);
  });

  it('reads the moving stack as before the step up to edge-on and reversed past it', () => {
    const justBefore = poseHinge(book(), Math.PI / 2 - 1e-6);
    const justAfter = poseHinge(book(), Math.PI / 2 + 1e-6);
    // Drawn back to front: the still layer first, then the moving group.
    expect(facesIn(justBefore)).toEqual([2, 1, 0]);
    expect(facesIn(justAfter)).toEqual([2, 0, 1]);
    // The patch fixes up the landed order only.
    expect(justBefore.items.some((item) => item.kind === 'face' && item.group)).toBe(false);
    expect(justAfter.items.some((item) => item.kind === 'face' && item.group)).toBe(true);
    // Each face keeps the crease it carries right after it.
    const kinds = justBefore.items.map((item) =>
      item.kind === 'face' ? `f${item.face}` : item.kind === 'line' ? `l${item.face}` : 'markup'
    );
    expect(kinds).toEqual(['f2', 'f1', 'l1', 'f0', 'l0']);
  });

  it('shows the moving faces’ other side until edge-on, naming their creases from it', () => {
    const early = poseHinge(book(), 0.3);
    const side = (scene: PaperScene, id: number) =>
      (scene.items.find((item) => item.kind === 'face' && item.face === id) as PaperFaceItem).side;
    expect(side(early, 0)).toBe('front');
    expect(side(early, 1)).toBe('back');
    expect(side(early, 2)).toBe('front');
    const crease = (scene: PaperScene, id: number) =>
      (scene.items.find((item) => item.kind === 'line' && item.face === id) as PaperLineItem).role;
    expect(crease(early, 0)).toBe('valley');
    expect(crease(early, 1)).toBe('mountain');
    const late = poseHinge(book(), 2.9);
    expect(side(late, 0)).toBe('back');
    expect(crease(late, 0)).toBe('mountain');
  });

  it('shades the moving faces by their tilt, and nothing else', () => {
    const shade = (scene: PaperScene, id: number) =>
      (scene.items.find((item) => item.kind === 'face' && item.face === id) as PaperFaceItem).shade;
    expect(shade(poseHinge(book(), 0), 0)).toBe(1);
    expect(shade(poseHinge(book(), Math.PI / 2), 0)).toBeCloseTo(1 - PAPER_TILT_SHADE[3], 9);
    expect(shade(poseHinge(book(), Math.PI / 3), 1)).toBeCloseTo(1 - PAPER_TILT_SHADE[3] / 2, 9);
    expect(shade(poseHinge(book(), Math.PI / 2), 2)).toBe(1);
  });

  it('draws a mountain’s moving group under the paper that stays', () => {
    const mountain = hingeMotion(sheetBefore(), landedBook(), new Set([0, 1]), L, 'mirrored', 'mountain');
    expect(facesIn(poseHinge(mountain, 0.4))).toEqual([1, 0, 2]);
    expect(facesIn(poseHinge(mountain, 2.4))).toEqual([0, 1, 2]);
  });

  it('starts a precrease where it lies and turns it over past edge-on', () => {
    const lying = sceneOf([face(1, 'front', LEFT), face(0, 'front', RIGHT)]);
    const precrease = hingeMotion(lying, lying, new Set([0]), L, 'in-place', 'valley');
    const start = poseHinge(precrease, 0);
    expect((start.items[1] as PaperFaceItem).rings[0]).toEqual(RIGHT);
    expect((start.items[1] as PaperFaceItem).side).toBe('front');
    const over = poseHinge(precrease, Math.PI);
    LEFT.forEach((p, k) => close((over.items[1] as PaperFaceItem).rings[0]![[1, 0, 3, 2][k]!]!, p));
    expect((over.items[1] as PaperFaceItem).side).toBe('back');
  });

  it('draws every layer while the paper moves, whatever the landed scene buries', () => {
    const buried = sceneOf([face(2, 'front', LEFT, { hidden: true }), face(0, 'back', LEFT)]);
    const motion = hingeMotion(sheetBefore(), buried, new Set([0]), L, 'mirrored', 'valley');
    expect(poseHinge(motion, 1).items.every((item) => !item.hidden)).toBe(true);
  });

  it('bounds every frame by both ends', () => {
    expect(poseHinge(book(), 1).bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });
});

describe('a turn step', () => {
  /** A face across the left of the sheet over one across all of it, so the stack has an order. */
  const flatScene = () =>
    sceneOf([
      face(0, 'front', [[0, 0], [100, 0], [100, 100], [0, 100]]),
      face(1, 'back', [[0, 0], [50, 0], [50, 100], [0, 100]]),
    ]);
  /** The same, turned over about the scene's vertical axis x = 0, as a turn's view mirrors it. */
  const mirrorX: SceneAffine = [-1, 0, 0, 1, 0, 0];
  const turnedScene = () =>
    sceneOf([
      face(1, 'front', [[0, 0], [-50, 0], [-50, 100], [0, 100]]),
      face(0, 'back', [[0, 0], [-100, 0], [-100, 100], [0, 100]]),
    ]);

  it('turns the paper over about its own middle, sliding it to where the turned view has it', () => {
    const motion = turnMotion(flatScene(), turnedScene(), mirrorX);
    expect(motion.turn).toEqual({ kind: 'over', axis: [expect.closeTo(0, 9), expect.closeTo(1, 9)] });
    expect(motion.pivot).toEqual([50, 50]);
    expect(motion.slide).toEqual([-100, 0]);
    const start = poseTurn(motion, 0);
    (flatScene().items[0] as PaperFaceItem).rings[0]!.forEach((p, k) =>
      close((start.items[0] as PaperFaceItem).rings[0]![k]!, p)
    );
    const landed = poseTurn(motion, Math.PI);
    (turnedScene().items[1] as PaperFaceItem).rings[0]!.forEach((p, k) =>
      close((landed.items[1] as PaperFaceItem).rings[0]![k]!, p)
    );
  });

  it('switches from the before scene to the after scene edge-on, where neither has width', () => {
    const motion = turnMotion(flatScene(), turnedScene(), mirrorX);
    const early = poseTurn(motion, Math.PI / 2 - 1e-7);
    const late = poseTurn(motion, Math.PI / 2 + 1e-7);
    expect(facesIn(early)).toEqual([0, 1]);
    expect(facesIn(late)).toEqual([1, 0]);
    expect((early.items[0] as PaperFaceItem).side).toBe('front');
    expect((late.items[1] as PaperFaceItem).side).toBe('back');
    // Both sides of the switch are the same sliver, at the slid middle.
    const xs = (scene: PaperScene) => scene.items.flatMap((item) => (item as PaperFaceItem).rings[0]!.map((p) => p[0]));
    for (const x of [...xs(early), ...xs(late)]) expect(x).toBeCloseTo(0, 4);
    // Shaded by the tilt, edge-on the most.
    expect((early.items[0] as PaperFaceItem).shade).toBeCloseTo(1 - PAPER_TILT_SHADE[3], 5);
  });

  it('turns the paper round about its middle without flipping or shading it', () => {
    // A quarter turn counter-clockwise about the scene's origin.
    const quarter: SceneAffine = [0, 1, -1, 0, 0, 0];
    const before = flatScene();
    const after = sceneOf(
      before.items.map((item) => ({
        ...(item as PaperFaceItem),
        rings: (item as PaperFaceItem).rings.map((ring) => ring.map((p) => applyAffine(quarter, p))),
      }))
    );
    const motion = turnMotion(before, after, quarter);
    expect(motion.turn.kind).toBe('round');
    expect(motion.turn.kind === 'round' && motion.turn.angle).toBeCloseTo(Math.PI / 2, 12);
    const landed = poseTurn(motion, Math.PI);
    (after.items[0] as PaperFaceItem).rings[0]!.forEach((p, k) => close((landed.items[0] as PaperFaceItem).rings[0]![k]!, p));
    const half = poseTurn(motion, Math.PI / 2);
    expect((half.items[0] as PaperFaceItem).shade).toBe(1);
    expect((half.items[1] as PaperFaceItem).side).toBe('back');
  });

  it('takes a half turn the way it is told', () => {
    const half: SceneAffine = [-1, 0, 0, -1, 0, 0];
    expect(turnMotion(flatScene(), flatScene(), half, 1).turn).toEqual({ kind: 'round', angle: Math.PI });
    expect(turnMotion(flatScene(), flatScene(), half, -1).turn).toEqual({ kind: 'round', angle: -Math.PI });
  });
});

describe('a crossfade', () => {
  const before = () => sceneOf([face(0, 'front', LEFT), line(0, 'edge', [0, 0], [0, 100])]);
  const after = () =>
    sceneOf([
      face(0, 'back', RIGHT, { hidden: true }),
      face(1, 'front', RIGHT, { group: 'patches-1' }),
      line(1, 'aux', [50, 0], [100, 100]),
    ]);

  it('fades the before scene out under the after scene, faces kept apart', () => {
    const motion = crossfadeMotion(before(), after());
    expect(motion.offset).toBe(1);
    const frame = crossfadeFrame(motion, 0.25);
    expect(frame.faces?.get(0)).toEqual({ alpha: 0.75 });
    expect(frame.faces?.get(2)).toEqual({ alpha: 0.25 });
    // The buried face is left out, the after scene's faces numbered past the before's.
    expect(facesIn(frame.scene)).toEqual([0]);
    const patch = frame.scene.items.find((item) => item.kind === 'face' && item.group) as PaperFaceItem;
    expect(patch).toMatchObject({ face: 2, group: 'patches-1-after' });
  });

  it('changes the lines over halfway', () => {
    const motion = crossfadeMotion(before(), after());
    const lines = (share: number) =>
      crossfadeFrame(motion, share).scene.items.filter((item) => item.kind === 'line').map((item) => (item as PaperLineItem).role);
    expect(lines(0.49)).toEqual(['edge']);
    expect(lines(0.5)).toEqual(['aux']);
    const late = crossfadeFrame(motion, 0.9).scene.items.find((item) => item.kind === 'line') as PaperLineItem;
    expect(late.face).toBe(2);
  });
});

describe('a compound step’s legs', () => {
  /** ℓ: x = 50, as the engine's line `n · p = d`; the tests' model frame is the scene's px. */
  const X50 = { n: [1, 0] as const, d: 50 };
  /** Every landed face named by its own place, and its parent's. */
  const PLACE = (parents: ReadonlyMap<number, number>) => ({
    toScene: [1, 0, 0, 1, 0, 0] as SceneAffine,
    faceAt: (id: number) => (parents.has(id) ? id : undefined),
    parentFace: (face: number) => parents.get(face) ?? null,
  });
  /** A half turn about `axis` in two legs, a spread stacked as the parent and a close as the landed state, up or down. */
  const halfTurn = (axis: FoldModelLine, groups: [number[], 1 | -1][], then?: FoldIsometry): FoldMotionLeg[] =>
    (['spread', 'close'] as const).map((name, k) => ({
      name,
      stacking: k === 0 ? 'parent' : 'landed',
      groups: groups.map(([faces, sign]) => ({
        faces,
        axis,
        side: 'positive',
        from: (sign * k * Math.PI) / 2,
        to: (sign * (k + 1) * Math.PI) / 2,
        ...(then ? { then } : {}),
      })),
    }));
  const ring = (scene: PaperScene, id: number) =>
    (scene.items.find((item) => item.kind === 'face' && item.face === id && item.group === undefined) as PaperFaceItem)
      .rings[0]!;
  const side = (scene: PaperScene, id: number) =>
    (scene.items.find((item) => item.kind === 'face' && item.face === id) as PaperFaceItem).side;

  describe('of a reverse fold', () => {
    /**
     * An inside reverse of a two-layer flap, drawn top-down: before it, the
     * still layer 2 and the flap's lower layer 0 under its upper layer 1, the
     * tip right of ℓ; landed, the tip's pieces (faces 3 and 4, of 0 and 1)
     * mirrored left, turned between the layers: the upper piece now under the
     * lower. Faces 0 and 1 keep their pieces that stay.
     */
    const before = () => sceneOf([face(2, 'front', LEFT), face(0, 'front', RIGHT), face(1, 'back', RIGHT)]);
    const landed = () =>
      sceneOf([
        face(2, 'front', LEFT),
        face(4, 'front', LEFT),
        face(3, 'back', LEFT),
        face(0, 'front', LEFT),
        face(1, 'back', LEFT),
      ]);
    const parents = new Map([
      [3, 0],
      [4, 1],
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    // The lower block turns down, the upper one up.
    const legs = () =>
      legsMotion(before(), landed(), halfTurn(X50, [[[3], -1], [[4], 1]]), PLACE(parents))!;

    it('pairs the spread and the close into one swing', () => {
      expect(legs().swings).toEqual([[0, 1]]);
      expect([...legs().startFlipped].sort()).toEqual([3, 4]);
    });

    it('turns every group from where the parent had it to where it lands, the paper that stays still', () => {
      const start = poseLegs(legs(), 0, 0);
      RIGHT.forEach((p, k) => close(ring(start, 3)[k === 0 ? 1 : k === 1 ? 0 : k === 2 ? 3 : 2]!, p));
      const end = poseLegs(legs(), 1, 1);
      LEFT.forEach((p, k) => close(ring(end, 4)[k]!, p));
      expect(ring(poseLegs(legs(), 0, 0.7), 2)).toEqual(LEFT);
      for (const p of ring(poseLegs(legs(), 0, 1), 3)) expect(p[0]).toBeCloseTo(50, 9);
      // The legs meet edge-on.
      ring(poseLegs(legs(), 0, 1), 4).forEach((p, k) => close(ring(poseLegs(legs(), 1, 0), 4)[k]!, p));
    });

    it('stacks the spread as the parent did and the close as the landed state does', () => {
      // The spread: each piece ranked as the face it is a piece of lay — the
      // lower layer's under the upper's, both pieces of each together.
      expect(facesIn(poseLegs(legs(), 0, 0.25))).toEqual([2, 3, 0, 4, 1]);
      // The close: the landed order, so the last frame is the landed scene.
      expect(facesIn(poseLegs(legs(), 1, 0.13))).toEqual([2, 4, 3, 0, 1]);
      // Showing the side they showed until edge-on, shaded by the tilt.
      expect(side(poseLegs(legs(), 0, 0.25), 3)).toBe('front');
      expect(side(poseLegs(legs(), 1, 0.87), 3)).toBe('back');
      const shade = (scene: PaperScene, id: number) =>
        (scene.items.find((item) => item.kind === 'face' && item.face === id) as PaperFaceItem).shade;
      expect(shade(poseLegs(legs(), 0, 1), 3)).toBeCloseTo(1 - PAPER_TILT_SHADE[3], 9);
      expect(shade(poseLegs(legs(), 0, 1), 2)).toBe(1);
    });

    it('lands on the landed scene exactly', () => {
      expect(poseLegs(legs(), 1, 1).items).toEqual(landed().items);
    });

    it('has no motion for legs that name nothing in the scene, or a placement that flattens', () => {
      expect(legsMotion(before(), landed(), halfTurn(X50, [[[9], 1]]), PLACE(parents))).toBeNull();
      expect(
        legsMotion(before(), landed(), halfTurn(X50, [[[3], 1]]), { ...PLACE(parents), toScene: [1, 0, 2, 0, 0, 0] })
      ).toBeNull();
    });
  });

  describe('of a crimp', () => {
    /**
     * A crimp across a strip, every coordinate scene px: ℓ1 at x = 50, ℓ2 at
     * x = 80. The strip (face 1, x 50–80) turns over ℓ1; the tip's two layers
     * (2 under 3, x 80–100) turn over ℓ1 with it, to x 0–20, and back over
     * where ℓ2 went (x = 20), to x 20–40: a slide, the tip's stack read the
     * same at both ends and reversed between its two turns.
     */
    const before = () =>
      sceneOf([
        face(0, 'front', square(0, 50)),
        face(1, 'front', square(50, 80)),
        face(2, 'front', square(80, 100)),
        face(3, 'back', square(80, 100)),
      ]);
    const landed = () =>
      sceneOf([
        face(0, 'front', square(0, 50)),
        face(1, 'back', square(20, 50)),
        face(2, 'front', square(20, 40)),
        face(3, 'back', square(20, 40)),
      ]);
    const parents = new Map([0, 1, 2, 3].map((id) => [id, id]));
    const X20 = { n: [1, 0] as const, d: 20 };
    /** The reflection across x = 20: what the tip still does after its turn about ℓ1. */
    const ACROSS_20: FoldIsometry = [-1, 0, 40, 0, 1, 0];
    const crimp = () =>
      legsMotion(
        before(),
        landed(),
        [
          ...halfTurn(X50, [[[1], 1]]).map((leg, k) => ({
            ...leg,
            groups: [...leg.groups, ...halfTurn(X50, [[[2, 3], 1]], ACROSS_20)[k]!.groups],
          })),
          ...halfTurn(X20, [[[2, 3], 1]]).map((leg) => ({ ...leg, stacking: 'landed' as const })),
        ],
        PLACE(parents)
      )!;
    const xs = (scene: PaperScene, id: number) => ring(scene, id).map((p) => p[0]);

    it('plays two swings: the strip and the tip about ℓ1, then the tip about where ℓ2 went', () => {
      const motion = crimp();
      expect(motion.swings).toEqual([
        [0, 1],
        [2, 3],
      ]);
      expect(xs(poseLegs(motion, 0, 0), 2)).toEqual([80, 100, 100, 80].map((x) => expect.closeTo(x, 9)));
      expect(xs(poseLegs(motion, 1, 1), 2)).toEqual([20, 0, 0, 20].map((x) => expect.closeTo(x, 9)));
      expect(xs(poseLegs(motion, 3, 1), 2)).toEqual([20, 40, 40, 20]);
      // The strip, done after the first swing, rests where it landed.
      expect(ring(poseLegs(motion, 2, 0.5), 1)).toEqual(square(20, 50));
    });

    it('starts every leg where the one before it ended', () => {
      const motion = crimp();
      for (let k = 0; k + 1 < motion.legs.length; k += 1) {
        const end = poseLegs(motion, k, 1);
        const next = poseLegs(motion, k + 1, 0);
        for (const id of [0, 1, 2, 3]) {
          ring(end, id).forEach((p, j) => close(ring(next, id)[j]!, p));
          expect(side(next, id), `face ${id} at leg ${k + 1}`).toBe(side(end, id));
        }
        expect(facesIn(next), `leg ${k + 1}`).toEqual(facesIn(end));
      }
    });

    it('reads the tip’s stack reversed while it lies turned over once', () => {
      const motion = crimp();
      expect(facesIn(poseLegs(motion, 0, 0.5))).toEqual([0, 1, 2, 3]);
      expect(facesIn(poseLegs(motion, 1, 0.5))).toEqual([0, 1, 3, 2]);
      expect(facesIn(poseLegs(motion, 2, 0.5))).toEqual([0, 1, 3, 2]);
      expect(facesIn(poseLegs(motion, 3, 0.5))).toEqual([0, 1, 2, 3]);
      // Showing its other side between the turns, its own at both ends.
      expect(side(poseLegs(motion, 0, 0.2), 3)).toBe('back');
      expect(side(poseLegs(motion, 2, 0.2), 3)).toBe('front');
      expect(side(poseLegs(motion, 3, 0.8), 3)).toBe('back');
    });

    it('bounds every leg’s frames, and lands on the landed scene', () => {
      const motion = crimp();
      expect(motion.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
      expect(poseLegs(motion, 3, 1).items).toEqual(landed().items);
    });
  });

  it('rests a face through the legs before its first turn where that turn starts it', () => {
    // Face 1 turns over x = 50 in the first swing, face 2 over x = 50 in the second.
    const before = sceneOf([
      face(0, 'front', square(0, 50)),
      face(1, 'front', square(50, 100)),
      face(2, 'front', square(50, 100)),
    ]);
    const landed = sceneOf([
      face(0, 'front', square(0, 50)),
      face(1, 'back', square(0, 50)),
      face(2, 'back', square(0, 50)),
    ]);
    const first = halfTurn(X50, [[[1], 1]]);
    const second = halfTurn(X50, [[[2], 1]]);
    const motion = legsMotion(
      before,
      landed,
      [...first, ...second].map((leg, k) => ({ ...leg, stacking: k === 3 ? 'landed' : 'parent' })),
      PLACE(new Map([0, 1, 2].map((id) => [id, id])))
    )!;
    // Mirrored back across ℓ, where the parent had it, on the side it showed there.
    expect(ring(poseLegs(motion, 1, 0.5), 2)).toEqual(square(0, 50).map(([x, y]) => [expect.closeTo(100 - x, 9), y]));
    expect(side(poseLegs(motion, 1, 0.5), 2)).toBe('front');
    expect(ring(poseLegs(motion, 2, 0.5), 1)).toEqual(square(0, 50).map((p) => [expect.closeTo(p[0], 9), p[1]]));
  });

  it('keeps a woven run’s patches while their faces lie where they land, and drops them while they move', () => {
    const before = sceneOf([face(0, 'front', square(0, 50)), face(1, 'front', square(50, 100))]);
    const landed = sceneOf([
      face(0, 'front', square(0, 50)),
      face(1, 'back', square(0, 50)),
      { ...face(0, 'front', [[0, 0], [20, 0], [20, 20]]), group: 'patches-1' },
      { ...face(1, 'back', [[30, 0], [40, 0], [40, 20]]), group: 'patches-2' },
    ]);
    const motion = legsMotion(before, landed, halfTurn(X50, [[[1], 1]]), PLACE(new Map([[0, 0], [1, 1]])))!;
    const groups = (scene: PaperScene) =>
      scene.items.flatMap((item) => (item.kind === 'face' && item.group ? [item.group] : []));
    expect(groups(poseLegs(motion, 0, 0.5))).toEqual([]);
    expect(groups(poseLegs(motion, 1, 0.5))).toEqual(['patches-1']);
    expect(groups(poseLegs(motion, 1, 1))).toEqual(['patches-1', 'patches-2']);
  });
});

function square(x0: number, x1: number): ScenePoint[] {
  return [
    [x0, 0],
    [x1, 0],
    [x1, 100],
    [x0, 100],
  ];
}

describe('affineThrough', () => {
  it('finds the map that takes three points to three others', () => {
    const map: SceneAffine = [0.5, -2, 1.5, 3, 7, -4];
    const from: [ScenePoint, ScenePoint, ScenePoint] = [
      [0, 0],
      [3, 1],
      [-1, 4],
    ];
    const to = from.map((p) => applyAffine(map, p)) as [ScenePoint, ScenePoint, ScenePoint];
    const found = affineThrough(from, to);
    expect(found).not.toBeNull();
    found!.forEach((value, k) => expect(value).toBeCloseTo(map[k]!, 12));
    expect(affineThrough([[0, 0], [1, 1], [2, 2]], to)).toBeNull();
  });
});
