import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OristudioCpCommandPayload,
  OristudioCpDocumentSnapshot,
  OristudioCpSelectedLines,
} from '../../engine/oristudioCpTypes';
import { emptyOristudioCpSelection } from '../../lib/creasePatternViewport';
import type { OristudioCpOperationId } from '../../lib/oristudioCpCommands';

/**
 * Selections through the store against the real CP kernel, in Node: the kernel
 * answers a selection with the selected lines, and the store keeps its
 * snapshot. Two copies of the selection have to stay right — the store's ids,
 * which the canvas draws, and the kernel's flags, which region commands read —
 * through undo, redo, the edits around them and a deselect.
 *
 * The kernel stands in for the worker as an in-process client over the same
 * wasm calls. Skipped when the bridge has not been built; CI builds it first.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
const wasmAvailable = existsSync(WASM);
type CpWasm = typeof import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');

const kernel = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('../../engines/engineHost', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../engines/engineHost')>();
  return {
    ...actual,
    connectEngine: async () => kernel.client,
    isEngineConnected: () => kernel.client !== null,
  };
});

/** The worker's API, the parts a selection reaches, over the wasm calls the worker makes. */
function inProcessClient(wasm: CpWasm) {
  return {
    operationDescriptors: async () => wasm.cp_operation_descriptors(),
    loadCp: async (text: string, title = '') => wasm.load_cp(text, title),
    documentGeometry: async (handle: number) => wasm.document_geometry(handle),
    summary: async (handle: number) => wasm.document_summary(handle),
    sheetIndex: async (handle: number) => wasm.sheet_index(handle),
    executeCommand: async (
      handle: number,
      operationId: OristudioCpOperationId,
      payload: OristudioCpCommandPayload = {}
    ) => wasm.execute_cp_command(handle, operationId, payload),
    executeSelectionCommand: async (
      handle: number,
      operationId: OristudioCpOperationId,
      payload: OristudioCpCommandPayload = {}
    ) => wasm.execute_cp_selection_command(handle, operationId, payload),
    setSelectedLines: async (handle: number, lines: OristudioCpSelectedLines) =>
      wasm.set_selected_lines(handle, lines.ids, lines.values),
    restoreDocument: async (handle: number, document: OristudioCpDocumentSnapshot) =>
      wasm.restore_document(handle, document),
    freeDocument: async (handle: number) => wasm.free_document(handle),
  };
}

/** Four separate mountain creases, one unit apart, ids 1-4 from the bottom. */
const PARALLEL_CP = '2 0 0 1 0\n2 0 1 1 1\n2 0 2 1 2\n2 0 3 1 3\n';

/** A box drag over the creases at heights `from..=to`. */
function boxOver(from: number, to: number, additive = false): OristudioCpCommandPayload {
  return {
    points: [
      { x: -0.5, y: from - 0.5 },
      { x: 1.5, y: to + 0.5 },
    ],
    replace_selection: !additive,
  };
}

