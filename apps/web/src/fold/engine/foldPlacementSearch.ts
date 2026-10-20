/**
 * A plain fold's placement search (`oristudio-fold-wasm/src/order_selection.rs`)
 * as a search the worker runs in slices (`foldSearch.ts`).
 *
 * The bridge keeps one search per fold and spends a query's `searchMs` on
 * it in calls of at most 150 ms, answering `searching` while that time is
 * not spent and the search is not over. This asks again until it is, giving
 * the thread back between calls, so a search can be stopped there. A new
 * `batch` is a new press of Find more orders, with its own time; a press
 * searches on from wherever the last one stopped, so each press finds more
 * than the one before it could have. A forced fold is decided before any of
 * this runs (`FoldPlacementSearch`), so a slow machine never asks one.
 *
 * Pure: no React, no store, no wasm import (the engine is handed in).
 */
import { FoldSearchStopped, type FoldSearch } from './foldSearch';
import type { FoldOrderQuery, FoldOrderSelection, FoldWasmCompoundEngine } from './foldEngineCompoundCalls';
import type { FoldEngineOp, FoldEngineOutcome } from './foldEngineWire';
import type { FoldChoices } from '../document/foldSequenceDocument';

/** A press's search time at the first budget: one of the bridge's slices. Each press after multiplies it with the budget. */
export const FOLD_PLACEMENT_SEARCH_MS = 150;

/** The time a placement search runs within, beyond its own `searchMs`: a bound for the driver, never reached by a bridge that counts its own time. */
const DRIVER_SLACK_MS = 1_000;

export function isFoldPlacementOp(op: FoldEngineOp): boolean {
  return op.kind === 'valley' || op.kind === 'mountain';
}

export function foldPlacementSearchBudget(query: FoldOrderQuery): number {
  return (query.searchMs ?? FOLD_PLACEMENT_SEARCH_MS) + DRIVER_SLACK_MS;
}

/** Ask until the press's time is spent or the search is over; stopped for time, the latest answer. */
export function* foldPlacementSearch(
  engine: FoldWasmCompoundEngine,
  state: number,
  op: FoldEngineOp,
  choices: FoldChoices | undefined,
  query: FoldOrderQuery
): FoldSearch<FoldEngineOutcome<FoldOrderSelection>> {
  const ask = () => engine.order_selection(state, op, choices, query) as FoldEngineOutcome<FoldOrderSelection>;
  let answer = ask();
  try {
    while (answer.status === 'ok' && answer.searching) {
      yield;
      answer = ask();
    }
  } catch (error) {
    if (!(error instanceof FoldSearchStopped) || error.reason !== 'budget') throw error;
  }
  return answer;
}
