import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  OristudioCpDocumentSummary,
  OristudioCpFoldSource,
  OristudioCpFoldWithOrderResult,
} from '../engine/oristudioCpTypes';
import type {
  LayerCommitted,
  LayerOpened,
  LayerOrderBridge,
  LayerPreviewed,
  LayerRestored,
} from '../layer-order/engine/layerOrderWire';
import { SAVED_FACE_INTACT, SAVED_PAIR_KEPT } from '../layer-order/engine/layerOrderWire';
import { encodeLayerOrderRecord, readLayerOrderRecord } from '../lib/layerOrder/layerOrderRecord';

/**
 * The Fold bridge's Layer order calls (`layer_*`,
 * `implementation-plans/layer-order-dialog.md` row E7) through the built
 * bridge, in Node, as the dialog's worker will make them: kabuto's source
 * from the CP bridge, handed over unchanged; open, preview, commit, save,
 * then a restore on a second engine (the host engine's path); typed arrays
 * out, the relations folded again by the CP bridge, the record read by the
 * TypeScript codec, refusals as values and mistakes thrown by code.
 * `crates/oristudio-fold-wasm/tests/layer_session.rs` holds the same calls
 * natively.
 *
 * Skipped when either bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds them before the web tests run.
 */
const ROOT = process.cwd();
const FOLD_WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const CP_WASM = resolve(ROOT, 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
const KABUTO = resolve(ROOT, '../../tests/fixtures/flat-folder/kabuto.fold');
const available = existsSync(FOLD_WASM) && existsSync(CP_WASM);

type FoldWasm = typeof import('../generated/oristudio-fold-wasm/oristudio_fold_wasm');
type CpWasm = typeof import('../generated/oristudio-cp-wasm/oristudio_cp_wasm');

/** `[a, b, a, b, …]` as pairs. */
function pairsOf(flat: Uint32Array): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return pairs;
}

/** "subject in front of object", read from the front, as the wire's sign rule makes it. */
function inFrontOf(subject: number, object: number, frontUp: Uint8Array): Int32Array {
  const nearerTheFront = true;
  return Int32Array.of(subject, object, nearerTheFront === (frontUp[object] === 1) ? 1 : -1);
}

/** The constraint the order on screen breaks on a pair: the lower face in front of the upper. */
function againstShown(relations: Uint32Array, [a, b]: [number, number], frontUp: Uint8Array): Int32Array {
  const shown = pairsOf(relations).find(([upper, lower]) => (upper === a && lower === b) || (upper === b && lower === a));
  if (!shown) throw new Error(`the order on screen does not relate ${a} and ${b}`);
  const [upper, lower] = shown;
  return inFrontOf(lower, upper, frontUp);
}

function spot(stacks: { offsets: Uint32Array; faces: Uint32Array }, i: number): number[] {
  return Array.from(stacks.faces.subarray(stacks.offsets[i], stacks.offsets[i + 1]));
}

