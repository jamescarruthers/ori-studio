import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Point } from '../../../lib/geometry';
import { lineThrough, sideOf } from '../../canvas/foldCanvasGeometry';
import { foldPickIndex, type FoldPick, type FoldPickIndex } from '../../canvas/foldPicking';
import type { FoldChoices, FoldOp, FoldVertexOp } from '../../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from '../../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls, type FoldEngineCompoundCalls } from '../../engine/foldEngineCompoundCalls';
import type { FoldVertexAnalysed } from '../../engine/foldEngineSquashWire';
import type { FoldEngineOutcome, FoldEngineRefused } from '../../engine/foldEngineWire';
import { freeLineThrough, movingPoint } from '../foldStepBuilder';
import {
  layerSheetPointAt,
  vertexAskedOp,
  vertexChosenOp,
  vertexStepFrom,
  type FoldVertexBuilt,
  type FoldVertexIntent,
  type FoldVertexTaken,
} from './vertexStep';

/**
 * Each vertex fold over the real bridge, in-process, as its tool folds it:
 * the clicks on the folded pane read into the op the engine describes first
 * (the compound question), the folder's choices taken of what that lists —
 * asked again when they make it another fold — and the step built from the
 * answers (`vertexChosenOp`, `vertexStepFrom`: the very functions the tool's
 * hook runs), which then lands through `step`, as a preview, a commit and a
 * replay land it. From the square: two squashes to the preliminary base, two
 * petal folds to the bird base (the vertex spike's route, research §5.3, in
 * the engine's frame: `crates/oristudio-fold/tests/vertex/cases.rs`); a
 * rabbit ear on the two-layer triangle, its ridge either way; a swivel on the
 * flat square, its fourth ray stepped.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(WASM);

interface Engine {
  calls: FoldEngineCalls;
  compound: FoldEngineCompoundCalls;
}

async function engine(): Promise<Engine> {
  const wasm = await import('../../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  const fold = new wasm.FoldEngine();
  return { calls: createFoldEngineCalls(fold), compound: createFoldEngineCompoundCalls(fold) };
}

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

const indexOf = (calls: FoldEngineCalls, state: number): FoldPickIndex =>
  foldPickIndex(calls.scene(state), calls.landmarks(state, []), []);

const p = (x: number, y: number): Point => ({ x, y });

const free = (at: Point): FoldPick => ({ kind: 'free', pane: 'folded', scene: at, sheet: null });

/** A point landmark at a scene point, named by `sheet`. */
const landmark = (at: Point, sheet: [number, number]): FoldPick => ({
  kind: 'point',
  provenance: 'vertex',
  sheet,
  mark: null,
  scene: at,
});

const NONE: FoldVertexTaken = { squashTarget: null, emergent: null, ridge: null, order: 0 };

const intent = (extra: Partial<FoldVertexIntent>): FoldVertexIntent => ({
  tool: 'squash',
  lineMode: 'free',
  picks: [],
  candidate: null,
  direction: 'valley',
  fanLayers: null,
  ...extra,
});

/** The compound question of a vertex op: its family's answer, or why it refused. */
function ask({ compound }: Engine, state: number, op: FoldVertexOp): FoldVertexAnalysed | FoldEngineRefused {
  const answer = compound.compoundAnalysis(state, op);
  if (answer.status !== 'ok') return answer;
  if (answer.family !== 'vertex') throw new Error(`answered for ${answer.family}`);
  return answer;
}

/** An answer that must describe the fold: an answer that did not throws, naming the refusal. */
function described(answer: FoldVertexAnalysed | FoldEngineRefused): FoldVertexAnalysed {
  if ('refusal' in answer) throw new Error(`refused: ${JSON.stringify(answer.refusal)}`);
  return answer;
}

interface Folded {
  first: FoldVertexAnalysed;
  answer: FoldVertexAnalysed;
  built: FoldVertexBuilt;
  /** Whether the choices made it another fold, asked again. */
  again: boolean;
}

