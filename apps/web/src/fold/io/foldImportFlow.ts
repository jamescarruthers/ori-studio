/**
 * Import CP and "Start from Edit's folded figure" as one flow (plan D16): a
 * file, a sample or Edit's figure in; a `cp-jump` step out, appended through
 * the session after the step on screen — or, for an empty sequence, one that
 * adopts the pattern's square or rectangle sheet.
 *
 * - **Open, choose, commit.** Opening reads the file with the CP kernel's
 *   loader and completes its layer order from its letters, a true ‹ n of m ›
 *   held in the engine. One order lands and commits at once; several wait
 *   for a choice, one listed order per independent component, each order
 *   pictured by the state it lands (a preview, landed and let go). Edit's
 *   figure brings its own order and commits at once.
 * - **The step lands once.** The pick that is committed is the state the
 *   session's replay then takes (`commitLanded`); nothing is folded twice.
 * - **The engine is held while the flow lives**, so a menu or a drop can
 *   import with no Fold surface mounted; the import is let go when a new one
 *   opens, the flow is reset, or it is disposed.
 * - **Latest wins.** A new request, a reset or a dispose drops whatever an
 *   earlier one was still waiting for.
 *
 * Pure: no React, no store, no wasm. The session and Edit's figure are
 * handed in.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { WasmErrorEnvelope } from '../../engine/types';
import type { FoldCpOrigin, FoldPaperShape } from '../document/foldSequenceDocument';
import { rectangleShape } from '../document/foldSequenceDocument';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldSampleId } from '../engine/foldEngineIoSamples';
import type {
  FoldImportFingerprinted,
  FoldImportLimits,
  FoldImportOpened,
  FoldImportSource,
  FoldImportTarget,
} from '../engine/foldEngineIoWire';
import type { FoldEngineOutcome, FoldScene } from '../engine/foldEngineWire';
import type { FoldSession, FoldSessionWorker } from '../session/foldSession';
import { foldSample, foldSampleSource } from './foldImportFiles';
import type { FoldImportLocalCode, FoldImportRefusal } from './foldImportRefusal';
import { foldCursorReady, type FoldCursorReady } from './foldSessionWaits';

/** What is imported: a file the user picked or dropped, a sample, or Edit's folded figure. */
export type FoldImportRequest =
  | {
      readonly kind: 'file';
      /** Shown in the dialog and its refusals; never stored, never sent. */
      readonly name: string;
      /** Null for a file whose extension names no format the kernel reads, or that could not be read. */
      readonly source: FoldImportSource | null;
      /** The platform could not read the file. */
      readonly unreadable?: boolean;
    }
  | { readonly kind: 'sample'; readonly sample: FoldSampleId }
  | { readonly kind: 'edit-folded-figure' };

/** One order's picture: the folded state it lands. */
export type FoldOrderPreview =
  | { readonly status: 'working' }
  | { readonly status: 'ready'; readonly scene: FoldScene }
  | { readonly status: 'failed' };

export type FoldImportFlowState =
  | { readonly phase: 'idle' }
  /** Reading the file, completing its order, or landing and committing it. */
  | { readonly phase: 'working'; readonly request: FoldImportRequest }
  | { readonly phase: 'refused'; readonly request: FoldImportRequest; readonly refusal: FoldImportRefusal }
  | { readonly phase: 'failed'; readonly request: FoldImportRequest; readonly error: WasmErrorEnvelope }
  | {
      readonly phase: 'choosing';
      readonly request: FoldImportRequest;
      readonly opened: FoldImportOpened;
      /** One listed order per component. */
      readonly choice: readonly number[];
      /** By {@link foldOrderChoiceKey}. */
      readonly previews: ReadonlyMap<string, FoldOrderPreview>;
      /** The choice is being landed and committed. */
      readonly committing: boolean;
    }
  | { readonly phase: 'done'; readonly request: FoldImportRequest; readonly stepId: string; readonly origin: FoldCpOrigin };

export interface FoldImportFlowOptions {
  session: FoldSession;
  /** Edit's chosen flat folded figure as the CP kernel's paper scene, or null when Edit has none. */
  editFoldedFigure: () => Promise<OristudioCpFoldedPaperScene | null>;
  /** A step was imported: the analytics event, by the step's closed origin. */
  onImported?: (origin: FoldCpOrigin) => void;
}

