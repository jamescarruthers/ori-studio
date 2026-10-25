/**
 * A fold held open while a linked step is posed (D4): the figure is folded once,
 * then turned over, stepped to another solution and read again on the same
 * kernel handle, where a Refresh folds from scratch every time. What it read
 * is kept until the fold changes, so turning the picture or spreading its
 * layers (Phase 13) draws it again with no call to the kernel at all.
 *
 * The session owns its handle through the shared registry (`retain` /
 * `release`), so a document replaced or an engine reset under it frees or
 * forgets it there; it checks the registry's epoch before every use and folds
 * again when the space it was folded in is gone. It never folds anything into
 * Edit: its figure is its own.
 *
 * React-free and store-free: the kernel and the registry are injected.
 */
import type {
  OristudioCpDocumentSnapshot,
  OristudioCpFold3dRefusal,
  OristudioCpFolded3dAuxLines,
} from '../../engine/oristudioCpTypes';
import type { LayerSpreadOptions } from '../../cp-workspace/folded/foldedLayerSpread';
import { hasFoldedLayerOrder, openFold, readFoldedPicture, type FoldedFigureState, type FoldedPicture } from '../../lib/creaseExportFold';
import type { LayerOrderAttention } from '../../lib/layerOrder/layerOrderRecord';
import type { DiagramStyle } from '../document/diagramDocument';
import {
  foldWithLayerOrder,
  LayerOrderNotShownError,
  type CaptureLayerOrderResolve,
  type StepLayerOrder,
} from './captureLayerOrder';
import { foldedMirrorAxes } from './mirrorAxes';
import type { SanitizeEnv } from '../upload/svgSanitize';
import type { FoldedFigureCamera } from '../../cp-workspace/folded/folded3dCamera';
import {
  capture3dPicture,
  captureModel,
  flatPicture,
  type CapturedPicture,
  type CpCaptureRuntime,
} from './captureFolded';

export interface CaptureSessionDeps {
  /**
   * Run a layer-ordering search as a visible, stoppable fold run: the kernel
   * calls, bound to that run, and the run's Stop, which a layer order's
   * restore listens to (H7).
   */
  search: <T>(work: (runtime: CpCaptureRuntime, stop?: AbortSignal) => Promise<T>) => Promise<T>;
  /** The kernel calls that search nothing — a model change, a read. */
  runtime: () => CpCaptureRuntime;
  retain: (handle: number) => void;
  release: (handle: number) => void;
  /** The handle registry's epoch: a change means every held handle is gone. */
  epoch: () => number;
  env?: SanitizeEnv;
}

/** Which fold a session holds: what it was folded from, so a change of either folds again. */
interface FoldKey {
  document: OristudioCpDocumentSnapshot;
  lineIds: string;
}

/**
 * A layer order a flat fold is drawn in (H7): the step's record, and the host
 * engine that restores it onto the creases.
 */
export interface HeldLayerOrder {
  order: StepLayerOrder;
  resolve: CaptureLayerOrderResolve;
}

/** The layer order a held flat fold shows: the record it was asked in, and the record of what it shows. */
interface HeldOrder {
  /** The step's record as asked: the hold is this fold for it, or for {@link HeldOrder.shown}'s. */
  asked: string;
  shown: StepLayerOrder;
  attention: LayerOrderAttention | null;
}

interface FlatHold extends FoldKey {
  kind: 'flat';
  handle: number;
  epoch: number;
  side: 'front' | 'back';
  /** The record's order it is drawn in; null for the kernel's own enumeration. */
  order: HeldOrder | null;
  state: Omit<FoldedFigureState, 'handle'>;
  /**
   * The most layer orders this fold's search has reached, and whether it ran
   * out there. A jump back to an earlier one restarts the search (the kernel
   * replays it forward), which forgets every one past it: these do not.
   */
  reached: { cases: number; complete: boolean };
  /**
   * What the kernel drew of it as it stands — its paper scene, unturned — so
   * a turn or a spread of the same side and layer order is drawn again with
   * no call to the kernel. Null until read, and again after any change.
   */
  read: FoldedPicture | null;
}