/** A vertex fold as its tool builds it (see the module docs). */
function vertexFold(engined: Engine, state: number, wanted: FoldVertexIntent, taken: FoldVertexTaken = NONE): Folded {
  const base = vertexAskedOp(wanted, indexOf(engined.calls, state));
  if (!base || 'status' in base) throw new Error(`no op: ${JSON.stringify(base)}`);
  const first = described(ask(engined, state, base));
  const chosen = vertexChosenOp(base, first, taken);
  const answer = chosen.again ? described(ask(engined, state, chosen.op)) : first;
  return { first, answer, built: vertexStepFrom(chosen.op, answer, taken), again: chosen.again };
}

/** Land a built step as a preview, a commit and a replay land it. */
function land({ calls }: Engine, state: number, step: { op: FoldOp; choices?: FoldChoices }) {
  const folded = landed(calls.step(state, step.op, step.choices));
  expect(folded.compound?.family).toBe('vertex');
  return folded;
}

/** A plain fold along the free line through two sheet points, `toward`'s side moving. */
const valley = (through: [[number, number], [number, number]], moving: [number, number]): FoldOp => ({
  kind: 'valley',
  line: { via: 'free', through },
  moving,
  seed: { scope: 'all' },
});

const TURN: FoldOp = { kind: 'turn', axis: 'vertical' };

/** The vertex spike's small triangle: the square folded on bd onto a, then on ac (four layers). */
function smallTriangle({ calls }: Engine): number {
  const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
  const half = landed(calls.step(sheet, valley([[1, 0], [0, 1]], [1, 1]))).state;
  return landed(calls.step(half, valley([[0, 0], [0.5, 0.5]], [0.9, 0.1]))).state;
}

const t22 = Math.tan(Math.PI / 8) * 0.5;
/** The petal fold's landmarks on the preliminary base, in the model frame (`cases.rs` `petal_marks`). */
const MARKS = {
  t: [0.5, 0.5],
  open: [0, 0],
  ends: [
    [t22, 0.5],
    [0.5, t22],
  ],
  near: [
    [0.03, 0.44],
    [0.44, 0.03],
  ],
  petal: [0.26, 0.2],
} as const;

/** A model point in the scene frame: the view's mirror, x ↦ −x, when turned over. */
const sceneOf = (flipped: boolean, [x, y]: readonly [number, number]): Point => p(flipped ? -x : x, y);

/** A precrease along the scene line through `a` and `b`, through the top layer at `top`, or every layer on `toward`'s side. */
function precrease(
  { calls }: Engine,
  state: number,
  a: Point,
  b: Point,
  through: { top: Point } | { toward: Point }
): number {
  const index = indexOf(calls, state);
  const line = lineThrough(a, b);
  if (!line) throw new Error('no line');
  const ends = freeLineThrough(index, line);
  if (!ends) throw new Error('the line misses the paper');
  let along: Pick<Extract<FoldOp, { kind: 'precrease' }>, 'seed' | 'moving'>;
  if ('top' in through) {
    const at = layerSheetPointAt(index, through.top, 'valley');
    if (!at) throw new Error('no layer there');
    along = { seed: { scope: 'depth', at, layers: 1 } };
  } else {
    const moving = movingPoint(index, line, sideOf(line, through.toward) > 0 ? 1 : -1);
    if (!moving) throw new Error('no paper on that side');
    along = { seed: { scope: 'all' }, moving: moving.sheet };
  }
  const op: FoldOp = { kind: 'precrease', direction: 'valley', line: { via: 'free', through: ends }, ...along };
  return landed(calls.step(state, op)).state;
}

/** The kite precreases on the flap seen on top: from the open corner to each end of H. */
function kites(engined: Engine, state: number, flipped: boolean): number {
  let s = state;
  for (const k of [0, 1] as const) {
    s = precrease(engined, s, sceneOf(flipped, MARKS.open), sceneOf(flipped, MARKS.ends[k]), {
      top: sceneOf(flipped, MARKS.near[k]),
    });
  }
  return s;
}

