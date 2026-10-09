import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paperSceneToFoldedGeometry } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import { DEFAULT_PAPER_STYLE } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldOp } from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import type { FoldEngineOutcome } from '../engine/foldEngineWire';
import {
  foldStepFrame,
  foldStepFrameAt,
  foldStepMotion,
  foldStepPaneAt,
  foldStepProgramme,
  type FoldStepMotion,
} from './foldStepMotion';

/**
 * Step motions built from the real engine's scenes, in-process: what the
 * folded pane gets from the session. The frames are checked where it matters
 * — at the ends, against the states the engine landed, by what the reader
 * would see at points across the paper — and through the painter that draws
 * them. Skipped when the bridge has not been built.
 */
const ROOT = process.cwd();
const WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(WASM);

/** The pane's placement, as a y-up model drawn y-down: 100 px to the sheet, every state alike. */
const SCALE = 100;
const PLACE: FoldedFlatPaperSceneOptions = {
  markHidden: true,
  toScenePx: (p) => [p.x * SCALE, -p.y * SCALE],
  scale: SCALE,
};
const PANE = foldStepPaneAt(PLACE);

const BOOK: FoldOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0.5, 0], [0.5, 1]] },
  moving: [0.75, 0.5],
  seed: { scope: 'all' },
};
/** The book folded in half again, top over bottom: through both layers. */
const HALF_AGAIN: FoldOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0, 0.5], [0.5, 0.5]] },
  moving: [0.25, 0.75],
  seed: { scope: 'all' },
};

async function engine(): Promise<FoldEngineCalls> {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  return createFoldEngineCalls(new wasm.FoldEngine());
}

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

/** Fold `ops` from the square, and the motion of the last one. */
async function motionOf(ops: readonly FoldOp[]): Promise<FoldStepMotion> {
  const calls = await engine();
  let state = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
  let parent = state;
  let report = null;
  for (const op of ops) {
    parent = state;
    const step = landed(calls.step(state, op));
    state = step.state;
    report = step.report;
  }
  const op = ops[ops.length - 1]!;
  return foldStepMotion(
    {
      op,
      before: calls.scene(parent),
      after: calls.scene(state),
      action: landed(calls.stepAction(state)).action,
      report,
    },
    PANE
  );
}

/** Even-odd: is `p` inside the rings? */
function inside(rings: readonly ScenePoint[][], [x, y]: ScenePoint): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** What the reader sees at `p`: the last face drawn over it, and its side; null off the paper. */
function seenAt(scene: PaperScene, p: ScenePoint): { face: number; side: PaperFaceItem['side'] } | null {
  let seen: { face: number; side: PaperFaceItem['side'] } | null = null;
  for (const item of scene.items) {
    if (item.kind === 'face' && inside(item.rings, p)) seen = { face: item.face, side: item.side };
  }
  return seen;
}

/** Points across the scene's bounds, off any line a crease pattern of halves and quarters has. */
function samples(scene: PaperScene): ScenePoint[] {
  const { minX, minY, maxX, maxY } = scene.bounds;
  const out: ScenePoint[] = [];
  for (let i = 0; i < 23; i += 1) {
    for (let j = 0; j < 23; j += 1) {
      out.push([minX + (maxX - minX) * ((i + 0.37) / 23), minY + (maxY - minY) * ((j + 0.61) / 23)]);
    }
  }
  return out;
}

const pose = (angle: number) => ({ flap: 0, angle, press: 0 });
/** A moment strictly inside the programme, posed at `angle`. */
const at = (angle: number) => ({ progress: 0.5, pose: pose(angle) });
const EPSILON = 1e-6;

function expectSeenAlike(frame: PaperScene, end: PaperScene, compare: 'face' | 'side') {
  for (const p of samples(end)) {
    const a = seenAt(frame, p);
    const b = seenAt(end, p);
    expect(compare === 'face' ? a : a?.side, `at ${p.join(', ')}`).toEqual(compare === 'face' ? b : b?.side);
  }
}

