import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNativeProjectFile } from '../../lib/nativeProjectFile';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEnginePort, type FoldEngineSource } from '../engine/foldEnginePort';
import { createFoldReplayer } from './foldReplay';
import { isLockedStep, type FoldSequenceDocument, type FoldStep } from './foldSequenceDocument';
import { readFoldSequences } from './foldSequenceFile';

/**
 * The example projects in `tests/fixtures/fold-examples` — a petal fold to
 * the bird base, a swivel, an inside and an outside crimp — each built
 * through the real Fold tools and saved with File ▸ Save (see the folder's
 * README for the clicks). Each must open as the app reads a project and
 * replay every step to `ok` through the real bridge: none broken, locked or
 * changed, so the examples still show what their notes say after an engine
 * change, or say so here first.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
const ROOT = process.cwd();
const WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const EXAMPLES = resolve(ROOT, '../../tests/fixtures/fold-examples');
const available = existsSync(WASM) && existsSync(EXAMPLES);

async function engine(): Promise<{ calls: FoldEngineCalls; version: number }> {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  return { calls: createFoldEngineCalls(new wasm.FoldEngine()), version: wasm.fold_engine_version() };
}

function sourceOf(calls: FoldEngineCalls): FoldEngineSource {
  return {
    generation: () => 0,
    sheet: async (paper) => calls.sheet(paper),
    step: async (state, op, choices) => calls.step(state, op, choices),
    release: async (states) => calls.release(states),
  };
}

/** The one sequence a saved example holds, read as the app opens a project. */
function opened(name: string): FoldSequenceDocument {
  const project = parseNativeProjectFile(readFileSync(resolve(EXAMPLES, name), 'utf8'));
  const sequences = readFoldSequences(project.workspace.foldSequences);
  expect(sequences, name).toHaveLength(1);
  const [held] = sequences;
  if (!held) throw new Error(`${name}: no sequence`);
  expect(held.readOnlyRaw, name).toBeNull();
  return held.document;
}

function steps(document: FoldSequenceDocument): FoldStep[] {
  return document.steps.map((node) => {
    if (isLockedStep(node)) throw new Error(`${document.title}: ${node.id} is locked`);
    return node;
  });
}

describe.skipIf(!available)('the Fold example projects', () => {
  it('holds the three examples the README names, and nothing else', () => {
    expect(
      readdirSync(EXAMPLES)
        .filter((name) => name.endsWith('.osf'))
        .sort()
    ).toEqual(['crimp.osf', 'petal-fold.osf', 'swivel-fold.osf']);
  });

  it.each(['petal-fold.osf', 'swivel-fold.osf', 'crimp.osf'])(
    'opens %s and replays every step to ok, each with the note that says how it was made',
    async (name) => {
      const document = opened(name);
      const { calls, version } = await engine();
      const replayed = await createFoldReplayer(createFoldEnginePort(sourceOf(calls), version)).run({
        loadId: 1,
        sequence: document,
      });
      if (!replayed) throw new Error(`${name}: the replay was superseded`);
      expect(replayed.done).toBe(true);
      expect(replayed.sheet.status).toBe('ok');
      for (const step of steps(document)) {
        const node = replayed.steps.get(step.id);
        expect(node?.status, `${name} ${step.id} ${step.op.kind} ${JSON.stringify(node?.refusal)}`).toBe('ok');
        // Committed with its fingerprint, so drift would read as changed rather than pass.
        expect(step.expect, `${name} ${step.id}`).toMatch(/^fs1:/);
        expect(step.note?.trim().length ?? 0, `${name} ${step.id} has no note`).toBeGreaterThan(0);
      }
    }
  );

  it('shows each tool as its README says: the bird base, three swivels, an inside and an outside crimp', async () => {
    const { calls, version } = await engine();
    const replay = async (document: FoldSequenceDocument) => {
      const done = await createFoldReplayer(createFoldEnginePort(sourceOf(calls), version)).run({
        loadId: 1,
        sequence: document,
      });
      if (!done) throw new Error('superseded');
      return done;
    };

    // Two squashes to the preliminary base, two petal folds to the bird base.
    const petal = opened('petal-fold.osf');
    const petalSteps = steps(petal);
    expect(petalSteps.map((step) => step.op.kind)).toEqual([
      'valley',
      'valley',
      'squash',
      'turn',
      'squash',
      'precrease',
      'precrease',
      'precrease',
      'petal',
      'turn',
      'precrease',
      'precrease',
      'petal',
    ]);
    const last = petalSteps.at(-1);
    const bird = last && (await replay(petal)).steps.get(last.id)?.state;
    if (!bird) throw new Error('the bird base did not land');
    expect(calls.summary(bird.id).faces).toBe(24);

    // Three branches from the sheet, one per fourth crease that lands.
    const swivels = steps(opened('swivel-fold.osf'));
    expect(swivels.map((step) => [step.parent, step.op.kind])).toEqual([
      [null, 'swivel'],
      [null, 'swivel'],
      [null, 'swivel'],
    ]);
    // Each in the swivel's rays form, as the file was saved.
    const emergents = swivels.map((step) =>
      step.op.kind === 'swivel' && !('via' in step.op) ? step.op.emergent.map(Math.round).join() : ''
    );
    expect(new Set(emergents).size).toBe(3);

    // The book fold, then two branches from it: the inside crimp and the outside.
    const [book, inside, outside] = steps(opened('crimp.osf'));
    expect(book?.op.kind).toBe('valley');
    expect([inside?.parent, outside?.parent]).toEqual([book?.id, book?.id]);
    expect([inside?.op, outside?.op]).toMatchObject([
      { kind: 'crimp', crimp: 'inside' },
      { kind: 'crimp', crimp: 'outside' },
    ]);
  });
});
