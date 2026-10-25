/**
 * The Layer order dialog's session, for as long as the dialog is up
 * (`implementation-plans/layer-order-dialog.md`, row U4): its own engine
 * worker (`layerOrderRuntime.ts`, role `dialog`), the open on the request's
 * source, and the session's status. U10's `useLayerOrderDialog` builds on it:
 * it takes {@link LayerOrderSession.runtime} for the inspector's calls and
 * reads the status the open left.
 *
 * - **The worker is the dialog's.** Created as the dialog mounts, so no
 *   worker exists until a host has opened the dialog, and terminated as it
 *   unmounts. A runtime spawns its worker on its first call, which is the open.
 * - **Statuses** ({@link LayerOrderSessionStatus}): `opening` (the Opening
 *   frame), `ready` (the open's result), `refused` (by code: what the panes
 *   and the notice say, `session_timed_out` offering Keep trying), `lost`
 *   (the engine went away or never loaded: Try again).
 * - **The count** is off while the session opens, and on once it is open only
 *   if few enough pairs are left open (`layerOrderCountStarts`, D7). After
 *   that the inspector follows its model's decision at every commit, through
 *   `runtime.setCounting` (U10). Never on by default.
 * - **Losses.** A browser that failed to load the worker or the Fold wasm
 *   (offline, a dropped connection) is shown as `lost` with Try again and
 *   reported to no one (`layerOrderLoadFailure.ts`). A crash is reported by
 *   the runtime, once, under `layer-order:engine`; any other failure of the
 *   open or Apply here, once per dialog, under `layer-order:dialog`. A stop
 *   the dialog asked for is neither.
 * - **Stop** ({@link LayerOrderSession.stop}) terminates the worker at once
 *   (the wasm has no cancel channel), for the Opening frame's Cancel and any
 *   close; the dialog closes after it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { reportError } from '../../monitoring';
import type { LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { keepTrying, type LayerOrderLimits, type LayerRefusal } from '../engine/layerOrderEngine';
import { isLayerOrderLoadFailure } from '../engine/layerOrderLoadFailure';
import { createLayerOrderRuntime, isLayerOrderEngineLost, type LayerOrderRuntime } from '../engine/layerOrderRuntime';
import { layerOrderCountStarts } from '../layerOrderBudgets';
import {
  applyLayerOrderSession,
  layerOrderOpenLimits,
  openLayerOrderSession,
  type LayerOrderApplyAnswer,
  type LayerOrderSessionOpen,
} from './layerOrderSession';

/** Why the session was lost: the browser didn't load the engine (`load`: say so, and Try again), or it failed. */
export type LayerOrderSessionLoss = 'load' | 'failed';

export type LayerOrderSessionStatus =
  /** Working out the layer orders; the Opening frame, with Cancel. `limits` is what the open runs with. */
  | { readonly kind: 'opening'; readonly limits: LayerOrderLimits }
  | { readonly kind: 'ready'; readonly open: LayerOrderSessionOpen }
  /** No session: the refusal says why, by code. `limits` is what the refused open ran with. */
  | { readonly kind: 'refused'; readonly refusal: LayerRefusal; readonly limits: LayerOrderLimits }
  /** The engine went away, failed or never loaded, and its session with it. `limits` is what the last open ran with. */
  | { readonly kind: 'lost'; readonly cause: LayerOrderSessionLoss; readonly limits: LayerOrderLimits };

export interface LayerOrderSessionOptions {
  /** Starts the engine's worker. The default spawns `workers/layerOrderWorker.ts`; tests pass a fake. */
  readonly spawn?: () => Worker;
  /** What one slice of the count may spend, while it runs: `LAYER_ORDER_COUNT_SLICE` when left out. */
  readonly count?: LayerOrderLimits;
}

export interface LayerOrderSession {
  readonly status: LayerOrderSessionStatus;
  /**
   * The dialog's engine, every call guarded (`layerOrderRuntime.ts`): what
   * the inspector asks once the session is `ready`, and where it turns the
   * count on and off (`setCounting`). Null only until the dialog's first
   * effect has run.
   */
  readonly runtime: LayerOrderRuntime | null;
  /**
   * Open again: Try again after a loss (the same limits), Keep trying after
   * an open that ran out (`keepTrying`'s), or `limits` when given. Ignored
   * while an open is running.
   */
  reopen(limits?: LayerOrderLimits): void;
  /** Stop: terminate the worker now, rejecting every call in flight. The dialog closes after it. */
  stop(): void;
  /**
   * Apply's plumbing (`applyLayerOrderSession`): the record and relations for
   * the host, or the reason it can't be saved. Null when there is no session
   * to apply, or the engine went away while it ran (the status then says so).
   */
  apply(): Promise<LayerOrderApplyAnswer | null>;
}