interface SpatialHold extends FoldKey {
  kind: 'spatial';
  handle: number;
  epoch: number;
  fold: Extract<Awaited<ReturnType<CpCaptureRuntime['fold3d']>>, { status: 'placed' }>;
  aux: OristudioCpFolded3dAuxLines | null;
}

/** Where a flat fold stands: which solution it shows, and whether another can be found. */
export interface FlatFoldState {
  side: 'front' | 'back';
  foldCase: number;
  /** How many layer orders the search has found so far, this one or later. */
  discovered: number;
  /** Whether the search may find more than `discovered`. */
  hasNext: boolean;
  noLayerOrder: boolean;
  /**
   * The layer order it is drawn in (H7): the record of the order it shows
   * and its summary, and whether this call restored it (`fresh`), so a verb
   * that only turns a held fold says nothing new of it. Null for the
   * kernel's own enumeration.
   */
  layerOrder: { order: StepLayerOrder; attention: LayerOrderAttention | null; fresh: boolean } | null;
}

export interface CaptureSession {
  /**
   * The flat fold of these lines from this document, on `side` at `foldCase`,
   * folding it only when the session holds none of it. `knownCases` is how
   * many layer orders are known to exist already — the one a step leaves —
   * which a fold opened fresh cannot know.
   *
   * With `layerOrder` (H7), the fold is drawn in the record's order, held
   * for that record (or the one it showed), and never stepped to a case. A
   * record whose order cannot be drawn holds nothing and throws
   * `LayerOrderNotShownError`, for the caller to keep the step's picture.
   */
  flat: (
    document: OristudioCpDocumentSnapshot,
    lineIds: readonly number[],
    side: 'front' | 'back',
    foldCase: number,
    knownCases?: number,
    layerOrder?: HeldLayerOrder | null
  ) => Promise<FlatFoldState>;
  /** Turn the held flat fold over: a model change, no fold. */
  turnOver: () => Promise<FlatFoldState>;
  /** The held flat fold's next solution, on the same handle. */
  nextSolution: () => Promise<FlatFoldState>;
  /**
   * The held flat fold's picture, turned clockwise by `rotationDeg`, its
   * layers spread when asked: read from the kernel once per side and layer
   * order, then drawn from what was read.
   */
  flatPicture: (rotationDeg: number, spread?: LayerSpreadOptions) => Promise<CapturedPicture>;
  /**
   * The held flat fold's mirror axes, unturned (`foldedMirrorAxes`): measured
   * on what the kernel read for its picture, so read once per side and layer
   * order with it.
   */
  flatMirrorAxes: () => Promise<number[]>;
  /**
   * The same picture now, with no call to the kernel, when the session holds
   * this flat fold of `document` on `side` at `foldCase` and has read it;
   * null otherwise. For a preview, never a commit: the caller says which
   * creases the fold is of, and it has no faces on the paper.
   */
  heldFlatPicture: (
    held: {
      document: OristudioCpDocumentSnapshot;
      side: 'front' | 'back';
      foldCase: number;
      /** The step's layer order record, which the held fold must be drawn in; absent or null for none. */
      layerOrder?: string | null;
    },
    rotationDeg: number,
    spread?: LayerSpreadOptions
  ) => CapturedPicture | null;
  /**
   * The 3D fold of these lines from this document — for the live view, and a
   * picture at any camera — or the kernel's refusal.
   */
  spatial: (
    document: OristudioCpDocumentSnapshot,
    lineIds: readonly number[]
  ) => Promise<SpatialHold | { kind: 'refused'; refusal: OristudioCpFold3dRefusal }>;
  /** The held 3D fold's picture at a camera, in the diagram's light. */
  spatialPicture: (camera: FoldedFigureCamera, style: DiagramStyle) => CapturedPicture;
  /**
   * Let the held fold go, and any fold still searching: it is freed as it
   * lands. Idempotent; the session can fold again afterwards.
   */
  dispose: () => void;
  /** Forget the held fold without freeing it: the engine that held it is gone. */
  forget: () => void;
}

export type { SpatialHold };

/**
 * A fold that landed after its session let go, or after a newer fold was
 * asked for: its handle is freed, not held, and the work that asked for it is
 * over. Nothing to tell the user — they moved on.
 */
