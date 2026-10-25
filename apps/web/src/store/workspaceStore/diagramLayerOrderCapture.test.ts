/**
 * A Diagram step's layer order through the store's capture (layer order H7):
 * Refresh draws the record's order and commits it with the picture; a record
 * that cannot be drawn keeps the picture and is flagged, one undo step; a
 * Stop ends the restore; Refresh All shares one host engine batch; Show as,
 * Duplicate and Duplicate as keep the record; a locked step is never touched.
 * The kernel is the fixture's fake, the host engine a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OristudioCpDocumentState } from '../../engine/oristudioCpTypes';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { sheetRegions } from '../../cp-workspace/sheets/cpSheetRegions';
import {
  cpDocument,
  fakeCaptureRuntime,
  fakeLayerOrderResolutions,
  STEP_LAYER_ORDER,
  STEP_LAYER_ORDER_IN_SOURCE,
  stepLayerOrderJson,
  TWO_SQUARES,
  twoSquaresIndex,
  type FixtureLine,
} from '../../diagram/capture/capture.fixtures';
import type { CpCaptureRuntime } from '../../diagram/capture/captureFolded';
import { stepLayerOrderOf } from '../../diagram/capture/captureLayerOrder';
import { refreshAllDiagramSteps } from '../../diagram/capture/captureQueue';
import { duplicateLinkedStepAs, refreshDiagramStep, showLinkedStepAs } from '../../diagram/capture/stepCaptureActions';
import { setLinkedLayerOrder, stepById, type DiagramCpSource } from '../../diagram/document/diagramDocument';
import { stepsIn } from '../../diagram/document/diagramSteps.fixtures';
import type { LayerOrderResolution, LayerOrderResolveBatch } from '../../layer-order/host/hostEngineGateway';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { useLayoutStore } from '../layoutStore';
import { useWorkspaceStore } from '../workspaceStore';

const bindings = vi.hoisted(() => ({ runtime: null as CpCaptureRuntime | null }));
vi.mock('./cpFoldRuntimeBindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cpFoldRuntimeBindings')>()),
  createCpCaptureRuntime: () => bindings.runtime,
}));
vi.mock('../../cp-workspace/sheets/cpSheetIndex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cp-workspace/sheets/cpSheetIndex')>()),
  ensureCpSheetIndex: vi.fn(async () => sheets),
  peekCpSheetIndex: vi.fn(() => sheets),
}));
vi.mock('../../lib/foldCancellation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/foldCancellation')>()),
  foldCancellationAvailable: () => true,
  cancelFoldRun: vi.fn(),
}));
type Answer = (source: LayerOrderSource, record: LayerOrderRecord, signal?: AbortSignal) => Promise<LayerOrderResolution>;
const hostEngine = vi.hoisted(() => ({
  answer: null as null | Answer,
  resolveLayerOrder: vi.fn(),
  batches: [] as { resolve: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
  openLayerOrderResolveBatch: vi.fn(),
}));
vi.mock('../../layer-order/host/hostEngineGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../layer-order/host/hostEngineGateway')>()),
  resolveLayerOrder: hostEngine.resolveLayerOrder,
  openLayerOrderResolveBatch: hostEngine.openLayerOrderResolveBatch,
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));
const analytics = vi.hoisted(() => ({
  trackDiagramPictureCaptured: vi.fn(),
  trackDiagramStepShownAs: vi.fn(),
  trackLayerConstraintsNeedAttention: vi.fn(),
}));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

const sheets = twoSquaresIndex();
const [left, right] = sheetRegions(sheets);
const initialState = useWorkspaceStore.getInitialState();
const state = () => useWorkspaceStore.getState();
const json = stepLayerOrderJson();
/** The record as the host engine takes it: about the crease pattern's origin. */
const inSource = STEP_LAYER_ORDER_IN_SOURCE;
const FLAT = { mode: 'folded-flat' as const, side: 'front' as const, rotationDeg: 0, foldCase: 1 };

const useDocument = (document = cpDocument()) =>
  useWorkspaceStore.setState({
    oristudioCpDocument: { handle: 1, document, geometry: null } as unknown as OristudioCpDocumentState,
  });

/** Both diagonals turned the other way: both squares' links go out of date. */
const edited = () =>
  cpDocument(
    TWO_SQUARES.map((line, i): FixtureLine =>
      i === 7 ? ([...line.slice(0, 4), 'Blue2'] as FixtureLine) : i === 8 ? ([...line.slice(0, 4), 'Red1'] as FixtureLine) : line
    )
  );