/** A petal fold, H by its two ends (the line-mode route), the flap at the spike's petal point. */
function petal(engined: Engine, state: number, flipped: boolean): Folded {
  const [a, b] = MARKS.ends;
  const picks = [free(sceneOf(flipped, a)), free(sceneOf(flipped, b)), free(sceneOf(flipped, MARKS.petal))];
  return vertexFold(engined, state, intent({ tool: 'petal', lineMode: 'free', picks }));
}

describe.skipIf(!available)('the vertex folds over the real bridge, as their tools build them', () => {
  it('squashes the small triangle front and back into the preliminary base, a spine aimed off its hinge too', async () => {
    const engined = await engine();
    const { calls } = engined;
    const tri = smallTriangle(engined);
    expect(calls.summary(tri).faces).toBe(4);

    // The flap clicked: one order, on its hinge, nothing more to ask.
    const front = vertexFold(engined, tri, intent({ picks: [free(p(0.1, 0.5))] }));
    expect(front.again).toBe(false);
    expect(front.first.analysis.kind).toBe('squash');
    expect(front.first.orders).toBeNull();
    expect(front.built.step.op).toMatchObject({ kind: 'squash', direction: 'valley' });
    expect(front.built.step.choices).toBeUndefined();
    const one = land(engined, tri, front.built.step);

    // Aimed off its hinge, inside its wedge: asked again, and it lands; outside, refused.
    const analysis = front.first.analysis;
    if (analysis.kind !== 'squash') throw new Error('not a squash');
    const [hx, hy] = analysis.hinge_direction;
    const [sx, sy] = analysis.spine_direction;
    const inside: [number, number] = [hx + 0.3 * sx, hy + 0.3 * sy];
    const aimed = vertexFold(engined, tri, intent({ picks: [free(p(0.1, 0.5))] }), { ...NONE, squashTarget: inside });
    expect(aimed.again).toBe(true);
    if (aimed.answer.analysis.kind !== 'squash') throw new Error('not a squash');
    expect(Math.abs(aimed.answer.analysis.share)).toBeGreaterThan(0.05);
    land(engined, tri, aimed.built.step);
    const outside = vertexAskedOp(intent({ picks: [free(p(0.1, 0.5))] }), indexOf(calls, tri));
    if (!outside || 'status' in outside) throw new Error('no op');
    const refused = ask(engined, tri, { ...outside, kind: 'squash', target: [-sx, -sy] } as FoldVertexOp);
    expect(refused).toMatchObject({ status: 'refused', refusal: { code: 'squash_target_outside' } });

    // Turned over, the back flap: the preliminary base.
    const turned = landed(calls.step(one.state, TURN)).state;
    const back = vertexFold(engined, turned, intent({ picks: [free(sceneOf(true, [0.1, 0.7]))] }));
    const base = land(engined, turned, back.built.step);
    expect(base.summary.faces).toBe(8);

    // A single layer: no flap, under the engine's code, before anything folds.
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const flat = vertexAskedOp(intent({ picks: [free(p(0.3, 0.3))] }), indexOf(calls, sheet));
    if (!flat || 'status' in flat) throw new Error('no op');
    expect(ask(engined, sheet, flat)).toMatchObject({
      status: 'refused',
      refusal: { code: 'squash_no_flap', cause: 'single_layer' },
    });
  });

  it('petal folds the preliminary base front and back into the bird base, refusing H until it is precreased', async () => {
    const engined = await engine();
    const { calls } = engined;
    const tri = smallTriangle(engined);
    const front = land(engined, tri, vertexFold(engined, tri, intent({ picks: [free(p(0.1, 0.5))] })).built.step);
    const turned = landed(calls.step(front.state, TURN)).state;
    const back = vertexFold(engined, turned, intent({ picks: [free(sceneOf(true, [0.1, 0.7]))] }));
    const base = land(engined, turned, back.built.step).state;

    // H through its ends before it is precreased: refused by the tools, in the engine's words.
    const [a, b] = MARKS.ends;
    const early = vertexAskedOp(
      intent({ tool: 'petal', picks: [free(sceneOf(true, a)), free(sceneOf(true, b)), free(sceneOf(true, MARKS.petal))] }),
      indexOf(calls, base)
    );
    expect(early).toMatchObject({ status: 'refused', refusal: { code: 'petal_not_precreased', missing: 'line' } });

    // The kites and H precreased: the petal fold, its H the precrease along the line through its ends.
    const kited = kites(engined, base, true);
    const ready = precrease(engined, kited, sceneOf(true, a), sceneOf(true, b), { toward: sceneOf(true, MARKS.t) });
    const first = petal(engined, ready, true);
    expect(first.first.analysis.kind).toBe('petal');
    expect(first.built.step.op).toMatchObject({ kind: 'petal', direction: 'valley' });
    const petalled = land(engined, ready, first.built.step);

    // Turned over, the kites again (H runs through every layer), the second petal fold: the bird base.
    const over = kites(engined, landed(calls.step(petalled.state, TURN)).state, false);
    const bird = land(engined, over, petal(engined, over, false).built.step);
    expect(bird.summary.faces).toBe(24);
  });

  it('rabbit-ears the two-layer triangle, its ridge either way, each landing alone', async () => {
    const engined = await engine();
    const { calls } = engined;
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const tri = landed(calls.step(sheet, valley([[1, 0], [0, 1]], [1, 1]))).state;
    const picks = [
      landmark(p(0, 0), [0, 0]),
      landmark(p(1, 0), [1, 0]),
      landmark(p(0, 1), [0, 1]),
      free(p(0.6, 0.35)),
    ];
    const ear = vertexFold(engined, tri, intent({ tool: 'rabbit-ear', picks }));
    if (ear.first.analysis.kind !== 'rabbit-ear') throw new Error('not a rabbit ear');
    expect(ear.first.analysis.candidates).toHaveLength(3);
    expect(ear.first.emergents).toHaveLength(3);
    // The fourth ray taken is one that lands; its two ridges are listed, and the ridge decides the order.
    expect(ear.first.emergents[ear.answer.analysis.kind === 'rabbit-ear' ? (ear.answer.analysis.emergent ?? 0) : 0]).toBe(true);
    expect(ear.built.ridges).toHaveLength(2);
    expect(ear.built.ridge).toBe(0);
    expect(ear.built.step.choices).toBeUndefined();
    const states = [0, 1].map((ridge) => {
      const built = vertexStepFrom(ear.built.step.op, ear.answer, { ...NONE, ridge });
      expect(built.step.op).toHaveProperty('ridge');
      return land(engined, tri, built.step).fingerprint;
    });
    expect(states[0]).not.toBe(states[1]);
  });

  it('swivels the flat square about a free vertex, stepping its fourth ray among those that land', async () => {
    const engined = await engine();
    const { calls } = engined;
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const picks = [
      landmark(p(0.5, 0.3), [0.5, 0.3]),
      landmark(p(1, 0.6), [1, 0.6]),
      landmark(p(0, 0.6), [0, 0.6]),
      landmark(p(0.5, 0), [0.5, 0]),
      free(p(0.3, 0.9)),
    ];
    const wanted = intent({ tool: 'swivel', picks });
    const swivel = vertexFold(engined, sheet, wanted);
    if (swivel.first.analysis.kind !== 'swivel') throw new Error('not a swivel');
    const candidates = swivel.first.analysis.candidates;
    expect(candidates).toHaveLength(3);
    const fingerprints = new Set<string>();
    swivel.first.emergents.forEach((lands, emergent) => {
      const stepped = vertexFold(engined, sheet, wanted, { ...NONE, emergent });
      const folded = calls.step(sheet, stepped.built.step.op, stepped.built.step.choices);
      // What the question says of each candidate is what landing it does.
      expect(folded.status === 'ok', `candidate ${emergent}`).toBe(lands);
      if (folded.status === 'ok') fingerprints.add(folded.fingerprint);
    });
    expect(fingerprints.size).toBe(swivel.first.emergents.filter(Boolean).length);
  });
});