export class CaptureSessionClosedError extends Error {
  constructor() {
    super('The pose session let go of this fold');
    this.name = 'CaptureSessionClosedError';
  }
}

export function createCaptureSession(deps: CaptureSessionDeps): CaptureSession {
  let held: FlatHold | SpatialHold | null = null;
  /**
   * Bumped by every fold asked for and by every let-go. A fold whose ticket is
   * not the current one when it lands is no longer wanted: a session disposed
   * while it searched (the detail closed) must not keep a handle nothing will
   * ever free.
   */
  let generation = 0;

  const release = () => {
    if (!held) return;
    const { handle, epoch } = held;
    held = null;
    // A handle from before an engine reset is already freed, or belongs to a
    // slot the new kernel may have reused: the registry's reset dealt with it.
    if (epoch === deps.epoch()) deps.release(handle);
  };

  const live = (key: FoldKey): boolean =>
    held !== null &&
    held.epoch === deps.epoch() &&
    held.document === key.document &&
    held.lineIds === key.lineIds;

  const take = (handle: number) => {
    deps.retain(handle);
    return deps.epoch();
  };

  /** Hold a fold that just landed, if it is still the one wanted; free it otherwise. */
  const adopt = (ticket: number, handle: number): number => {
    const epoch = take(handle);
    if (ticket === generation) return epoch;
    deps.release(handle);
    throw new CaptureSessionClosedError();
  };

  const letGo = () => {
    generation += 1;
    release();
  };

  const flatHold = (): FlatHold => {
    // Every verb folds before it reads, so nothing held here means it was let go mid-verb.
    if (!held) throw new CaptureSessionClosedError();
    if (held.kind !== 'flat' || held.epoch !== deps.epoch()) throw new Error('No flat fold is held');
    return held;
  };

  /**
   * The fold's new state, and how far its search has reached. The frontier
   * only grows, or closes: the kernel learns it ran out only from a search
   * that failed, and a replay to the last order says "maybe more" again.
   */
  const settle = (hold: FlatHold, state: Omit<FoldedFigureState, 'handle'>) => {
    hold.state = state;
    hold.read = null;
    const cases = state.discoveredCases;
    const more = state.hasNext ?? false;
    if (cases > hold.reached.cases) hold.reached = { cases, complete: !more };
    else if (cases === hold.reached.cases && !more) hold.reached = { cases, complete: true };
  };

  const flatState = (hold: FlatHold, fresh = false): FlatFoldState => ({
    side: hold.side,
    foldCase: Math.max(1, hold.state.currentCase ?? hold.state.discoveredCases),
    discovered: Math.max(1, hold.reached.cases),
    hasNext: !hold.reached.complete,
    noLayerOrder: !hasFoldedLayerOrder(hold.state),
    layerOrder: hold.order ? { order: hold.order.shown, attention: hold.order.attention, fresh } : null,
  });

  /** Whether `hold` is drawn in the order a step asks for: none, or its record's (or the record of what it showed). */
  const sameOrder = (hold: FlatHold, asked: string | null): boolean =>
    hold.order === null ? asked === null : asked === hold.order.asked || asked === hold.order.shown.json;

  /** A flat fold of these lines, in the kernel's first order or in a record's, held. */
  const foldFlat = async (
    key: FoldKey,
    lineIds: readonly number[],
    side: 'front' | 'back',
    layerOrder: HeldLayerOrder | null
  ): Promise<FlatHold> => {
    release();
    const ticket = ++generation;
    const model = captureModel(key.document, side);
    if (!layerOrder) {
      const folded = await deps.search((runtime) => openFold(runtime, [...lineIds], model));
      return {
        kind: 'flat',
        ...key,
        handle: folded.handle,
        epoch: adopt(ticket, folded.handle),
        side,
        order: null,
        state: folded,
        reached: { cases: 0, complete: false },
        read: null,
      };
    }
    const shown = await deps.search((runtime, stop) =>
      foldWithLayerOrder(runtime, lineIds, model, layerOrder.order, layerOrder.resolve, stop)
    );
    // No figure was made for it: nothing to hold, or to free.
    if (ticket !== generation) throw new CaptureSessionClosedError();
    if (shown.kind !== 'shown') throw new LayerOrderNotShownError(shown.kind === 'kept' ? shown : null);
    const { state } = shown;
    return {
      kind: 'flat',
      ...key,
      handle: state.handle,
      epoch: adopt(ticket, state.handle),
      side,
      order: { asked: layerOrder.order.json, shown: shown.layerOrder, attention: shown.attention },
      state,
      // Its order is the record's, not a step of an enumeration.
      reached: { cases: 1, complete: true },
      read: null,
    };
  };

  return {
    async flat(document, lineIds, side, foldCase, knownCases = 0, layerOrder = null) {
      const key: FoldKey = { document, lineIds: lineIds.join(',') };
      const asked = layerOrder?.order.json ?? null;
      const fresh = !live(key) || held?.kind !== 'flat' || !sameOrder(held, asked);
      if (fresh) {
        held = await foldFlat(key, lineIds, side, layerOrder);
        settle(held, held.state);
      }
      const hold = flatHold();
      if (knownCases > hold.reached.cases && !hold.order) hold.reached = { cases: knownCases, complete: false };
      if (hold.side !== side) {
        settle(hold, { ...hold.state, ...(await deps.runtime().setModel(hold.handle, captureModel(document, side))) });
        hold.side = side;
      }
      // A record's order is never stepped: its pager waits for the dialog's (D9).
      if (!hold.order && flatState(hold).foldCase !== foldCase && foldCase >= 1) {
        settle(hold, await deps.search((runtime) => runtime.foldToCase(hold.handle, foldCase)));
      }
      return flatState(hold, fresh);
    },

    async turnOver() {
      const hold = flatHold();
      const side = hold.side === 'back' ? 'front' : 'back';
      settle(hold, { ...hold.state, ...(await deps.runtime().setModel(hold.handle, captureModel(hold.document, side))) });
      hold.side = side;
      return flatState(hold);
    },

    async nextSolution() {
      const hold = flatHold();
      settle(hold, await deps.search((runtime) => runtime.foldAnother(hold.handle)));
      return flatState(hold);
    },

    async flatPicture(rotationDeg, spread) {
      const hold = flatHold();
      hold.read ??= await readFoldedPicture(deps.runtime(), hold.handle, hold.state.displayStyle);
      return flatPicture(hold.read, rotationDeg, deps.env, spread);
    },

    async flatMirrorAxes() {
      const hold = flatHold();
      hold.read ??= await readFoldedPicture(deps.runtime(), hold.handle, hold.state.displayStyle);
      return foldedMirrorAxes(hold.read);
    },

    heldFlatPicture({ document, side, foldCase, layerOrder = null }, rotationDeg, spread) {
      if (held?.kind !== 'flat' || held.epoch !== deps.epoch() || held.document !== document) return null;
      if (!held.read || held.side !== side || flatState(held).foldCase !== foldCase) return null;
      if (!sameOrder(held, layerOrder)) return null;
      // A preview, never stored: no faces on the paper, which only a stored capture is anchored by.
      return flatPicture(held.read, rotationDeg, deps.env, spread, { faces: false });
    },

    async spatial(document, lineIds) {
      const key: FoldKey = { document, lineIds: lineIds.join(',') };
      if (live(key) && held?.kind === 'spatial') return held;
      release();
      const ticket = ++generation;
      const result = await deps.search((runtime) =>
        runtime.fold3d([...lineIds], captureModel(document, 'front'))
      );
      if (result.status === 'refused') return { kind: 'refused', refusal: result.refusal };
      const epoch = adopt(ticket, result.handle);
      const hold: SpatialHold = { kind: 'spatial', ...key, handle: result.handle, epoch, fold: result, aux: null };
      held = hold;
      hold.aux = await deps.runtime().aux3d(result.handle);
      // Let go while its aux lines were read: the release freed it.
      if (held !== hold) throw new CaptureSessionClosedError();
      return hold;
    },

    spatialPicture(camera, style) {
      if (!held) throw new CaptureSessionClosedError();
      if (held.kind !== 'spatial' || held.epoch !== deps.epoch()) throw new Error('No 3D fold is held');
      return capture3dPicture(held.fold, camera, style, held.aux);
    },

    dispose: letGo,

    forget() {
      held = null;
    },
  };
}
