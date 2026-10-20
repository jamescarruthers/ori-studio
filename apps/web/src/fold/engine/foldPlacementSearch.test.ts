import { describe, expect, it, vi } from 'vitest';
import { createFoldSearchRunner, FOLD_SEARCH_CANCELLED, runFoldSearch, type FoldSearchClock } from './foldSearch';
import { foldPlacementSearch, foldPlacementSearchBudget } from './foldPlacementSearch';
import type { FoldWasmCompoundEngine } from './foldEngineCompoundCalls';
import type { FoldEngineOp } from './foldEngineWire';

const op: FoldEngineOp = { kind: 'valley', line: { via: 'free', through: [[0, 0.8], [1, 0.8]] }, moving: [0.5, 0.9], seed: { scope: 'all' } };
const answer = (orders: number, searching: boolean) => ({ status: 'ok', count: { orders, exact: !searching }, index: 0, completion: null, ...(searching ? { searching } : {}) });

/** The bridge, answering a press slice by slice: `searching` until its last answer. */
function engine(...answers: ReturnType<typeof answer>[]): FoldWasmCompoundEngine & { order_selection: ReturnType<typeof vi.fn> } {
  const order_selection = vi.fn();
  answers.forEach((a) => order_selection.mockReturnValueOnce(a));
  return { order_selection, compound_analysis: vi.fn() };
}

describe('foldPlacementSearch', () => {
  it('asks again, with the same query, while the bridge says the press is still searching', () => {
    const bridge = engine(answer(1, true), answer(1, true), answer(2, false));
    const query = { index: 0, batch: 3, searchMs: 600 };
    expect(runFoldSearch(foldPlacementSearch(bridge, 7, op, undefined, query), foldPlacementSearchBudget(query))).toMatchObject({ count: { orders: 2, exact: true } });
    expect(bridge.order_selection).toHaveBeenCalledTimes(3);
    for (const call of bridge.order_selection.mock.calls) expect(call).toEqual([7, op, undefined, query]);
  });

  it('answers with what it found when its driver’s time runs out, and rejects once cancelled', async () => {
    let now = 0;
    const clock: FoldSearchClock = { now: () => (now += 10) };
    const bridge = engine(...Array.from({ length: 50 }, () => answer(1, true)));
    expect(runFoldSearch(foldPlacementSearch(bridge, 7, op, undefined, { index: 0 }), 40, clock)).toMatchObject({ count: { orders: 1 } });
    const runner = createFoldSearchRunner({ yieldTask: async () => {} });
    const ticket = { id: 1 };
    runner.cancel(ticket.id);
    await expect(runner.run(foldPlacementSearch(engine(answer(1, true)), 7, op, undefined, { index: 0 }), 1_000, ticket)).rejects.toMatchObject({ code: FOLD_SEARCH_CANCELLED });
  });

  it('gives the driver the press’s own time and a bound beyond it', () => {
    expect(foldPlacementSearchBudget({ index: 0, searchMs: 9_600 })).toBeGreaterThan(9_600);
    expect(foldPlacementSearchBudget({ index: 0 })).toBeGreaterThan(150);
  });
});
