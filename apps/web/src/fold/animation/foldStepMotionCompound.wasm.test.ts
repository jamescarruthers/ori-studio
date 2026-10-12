import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { paperSceneToFoldedGeometry } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import { DEFAULT_PAPER_STYLE } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import {
  SQUARE_PAPER,
  type FoldChoices,
  type FoldCrimpOp,
  type FoldOp,
  type FoldRabbitEarOp,
  type FoldSinkOp,
  type FoldSquashOp,
  type FoldTuckOp,
  type SheetPoint,
} from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls, type FoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import type { FoldCompoundReport } from '../engine/foldEngineCompoundWire';
import { createFoldEngineCrimpTuckCalls, type FoldEngineCrimpTuckCalls } from '../engine/foldEngineCrimpTuckCalls';
import { createFoldEngineIoCalls, type FoldEngineIoCalls } from '../engine/foldEngineIoCalls';
import { FOLD_SAMPLES, foldSampleSource } from '../engine/foldEngineIoSamples';
import { pocketChoice } from '../engine/foldEngineSinkWire';
import { createFoldEngineVertexCalls, type FoldEngineVertexCalls } from '../engine/foldEngineSquashCalls';
import type { FoldEngineOp, FoldEngineOutcome, FoldScene, FoldStepMotionLegs } from '../engine/foldEngineWire';
import {
  foldStepFrameAt,
  foldStepMotion,
  foldStepPaneAt,
  foldStepProgramme,
  type FoldStepMotion,
} from './foldStepMotion';
import { poseLegs, type FoldLegsMotion } from './foldStepPoses';

/**
 * Every compound family's motion from the real engine's legs and scenes,
 * in-process: a reverse fold of the crane, a crimp, a tuck, a squash, a
 * rabbit ear, the sinks. For each, the first frame is the parent's picture
 * — every point of the paper shows the side, and the face (a piece of), the
 * parent shows there — the last is the landed scene's, and each leg starts
 * on the frame the one before ended on. Skipped when the bridge has not been
 * built.
 */
const ROOT = process.cwd();
const WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const FIXTURES = resolve(ROOT, '../../tests/fixtures');
const available = existsSync(WASM);

/** The pane's placement, as a y-up model drawn y-down: 100 px to the sheet. */
const SCALE = 100;
const PLACE: FoldedFlatPaperSceneOptions = {
  markHidden: true,
  toScenePx: (p) => [p.x * SCALE, -p.y * SCALE],
  scale: SCALE,
};
const PANE = foldStepPaneAt(PLACE);

interface Engine {
  calls: FoldEngineCalls;
  compound: FoldEngineCrimpTuckCalls;
  question: FoldEngineCompoundCalls;
  vertex: FoldEngineVertexCalls;
  io: FoldEngineIoCalls;
}

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

/** A landing's compound report, which must be `family`'s. */
function reportOf(report: FoldCompoundReport | undefined, family: FoldCompoundReport['family']): FoldCompoundReport {
  if (report?.family !== family) throw new Error(`no ${family} report: ${JSON.stringify(report)}`);
  return report;
}

/** A landed compound step: its op, its parent and landed states, and its legs. */
interface Folded {
  op: FoldOp;
  parent: number;
  state: number;
  legs: FoldStepMotionLegs;
}

function motionOf({ calls }: Engine, folded: Folded): { motion: FoldStepMotion; before: FoldScene; after: FoldScene } {
  const before = calls.scene(folded.parent);
  const after = calls.scene(folded.state);
  const motion = foldStepMotion({ op: folded.op, before, after, action: null, report: null, legs: folded.legs }, PANE);
  return { motion, before, after };
}

const valley = (through: readonly [SheetPoint, SheetPoint], moving: SheetPoint): FoldOp => ({
  kind: 'valley',
  line: { via: 'free', through },
  moving,
  seed: { scope: 'all' },
});

/** The square folded on its diagonal, corner (1, 1) over onto (0, 0): a two-layer triangle. */
function triangle({ calls }: Engine): number {
  const sheet = landed(calls.sheet(SQUARE_PAPER)).state;
  return landed(calls.step(sheet, valley([[1, 0], [0, 1]], [0.9, 0.9]))).state;
}