function thrownCode(call: () => unknown): string | undefined {
  try {
    call();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe.skipIf(!available)('the Fold bridge’s layer calls, in Node', () => {
  let fold: FoldWasm;
  let cp: CpWasm;

  beforeAll(async () => {
    fold = await import('../generated/oristudio-fold-wasm/oristudio_fold_wasm');
    fold.initSync({ module: readFileSync(FOLD_WASM) });
    cp = await import('../generated/oristudio-cp-wasm/oristudio_cp_wasm');
    cp.initSync({ module: readFileSync(CP_WASM) });
  });

  /** Kabuto folded whole, as Edit's selection hands it over. */
  function kabuto(): OristudioCpFoldSource {
    const document = cp.load_fold(readFileSync(KABUTO, 'utf8'), '');
    const summary = cp.document_summary(document) as OristudioCpDocumentSummary;
    const lines = Array.from({ length: summary.line_segments }, (_, index) => index + 1);
    const source = cp.fold_source_of_selection(document, lines, 1) as OristudioCpFoldSource;
    cp.free_document(document);
    return source;
  }

  it('opens kabuto, previews, commits, saves and restores', () => {
    const source = kabuto();
    const engine = new fold.FoldEngine();
    const bridge: LayerOrderBridge = engine;

    // Open: the faces, which show their fronts, and the open pairs.
    const opened = bridge.layer_open(source, { deadlineMs: 10_000 });
    if (opened.status !== 'ok') throw new Error(`refused: ${JSON.stringify(opened.refusal)}`);
    const { session, front_up: frontUp } = opened satisfies LayerOpened;
    expect(opened.faces).toBe(18);
    expect(frontUp).toBeInstanceOf(Uint8Array);
    expect(frontUp).toHaveLength(18);
    expect(opened.open_pairs).toBeInstanceOf(Uint32Array);
    expect(opened.open_pairs).toHaveLength(2 * 36);
    expect(bridge.layer_open_pairs(session)).toEqual(opened.open_pairs);
    expect(bridge.layer_constraints(session)).toEqual(new Int32Array(0));
    expect(bridge.layer_live()).toBe(1);

    // The stacks number the kernel's paper scene's subfaces, from each side.
    for (const side of ['front', 'back'] as const) {
      const stacks = bridge.layer_stacks(session, side);
      expect(stacks.offsets).toBeInstanceOf(Uint32Array);
      expect(stacks.offsets).toHaveLength(opened.spots + 1);
      const scene = bridge.layer_scene(session, side, undefined);
      if (!scene) throw new Error('kabuto has subfaces');
      expect(scene.flipped).toBe(side === 'back');
      expect(scene.subfaces).toHaveLength(opened.spots);
      scene.subfaces.forEach((subface, i) => expect(spot(stacks, i)).toEqual(subface.faces_top_to_bottom));
    }

    // Preview an open pair's other order: it fits, and nothing is committed.
    const relations = bridge.layer_oriedita_relations(session);
    expect(relations).toBeInstanceOf(Uint32Array);
    const [pair] = pairsOf(opened.open_pairs);
    const candidate = againstShown(relations, pair, frontUp);
    const preview: LayerPreviewed = bridge.layer_preview(session, candidate, { deadlineMs: 3_000 });
    if (preview.verdict !== 'fits') throw new Error(`no fit: ${JSON.stringify(preview)}`);
    expect(preview.changed.front).toBeInstanceOf(Uint32Array);
    expect(preview.changed.front.length + preview.changed.back.length).toBeGreaterThan(0);
    expect(preview.stacks.back.offsets).toHaveLength(opened.spots + 1);
    expect(bridge.layer_constraints(session)).toHaveLength(0);
    expect(bridge.layer_oriedita_relations(session)).toEqual(relations);

    // Add: the commit lands on the previewed order.
    const committed: LayerCommitted = bridge.layer_commit(session, candidate, { deadlineMs: 3_000 });
    if (committed.verdict !== 'committed') throw new Error(`not committed: ${JSON.stringify(committed)}`);
    expect(committed.changed).toEqual(preview.changed);
    expect(committed.stacks).toEqual(preview.stacks);
    expect(committed.open_pairs.length).toBeLessThan(opened.open_pairs.length);
    expect(bridge.layer_constraints(session)).toEqual(candidate);

    // Apply: the CP bridge folds the order on screen into a solved figure.
    const shown = bridge.layer_oriedita_relations(session);
    const applied = cp.folded_figure_fold_with_order(source, shown, null, 0) as OristudioCpFoldWithOrderResult;
    if (applied.status !== 'folded') throw new Error(`refused: ${JSON.stringify(applied.refusal)}`);
    expect(applied.snapshot.outcome).toBe('Solved');
    cp.free_folded_figure(applied.handle);

    // Save: the TypeScript codec reads the record and writes the same bytes.
    const saved = bridge.layer_save(session);
    if (saved.status !== 'ok') throw new Error(`refused: ${JSON.stringify(saved.refusal)}`);
    const read = readLayerOrderRecord(saved.json);
    if (typeof read === 'symbol' || !read.ok) throw new Error(`the record does not read: ${String(read)}`);
    expect(read.json).toBe(saved.json);
    expect(read.record.constraints).toHaveLength(1);
    expect(encodeLayerOrderRecord(read.record)).toEqual({ ok: true, json: saved.json });

    // Restore on another engine, as the host engine reopens a figure.
    const hostEngine = new fold.FoldEngine();
    const host: LayerOrderBridge = hostEngine;
    const restored = host.layer_restore(source, saved.json, { deadlineMs: 10_000 });
    if (restored.status !== 'ok') throw new Error(`refused: ${JSON.stringify(restored.refusal)}`);
    expect(restored.outcome).toEqual({ kind: 'applied' });
    expect((restored satisfies LayerRestored).constraints).toEqual(candidate);
    expect(Array.from(restored.saved_faces.status).every((s) => s === SAVED_FACE_INTACT)).toBe(true);
    expect(restored.saved_constraints).toEqual([{ status: 'intact' }]);
    expect(Array.from(restored.saved_order).every((s) => s === SAVED_PAIR_KEPT)).toBe(true);
    expect(host.layer_oriedita_relations(restored.session)).toEqual(shown);
    const resaved = host.layer_save(restored.session);
    expect(resaved).toEqual(saved);

    engine.free();
    hostEngine.free();
  });

  it('answers a no, a timeout and a refusal as values, and keeps trying with a later deadline', () => {
    const source = kabuto();
    const engine = new fold.FoldEngine();
    const bridge: LayerOrderBridge = engine;
    const opened = bridge.layer_open(source);
    if (opened.status !== 'ok') throw new Error('kabuto opens');
    const { session, front_up: frontUp } = opened;
    const relations = bridge.layer_oriedita_relations(session);
    const open = new Set(pairsOf(opened.open_pairs).map(([a, b]) => `${a},${b}`));

    // Against what the creases force.
    const forced = pairsOf(relations)
      .map(([u, l]): [number, number] => [Math.min(u, l), Math.max(u, l)])
      .find(([a, b]) => !open.has(`${a},${b}`));
    if (!forced) throw new Error('kabuto forces pairs');
    const no = bridge.layer_preview(session, againstShown(relations, forced, frontUp));
    if (no.verdict !== 'cant_fit') throw new Error(`not a no: ${JSON.stringify(no)}`);
    expect(no.proof).toEqual({ kind: 'forced' });
    expect(no.faces).toBeInstanceOf(Uint32Array);
    expect(Array.from(no.constraints)).toEqual([0]);

    // Out of nodes, then out of time; the same call later answers.
    let timedOut = 0;
    for (const pair of pairsOf(opened.open_pairs)) {
      const candidate = againstShown(relations, pair, frontUp);
      for (const [limits, limit] of [
        [{ maxNodes: 0, fastNodes: 0 }, 'nodes'],
        [{ deadlineMs: 0 }, 'deadline'],
      ] as const) {
        const first = bridge.layer_preview(session, candidate, limits);
        if (first.verdict !== 'timed_out') continue;
        timedOut += 1;
        expect(first.limit).toBe(limit);
        const later = bridge.layer_preview(session, candidate, { deadlineMs: 60_000 });
        expect(later.verdict).not.toBe('timed_out');
        expect(bridge.layer_commit(session, candidate, limits).verdict).toBe('timed_out');
        expect(bridge.layer_constraints(session)).toHaveLength(0);
      }
    }
    expect(timedOut).toBeGreaterThan(10);

    // The open's own refusals.
    expect(bridge.layer_open({ ...source, digest: '0000000000000000' })).toEqual({
      status: 'refused',
      refusal: { code: 'source_digest_mismatch', expected: '0000000000000000', actual: source.digest },
    });
    expect(bridge.layer_open(source, { maxNodes: 0 })).toMatchObject({
      status: 'refused',
      refusal: { code: 'session_timed_out', limit: 'nodes' },
    });
    expect(bridge.layer_open(source, { deadlineMs: 0 })).toMatchObject({
      status: 'refused',
      refusal: { code: 'session_timed_out', limit: 'deadline' },
    });
    expect(bridge.layer_restore(source, 'not json')).toEqual({
      status: 'refused',
      refusal: { code: 'record_damaged', damage: 'not-json' },
    });

    // A caller's mistakes throw, by code.
    const [[a]] = pairsOf(opened.open_pairs);
    expect(thrownCode(() => bridge.layer_preview(session, Int32Array.of(a, a, 1)))).toBe('session_bad_constraint');
    expect(thrownCode(() => bridge.layer_preview(session, Int32Array.of(a, 1)))).toBe('invalid_input');
    expect(thrownCode(() => bridge.layer_stacks(session, 'up' as 'front'))).toBe('invalid_input');
    expect(thrownCode(() => bridge.layer_open(source, { deadline: 5 } as never))).toBe('invalid_input');

    // Close, then use.
    expect(bridge.layer_close(session)).toBe(true);
    expect(bridge.layer_close(session)).toBe(false);
    expect(thrownCode(() => bridge.layer_open_pairs(session))).toBe('unknown_layer_session');
    expect(thrownCode(() => bridge.layer_save(session))).toBe('unknown_layer_session');
    expect(bridge.layer_live()).toBe(0);
    engine.free();
  });
});
