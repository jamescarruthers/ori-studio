import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNativeProjectFile } from '../../lib/nativeProjectFile';
import { createFoldReplayer } from '../document/foldReplay';
import { isLockedStep, type FoldSequenceDocument, type FoldStep } from '../document/foldSequenceDocument';
import { readFoldSequences, writeFoldSequences } from '../document/foldSequenceFile';
import { createFoldEngineCalls, type FoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import { createFoldEnginePort, type FoldEngineSource } from '../engine/foldEnginePort';
import { orderResolvedStep } from '../engine/foldEnginePreview';
import type { FoldEngineOp, FoldScene } from '../engine/foldEngineWire';

/**
 * `tests/fixtures/fold-regressions/independent-sides-orders.osf` (see the
 * folder's README): a square with two flaps folded in at the bottom left and
 * the same mirrored at the top right, then the bottom-right corner folded up
 * across both. That last fold has two independent parts, one per side, of
 * three orders each: under both of the side's flaps, between them, or on top.
 * The recipe search the chooser used before listed six of the nine and never
 * both sides between, the order the file saves. Each of the nine must be
 * listed, save and replay to itself, and the saved one must be among them.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
const ROOT = process.cwd();
const WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const FIXTURE = resolve(ROOT, '../../tests/fixtures/fold-regressions/independent-sides-orders.osf');
const available = existsSync(WASM) && existsSync(FIXTURE);

/** The last fold's line on the sheet: x - y = 9/16; the corner beyond it moves. */
const LINE = 9 / 16;

async function engine() {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  const raw = new wasm.FoldEngine();
  return { calls: createFoldEngineCalls(raw), compound: createFoldEngineCompoundCalls(raw), version: wasm.fold_engine_version() };
}

function sourceOf(calls: FoldEngineCalls): FoldEngineSource {
  return {
    generation: () => 0,
    sheet: async (paper) => calls.sheet(paper),
    step: async (state, op, choices) => calls.step(state, op, choices),
    release: async (states) => calls.release(states),
  };
}

function opened(): FoldSequenceDocument {
  const project = parseNativeProjectFile(readFileSync(FIXTURE, 'utf8'));
  const [held, ...rest] = readFoldSequences(project.workspace.foldSequences);
  expect(rest).toHaveLength(0);
  if (!held) throw new Error('no sequence');
  expect(held.readOnlyRaw).toBeNull();
  return held.document;
}

type Place = 'under' | 'between' | 'top';

/**
 * Where the moving corner lies on each side, read from the landed scene: in
 * a stack where it meets that side's flaps (every face but it and the sheet
 * below them is a flap of that side), on top of them, under them (only the
 * sheet below it), or between (a flap above it, and another and the sheet
 * below). The sides are told apart on the sheet: the bottom-left flaps lie
 * below x + y = 1, the top-right ones above it.
 */
function places(scene: FoldScene): { bottomLeft: Place; topRight: Place } {
  const centroid = scene.faces.map((face) => {
    const points = face.points.map((i) => scene.sheet_points[i]!);
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return { x, y };
  });
  const moves = (face: number) => centroid[face]!.x - centroid[face]!.y > LINE;
  const place = (bottomLeft: boolean): Place => {
    let found: Place = 'top';
    let met = false;
    for (const { faces_top_to_bottom: stack } of scene.subfaces) {
      const at = stack.findIndex(moves);
      const flaps = stack.filter((_, i) => i !== at && i !== stack.length - 1);
      if (at < 0 || flaps.length === 0) continue;
      if (!flaps.every((f) => centroid[f]!.x + centroid[f]!.y < 1 === bottomLeft)) continue;
      met = true;
      if (at > 0 && stack.length - 1 - at >= 2) found = 'between';
      else if (at > 0 && found === 'top') found = 'under';
    }
    if (!met) throw new Error('the corner meets no flap of this side');
    return found;
  };
  return { bottomLeft: place(true), topRight: place(false) };
}

describe.skipIf(!available)('a fold over two independent sides', () => {
  it('lists all nine orders, each saves and replays, and the saved one, both sides between, is among them', async () => {
    const { calls, compound, version } = await engine();
    const replay = async (sequence: FoldSequenceDocument) => {
      const done = await createFoldReplayer(createFoldEnginePort(sourceOf(calls), version)).run({ loadId: 1, sequence });
      if (!done) throw new Error('superseded');
      return done;
    };

    const document = opened();
    const steps = document.steps.map((node) => {
      if (isLockedStep(node)) throw new Error(`${node.id} is locked`);
      return node;
    });
    const opening = await replay(document);
    for (const step of steps) expect(opening.steps.get(step.id)?.status, step.id).toBe('ok');

    const saved = steps.at(-1) as FoldStep;
    expect(saved.op.kind).toBe('valley');
    expect((saved.op as { landing?: { kind: string } }).landing?.kind).toBe('solved');
    const parent = saved.parent === null ? undefined : opening.steps.get(saved.parent)?.state?.id;
    if (parent === undefined) throw new Error('no parent state');

    // The fold as the tool holds it before an order is picked: its line's root, no landing.
    const { landing: _, ...bare } = saved.op as FoldEngineOp & { landing?: unknown };
    const op = bare as FoldEngineOp;
    const root = { root: saved.choices?.root };
    const listing = compound.orderSelection(parent, op, root, { index: 0 });
    if (listing.status !== 'ok') throw new Error(JSON.stringify(listing));
    expect(listing.count).toEqual({ orders: 9, exact: true });
    expect(listing.source).toBe('solved');
    expect(listing.parts?.map((part) => part.orders)).toEqual([3, 3]);

    const orders: { fingerprint: string; place: ReturnType<typeof places> }[] = [];
    for (let left = 0; left < 3; left++) {
      for (let right = 0; right < 3; right++) {
        const picked = compound.orderSelection(parent, op, root, { index: 0, choice: [left, right] });
        if (picked.status !== 'ok') throw new Error(JSON.stringify(picked));
        const step = orderResolvedStep(op, root, picked);
        if (!step) throw new Error(`no step for ${left}, ${right}`);
        const landed = calls.step(parent, step.op, step.choices);
        if (landed.status !== 'ok') throw new Error(JSON.stringify(landed));
        orders.push({ fingerprint: landed.fingerprint, place: places(calls.scene(landed.state)) });

        // Saved in place of the last step, written and read as a project
        // writes and reads it, then replayed: to exactly the order picked.
        const edited = { ...saved, op: step.op, choices: step.choices, expect: landed.fingerprint } as FoldStep;
        const written = writeFoldSequences([{ document: { ...document, steps: [...steps.slice(0, -1), edited] }, readOnlyRaw: null }]);
        const [reread] = readFoldSequences(JSON.parse(JSON.stringify(written)));
        if (!reread) throw new Error('not read back');
        const replayed = (await replay(reread.document)).steps.get(saved.id);
        expect(replayed?.status, `${left}, ${right}`).toBe('ok');
        expect(replayed?.fingerprint, `${left}, ${right}`).toBe(landed.fingerprint);
      }
    }
    expect(new Set(orders.map((order) => order.fingerprint)).size).toBe(9);
    // Every combination of the three places on each side, once.
    expect(new Set(orders.map(({ place }) => `${place.bottomLeft}/${place.topRight}`)).size).toBe(9);

    const book = orders.find((order) => order.fingerprint === saved.expect);
    expect(book?.place).toEqual({ bottomLeft: 'between', topRight: 'between' });
  });
});