/** Every point the landed scene draws a face with has a posed point within `tolerance` px. */
function expectRingsClose(frame: PaperScene, end: PaperScene, tolerance: number) {
  for (const item of end.items) {
    if (item.kind !== 'face') continue;
    const posed = frame.items.find(
      (other): other is PaperFaceItem => other.kind === 'face' && other.face === item.face && other.group === item.group
    );
    expect(posed, `face ${item.face}`).toBeDefined();
    for (const p of item.rings.flat()) {
      const nearest = Math.min(...posed!.rings.flat().map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
      expect(nearest).toBeLessThan(tolerance);
    }
  }
}

const faceOrder = (scene: PaperScene, among: ReadonlySet<number>) =>
  scene.items.filter((item): item is PaperFaceItem => item.kind === 'face' && among.has(item.face)).map((item) => item.face);

describe.skipIf(!available)('a step’s motion from the engine’s scenes', () => {
  it('starts a book fold on the parent’s scene and lands it on the landed one, continuously', async () => {
    const motion = await motionOf([BOOK]);
    expect(motion.step).toBe('valley');
    expect(motion.motion.kind).toBe('hinge');
    expect(foldStepFrameAt(motion, 0).scene).toBe(motion.before);
    expect(foldStepFrameAt(motion, 1).scene).toBe(motion.after);
    // θ → 180°: the frame converges on the landed scene, face for face, and the
    // reader sees the same face on the same side everywhere.
    const nearlyLanded = foldStepFrame(motion, at(Math.PI - EPSILON)).scene;
    expectRingsClose(nearlyLanded, motion.after, 1e-3);
    expectSeenAlike(nearlyLanded, motion.after, 'face');
    // θ → 0°: the paper the parent showed, on the side it showed it.
    expectSeenAlike(foldStepFrame(motion, at(EPSILON)).scene, motion.before, 'side');
  });

  it('reverses the moving stack past edge-on, folding through two layers', async () => {
    const motion = await motionOf([BOOK, HALF_AGAIN]);
    if (motion.motion.kind !== 'hinge') throw new Error('not a hinge');
    const moving = new Set(motion.motion.moving.flatMap((block) => (block.face === null ? [] : [block.face])));
    expect(moving.size).toBe(2);
    const landedOrder = faceOrder(motion.after, moving);
    expect(faceOrder(foldStepFrame(motion, at(Math.PI / 2 + 1e-3)).scene, moving)).toEqual(landedOrder);
    expect(faceOrder(foldStepFrame(motion, at(Math.PI / 2 - 1e-3)).scene, moving)).toEqual([...landedOrder].reverse());
    // A valley: the moving group over the layers that stay, all the way.
    const frame = foldStepFrame(motion, at(1)).scene;
    const faces = frame.items.filter((item): item is PaperFaceItem => item.kind === 'face');
    const firstMoving = faces.findIndex((item) => moving.has(item.face));
    expect(faces.slice(firstMoving).every((item) => moving.has(item.face))).toBe(true);
    const nearlyLanded = foldStepFrame(motion, at(Math.PI - EPSILON)).scene;
    expectRingsClose(nearlyLanded, motion.after, 1e-3);
    expectSeenAlike(nearlyLanded, motion.after, 'face');
    expectSeenAlike(foldStepFrame(motion, at(EPSILON)).scene, motion.before, 'side');
  });

  it('draws a mountain’s moving paper under the paper that stays', async () => {
    const motion = await motionOf([{ ...BOOK, kind: 'mountain' }]);
    if (motion.motion.kind !== 'hinge') throw new Error('not a hinge');
    expect(motion.motion.direction).toBe('mountain');
    const frame = foldStepFrame(motion, at(2)).scene;
    expect(frame.items[0]?.kind === 'face' && motion.motion.moving[0]?.face === frame.items[0].face).toBe(true);
    expectSeenAlike(foldStepFrame(motion, at(Math.PI - EPSILON)).scene, motion.after, 'face');
  });

  it('folds a precrease over, holds it, and brings it back to the landed scene', async () => {
    const motion = await motionOf([
      {
        kind: 'precrease',
        direction: 'valley',
        line: { via: 'free', through: [[0, 0], [1, 1]] },
        moving: [0.75, 0.25],
        seed: { scope: 'all' },
      },
    ]);
    if (motion.motion.kind !== 'hinge') throw new Error('not a hinge');
    expect(motion.motion.start).toBe('in-place');
    expect(foldStepProgramme(motion).legs.map((leg) => leg.heading)).toEqual(['fold', 'unfold']);
    // The middle of the programme is the hold: folded over the diagonal, the
    // moving corner on the far side of it, showing its back.
    const held = foldStepFrameAt(motion, 0.5).scene;
    const corner = seenAt(held, [20, -80]);
    expect(corner?.side).toBe('back');
    expect(seenAt(held, [80, -20])).toBeNull();
    expect(foldStepFrameAt(motion, 1).scene).toBe(motion.after);
    expectSeenAlike(foldStepFrame(motion, at(EPSILON)).scene, motion.after, 'face');
  });

  it('unfolds a flap back off the paper', async () => {
    const motion = await motionOf([
      BOOK,
      { kind: 'unfold', crease: [0.5, 0.5], direction: 'valley', seed: { scope: 'depth', at: [0.25, 0.5], layers: 1 } },
    ]);
    expect(motion.motion.kind).toBe('hinge');
    const nearlyLanded = foldStepFrame(motion, at(Math.PI - EPSILON)).scene;
    expectSeenAlike(nearlyLanded, motion.after, 'face');
    expectSeenAlike(foldStepFrame(motion, at(EPSILON)).scene, motion.before, 'side');
  });

  it.each([
    ['vertical', { kind: 'turn', axis: 'vertical' }],
    ['horizontal', { kind: 'turn', axis: 'horizontal' }],
  ] as const)('turns the model over about its %s axis as the view turns', async (_, turn) => {
    const motion = await motionOf([BOOK, HALF_AGAIN, turn]);
    expect(motion.motion.kind === 'turn' && motion.motion.turn.kind).toBe('over');
    expect(foldStepProgramme(motion).legs[0]?.roll).toBe(true);
    const nearlyLanded = foldStepFrame(motion, at(Math.PI - EPSILON)).scene;
    expectRingsClose(nearlyLanded, motion.after, 1e-3);
    expectSeenAlike(nearlyLanded, motion.after, 'face');
    const justStarted = foldStepFrame(motion, at(EPSILON)).scene;
    expectRingsClose(justStarted, motion.before, 1e-3);
    expectSeenAlike(justStarted, motion.before, 'face');
  });

  it.each([
    ['a quarter turn clockwise', { amount: 'quarter', direction: 'cw' }],
    ['an eighth anticlockwise', { amount: 'eighth', direction: 'ccw' }],
    ['a half turn', { amount: 'half', direction: 'cw' }],
  ] as const)('turns the model round by %s', async (_, rotate) => {
    const motion = await motionOf([BOOK, { kind: 'rotate', rotate }]);
    expect(motion.motion.kind === 'turn' && motion.motion.turn.kind).toBe('round');
    const nearlyLanded = foldStepFrame(motion, at(Math.PI - EPSILON)).scene;
    expectRingsClose(nearlyLanded, motion.after, 1e-3);
    expectSeenAlike(nearlyLanded, motion.after, 'face');
    // Clockwise on the screen is clockwise in the model, mirror and all: a
    // clockwise quarter turn's first move takes the top of the sheet right.
    if (rotate.amount === 'quarter' && motion.motion.kind === 'turn' && motion.motion.turn.kind === 'round') {
      expect(motion.motion.turn.angle).toBeCloseTo(Math.PI / 2, 9);
    }
  });

  it('crossfades an import, and a fold it cannot hinge', async () => {
    const book = await motionOf([BOOK]);
    const calls = await engine();
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const folded = landed(calls.step(sheet, BOOK));
    const input = { before: calls.scene(sheet), after: calls.scene(folded.state), action: null, report: null };
    const imported = foldStepMotion({ ...input, op: { kind: 'cp-jump', cpJson: '{}', orderJson: '{}', origin: 'cp' } }, PANE);
    expect(imported.step).toBe('import');
    expect(imported.motion.kind).toBe('crossfade');
    expect(foldStepFrameAt(imported, 0.5).faces?.size).toBeGreaterThan(0);
    // No picture of the step to hinge it about: never a motion invented.
    expect(foldStepMotion({ ...input, op: BOOK }, PANE).motion.kind).toBe('crossfade');
    expect(book.motion.kind).toBe('hinge');
  });

  it('paints every kind of frame through the folded pane’s painter', async () => {
    const motions = [
      await motionOf([BOOK, HALF_AGAIN]),
      await motionOf([BOOK, { kind: 'turn', axis: 'vertical' }]),
      await motionOf([BOOK, { kind: 'rotate', rotate: { amount: 'quarter', direction: 'ccw' } }]),
    ];
    for (const motion of motions) {
      for (const progress of [0, 0.3, 0.6, 1]) {
        const frame = foldStepFrameAt(motion, progress);
        const geometry = paperSceneToFoldedGeometry(frame.scene, DEFAULT_PAPER_STYLE, {
          policy: PAPER_STYLE_POLICIES.fold,
          ...(frame.faces ? { faces: frame.faces } : {}),
        });
        expect(geometry.fills.count).toBeGreaterThan(0);
        expect(geometry.strokes.count).toBeGreaterThan(0);
      }
    }
  });
});