describe.skipIf(!wasmAvailable)('selection commands against the kernel', () => {
  let wasm: CpWasm;
  let store: typeof import('./store').useWorkspaceStore;

  beforeAll(async () => {
    wasm = await import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    kernel.client = inProcessClient(wasm);
    store = (await import('./store')).useWorkspaceStore;
  });

  beforeEach(async () => {
    const { loadOristudioCpDocumentFromText } = await import('./oristudioCpRuntime');
    const documentState = await loadOristudioCpDocumentFromText(PARALLEL_CP, {
      format: 'cp',
      filename: 'parallel.cp',
    });
    store.setState({
      oristudioCpDocument: documentState,
      oristudioCpSelection: emptyOristudioCpSelection(),
      oristudioCpHistoryPast: [],
      oristudioCpHistoryFuture: [],
      // The Edit canvas, which is what makes undo the crease pattern's.
      activePanelId: 'crease-pattern',
      dirty: false,
    });
    expect(store.getState().activeEditingContext).toBe('crease-pattern');
  });

  const state = () => store.getState();
  const storeIds = () => state().oristudioCpSelection.lines;
  /** The kernel's own flags, read from the kernel. */
  const kernelIds = () => {
    const handle = state().oristudioCpDocument?.handle;
    if (handle === undefined) throw new Error('no document');
    const document = wasm.document_snapshot(handle) as OristudioCpDocumentSnapshot;
    return document.crease_pattern.line_segments.flatMap((line, index) =>
      line.selected === 0 ? [] : [index + 1]
    );
  };
  /** The flags on the store's snapshot, which an `.osf` save writes. */
  const snapshotIds = () =>
    (state().oristudioCpDocument?.document.crease_pattern.line_segments ?? []).flatMap(
      (line, index) => (line.selected === 0 ? [] : [index + 1])
    );
  const select = (payload: OristudioCpCommandPayload, operation: OristudioCpOperationId = 'CreaseSelect') =>
    state().executeOristudioCpCommand(operation, payload);

  it('answers a box select with the lines it selected and keeps the document', async () => {
    const before = state().oristudioCpDocument;
    const artifactRevision = state().foldArtifactRevision;

    await expect(select(boxOver(0, 1))).resolves.toBe(true);

    expect(storeIds()).toEqual([1, 2]);
    expect(kernelIds()).toEqual([1, 2]);
    expect(snapshotIds()).toEqual([1, 2]);
    // The same creases, so the same objects: nothing keyed on them rebuilds.
    expect(state().oristudioCpDocument?.document).toBe(before?.document);
    expect(state().oristudioCpDocument?.geometry).toBe(before?.geometry);
    expect(state().foldArtifactRevision).toBe(artifactRevision);
    expect(state().dirty).toBe(true);
    // One undo step, holding what it replaced rather than a document of its own.
    const entry = state().oristudioCpHistoryPast.at(-1);
    expect(entry?.label).toBe('CreaseSelect');
    expect(entry?.document).toBe(before?.document);
    expect(Array.from(entry?.selectedLines?.ids ?? [-1])).toEqual([]);
  });

  /**
   * Pins today's behaviour, not the behaviour anyone wants: a click selects in
   * the store alone, so the kernel never hears of it, and a Shift+drag that
   * means "add" is answered from the kernel's flags, which drops the click.
   * See `cp-selection-two-sources-of-truth`; fixing it should change this test.
   */
  it('drops a clicked crease from an additive box select (the known two-copies bug)', async () => {
    state().toggleOristudioCpLineSelection(4);
    expect(storeIds()).toEqual([4]);
    expect(kernelIds()).toEqual([]);

    await select(boxOver(0, 0, true));

    expect(storeIds()).toEqual([1]);
    expect(kernelIds()).toEqual([1]);
  });

  it('undoes and redoes a selection in both the store and the kernel', async () => {
    const document = state().oristudioCpDocument?.document;
    await select(boxOver(0, 1));
    await select(boxOver(2, 2, true));
    expect(storeIds()).toEqual([1, 2, 3]);

    await state().undo();
    expect([storeIds(), kernelIds(), snapshotIds()]).toEqual([[1, 2], [1, 2], [1, 2]]);
    await state().undo();
    expect([storeIds(), kernelIds(), snapshotIds()]).toEqual([[], [], []]);
    await state().redo();
    expect([storeIds(), kernelIds(), snapshotIds()]).toEqual([[1, 2], [1, 2], [1, 2]]);
    await state().redo();
    expect([storeIds(), kernelIds(), snapshotIds()]).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
    expect(state().oristudioCpDocument?.document).toBe(document);
    expect(state().oristudioCpHistoryFuture).toHaveLength(0);
  });

  it('undoes an unselect back to the selection it narrowed', async () => {
    await select(boxOver(0, 3));
    await select(boxOver(1, 2), 'CreaseUnselect');
    expect([storeIds(), kernelIds()]).toEqual([[1, 4], [1, 4]]);

    await state().undo();
    expect([storeIds(), kernelIds()]).toEqual([[1, 2, 3, 4], [1, 2, 3, 4]]);
  });

  /**
   * The edit's undo entry keeps the snapshot it replaced, and puts it back into
   * the kernel: flags and all. So the selection made just before the edit has
   * to be on that snapshot, or undoing the edit would quietly clear it in the
   * kernel and the next additive select would drop it.
   */
  it('undoes an edit made after a selection back to that selection', async () => {
    await select(boxOver(0, 1));
    await expect(
      state().executeOristudioCpCommand('CreaseMakeValley', { line_ids: [1, 2] })
    ).resolves.toBe(true);

    await state().undo();
    expect([storeIds(), kernelIds()]).toEqual([[1, 2], [1, 2]]);
    const colors = state().oristudioCpDocument?.document.crease_pattern.line_segments.map(
      (line) => line.color
    );
    expect(colors).toEqual(['Red1', 'Red1', 'Red1', 'Red1']);

    await select(boxOver(3, 3, true));
    expect(storeIds()).toEqual([1, 2, 4]);
  });

  it('deselects in the kernel without fetching the document again', async () => {
    await select(boxOver(0, 1));
    const document = state().oristudioCpDocument?.document;

    state().clearOristudioCpSelection();
    await vi.waitFor(() => expect(kernelIds()).toEqual([]));
    await vi.waitFor(() => expect(state().oristudioCpDocument?.lastCommandResult).toBeNull());

    expect(storeIds()).toEqual([]);
    expect(snapshotIds()).toEqual([]);
    expect(state().oristudioCpDocument?.document).toBe(document);
  });

  it('runs every selection-only operation through the kernel as a selection', async () => {
    const { SELECTION_ONLY_CP_OPERATIONS } = await import('./cpSelectedLines');
    const handle = state().oristudioCpDocument?.handle ?? -1;
    for (const operation of SELECTION_ONLY_CP_OPERATIONS) {
      expect(() =>
        wasm.execute_cp_selection_command(handle, operation, {
          points: [
            { x: 0.5, y: -0.5 },
            { x: 0.6, y: 3.5 },
          ],
        })
      ).not.toThrow();
    }
    expect(() =>
      wasm.execute_cp_selection_command(handle, 'CreaseMakeValley', { line_ids: [1] })
    ).toThrow();
  });
});
