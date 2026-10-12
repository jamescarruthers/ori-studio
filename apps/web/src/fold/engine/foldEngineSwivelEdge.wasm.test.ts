import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFoldReplayer } from '../document/foldReplay';
import { sequenceOf, step } from '../document/foldSequence.fixtures';
import {
  isLockedStep,
  type FoldPrecreaseOp,
  type FoldSequenceDocument,
  type FoldSwivelEdgeOp,
} from '../document/foldSequenceDocument';
import { readFoldSequence, writeFoldSequence } from '../document/foldSequenceFile';
import { createFoldEngineCalls, type FoldEngineCalls } from './foldEngineCalls';
import { createFoldEngineCompoundCalls, type FoldEngineCompoundCalls } from './foldEngineCompoundCalls';
import { createFoldEnginePort, type FoldEngineSource } from './foldEnginePort';
import { createFoldEngineVertexCalls, type FoldEngineVertexCalls } from './foldEngineSquashCalls';
import type { FoldSwivelEdgeAnalysis } from './foldEngineSquashWire';
import type { FoldEngineOutcome } from './foldEngineWire';

/**
 * The swivel's edge form (`FoldSwivelEdgeOp`, engine `compound::swivel`)
 * over the real bridge, in-process: the document op crosses as it is stored,
 * the compound question answers `swivel-by-edge` (its vertex, its creases
 * with their letters as the diagram pens draw them, where the edge lands,
 * its ridges and which land), a stored step lands through `step` with its
 * ridge as stored, a saved sequence replays to `ok`, and one that does not
 * read is locked rather than folded.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
const FOLD_WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(FOLD_WASM);

interface Engine {
  calls: FoldEngineCalls;
  vertex: FoldEngineVertexCalls;
  question: FoldEngineCompoundCalls;
  version: number;
}

async function makeEngine(): Promise<Engine> {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(FOLD_WASM) });
  const fold = new wasm.FoldEngine();
  return {
    calls: createFoldEngineCalls(fold),
    vertex: createFoldEngineVertexCalls(fold),
    question: createFoldEngineCompoundCalls(fold),
    version: wasm.fold_engine_version(),
  };
}

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

/** The square's diagonal a c precreased: a centre crease to swivel an edge onto. */
const diagonal: FoldPrecreaseOp = {
  kind: 'precrease',
  line: {
    via: 'free',
    through: [
      [0, 0],
      [1, 1],
    ],
  },
  direction: 'valley',
  moving: [0, 1],
  seed: { scope: 'all' },
};

/** The bottom edge onto the diagonal, pivoting on the bisector from a past the incenter. */
const swivel: FoldSwivelEdgeOp = {
  kind: 'swivel',
  via: 'edge',
  pivot: [0.8, 0.8 * Math.tan(Math.PI / 8)],
  edge: [0.5, 0],
  target: { via: 'crease', at: [0.5, 0.5] },
  seed: { scope: 'all' },
  direction: 'valley',
};

