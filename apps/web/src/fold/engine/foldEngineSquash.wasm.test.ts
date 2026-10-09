import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  SQUARE_PAPER,
  type FoldPlainOp,
  type FoldRabbitEarOp,
  type FoldSquashOp,
  type SheetPoint,
} from '../document/foldSequenceDocument';
import { createFoldEngineCalls, type FoldEngineCalls } from './foldEngineCalls';
import { createFoldEngineVertexCalls, type FoldEngineVertexCalls } from './foldEngineSquashCalls';
import { FOLD_REFUSAL_CODES, type FoldEngineOutcome, type FoldEngineRefused } from './foldEngineWire';

/**
 * The vertex folds over the real bridge, in-process: exactly what
 * `workers/foldSequenceWorker.ts` runs beside the step calls, on one engine.
 *
 * The crates' tests prove the folds natively; what they do not cover is
 * TypeScript's side of the boundary — a document op crossing as it is
 * stored, a stored one replaying through the ordinary `step` call with its
 * `vertex` report, and a choice held, picked and stored as the document's
 * `completion`, which `step` then replays to the state picked.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
const FOLD_WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(FOLD_WASM);

interface Engine {
  calls: FoldEngineCalls;
  vertex: FoldEngineVertexCalls;
}

async function makeEngine(): Promise<Engine> {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(FOLD_WASM) });
  const fold = new wasm.FoldEngine();
  return { calls: createFoldEngineCalls(fold), vertex: createFoldEngineVertexCalls(fold) };
}

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

function refused<T>(outcome: FoldEngineOutcome<T>): FoldEngineRefused {
  if (outcome.status !== 'refused') throw new Error('landed');
  return outcome;
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('did not throw');
}

/** A valley through every layer on `moving`'s side of the line through two sheet points. */
function valley(through: readonly [SheetPoint, SheetPoint], moving: SheetPoint): FoldPlainOp {
  return { kind: 'valley', line: { via: 'free', through }, moving, seed: { scope: 'all' } };
}

describe.skipIf(!available)('the vertex folds over the bridge', () => {
  let engine: Engine;

  beforeAll(async () => {
    engine = await makeEngine();
  });

  /** The square folded on a diagonal: a two-layer triangle. */
  function triangle(): number {
    const sheet = landed(engine.calls.sheet(SQUARE_PAPER)).state;
    return landed(engine.calls.step(sheet, valley([[1, 0], [0, 1]], [1, 1]))).state;
  }

  it('lands a stored squash through `step`, with its report and its staged motion', () => {
    const half = triangle();
    const small = landed(engine.calls.step(half, valley([[0, 0], [0.5, 0.5]], [0.9, 0.1]))).state;
    const top = engine.calls.topVisibleAt(small, [0.1, 0.5]);
    if (!top) throw new Error('nothing on top');
    const op: FoldSquashOp = { kind: 'squash', flap: top.sheet, direction: 'valley' };

    const analysed = landed(engine.vertex.vertexAnalysis(small, op)).analysis;
    expect(analysed.kind).toBe('squash');
    if (analysed.kind === 'squash') expect(analysed.share).toBe(0);

    const stepped = landed(engine.calls.step(small, op));
    expect(stepped.report).toBeNull();
    expect(stepped.vertex?.kind).toBe('squash');
    expect(stepped.vertex?.created).toHaveLength(2);
    expect(stepped.vertex?.motion.kind).toBe('visual');
    // Two stages, a spread and a close leg each, every leg placing every
    // moving face.
    expect(stepped.vertex?.motion.legs.map((leg) => leg.stacking)).toEqual(['parent', 'parent', 'parent', 'landed']);
    expect(stepped.vertex?.stored).toEqual({});

    // The tools' call lands the same state.
    const tried = landed(engine.vertex.vertexFold(small, op));
    expect(tried.result).toBe('landed');
    if (tried.result === 'landed') expect(tried.fingerprint).toEqual(stepped.fingerprint);
  });

  it('holds a rabbit ear’s choice, picks one, and replays the stored completion to it', () => {
    const tri = triangle();
    const ear: FoldRabbitEarOp = {
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
    const analysed = landed(engine.vertex.vertexAnalysis(tri, ear)).analysis;
    expect(analysed.kind).toBe('rabbit-ear');
    if (analysed.kind === 'rabbit-ear') expect(analysed.candidates).toHaveLength(3);

    const tried = landed(engine.vertex.vertexFold(tri, ear));
    if (tried.result !== 'choose') throw new Error('no choice');
    expect(tried.count).toEqual({ orders: 2, exact: true });
    expect(tried.components).toEqual([2]);

    const picked = landed(engine.vertex.vertexPick(tried.pending, [1]));
    const completion = picked.vertex.stored.completion;
    expect(completion?.orders.length).toBeGreaterThan(0);
    const replayed = landed(engine.calls.step(tri, ear, { completion }));
    expect(replayed.fingerprint).toEqual(picked.fingerprint);
    // The other pick is another state.
    const other = landed(engine.vertex.vertexPick(tried.pending, [0]));
    expect(other.fingerprint).not.toEqual(picked.fingerprint);
    expect(engine.vertex.releaseVertexChoices([tried.pending])).toBe(1);

    // A stored step with no choice leaves one it does not store.
    const needed = refused(engine.calls.step(tri, ear));
    expect(needed.refusal).toEqual({ code: 'choice_needed', choice: 'completion' });
    expect(FOLD_REFUSAL_CODES).toContain(needed.refusal.code);
  });

  it('refuses by code, and throws a caller’s mistake', () => {
    const sheet = landed(engine.calls.sheet(SQUARE_PAPER)).state;
    const flat = refused(engine.calls.step(sheet, { kind: 'squash', flap: [0.3, 0.3], direction: 'valley' }));
    expect(flat.refusal.code).toBe('squash_no_flap');
    expect(flat.faces).toEqual([0]);
    expect(thrown(() => engine.vertex.vertexPick(0, [0]))).toMatchObject({ code: 'invalid_input' });
    expect(thrown(() => engine.vertex.vertexPick(1, [-1]))).toMatchObject({ code: 'invalid_input' });
    expect(thrown(() => engine.vertex.vertexPick(77, [0]))).toMatchObject({ code: 'invalid_input' });
    expect(engine.vertex.releaseVertexChoices([])).toBe(0);
  });
});
