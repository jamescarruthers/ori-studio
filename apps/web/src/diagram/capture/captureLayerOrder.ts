/**
 * A Diagram step's chosen layer order, folded
 * (`implementation-plans/layer-order-dialog.md`, row H7): a linked step whose
 * source carries a record (`DiagramCpSource.layerOrder`) is drawn in the
 * record's order wherever its flat fold is captured — Refresh, Refresh All,
 * Show as, Duplicate, its faces on the paper, Pose's held fold — never in
 * the kernel's first order.
 *
 * - **Restore, then fold with the order.** The step's creases are folded as
 *   every capture folds them, for the source the kernel folded and the
 *   paper's frame; the host engine restores the record onto that source
 *   (`layer-order/host/`, injected as a {@link CaptureLayerOrderResolve}),
 *   and an order that applied is folded again with its relations, into a new
 *   figure (`fold_with_order`). That figure is what is drawn.
 * - **D10.** Anything else keeps the step's picture: the record comes back
 *   flagged with the summary the step shows at rest (`attention`); nothing is
 *   applied greedily and nothing is dropped. A Stop keeps nothing.
 * - **The paper frame.** A step keeps its record's points about the centre of
 *   its paper's box (`paperBoxCentre`), the frame its faces on the paper are
 *   kept in, so a step whose region moved keeps its record. The host engine
 *   and the dialog take them in the crease pattern's coordinates, through the
 *   frame, once, here.
 *
 * Store-free and React-free: the kernel and the host engine are injected.
 */
import type {
  OristudioCpFoldedFigureModel,
  OristudioCpFoldedPaperScene,
  OristudioCpFoldSource,
} from '../../engine/oristudioCpTypes';
import type { LayerOrderResolution } from '../../layer-order/host/hostEngineGateway';
import { withLayerOrderAttention } from '../../layer-order/host/layerOrderResolution';
import { NEWER } from '../../lib/documentFile';
import { openFold, type CpFoldRuntime, type FoldedFigureState } from '../../lib/creaseExportFold';
import {
  encodeLayerOrderRecord,
  readLayerOrderRecord,
  type LayerOrderAttention,
  type LayerOrderRecord,
} from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderApplied, LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { kernelFoldSourceOf, layerOrderSourceOf } from '../../lib/layerOrder/layerOrderSource';
import {
  layerOrderRecordFromSource,
  layerOrderRecordToSource,
  paperFrameAbout,
  type PaperFrame,
} from '../../lib/layerOrder/paperFrame';
import { paperBoxCentre } from './capturePaperFaces';

/** A step's record as this build reads it, and as its source keeps it. */
export interface StepLayerOrder {
  readonly record: LayerOrderRecord;
  readonly json: string;
}

/**
 * The record a step's source keeps, read; null when it keeps none. A newer
 * build's locks its step (`diagramFile.ts`), which is never captured, and
 * one that does not read was dropped as the file loaded: neither reaches a
 * capture, and both read as none here.
 */
export function stepLayerOrderOf(layerOrder: string | undefined): StepLayerOrder | null {
  if (layerOrder === undefined) return null;
  const read = readLayerOrderRecord(layerOrder);
  return read !== NEWER && read.ok ? { record: read.record, json: read.json } : null;
}

/** `layerOrder` with its summary set (or cleared, for null), as its source keeps it. */
export function flaggedLayerOrder(layerOrder: StepLayerOrder, attention: LayerOrderAttention | null): StepLayerOrder {
  return keptLayerOrder(withLayerOrderAttention(layerOrder.record, attention));
}

/**
 * A step's record once its creases fold in 3D (D13): kept, with every
 * constraint waiting until they fold flat again; already so, as it was.
 */
export function routed3dLayerOrder(layerOrder: StepLayerOrder): StepLayerOrder {
  const { attention } = layerOrder.record;
  const count = layerOrder.record.constraints.length;
  if (attention?.reason === 'route-3d' && attention.count === count) return layerOrder;
  return flaggedLayerOrder(layerOrder, { reason: 'route-3d', count });
}

/**
 * The host engine, as a capture asks it: restore `record` (its points in the
 * crease pattern's coordinates) onto `source`, the fold the kernel just made.
 * Bound by the store to a single resolve or to Refresh All's batch
 * (`hostEngineGateway.ts`); `stop` is the capture's fold run's, so its Stop
 * terminates the resolve's worker too.
 */
export type CaptureLayerOrderResolve = (
  source: LayerOrderSource,
  record: LayerOrderRecord,
  stop: AbortSignal | undefined
) => Promise<LayerOrderResolution>;

/** A Diagram step's paper frame: crease-pattern units about the centre of its paper's box, as its faces are kept. */
export function diagramLayerOrderFrame(scene: Pick<OristudioCpFoldedPaperScene, 'sheet_points'>): PaperFrame {
  return paperFrameAbout(paperBoxCentre(scene));
}

/** The same frame, for a fold the kernel drew no paper scene of: the box of the creases it folded. */
function segmentsFrame(source: OristudioCpFoldSource): PaperFrame {
  const sheet_points = source.segments.flatMap((segment) => [segment.a, segment.b]);
  return diagramLayerOrderFrame({ sheet_points });
}

/** What a fold of a step's creases was made from, as the host engine and the dialog take it. */
export interface StepFoldSource {
  readonly source: LayerOrderSource;
  /** The step's paper frame, for its record's points. */
  readonly frame: PaperFrame;
  /** The kernel's paper scene of the fold, in the kernel's first order; null for one it drew none of. */
  readonly scene: OristudioCpFoldedPaperScene | null;
}