/** A sample imported as Import CP lands it, its one order picked. */
function sample({ io }: Engine, id: 'preliminary-base'): number {
  const found = FOLD_SAMPLES.find((s) => s.id === id);
  if (!found) throw new Error(`no sample ${id}`);
  const opened = landed(io.importCp(foldSampleSource(found), { kind: 'empty', startSide: 'front' }));
  return landed(io.importPick(opened.import, [])).state;
}

// ---------------------------------------------------------------------------
// What the reader sees

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

/** How far `p` is from the nearest edge of any face of the scenes: a point on one is no sample of either side. */
function clearance(scenes: readonly PaperScene[], [x, y]: ScenePoint): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const scene of scenes) {
    for (const item of scene.items) {
      if (item.kind !== 'face') continue;
      for (const ring of item.rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
          const [ax, ay] = ring[j]!;
          const [bx, by] = ring[i]!;
          const dx = bx - ax;
          const dy = by - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
          nearest = Math.min(nearest, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
        }
      }
    }
  }
  return nearest;
}

/** The last face drawn over `p`, and its side; null off the paper. */
function seenAt(scene: PaperScene, p: ScenePoint): { face: number; side: PaperFaceItem['side'] } | null {
  let seen: { face: number; side: PaperFaceItem['side'] } | null = null;
  for (const item of scene.items) {
    if (item.kind === 'face' && inside(item.rings, p)) seen = { face: item.face, side: item.side };
  }
  return seen;
}

/** Points across the scenes' bounds, clear of every face edge of both. */
function samples(a: PaperScene, b: PaperScene): ScenePoint[] {
  const minX = Math.min(a.bounds.minX, b.bounds.minX);
  const minY = Math.min(a.bounds.minY, b.bounds.minY);
  const maxX = Math.max(a.bounds.maxX, b.bounds.maxX);
  const maxY = Math.max(a.bounds.maxY, b.bounds.maxY);
  const out: ScenePoint[] = [];
  for (let i = 0; i < 29; i += 1) {
    for (let j = 0; j < 29; j += 1) {
      const p: ScenePoint = [minX + (maxX - minX) * ((i + 0.37) / 29), minY + (maxY - minY) * ((j + 0.61) / 29)];
      if (clearance([a, b], p) > 1e-3) out.push(p);
    }
  }
  return out;
}

/** The two frames show the same face, on the same side, at every sample; `face` names a frame's face as the other's. */
function expectSeenAlike(frame: PaperScene, end: PaperScene, label: string, face: (id: number) => number | null = (id) => id) {
  const points = samples(frame, end);
  expect(points.length).toBeGreaterThan(100);
  for (const p of points) {
    const a = seenAt(frame, p);
    const b = seenAt(end, p);
    expect(a && { face: face(a.face), side: a.side }, `${label} at ${p.map((v) => v.toFixed(2)).join(', ')}`).toEqual(b);
  }
}

/** Every face of `a` drawn where `b` draws it, corner for corner. */
function expectRingsClose(a: PaperScene, b: PaperScene, label: string) {
  for (const item of b.items) {
    if (item.kind !== 'face' || item.group !== undefined) continue;
    const other = a.items.find(
      (each): each is PaperFaceItem => each.kind === 'face' && each.face === item.face && each.group === undefined
    );
    expect(other, `${label}: face ${item.face}`).toBeDefined();
    item.rings.forEach((ring, r) =>
      ring.forEach((p, k) => {
        const q = other!.rings[r]![k]!;
        expect(Math.hypot(q[0] - p[0], q[1] - p[1]), `${label}: face ${item.face}`).toBeLessThan(1e-6);
      })
    );
  }
}

/** Each landed face's parent face, by the before scene's face numbers, as the motion ranks them. */
function parentFaceOf(before: FoldScene, after: FoldScene): (face: number) => number | null {
  const parentAt = new Map(before.lineage.map((face, index) => [face.id, index]));
  return (face) => {
    const lineage = after.lineage[face];
    if (!lineage) return null;
    return parentAt.get(lineage.id) ?? (lineage.parent === null ? null : (parentAt.get(lineage.parent) ?? null));
  };
}

/**
 * The checks every family's motion passes: legs, a first frame that is the
 * parent's picture, a last that is the landed one, every leg starting where
 * the one before ended, frames the painter draws.
 */