export interface FoldImportFlow {
  readonly store: StoreApi<FoldImportFlowState>;
  /** Import `request`, after the step on screen. */
  open(request: FoldImportRequest): Promise<void>;
  /** Pick order `order` of component `component` (the chooser's cards). */
  choose(component: number, order: number): void;
  /** Land the chosen orders as a step and commit it. */
  commit(): Promise<void>;
  /** A refused search, asked again with a larger budget. */
  searchLonger(): Promise<void>;
  /** Back to choosing what to import; an opened import is let go. */
  reset(): void;
  /** Let the import and the engine go. */
  dispose(): void;
}

/** The most orders a component pictures; one past them is still listed by count. */
export const FOLD_ORDER_PREVIEW_LIMIT = 24;

/** How much more a "Search longer" spends than the search that ran out. */
const SEARCH_LONGER_FACTOR = 8;

/** A choice's key in the previews. */
export function foldOrderChoiceKey(choice: readonly number[]): string {
  return choice.join(',');
}

/** `choice` with component `component` at `order`. */
export function withFoldOrder(choice: readonly number[], component: number, order: number): number[] {
  return choice.map((value, index) => (index === component ? order : value));
}

/** How many components the chooser has to ask about: the ones with more than one order. */
export function foldOrderChoices(opened: Pick<FoldImportOpened, 'components'>): number {
  return opened.components.filter((component) => component.orders > 1).length;
}

/**
 * The sheet a state's outline is, as the document stores its shape: a square
 * when its sides agree, a rectangle otherwise; null for an outline with no
 * area. What an import of Edit's figure into an empty sequence adopts, since
 * that call says no sheet of its own.
 */
export function foldShapeOfOutline(outline: readonly (readonly [number, number])[]): FoldPaperShape | null {
  if (outline.length < 3) return null;
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (!(width > 0 && height > 0)) return null;
  if (Math.abs(width - height) <= 1e-9 * Math.max(width, height)) return { kind: 'square' };
  return rectangleShape(width, height);
}

function errorEnvelope(error: unknown): WasmErrorEnvelope {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const message = 'message' in error ? String(error.message) : error.code;
    return { code: error.code, message };
  }
  return { code: 'fold_import', message: error instanceof Error ? error.message : String(error) };
}

/** An import the engine holds, and where it was opened. */
interface Held {
  readonly handle: number;
  readonly where: FoldCursorReady;
  readonly opened: FoldImportOpened;
}

const IDLE: FoldImportFlowState = { phase: 'idle' };

