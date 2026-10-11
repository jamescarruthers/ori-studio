import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TFunction } from 'i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { initCpWasm } from '../../engine/oristudioCpTestSupport';
import { document_snapshot, free_document, load_fold_file } from '../../generated/oristudio-cp-wasm/oristudio_cp_wasm';
import { DEFAULT_PAPER_STYLE } from '../../lib/paper/paperStyle';
import type { FileService } from '../../platform/fileService';
import type { PaperExportTarget } from '../../paperExport/paperExportTarget';
import { createFoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineIoCalls } from '../engine/foldEngineIoCalls';
import { FOLD_SAMPLES } from '../engine/foldEngineIoSamples';
import type { FoldSequenceDocument } from '../document/foldSequenceDocument';
import { createFoldSession, type FoldSession } from '../session/foldSession';
import { inProcessFoldRuntime, memoryFoldDocument, settle } from '../session/foldSession.fixtures';
import { selectFoldCursorNode } from '../session/foldSessionState';
import { foldImportFileSource } from './foldImportFiles';
import { createFoldImportFlow, type FoldImportFlow, type FoldImportFlowState } from './foldImportFlow';
import { exportFoldSequence, openFoldStepsExport, sendFoldSequenceToEdit, type FoldHandOffDeps } from './foldHandOffs';
import { foldStatePictureUrl } from '../canvas/foldStatePicture';

/**
 * Import CP and the hand-offs over the real bridge, in-process: the flow and
 * the hand-offs exactly as the app runs them, over the session and the
 * engine the worker runs — samples and a fixture `.cp` imported into an
 * empty sequence and committed as they landed, a pattern with several orders
 * pictured and chosen, a refusal said, then the sequence sent to Edit (which
 * the CP kernel's own loader reads back), exported as FOLD and as pages.
 *
 * Skipped when either bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds them before the web tests run.
 */
const ROOT = process.cwd();
const FOLD_WASM = resolve(ROOT, 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const CP_WASM = resolve(ROOT, 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
const FIXTURES = resolve(ROOT, '../../tests/fixtures');
const available = existsSync(FOLD_WASM) && existsSync(CP_WASM);

const t = ((_key: string, english: string, values?: Record<string, unknown>) =>
  english.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))) as unknown as TFunction;

/** A square creased with a plus, neither crease's letter known: several orders. */
const PLUS = JSON.stringify({
  vertices_coords: [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0.5]],
  edges_vertices: [[0, 4], [4, 1], [1, 5], [5, 2], [2, 6], [6, 3], [3, 7], [7, 0], [4, 8], [8, 6], [7, 8], [8, 5]],
  edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'U', 'U', 'U', 'U'],
});

let sessions: FoldSession[] = [];
let flows: FoldImportFlow[] = [];
afterEach(() => {
  for (const flow of flows) flow.dispose();
  for (const session of sessions) session.dispose();
  flows = [];
  sessions = [];
});

async function setup() {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(FOLD_WASM) });
  const runtime = inProcessFoldRuntime(() => {
    const engine = new wasm.FoldEngine();
    return { ...createFoldEngineCalls(engine), ...createFoldEngineIoCalls(engine) };
  }, wasm.fold_engine_version());
  const source = memoryFoldDocument();
  const session = createFoldSession({ document: source, runtime });
  sessions.push(session);
  const flow = createFoldImportFlow({ session, editFoldedFigure: async () => null });
  flows.push(flow);
  return { runtime, source, session, flow };
}

/** Wait for the flow to stop working. */
async function settled(flow: FoldImportFlow): Promise<FoldImportFlowState> {
  for (let round = 0; round < 200; round += 1) {
    const state = flow.store.getState();
    if (state.phase !== 'working') {
      if (state.phase !== 'choosing' || [...state.previews.values()].every((p) => p.status !== 'working')) {
        await settle();
        return flow.store.getState();
      }
    }
    await settle(1);
  }
  return flow.store.getState();
}

function handOffDeps(session: FoldSession) {
  const saved: string[] = [];
  const sent: string[] = [];
  const exported: PaperExportTarget[] = [];
  const deps: FoldHandOffDeps = {
    session,
    t,
    title: () => 'Imported',
    blocked: vi.fn(),
    sendToEdit: async (payload) => {
      sent.push(payload.text);
      return true;
    },
    sentToEdit: vi.fn(),
    fileService: () =>
      ({
        saveTextFile: async (options) => {
          saved.push(options.contents);
          return { name: options.suggestedName, path: null };
        },
      }) as FileService,
    exportStyle: () => DEFAULT_PAPER_STYLE,
    openPaperExport: (target) => exported.push(target),
  };
  return { deps, saved, sent, exported };
}