function expectPlays(engine: Engine, folded: Folded, swings: number) {
  const { motion, before, after } = motionOf(engine, folded);
  expect(motion.motion.kind).toBe('legs');
  const legs = motion.motion as FoldLegsMotion;
  expect(legs.swings).toHaveLength(swings);
  expect(foldStepProgramme(motion).legs).toHaveLength(swings);
  // The first frame: the parent's picture, every face where (a piece of) it lay.
  const first = poseLegs(legs, 0, 0);
  expectSeenAlike(first, motion.before, 'first frame', parentFaceOf(before, after));
  // Which is not the landed one: the step moves paper — out of sight, for a
  // tuck between the layers, so by where the faces lie.
  const lies = (scene: PaperScene) =>
    new Map(scene.items.flatMap((item) => (item.kind === 'face' && !item.group ? [[item.face, item.rings]] : [])));
  const landedRings = lies(motion.after);
  const moved = [...lies(first)].filter(([face, rings]) =>
    rings.some((ring, r) => ring.some((p, k) => {
      const q = landedRings.get(face)?.[r]?.[k];
      return !q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1;
    }))
  );
  expect(moved.length).toBeGreaterThan(0);
  // The last: the landed picture.
  const last = poseLegs(legs, legs.legs.length - 1, 1);
  expectRingsClose(last, motion.after, 'last frame');
  expectSeenAlike(last, motion.after, 'last frame');
  // Every leg starts where the one before ended: the same footprint, faces and sides.
  for (let k = 0; k + 1 < legs.legs.length; k += 1) {
    const end = poseLegs(legs, k, 1);
    const next = poseLegs(legs, k + 1, 0);
    expectRingsClose(next, end, `leg ${k + 1}`);
    expectSeenAlike(next, end, `leg ${k + 1}`);
  }
  // The programme's ends are the two scenes themselves; between, the painter draws every frame.
  expect(foldStepFrameAt(motion, 0).scene).toBe(motion.before);
  expect(foldStepFrameAt(motion, 1).scene).toBe(motion.after);
  for (const progress of [0.1, 0.35, 0.5, 0.65, 0.9]) {
    const geometry = paperSceneToFoldedGeometry(foldStepFrameAt(motion, progress).scene, DEFAULT_PAPER_STYLE, {
      policy: PAPER_STYLE_POLICIES.fold,
    });
    expect(geometry.fills.count).toBeGreaterThan(0);
  }
  return legs;
}