export function createFoldImportFlow({ session, editFoldedFigure, onImported }: FoldImportFlowOptions): FoldImportFlow {
  const store = createStore<FoldImportFlowState>(() => IDLE);
  const releaseHold = session.retain();
  let disposed = false;
  /** Bumped by every request, reset and dispose: work for an older one lands nothing. */
  let ticket = 0;
  let held: Held | null = null;
  let previewRunning = false;
  /** The limits the last request was opened with, for "Search longer". */
  let lastLimits: FoldImportLimits | undefined;

  const local = (request: FoldImportRequest, code: FoldImportLocalCode): FoldImportFlowState => ({
    phase: 'refused',
    request,
    refusal: { kind: 'local', code, ...(request.kind === 'file' ? { name: request.name } : {}) },
  });

  /** Ask the engine with `state` as the call's anchor; null when the state is no longer held. */
  const ask = async <T>(state: FoldEngineStateHandle, call: (engine: FoldSessionWorker, id: number) => Promise<T>) => {
    const answer = await session.withState(state, call);
    return answer.status === 'answered' ? answer.value : null;
  };

  const letGo = () => {
    const import_ = held;
    held = null;
    if (!import_) return;
    void ask(import_.where.state, (engine) => engine.releaseImports([import_.handle])).catch(() => {});
  };

  const targetOf = (where: FoldCursorReady, id: number): FoldImportTarget =>
    where.empty ? { kind: 'empty', startSide: where.paper.startSide } : { kind: 'after', state: id };

  /** Commit a landed step after `where`; the flow's state says how it went. */
  const commitLandedStep = async (
    request: FoldImportRequest,
    where: FoldCursorReady,
    landed: FoldImportFingerprinted,
    adopt: FoldPaperShape | null,
    mine: number
  ): Promise<void> => {
    const state = { generation: where.state.generation, id: landed.state };
    const outcome = await session.commitLanded({
      state,
      parent: where.empty ? null : where.state,
      op: landed.op,
      fingerprint: landed.fingerprint,
      summary: landed.summary,
      ...(where.empty && adopt ? { adopt } : {}),
    });
    if (mine !== ticket) return;
    switch (outcome.status) {
      case 'committed':
        letGo();
        store.setState({ phase: 'done', request, stepId: outcome.stepId, origin: landed.op.origin }, true);
        onImported?.(landed.op.origin);
        return;
      case 'refused':
        store.setState({ phase: 'refused', request, refusal: { kind: 'engine', refused: outcome.refused } }, true);
        return;
      case 'failed':
        store.setState({ phase: 'failed', request, error: outcome.error }, true);
        return;
      case 'stale':
        store.setState(local(request, 'changed'), true);
        return;
      case 'unavailable':
        store.setState(local(request, outcome.reason === 'read-only' ? 'read_only' : 'no_state'), true);
        return;
    }
  };

  /** Land `choice` of the held import and commit it. */
  const pickAndCommit = async (request: FoldImportRequest, import_: Held, choice: readonly number[], mine: number) => {
    const picked = await ask(import_.where.state, (engine) => engine.importPick(import_.handle, choice));
    if (mine !== ticket) {
      if (picked?.status === 'ok') {
        void ask(import_.where.state, (engine) => engine.release([picked.state])).catch(() => {});
      }
      return;
    }
    if (!picked) {
      store.setState(local(request, 'no_state'), true);
      return;
    }
    if (picked.status !== 'ok') {
      store.setState({ phase: 'refused', request, refusal: { kind: 'engine', refused: picked } }, true);
      return;
    }
    await commitLandedStep(request, import_.where, picked, import_.opened.paper, mine);
  };

  /** Picture the orders the chooser shows, one at a time, the newest choice's first. */
  const runPreviews = async () => {
    if (previewRunning) return;
    previewRunning = true;
    try {
      for (;;) {
        const now = store.getState();
        const import_ = held;
        if (disposed || now.phase !== 'choosing' || !import_) return;
        const next = nextPreview(now.opened, now.choice, now.previews);
        if (!next) return;
        const key = foldOrderChoiceKey(next);
        const mine = ticket;
        setPreview(key, { status: 'working' });
        const scene = await ask(import_.where.state, async (engine) => {
          const picked = await engine.importPick(import_.handle, next);
          if (picked.status !== 'ok') return null;
          try {
            return await engine.scene(picked.state);
          } finally {
            await engine.release([picked.state]);
          }
        }).catch(() => null);
        if (mine !== ticket) continue;
        setPreview(key, scene ? { status: 'ready', scene } : { status: 'failed' });
      }
    } finally {
      previewRunning = false;
    }
  };

  const setPreview = (key: string, preview: FoldOrderPreview) => {
    const now = store.getState();
    if (now.phase !== 'choosing') return;
    const previews = new Map(now.previews);
    previews.set(key, preview);
    store.setState({ ...now, previews }, true);
  };

  const open = async (request: FoldImportRequest, limits?: FoldImportLimits): Promise<void> => {
    if (disposed) return;
    const mine = ++ticket;
    letGo();
    lastLimits = limits;
    store.setState({ phase: 'working', request }, true);
    if (request.kind === 'file' && request.source === null) {
      store.setState(local(request, request.unreadable ? 'unreadable_file' : 'unsupported_file'), true);
      return;
    }
    try {
      const where = await foldCursorReady(session);
      if (mine !== ticket) return;
      if (where.status !== 'ready') {
        store.setState(local(request, where.reason === 'read-only' ? 'read_only' : 'no_state'), true);
        return;
      }

      if (request.kind === 'edit-folded-figure') {
        const scene = await editFoldedFigure();
        if (mine !== ticket) return;
        if (!scene) {
          store.setState(local(request, 'no_folded_figure'), true);
          return;
        }
        const landed = await ask(where.state, (engine, id) =>
          engine.importEditFoldedFigure(scene, targetOf(where, id), limits)
        );
        if (mine !== ticket) {
          if (landed?.status === 'ok') void ask(where.state, (engine) => engine.release([landed.state])).catch(() => {});
          return;
        }
        if (!landed) {
          store.setState(local(request, 'no_state'), true);
          return;
        }
        if (landed.status !== 'ok') {
          store.setState({ phase: 'refused', request, refusal: { kind: 'engine', refused: landed } }, true);
          return;
        }
        await commitLandedStep(request, where, landed, foldShapeOfOutline(landed.summary.sheet), mine);
        return;
      }

      const source = request.kind === 'sample' ? sampleSource(request.sample) : request.source;
      if (!source) {
        store.setState(local(request, 'unsupported_file'), true);
        return;
      }
      const opened: FoldEngineOutcome<FoldImportOpened> | null = await ask(where.state, (engine, id) =>
        engine.importCp(source, targetOf(where, id), limits)
      );
      if (mine !== ticket || disposed) {
        if (opened?.status === 'ok') {
          void ask(where.state, (engine) => engine.releaseImports([opened.import])).catch(() => {});
        }
        return;
      }
      if (!opened) {
        store.setState(local(request, 'no_state'), true);
        return;
      }
      if (opened.status !== 'ok') {
        store.setState({ phase: 'refused', request, refusal: { kind: 'engine', refused: opened } }, true);
        return;
      }
      const import_: Held = { handle: opened.import, where, opened };
      held = import_;
      const choice = opened.components.map(() => 0);
      if (foldOrderChoices(opened) === 0) {
        await pickAndCommit(request, import_, choice, mine);
        return;
      }
      store.setState({ phase: 'choosing', request, opened, choice, previews: new Map(), committing: false }, true);
      void runPreviews();
    } catch (error) {
      if (mine === ticket) store.setState({ phase: 'failed', request, error: errorEnvelope(error) }, true);
    }
  };

  return {
    store,
    open: (request) => open(request),

    choose(component, order) {
      const now = store.getState();
      if (now.phase !== 'choosing' || now.committing) return;
      const listed = now.opened.components[component]?.orders ?? 0;
      if (!Number.isInteger(order) || order < 0 || order >= listed || now.choice[component] === order) return;
      store.setState({ ...now, choice: withFoldOrder(now.choice, component, order) }, true);
      void runPreviews();
    },

    async commit() {
      const now = store.getState();
      const import_ = held;
      if (now.phase !== 'choosing' || now.committing || !import_) return;
      const mine = ticket;
      store.setState({ ...now, committing: true }, true);
      try {
        await pickAndCommit(now.request, import_, now.choice, mine);
      } catch (error) {
        if (mine === ticket) store.setState({ phase: 'failed', request: now.request, error: errorEnvelope(error) }, true);
      }
    },

    async searchLonger() {
      const now = store.getState();
      if (now.phase !== 'refused' || now.refusal.kind !== 'engine') return;
      const { refusal } = now.refusal.refused;
      if (refusal.code !== 'import_budget_exceeded') return;
      const spent = (refusal as Readonly<Record<string, unknown>>).nodes;
      const nodes = typeof spent === 'number' && spent > 0 ? spent : 1;
      await open(now.request, { ...lastLimits, maxNodes: Math.ceil(nodes * SEARCH_LONGER_FACTOR) });
    },

    reset() {
      ticket += 1;
      letGo();
      store.setState(IDLE, true);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      ticket += 1;
      letGo();
      releaseHold();
    },
  };
}

/** A sample as the engine imports it; null for an id this build does not ship. */
function sampleSource(id: FoldSampleId): FoldImportSource | null {
  const sample = foldSample(id);
  return sample ? foldSampleSource(sample) : null;
}

/**
 * The next order to picture: the chosen one first, then each component's
 * orders with the others as chosen, up to {@link FOLD_ORDER_PREVIEW_LIMIT}
 * each. Null when every one shown has its picture or is being drawn.
 */
function nextPreview(
  opened: FoldImportOpened,
  choice: readonly number[],
  previews: ReadonlyMap<string, FoldOrderPreview>
): number[] | null {
  if (!previews.has(foldOrderChoiceKey(choice))) return [...choice];
  for (let component = 0; component < opened.components.length; component += 1) {
    const { orders } = opened.components[component] ?? { orders: 0 };
    if (orders <= 1) continue;
    for (let order = 0; order < Math.min(orders, FOLD_ORDER_PREVIEW_LIMIT); order += 1) {
      const candidate = withFoldOrder(choice, component, order);
      if (!previews.has(foldOrderChoiceKey(candidate))) return candidate;
    }
  }
  return null;
}