/** A step linked to `region`, folded flat, carrying the fixture's record (as an Apply would leave it). */
async function constrainedStep(region = left): Promise<string> {
  const stepId = state().addDiagramStep()!;
  await state().captureDiagramStep(stepId, {
    scope: { kind: 'segment', region: regionReferenceFor(region!) },
    render: FLAT,
    kind: 'diagram-capture',
    label: 'Link pattern',
  });
  useWorkspaceStore.setState({ diagram: setLinkedLayerOrder(state().diagram!, stepId, json) });
  return stepId;
}

const step = (stepId: string) => stepById(state().diagram!, stepId)!;
const source = (stepId: string) => step(stepId).source as DiagramCpSource;

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState(initialState, true);
  useLayoutStore.setState({ activeWorkspace: 'diagram' });
  useDocument();
  bindings.runtime = fakeCaptureRuntime();
  hostEngine.answer = async (source) => fakeLayerOrderResolutions.applied(inSource, source);
  hostEngine.resolveLayerOrder.mockImplementation((source: LayerOrderSource, record: LayerOrderRecord, _limits: unknown, options?: { signal?: AbortSignal }) =>
    hostEngine.answer!(source, record, options?.signal)
  );
  hostEngine.batches.length = 0;
  hostEngine.openLayerOrderResolveBatch.mockImplementation((): LayerOrderResolveBatch => {
    const batch = {
      resolve: vi.fn((source: LayerOrderSource, record: LayerOrderRecord, _limits?: unknown, options?: { signal?: AbortSignal }) =>
        hostEngine.answer!(source, record, options?.signal)
      ),
      close: vi.fn(),
    };
    hostEngine.batches.push(batch);
    return batch;
  });
});