describe.skipIf(!available)('Import CP and the hand-offs over the built bridge', () => {
  beforeAll(async () => {
    await initCpWasm();
  });

  it('imports each sample into an empty sequence, committed as it landed and replayed to the same state', async () => {
    for (const sample of FOLD_SAMPLES) {
      const { flow, source, session } = await setup();
      await flow.open({ kind: 'sample', sample: sample.id });
      const state = await settled(flow);
      expect(state, sample.id).toMatchObject({ phase: 'done', origin: 'sample' });
      const document = source.read().held?.document as FoldSequenceDocument;
      expect(document.paper.shape).toEqual({ kind: 'square' });
      expect(document.steps).toHaveLength(1);
      const [jump] = document.steps;
      expect(jump && 'op' in jump ? jump.op?.kind : null).toBe('cp-jump');
      const node = selectFoldCursorNode(session.store.getState());
      expect(node.status, sample.id).toBe('ok');
      expect(node.fingerprint).toBe(jump && 'expect' in jump ? jump.expect : null);
      // The step on screen is the state the import landed after a sheet of its
      // own, since let go: its summary is the pattern it brings, which needs none.
      const summarised = await session.withCursor((engine, state) => engine.stepSummary(state));
      expect(summarised, sample.id).toMatchObject({
        status: 'answered',
        value: {
          status: 'ok',
          summary: {
            counts: { mountain: node.summary?.creases.mountain, valley: node.summary?.creases.valley },
            diff: { added: [], reversed: [], unfolded: [], refolded: [] },
            layers: null,
          },
        },
      });
    }
  });

  it('imports a crease pattern file from the fixtures', async () => {
    const { flow, source } = await setup();
    const bytes = new Uint8Array(readFileSync(resolve(FIXTURES, 'oriedita/solution_sample_1.cp')));
    await flow.open({ kind: 'file', name: 'solution_sample_1.cp', source: foldImportFileSource('solution_sample_1.cp', bytes) });
    const state = await settled(flow);
    if (state.phase === 'choosing') {
      await flow.commit();
      await settled(flow);
    }
    expect(flow.store.getState()).toMatchObject({ phase: 'done', origin: 'cp' });
    expect(source.read().held?.document.steps).toHaveLength(1);
  });

  it('pictures each of several orders and commits the one chosen, then hands the sequence off', async () => {
    const { flow, source, session } = await setup();
    await flow.open({ kind: 'file', name: 'plus.fold', source: { format: 'fold', text: PLUS } });
    const state = await settled(flow);
    if (state.phase !== 'choosing') throw new Error(`not choosing: ${state.phase}`);
    expect(state.opened.count.orders).toBeGreaterThan(1);
    const pictures = [...state.previews.values()];
    expect(pictures.length).toBeGreaterThan(1);
    for (const preview of pictures) {
      expect(preview.status).toBe('ready');
      if (preview.status === 'ready') expect(foldStatePictureUrl(preview.scene, DEFAULT_PAPER_STYLE)).toMatch(/^data:image\/svg\+xml/);
    }
    const last = state.opened.components.findIndex((component) => component.orders > 1);
    flow.choose(last, state.opened.components[last]!.orders - 1);
    await flow.commit();
    expect(await settled(flow)).toMatchObject({ phase: 'done', origin: 'fold' });
    expect(source.read().held?.document.steps).toHaveLength(1);

    const { deps, saved, sent, exported } = handOffDeps(session);
    await expect(sendFoldSequenceToEdit(deps, 'plain')).resolves.toBe(true);
    const document = load_fold_file(sent[0]!);
    const snapshot = document_snapshot(document) as OristudioCpDocumentSnapshot;
    free_document(document);
    expect(snapshot.crease_pattern.line_segments.length).toBeGreaterThan(4);

    await expect(exportFoldSequence(deps)).resolves.toBe(true);
    const fold = JSON.parse(saved[0]!) as { file_title: string; file_frames: unknown[] };
    expect(fold.file_title).toBe('Imported');
    expect(fold.file_frames).toHaveLength(2);

    await expect(openFoldStepsExport(deps, 'all')).resolves.toBe(true);
    expect(exported[0]?.pages?.list.map((page) => page.label)).toEqual(['Step 1']);
    expect(deps.blocked).not.toHaveBeenCalled();
  });

  it('says why a pattern that does not fold flat was refused', async () => {
    const { flow, source } = await setup();
    const bytes = new Uint8Array(readFileSync(resolve(FIXTURES, 'precrease/divergence-1.cp')));
    await flow.open({ kind: 'file', name: 'divergence-1.cp', source: foldImportFileSource('divergence-1.cp', bytes) });
    const state = await settled(flow);
    expect(state).toMatchObject({ phase: 'refused', refusal: { kind: 'engine' } });
    expect(source.commits).toEqual([]);
  });
});