/**
 * Fold a step's creases as a capture does, read what the fold was made from
 * and the paper it lies on, and free it.
 */
export async function stepFoldSource(
  runtime: CpFoldRuntime,
  lineIds: readonly number[],
  model: OristudioCpFoldedFigureModel
): Promise<StepFoldSource> {
  if (!runtime.source) throw new Error('This crease kernel cannot say what a fold was made from');
  const folded = await openFold(runtime, [...lineIds], model);
  try {
    const kernel = await runtime.source(folded.handle);
    const scene = await runtime.paperScene(folded.handle);
    return {
      source: layerOrderSourceOf(kernel, model),
      frame: scene && scene.sheet_points.length > 0 ? diagramLayerOrderFrame(scene) : segmentsFrame(kernel),
      scene,
    };
  } finally {
    await runtime.free(folded.handle);
  }
}

/** Why a record's order was not drawn: the host engine's answer, or the kernel refusing to draw it. */
export type LayerOrderKeptOutcome = 'clash' | 'timed_out' | 'refused' | 'lost';

/** A fold in a record's order, or why the step keeps its picture. */
export type LayerOrderShown =
  /**
   * Drawn: the new figure, which the caller owns and frees; the record of
   * the order it shows (the host engine's save of it), and its summary.
   */
  | {
      readonly kind: 'shown';
      readonly state: FoldedFigureState;
      readonly layerOrder: StepLayerOrder;
      readonly attention: LayerOrderAttention | null;
    }
  /** Not drawn (D10): the step keeps its picture, and this record, flagged. */
  | {
      readonly kind: 'kept';
      readonly layerOrder: StepLayerOrder;
      readonly attention: LayerOrderAttention;
      readonly outcome: LayerOrderKeptOutcome;
    }
  /** A Stop: nothing to keep. */
  | { readonly kind: 'cancelled' };

/** The record a step saves, encoded once; a record past the budget is no answer the step can keep. */
function keptLayerOrder(record: LayerOrderRecord): StepLayerOrder {
  const encoded = encodeLayerOrderRecord(record);
  if (!encoded.ok) throw new Error(`The step's layer order cannot be saved (${encoded.reason})`);
  return { record, json: encoded.json };
}

/**
 * Fold a step's creases in its record's order: restore it, then fold its
 * relations into a new figure. `model` is the capture's (`captureModel`): its
 * side, at no turn and no scale.
 */
export async function foldWithLayerOrder(
  runtime: CpFoldRuntime,
  lineIds: readonly number[],
  model: OristudioCpFoldedFigureModel,
  layerOrder: StepLayerOrder,
  resolve: CaptureLayerOrderResolve,
  stop?: AbortSignal
): Promise<LayerOrderShown> {
  const { source, frame } = await stepFoldSource(runtime, lineIds, model);
  const resolution = await resolve(source, layerOrderRecordToSource(layerOrder.record, frame), stop);
  if (resolution.outcome === 'cancelled') return { kind: 'cancelled' };
  if (resolution.outcome !== 'applied') {
    // The record asked about, as the step keeps it: its points never go through the frame and back.
    const attention = resolution.attention ?? { reason: 'unresolved', count: layerOrder.record.constraints.length };
    return { kind: 'kept', layerOrder: flaggedLayerOrder(layerOrder, attention), attention, outcome: resolution.outcome };
  }
  const shown = await foldAppliedOrder(runtime, resolution.applied, model, frame);
  if (shown.kind === 'shown') return { ...shown, attention: resolution.attention };
  return shown.kind === 'kept' ? { ...shown, layerOrder: flaggedLayerOrder(layerOrder, shown.attention) } : shown;
}

/**
 * Fold an order the dialog applied, or the host engine restored, into a new
 * figure: `applied.relations` on `applied.source`, exactly what was analysed.
 * Its record is saved in the step's frame, with the summary it came with. A
 * kernel that cannot draw the order refuses (a typed refusal, no figure), and
 * the step keeps its picture, its record flagged with every constraint.
 */
export async function foldAppliedOrder(
  runtime: CpFoldRuntime,
  applied: LayerOrderApplied,
  model: OristudioCpFoldedFigureModel,
  frame: PaperFrame
): Promise<LayerOrderShown> {
  if (!runtime.foldWithOrder) throw new Error('This crease kernel cannot fold a given layer order');
  const folded = await runtime.foldWithOrder(kernelFoldSourceOf(applied.source), applied.relations, model);
  const layerOrder = keptLayerOrder(layerOrderRecordFromSource(applied.record, frame));
  if (folded.status === 'refused') {
    const attention: LayerOrderAttention = { reason: 'unresolved', count: applied.record.constraints.length };
    return { kind: 'kept', layerOrder: flaggedLayerOrder(layerOrder, attention), attention, outcome: 'refused' };
  }
  const { status: _folded, ...state } = folded;
  return { kind: 'shown', state, layerOrder, attention: applied.record.attention ?? null };
}

/**
 * A fold that was asked for in a record's order and could not be drawn in
 * it: the step keeps its picture, and `shown`'s flagged record (D10). Thrown
 * through a Pose verb, whose session holds the fold, for its controller to
 * keep; `null` for a Stop.
 */
export class LayerOrderNotShownError extends Error {
  constructor(readonly kept: Extract<LayerOrderShown, { kind: 'kept' }> | null) {
    super(kept ? 'The step’s layer order could not be drawn' : 'The step’s layer order was stopped');
    this.name = 'LayerOrderNotShownError';
  }
}