/** The limits a status's open ran with, for the next. */
function limitsOf(status: LayerOrderSessionStatus, request: LayerOrderRequest): LayerOrderLimits {
  return status.kind === 'ready' ? layerOrderOpenLimits(request) : status.limits;
}

/** The limits to open again with after `status`: later ones after an open that ran out, the same otherwise. */
function againLimits(status: LayerOrderSessionStatus, request: LayerOrderRequest): LayerOrderLimits {
  const limits = limitsOf(status, request);
  return status.kind === 'refused' && status.refusal.code === 'session_timed_out' ? keepTrying(limits) : limits;
}

export function useLayerOrderSession(request: LayerOrderRequest, options: LayerOrderSessionOptions = {}): LayerOrderSession {
  const [status, setStatus] = useState<LayerOrderSessionStatus>(() => ({
    kind: 'opening',
    limits: layerOrderOpenLimits(request),
  }));
  const [runtime, setRuntime] = useState<LayerOrderRuntime | null>(null);
  // The runtime the dialog holds now, and which open of it counts: an answer for another is dropped.
  const live = useRef<{ runtime: LayerOrderRuntime; attempt: number } | null>(null);
  const reported = useRef(false);
  // Read once, as the dialog mounts: a new spawner or slice would need a new worker.
  const { spawn, count } = options;
  const firstOptions = useRef({ spawn, count });

  const lose = useCallback(
    (cause: LayerOrderSessionLoss) => setStatus((now) => ({ kind: 'lost', cause, limits: limitsOf(now, request) })),
    [request]
  );

  /**
   * A failure that is not a stop the dialog asked for: the session is lost.
   * A load failure is shown and not reported; a crash the runtime reported;
   * anything else is reported here, once.
   */
  const fail = useCallback(
    (target: LayerOrderRuntime, error: unknown, call: 'open' | 'apply') => {
      if (live.current?.runtime !== target) return;
      if (isLayerOrderEngineLost(error) && (error.reason === 'cancelled' || error.reason === 'closed')) return;
      if (isLayerOrderLoadFailure(error)) {
        lose('load');
        return;
      }
      if (!isLayerOrderEngineLost(error) && !reported.current) {
        reported.current = true;
        reportError(error, { surface: 'layer-order:dialog', tags: { call } });
      }
      lose('failed');
    },
    [lose]
  );

  const open = useCallback(
    (target: LayerOrderRuntime, limits: LayerOrderLimits) => {
      const held = live.current;
      if (!held || held.runtime !== target) return;
      const attempt = held.attempt + 1;
      live.current = { runtime: target, attempt };
      const current = () => live.current?.runtime === target && live.current.attempt === attempt;
      // Nothing is counted until the open says how much there is to count.
      target.setCounting(false);
      setStatus({ kind: 'opening', limits });
      openLayerOrderSession(target.engine, request, limits).then(
        (answer) => {
          if (!current()) return;
          if (answer.kind === 'refused') {
            setStatus({ kind: 'refused', refusal: answer.refusal, limits });
            return;
          }
          target.setCounting(layerOrderCountStarts(answer.open.opened.open_pairs.length / 2));
          setStatus({ kind: 'ready', open: answer.open });
        },
        (error: unknown) => {
          if (current()) fail(target, error, 'open');
        }
      );
    },
    [fail, request]
  );

  useEffect(() => {
    const target = createLayerOrderRuntime({ role: 'dialog', ...firstOptions.current });
    live.current = { runtime: target, attempt: 0 };
    setRuntime(target);
    // A loss after the open (an inspector call's) loses the session too.
    const offLost = target.onLost((reason) => {
      if (live.current?.runtime !== target) return;
      if (reason === 'crashed') lose('failed');
      else if (reason === 'unloaded') lose('load');
    });
    open(target, layerOrderOpenLimits(request));
    return () => {
      offLost();
      if (live.current?.runtime === target) live.current = null;
      target.dispose();
    };
  }, [lose, open, request]);

  const reopen = useCallback(
    (limits?: LayerOrderLimits) => {
      const held = live.current;
      if (!held || status.kind === 'opening') return;
      open(held.runtime, limits ?? againLimits(status, request));
    },
    [open, request, status]
  );

  const stop = useCallback(() => {
    const held = live.current;
    if (!held) return;
    // Whatever the worker was answering no longer counts.
    live.current = { runtime: held.runtime, attempt: held.attempt + 1 };
    held.runtime.cancel();
  }, []);

  const apply = useCallback(async (): Promise<LayerOrderApplyAnswer | null> => {
    const held = live.current;
    if (!held || status.kind !== 'ready') return null;
    try {
      const answer = await applyLayerOrderSession(held.runtime.engine, request);
      return live.current?.runtime === held.runtime ? answer : null;
    } catch (error) {
      fail(held.runtime, error, 'apply');
      return null;
    }
  }, [fail, request, status]);

  return { status, runtime, reopen, stop, apply };
}