describe.skipIf(!available)('every compound fold’s motion from the engine’s legs', () => {
  let engine: Engine;
  beforeAll(async () => {
    const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    const fold = new wasm.FoldEngine();
    engine = {
      calls: createFoldEngineCalls(fold),
      compound: createFoldEngineCrimpTuckCalls(fold),
      question: createFoldEngineCompoundCalls(fold),
      vertex: createFoldEngineVertexCalls(fold),
      io: createFoldEngineIoCalls(fold),
    };
  });

  it('plays the crane’s inside reverse folds on Beloch’s bird base', () => {
    const { calls, io } = engine;
    const crane = JSON.parse(readFileSync(resolve(FIXTURES, 'fold-crane/crane-on-bird-base.json'), 'utf8')) as {
      import: { fixture: string; choice: number[] };
      steps: { name: string; op: FoldEngineOp; choices: FoldChoices }[];
    };
    // Mirrored top to bottom, as the reverse tool's test lands it.
    const file = JSON.parse(readFileSync(resolve(FIXTURES, crane.import.fixture), 'utf8')) as {
      vertices_coords: [number, number][];
    };
    const text = JSON.stringify({ ...file, vertices_coords: file.vertices_coords.map(([x, y]) => [x, 1 - y]) });
    const opened = landed(io.importCp({ format: 'fold', text }, { kind: 'empty', startSide: 'front' }));
    let state = landed(io.importPick(opened.import, crane.import.choice)).state;
    let played = 0;
    for (const { name, op, choices } of crane.steps) {
      const step = landed(calls.step(state, op, choices));
      if (op.kind === 'inside-reverse' && step.compound) {
        expectPlays(engine, { op: op as FoldOp, parent: state, state: step.state, legs: step.compound.motion }, 1);
        played += 1;
      }
      expect(name).toBeTruthy();
      state = step.state;
    }
    expect(played).toBeGreaterThan(0);
  });

  /**
   * The triangle's crimps (the engine's `the_triangles_crimp_lands_by_the_lines_angle`):
   * ℓ1 across the spine at (0.4, 0.6), ℓ2 through (0.62, 0.38) at 36.87°
   * (inside only), at 53.13° (outside only), or parallel to ℓ1 (either).
   */
  const CRIMPS: [string, number | 'parallel', FoldCrimpOp['crimp']][] = [
    ['36.87°, inside', 36.87, 'inside'],
    ['53.13°, outside', 53.13, 'outside'],
    ['parallel, inside', 'parallel', 'inside'],
    ['parallel, outside', 'parallel', 'outside'],
  ];
  const crimpOp = (degrees: number | 'parallel', kind: FoldCrimpOp['crimp']): FoldCrimpOp => {
    const angle = degrees === 'parallel' ? Math.PI / 4 : (degrees * Math.PI) / 180;
    const from: SheetPoint = degrees === 'parallel' ? [0.6, 0.4] : [0.62, 0.38];
    return {
      kind: 'crimp',
      line: { via: 'free', through: [[0.4, 0.6], [0.6, 0.8]] },
      second: { via: 'free', through: [from, [from[0] + 0.3 * Math.cos(angle), from[1] + 0.3 * Math.sin(angle)]] },
      crimp: kind,
      moving: [0.97, 0.06],
      seed: { scope: 'all' },
    };
  };

  it.each(CRIMPS)('plays the triangle’s crimp (%s) in one swing, both lines folding together', (_, degrees, kind) => {
    const tri = triangle(engine);
    const op = crimpOp(degrees, kind);
    const folded = landed(engine.compound.crimp(tri, op));
    if (folded.outcome !== 'landed') throw new Error(folded.outcome);
    expect(folded.compound.motion.legs.map((leg) => [leg.name, leg.stacking])).toEqual([
      ['spread', 'parent'],
      ['close', 'landed'],
    ]);
    expectPlays(engine, { op, parent: tri, state: folded.state, legs: folded.compound.motion }, 1);
  });

  it.each(CRIMPS)('keeps the crimp’s tip in sight all the way through (%s)', (_, degrees, kind) => {
    const tri = triangle(engine);
    const op = crimpOp(degrees, kind);
    const folded = landed(engine.compound.crimp(tri, op));
    if (folded.outcome !== 'landed') throw new Error(folded.outcome);
    const legs = folded.compound.motion;
    const { motion, after } = motionOf(engine, { op, parent: tri, state: folded.state, legs });
    // The tip: the faces that turn about ℓ2 as the strip carries it, by their place in the scenes.
    const tipIds = new Set(legs.legs[0]!.groups.flatMap((group) => (group.carrier ? group.faces : [])));
    const tip = new Set(after.lineage.flatMap((face, index) => (tipIds.has(face.id) ? [index] : [])));
    expect(tip.size).toBeGreaterThan(0);
    const points = samples(motion.before, motion.after);
    const seen: string[] = [];
    for (let k = 1; k < 50; k += 1) {
      const frame = foldStepFrameAt(motion, k / 50).scene;
      const shown = points.filter((p) => {
        const top = seenAt(frame, p);
        return top !== null && tip.has(top.face);
      }).length;
      seen.push(`${(k / 50).toFixed(2)}:${shown}`);
      expect(shown, `the tip at ${k / 50} (${seen.join(' ')})`).toBeGreaterThan(0);
    }
  });

  it('plays a tuck of the book’s corner under the layer beside it', () => {
    const sheet = landed(engine.calls.sheet(SQUARE_PAPER)).state;
    const book = landed(engine.calls.step(sheet, valley([[0.5, 0], [0.5, 1]], [0.75, 0.5]))).state;
    const op: FoldTuckOp = {
      kind: 'tuck',
      line: { via: 'free', through: [[0, 0.3], [0.3, 0]] },
      direction: 'valley',
      seed: { scope: 'flaps', at: [[0.05, 0.05]] },
      target: [0.75, 0.5],
    };
    const folded = landed(engine.compound.tuck(book, op));
    if (folded.outcome !== 'landed') throw new Error(folded.outcome);
    expectPlays(engine, { op, parent: book, state: folded.state, legs: folded.compound.motion }, 1);
  });

  it('plays a squash in its two stages: the flap opened across its spine, then pressed flat', () => {
    const half = triangle(engine);
    const small = landed(engine.calls.step(half, valley([[0, 0], [0.5, 0.5]], [0.9, 0.1]))).state;
    const top = engine.calls.topVisibleAt(small, [0.1, 0.5]);
    if (!top) throw new Error('nothing on top');
    const op: FoldSquashOp = { kind: 'squash', flap: top.sheet, direction: 'valley' };
    const stepped = landed(engine.calls.step(small, op));
    const vertex = reportOf(stepped.compound, 'vertex');
    const legs = expectPlays(engine, { op, parent: small, state: stepped.state, legs: vertex.motion }, 2);
    expect(legs.legs.map((leg) => leg.stacking)).toEqual(['parent', 'parent', 'parent', 'landed']);
  });

  it('plays a rabbit ear of the triangle, its one ear', () => {
    const tri = triangle(engine);
    const op: FoldRabbitEarOp = {
      kind: 'rabbit-ear',
      corners: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      emergent: [-1, 0],
      seed: { scope: 'all' },
      stayer: [0.6, 0.35],
      direction: 'valley',
    };
    // Its fourth crease is its ridge: one ear, landed through `step` as a stored one replays.
    const stepped = landed(engine.calls.step(tri, op));
    const vertex = reportOf(stepped.compound, 'vertex');
    const stages = new Set(vertex.motion.legs.map((_, k) => Math.floor(k / 2))).size;
    expectPlays(engine, { op, parent: tri, state: stepped.state, legs: vertex.motion }, stages);
  });

  describe('the sinks of the preliminary base’s point', () => {
    const C: SheetPoint = [0.5, 0.5];
    const at = (p: SheetPoint, toward: SheetPoint, t: number): SheetPoint => [
      p[0] + t * (toward[0] - p[0]),
      p[1] + t * (toward[1] - p[1]),
    ];
    const ring = (f: number): [SheetPoint, SheetPoint] => [at(C, [0, 0], f), at(C, [0, 0.5], 2 * f)];
    const tip = (f: number): SheetPoint => {
      const [a, b] = ring(f);
      return [(C[0] + a[0] + b[0]) / 3, (C[1] + a[1] + b[1]) / 3];
    };
    const sinkOp = (kind: FoldSinkOp['kind'], f: number): FoldSinkOp => ({
      kind,
      line: { via: 'free', through: ring(f) },
      seed: { scope: 'flaps', at: [tip(f)] },
    });

    it('plays an open sink, and the unsink that takes it back', () => {
      const base = sample(engine, 'preliminary-base');
      const op = sinkOp('open-sink', 0.3);
      const sunk = landed(engine.calls.step(base, op));
      const sink = reportOf(sunk.compound, 'sink');
      expectPlays(engine, { op, parent: base, state: sunk.state, legs: sink.motion }, 1);
      const [a, b] = ring(0.3);
      const unsink: FoldSinkOp = {
        kind: 'unsink',
        line: { via: 'crease', at: at(a, b, 0.5) },
        seed: { scope: 'flaps', at: [tip(0.3)] },
      };
      const back = landed(engine.calls.step(sunk.state, unsink));
      const unsunk = reportOf(back.compound, 'sink');
      expectPlays(engine, { op: unsink, parent: sunk.state, state: back.state, legs: unsunk.motion }, 1);
    });

    it('plays a closed sink into each pocket', () => {
      const base = sample(engine, 'preliminary-base');
      const op = sinkOp('closed-sink', 0.3);
      const answer = landed(engine.question.compoundAnalysis(base, op));
      if (answer.family !== 'sink') throw new Error(`answered for ${answer.family}`);
      for (const pocket of answer.analysis.pockets) {
        const sunk = landed(engine.calls.step(base, op, { pocket: pocketChoice(pocket.stored) }));
        const legs = reportOf(sunk.compound, 'sink').motion;
        expectPlays(engine, { op, parent: base, state: sunk.state, legs }, legs.legs.length / 2);
      }
    });
  });
});
