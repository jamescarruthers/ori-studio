/**
 * A host's cursor through the solutions that fit a saved record
 * (`implementation-plans/layer-order-dialog.md`, row H6, decision D9): what
 * Edit's Another solution and the Properties pane's ‹ › step with on a
 * constrained figure. Reached only through `hostEngineGateway.ts`, as the
 * rest of the host engine is.
 *
 * - **A worker of its own, kept between presses.** Creating a cursor spawns
 *   nothing; its first step does, restores the record onto the source (E5's
 *   `restore`, D10) and keeps that session, with E6's solutions cursor beside
 *   it, so each later press is one step. Closing it terminates the worker.
 * - **The stepper's fixed order** ("3 of 12", never the order on screen
 *   first; the plan's "Calls I've made"), by picture from a side or, with
 *   X-ray on, by layer order (D5). Each answer says where the order now
 *   shown lies, and whether the count runs at all on a figure this large
 *   (D7: above `LAYER_ORDER_COUNT_MAX_OPEN_PAIRS` open pairs the stepper
 *   steps with no total).
 * - **A step that moved answers what the host folds**, as a resolve does: the
 *   full relations of the order now shown, to seed `fold_with_order`, and
 *   the record of that order, its summary kept from the restore.
 * - **A Stop terminates,** as for a resolve: the step answers `cancelled`,
 *   and the cursor is gone with its worker ({@link LayerOrderSolutionCursor.alive}).
 *   So is it after any loss; the host makes a new one on the next press.
 *
 * Store-free and host-free (`layerOrderBoundary.test.ts`).
 */
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderApplied, LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { reportError } from '../../monitoring';
import { layerOrderCountStarts } from '../layerOrderBudgets';
import { LAYER_ORDER_LIMITS, type LayerPosition, type LayerStepBy } from '../engine/layerOrderEngine';
import { createLayerOrderRuntime } from '../engine/layerOrderRuntime';
import { layerOrderLossOf } from './layerOrderLoss';
import {
  layerOrderAttentionOf,
  withLayerOrderAttention,
  type LayerOrderFound,
  type LayerOrderLossCause,
} from './layerOrderResolution';

/** Where the order shown lies among the solutions that fit, and whether they are counted at all. */
export interface LayerOrderSolutionPlace {
  /** `index` from 1 in the stepper's fixed order; `total` what is counted so far, final once exact. */
  readonly position: LayerPosition;
  /** False on a figure too large to count (D7): the stepper steps, with no total. */
  readonly counted: boolean;
}

/** Why the record gave the cursor nothing to step from: its restore clashed, ran out of time, or was refused. */
export type LayerOrderSolutionsUnrestored = 'clash' | 'timed_out' | 'refused';

export type LayerOrderSolutionStep =
  /** On to another solution: what the host folds and commits, as it commits an Apply. */
  | (LayerOrderSolutionPlace & { readonly outcome: 'moved'; readonly applied: LayerOrderApplied })
  /** No solution lies that way among those counted; final once `position.total.exact`. Nothing changed. */
  | (LayerOrderSolutionPlace & { readonly outcome: 'end' })
  /** The check within the next solution ran out of time. Nothing changed. */
  | { readonly outcome: 'timed_out' }
  /** The record restores to no order to step from (D10): nothing changed, and the cursor is spent. */
  | { readonly outcome: 'unrestored'; readonly why: LayerOrderSolutionsUnrestored }
  /** The engine went away or never came (`load` for offline): reported as a resolve's loss is. */
  | { readonly outcome: 'lost'; readonly cause: LayerOrderLossCause }
  /** A Stop. */
  | { readonly outcome: 'cancelled' };

export interface LayerOrderSolutionStepOptions {
  /** A Stop: aborting it terminates the cursor's worker, and the step answers `cancelled`. */
  readonly signal?: AbortSignal;
}

export interface LayerOrderSolutionCursor {
  /** Step to the next or previous solution by `by`; the first step restores the record first. Never rejects. */
  step(
    direction: 'next' | 'previous',
    by: LayerStepBy,
    options?: LayerOrderSolutionStepOptions
  ): Promise<LayerOrderSolutionStep>;
  /** Where the order shown lies by `by` (a side turned, X-ray toggled); null before the first step, or once gone. */
  place(by: LayerStepBy): Promise<LayerOrderSolutionPlace | null>;
  /** Whether it can still step from where it is: false once closed, stopped, spent or lost. */
  alive(): boolean;
  /** Terminate its worker. Idempotent. */
  close(): void;
}