describe('a step’s layer order, captured', () => {
  it('Refresh draws the record’s order and commits it with the picture, one undo step', async () => {
    const stepId = await constrainedStep();
    const pictureBefore = step(stepId).picture?.key;
    const entries = state().diagramHistory.past.length;
    expect(await refreshDiagramStep(stepId)).toBe(true);
    expect(hostEngine.resolveLayerOrder).toHaveBeenCalledOnce();
    expect(hostEngine.resolveLayerOrder.mock.calls[0]![1]).toEqual(inSource);
    expect(bindings.runtime!.foldWithOrder).toHaveBeenCalledOnce();
    expect(step(stepId).picture?.key).not.toBe(pictureBefore);
    expect(stepLayerOrderOf(source(stepId).layerOrder)?.record.constraints).toEqual(STEP_LAYER_ORDER.constraints);
    expect(state().diagramHistory.past).toHaveLength(entries + 1);
    expect(analytics.trackLayerConstraintsNeedAttention).not.toHaveBeenCalled();
  });

  it.each(['clash', 'timed_out', 'lost'] as const)(
    'on %s keeps the step’s picture and flags its record, one undo step, and says so (D10)',
    async (outcome) => {
      const stepId = await constrainedStep();
      const before = step(stepId);
      hostEngine.answer = async () => fakeLayerOrderResolutions.kept(outcome, inSource);
      const entries = state().diagramHistory.past.length;
      const captured = await state().captureDiagramStep(stepId, {
        scope: source(stepId).scope,
        render: source(stepId).render,
        kind: 'diagram-refresh',
        label: 'Refresh picture',
        layerOrder: json,
      });
      expect(captured).toMatchObject({ status: 'needs-attention', changed: true });
      const after = step(stepId);
      expect(after.picture).toEqual(before.picture);
      expect(source(stepId).fingerprint).toBe((before.source as DiagramCpSource).fingerprint);
      const flagged = stepLayerOrderOf(source(stepId).layerOrder)!.record;
      expect(flagged.faces).toEqual(STEP_LAYER_ORDER.faces);
      expect(flagged.attention).toBeDefined();
      expect(state().diagramHistory.past).toHaveLength(entries + 1);
      // Flagged so already: nothing new to record.
      const again = await state().captureDiagramStep(stepId, {
        scope: source(stepId).scope,
        render: source(stepId).render,
        kind: 'diagram-refresh',
        label: 'Refresh picture',
        layerOrder: source(stepId).layerOrder,
      });
      expect(again).toMatchObject({ status: 'needs-attention', changed: false });
      expect(state().diagramHistory.past).toHaveLength(entries + 1);
    }
  );

  it('fires `layer constraints need attention` with enums only, and toasts once per Refresh', async () => {
    const stepId = await constrainedStep();
    hostEngine.answer = async () => fakeLayerOrderResolutions.kept('clash', inSource);
    await refreshDiagramStep(stepId);
    expect(analytics.trackLayerConstraintsNeedAttention).toHaveBeenCalledWith({
      surface: 'diagram_step',
      broken_count_bucket: '<=1',
    });
    expect(toasts.message).toHaveBeenCalledWith('This step’s layer constraints need attention, so it keeps its picture.');
    // Not a capture: no picture was taken.
    expect(analytics.trackDiagramPictureCaptured).not.toHaveBeenCalled();
  });

  it('a Stop on the step ends its restore: nothing is committed', async () => {
    const stepId = await constrainedStep();
    let asked!: () => void;
    const restoring = new Promise<void>((resolve) => {
      asked = resolve;
    });
    hostEngine.answer = (_source, _record, signal) => {
      asked();
      return new Promise((resolve) => signal?.addEventListener('abort', () => resolve({ outcome: 'cancelled' })));
    };
    const before = step(stepId);
    const entries = state().diagramHistory.past.length;
    const refreshing = state().captureDiagramStep(stepId, {
      scope: source(stepId).scope,
      render: source(stepId).render,
      kind: 'diagram-refresh',
      label: 'Refresh picture',
      layerOrder: json,
    });
    await restoring;
    expect(state().stopDiagramCapture(stepId)).toBe(true);
    expect(await refreshing).toEqual({ status: 'stopped' });
    expect(step(stepId)).toEqual(before);
    expect(state().diagramHistory.past).toHaveLength(entries);
    expect(state().oristudioCpFoldRuns).toEqual({});
  });

  it('Refresh All restores every constrained step on one host engine batch, closed with the run', async () => {
    const first = await constrainedStep(left);
    const second = await constrainedStep(right);
    useDocument(edited());
    expect(await refreshAllDiagramSteps()).toBe(2);
    expect(hostEngine.openLayerOrderResolveBatch).toHaveBeenCalledOnce();
    expect(hostEngine.resolveLayerOrder).not.toHaveBeenCalled();
    const [batch] = hostEngine.batches;
    expect(batch!.resolve).toHaveBeenCalledTimes(2);
    expect(batch!.close).toHaveBeenCalledOnce();
    expect(stepLayerOrderOf(source(first).layerOrder)).not.toBeNull();
    expect(stepLayerOrderOf(source(second).layerOrder)).not.toBeNull();
  });

  it('Show as Crease Pattern and back keeps the record, restored as it is drawn again', async () => {
    const stepId = await constrainedStep();
    expect(await showLinkedStepAs(stepId, 'crease-pattern', 'pane')).toBe(true);
    expect(source(stepId).render.mode).toBe('crease-pattern');
    expect(source(stepId).layerOrder).toBe(json);
    expect(hostEngine.resolveLayerOrder).not.toHaveBeenCalled();
    expect(await showLinkedStepAs(stepId, 'folded', 'pane')).toBe(true);
    expect(source(stepId).render.mode).toBe('folded-flat');
    expect(hostEngine.resolveLayerOrder).toHaveBeenCalledOnce();
    expect(stepLayerOrderOf(source(stepId).layerOrder)?.record.constraints).toEqual(STEP_LAYER_ORDER.constraints);
  });

  it('Duplicate copies the record, and Duplicate as keeps it on the copy', async () => {
    const stepId = await constrainedStep();
    const copyId = state().duplicateDiagramStep(stepId)!;
    expect(source(copyId).layerOrder).toBe(json);
    const shownAs = await duplicateLinkedStepAs(stepId, 'crease-pattern');
    expect(shownAs).not.toBeNull();
    expect(source(shownAs!).layerOrder).toBe(json);
    expect(source(shownAs!).render.mode).toBe('crease-pattern');
  });

  it('never captures a step whose record is a newer build’s: it is locked, and carried as it came', async () => {
    const stepId = await constrainedStep();
    const locked = { ...step(stepId), unknown: { raw: {} } } as unknown as ReturnType<typeof step>;
    useWorkspaceStore.setState({
      diagram: { ...state().diagram!, steps: state().diagram!.steps.map((entry) => (entry.id === stepId ? locked : entry)) },
    });
    expect(await refreshDiagramStep(stepId)).toBe(false);
    expect(hostEngine.resolveLayerOrder).not.toHaveBeenCalled();
    expect(stepsIn(state().diagram!).find((entry) => entry.id === stepId)).toBe(locked);
  });
});