describe.skipIf(!available)('the swivel’s edge form over the bridge', () => {
  let engine: Engine;
  let parent: number;

  beforeAll(async () => {
    engine = await makeEngine();
    const sheet = landed(engine.calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    parent = landed(engine.calls.step(sheet, diagonal)).state;
  });

  function question(op: FoldSwivelEdgeOp): { analysis: FoldSwivelEdgeAnalysis; emergents: boolean[] } {
    const answer = landed(engine.question.compoundAnalysis(parent, op));
    if (answer.family !== 'vertex') throw new Error(`answered for ${answer.family}`);
    if (answer.analysis.kind !== 'swivel-by-edge') throw new Error(`answered as ${answer.analysis.kind}`);
    return { analysis: answer.analysis, emergents: answer.emergents };
  }

  it('answers the compound question: the vertex, the creases with their letters, the landing, the ridges', () => {
    const { analysis, emergents } = question(swivel);
    expect(analysis.creases.map((crease) => crease.ray)).toEqual(['meet', 'foot', 'end', 'hinge']);
    expect(analysis.creases.map((crease) => crease.letter)).toEqual(['valley', 'mountain', 'valley', 'valley']);
    expect(analysis.creases.map((crease) => crease.ridge)).toEqual([false, true, false, false]);
    // The vertex is on the bisector from a, y = x·tan 22.5°.
    const [x, y] = analysis.vertex;
    expect(y).toBeCloseTo(x * Math.tan(Math.PI / 8), 12);
    // The edge lands on the diagonal.
    for (const [p, q] of analysis.landed) {
      expect(p[0]).toBeCloseTo(p[1], 9);
      expect(q[0]).toBeCloseTo(q[1], 9);
    }
    expect(analysis.ridges).toHaveLength(2);
    expect(analysis.ridge).toBe(0);
    expect(emergents).toEqual([true, true]);
    expect(analysis.regions.map((region) => region.wedge).sort()).toEqual(['beyond', 'near', 'turn']);
  });

  it('lands a stored step through `step` and the tools’ call alike, its ridge as stored', () => {
    const step = landed(engine.calls.step(parent, swivel));
    expect(step.compound?.family).toBe('vertex');
    const tried = landed(engine.vertex.vertexFold(parent, swivel));
    if (tried.result !== 'landed') throw new Error('a choice of orders');
    expect(tried.fingerprint).toBe(step.fingerprint);
    const { analysis } = question(swivel);
    const other = analysis.ridges[1];
    if (!other) throw new Error('no second ridge');
    const byEnd = landed(engine.calls.step(parent, { ...swivel, ridge: other }));
    expect(byEnd.fingerprint).not.toBe(step.fingerprint);
    expect(question({ ...swivel, ridge: other }).analysis.creases.map((crease) => crease.letter)).toEqual([
      'valley',
      'valley',
      'mountain',
      'valley',
    ]);
  });

  it('refuses by code: a point on no edge names the point', () => {
    const outcome = engine.calls.step(parent, { ...swivel, edge: [0.5, 0.3] });
    if (outcome.status !== 'refused') throw new Error('landed');
    expect(outcome.refusal).toEqual({ code: 'swivel_not_an_edge', point: [0.5, 0.3] });
  });

  it('replays a saved sequence to ok, and locks rather than folds an edge form that does not read', async () => {
    const document = sequenceOf([step('a', null, diagonal), step('b', 'a', swivel)]);
    const saved = JSON.parse(JSON.stringify(writeFoldSequence({ document, readOnlyRaw: null }))) as unknown;
    const opened = readFoldSequence(saved);
    if (!opened) throw new Error('no sequence');
    expect(opened.document.steps.map(isLockedStep)).toEqual([false, false]);
    const replayed = await replay(opened.document);
    expect(replayed.steps.get('b')?.status).toBe('ok');

    const broken = JSON.parse(JSON.stringify(saved)) as { steps: { op: Record<string, unknown> }[] };
    const second = broken.steps[1];
    if (!second) throw new Error('no second step');
    second.op.target = { via: 'axiom', axiom: 1, inputs: [] };
    const reopened = readFoldSequence(broken);
    if (!reopened) throw new Error('no sequence');
    expect(reopened.document.steps.map(isLockedStep)).toEqual([false, true]);
    const locked = await replay(reopened.document);
    expect(locked.steps.get('a')?.status).toBe('ok');
    expect(locked.steps.get('b')?.status).toBe('locked');
  });

  async function replay(document: FoldSequenceDocument) {
    const calls = engine.calls;
    const source: FoldEngineSource = {
      generation: () => 0,
      sheet: async (paper) => calls.sheet(paper),
      step: async (state, op, choices) => calls.step(state, op, choices),
      release: async (states) => calls.release(states),
    };
    const replayed = await createFoldReplayer(createFoldEnginePort(source, engine.version)).run({
      loadId: 1,
      sequence: document,
    });
    if (!replayed) throw new Error('the replay was superseded');
    expect(replayed.done).toBe(true);
    return replayed;
  }
});