export interface LayerOrderSolutionCursorOptions {
  /** Starts a worker. The default spawns `workers/layerOrderWorker.ts`; tests pass a fake. */
  readonly spawn?: () => Worker;
}

/** Thrown between calls once a step is stopped, so nothing more is asked of a worker that is gone. */
const STOPPED = Symbol('layer order step stopped');

const CANCELLED: LayerOrderSolutionStep = Object.freeze({ outcome: 'cancelled' });

/**
 * A cursor over `record` (its points in the crease pattern's coordinates) on
 * `source`, the fold the host shows. See the module docs.
 */
export function createLayerOrderSolutionCursor(
  source: LayerOrderSource,
  record: LayerOrderRecord,
  options: LayerOrderSolutionCursorOptions = {}
): LayerOrderSolutionCursor {
  const runtime = createLayerOrderRuntime({ role: 'host', ...(options.spawn ? { spawn: options.spawn } : {}) });
  /** The session the first step restored: what the record kept, and whether its solutions are counted. */
  let opened: { found: LayerOrderFound; counted: boolean } | null = null;
  let closed = false;
  /** Gone for good: closed, stopped, spent or lost. Its worker is terminated. */
  let spent = false;
  let queue: Promise<unknown> = Promise.resolve();

  const spend = () => {
    spent = true;
    opened = null;
    runtime.dispose();
  };
  // A worker that dies between presses takes the session, and so the cursor, with it.
  runtime.onLost(() => {
    if (!spent) spend();
  });

  const turn = async (
    direction: 'next' | 'previous',
    by: LayerStepBy,
    { signal }: LayerOrderSolutionStepOptions
  ): Promise<LayerOrderSolutionStep> => {
    if (closed || spent || signal?.aborted) return CANCELLED;
    let stopped = false;
    const stop = () => {
      stopped = true;
      spend();
    };
    signal?.addEventListener('abort', stop, { once: true });
    const { engine } = runtime;
    const ask = <T>(call: () => Promise<T>): Promise<T> => (stopped || spent ? Promise.reject(STOPPED) : call());
    try {
      if (!opened) {
        const restored = await ask(() => engine.restore(source, record, LAYER_ORDER_LIMITS.restore));
        if (restored.status === 'refused') {
          spend();
          return { outcome: 'unrestored', why: restored.refusal.code === 'session_timed_out' ? 'timed_out' : 'refused' };
        }
        if (restored.outcome.kind !== 'applied') {
          spend();
          return { outcome: 'unrestored', why: restored.outcome.kind };
        }
        opened = {
          found: { saved_constraints: restored.saved_constraints, carried: restored.carried, opened_on: restored.opened_on },
          counted: layerOrderCountStarts(restored.open_pairs.length / 2),
        };
      }
      const { found, counted } = opened;
      const stepped = await ask(() => engine.step(by, direction, LAYER_ORDER_LIMITS.step));
      switch (stepped.verdict) {
        case 'timed_out':
          return { outcome: 'timed_out' };
        case 'end': {
          const position = await ask(() => engine.position(by));
          return { outcome: 'end', position, counted };
        }
        case 'moved': {
          const relations = await ask(() => engine.relations());
          const saved = await ask(() => engine.save());
          // An order past the record's budget can't be kept: nothing is folded, and the cursor goes.
          if (saved.status !== 'ok') {
            spend();
            return { outcome: 'unrestored', why: 'refused' };
          }
          // The constraints never change in a step, so neither does what the restore found of them.
          const kept = withLayerOrderAttention(saved.record, layerOrderAttentionOf({ outcome: 'applied', found }, record));
          return { outcome: 'moved', applied: { record: kept, relations, source }, position: stepped.position, counted };
        }
      }
    } catch (error) {
      if (stopped || closed || error === STOPPED) return CANCELLED;
      const { cause, report } = layerOrderLossOf(error);
      if (report) reportError(error, { surface: 'layer-order:host', tags: { cause } });
      if (!spent) spend();
      return { outcome: 'lost', cause };
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  };

  return {
    step: (direction, by, more = {}) => {
      const next = queue.then(() => turn(direction, by, more));
      queue = next;
      return next;
    },
    place: async (by) => {
      const counted = opened?.counted;
      if (counted === undefined || spent) return null;
      try {
        const position = await runtime.engine.position(by);
        return spent ? null : { position, counted };
      } catch {
        return null;
      }
    },
    alive: () => !closed && !spent,
    close: () => {
      if (closed) return;
      closed = true;
      if (!spent) spend();
    },
  };
}
