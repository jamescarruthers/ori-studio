import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_LAYER_ORDER_SOURCE } from '../engine/layerOrderEngine.fixtures';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import {
  createSolutionCursorTable,
  solutionEndFinal,
  solutionPlaceEnds,
  solutionPressOf,
  type SolutionCursorOpening,
} from './solutionCursorTable';
import { scriptedSolutionCursor, solutionPosition } from './solutionCursorTable.fixtures';

/**
 * The hosts' one solutions-cursor table on its own (rows H6, H9): what every
 * host's binding shares. Edit's rules through it are
 * `foldedSolutionCursor.test.ts`; the Diagram's, `stepSolutionSteps.test.ts`.
 */
const gateway = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('./hostEngineGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hostEngineGateway')>()),
  openLayerOrderSolutionCursor: (...args: unknown[]) => gateway.open(...args),
}));

const RECORD: LayerOrderRecord = { faces: [], constraints: [], order: [] };

/** A toy host: a thing is its id and the order it holds; the world, a number that must not change. */
interface Thing {
  id: string;
  holds: string;
}
function toyTable() {
  return createSolutionCursorTable<Thing, number, { holds: string; world: number }, SolutionCursorOpening>({
    idOf: (thing) => thing.id,
    markOf: (thing, world) => ({ holds: thing.holds, world }),
    inStep: (mark, thing) => mark.holds === thing.holds,
    heldIn: (mark, _thing, world) => mark.world === world,
    stepBy: () => ({ picture: 'front' }),
  });
}

const tables = [toyTable(), toyTable()] as const;
afterEach(() => {
  for (const table of tables) table.drop();
  gateway.open.mockReset();
});

const END = { outcome: 'end', position: solutionPosition(1, 3, false), counted: true } as const;
const ask = { direction: 'next', open: async () => ({ source: FAKE_LAYER_ORDER_SOURCE, record: RECORD }) } as const;

async function seat(table: (typeof tables)[number], thing: Thing) {
  const cursor = scriptedSolutionCursor([END]);
  gateway.open.mockReturnValueOnce(cursor);
  const turn = table.begin(thing, 0);
  await turn.step(ask);
  turn.end((id) => (id === thing.id ? thing : undefined), 0);
  return cursor;
}

describe('the hosts’ solutions-cursor table', () => {
  it('keeps one cursor in the whole app: making one in a host lets every other host’s go', async () => {
    const [edit, diagram] = tables;
    const first = await seat(edit, { id: 'figure', holds: 'a' });
    expect(edit.heldId()).toBe('figure');
    const second = await seat(diagram, { id: 'step', holds: 'b' });
    expect(first.closed).toBe(true);
    expect(edit.heldId()).toBeNull();
    expect(diagram.heldId()).toBe('step');
    expect(second.closed).toBe(false);
  });

  it('drops only the thing named, when one is', async () => {
    const [table] = tables;
    const cursor = await seat(table, { id: 'step', holds: 'a' });
    table.drop('another');
    expect(cursor.closed).toBe(false);
    table.drop('step');
    expect(cursor.closed).toBe(true);
  });

  it('lets the cursor go once its thing holds something else, is gone, or its world changed', async () => {
    const [table] = tables;
    for (const [thing, world] of [
      [{ id: 'step', holds: 'b' }, 0],
      [undefined, 0],
      [{ id: 'step', holds: 'a' }, 1],
    ] as const) {
      const cursor = await seat(table, { id: 'step', holds: 'a' });
      table.settle(() => thing, world);
      expect(cursor.closed).toBe(true);
    }
    // And keeps it while it holds what the cursor shows.
    const kept = await seat(table, { id: 'step', holds: 'a' });
    table.settle(() => ({ id: 'step', holds: 'a' }), 0);
    expect(kept.closed).toBe(false);
  });

  it('lets the cursor go when the press was given up on before its step moved (the host’s engine lost under it)', async () => {
    const [table] = tables;
    let answer: (step: { outcome: 'moved' } & Record<string, unknown>) => void = () => {};
    const cursor = scriptedSolutionCursor([() => new Promise((resolve) => (answer = resolve as never))]);
    gateway.open.mockReturnValueOnce(cursor);
    const thing = { id: 'step', holds: 'a' };
    const turn = table.begin(thing, 0);
    const stepped = turn.step(ask);
    await vi.waitFor(() => expect(cursor.asked).toHaveLength(1));
    // The host's capture ended first: nothing will land.
    turn.end(() => thing, 0);
    expect(cursor.closed).toBe(false);
    answer({
      outcome: 'moved',
      applied: { record: RECORD, relations: new Uint32Array(), source: FAKE_LAYER_ORDER_SOURCE },
      position: solutionPosition(2, 3),
      counted: true,
    });
    await stepped;
    expect(cursor.closed).toBe(true);
    expect(table.heldId()).toBeNull();
  });

  it('keeps what the host marked of the thing, and what each landing changed', async () => {
    const [table] = tables;
    gateway.open.mockReturnValueOnce(
      scriptedSolutionCursor([
        { outcome: 'moved', applied: { record: RECORD, relations: new Uint32Array(), source: FAKE_LAYER_ORDER_SOURCE }, position: solutionPosition(2, 3), counted: true },
      ])
    );
    const turn = table.begin({ id: 'step', holds: 'a' }, 0);
    expect(turn.mark()).toBeNull();
    await turn.step(ask);
    expect(turn.mark()).toEqual({ holds: 'a', world: 0 });
    turn.landed((mark) => ({ ...mark, holds: 'b' }));
    turn.end(() => ({ id: 'step', holds: 'b' }), 0);
    expect(table.place({ id: 'step', holds: 'b' })).toEqual({ position: solutionPosition(2, 3), counted: true });
    expect(table.place({ id: 'step', holds: 'a' })).toBeNull();
  });
});

describe('what every host’s pager and press read', () => {
  it('waits at the ends of a fixed order: ‹ on the first, › on the last once the count is final', () => {
    const at = (index: number, n: number, exact: boolean) => solutionPlaceEnds({ position: solutionPosition(index, n, exact), counted: true });
    expect(at(1, 3, false)).toEqual({ first: true, last: false, only: false });
    expect(at(3, 3, false)).toEqual({ first: false, last: false, only: false });
    expect(at(3, 3, true)).toEqual({ first: false, last: true, only: false });
    expect(at(1, 1, true)).toEqual({ first: true, last: true, only: true });
  });

  it('calls an end final before the first, or once the count is', () => {
    expect(solutionEndFinal('previous', solutionPosition(1, 3, false))).toBe(true);
    expect(solutionEndFinal('next', solutionPosition(3, 3, false))).toBe(false);
    expect(solutionEndFinal('next', solutionPosition(3, 3, true))).toBe(true);
  });

  it('says what a press that moved nothing came to', () => {
    expect(solutionPressOf({ outcome: 'end', position: solutionPosition(3, 3, false), counted: true }, 'next')).toEqual({
      status: 'end',
      final: false,
    });
    expect(solutionPressOf({ outcome: 'timed_out' }, 'next')).toEqual({ status: 'timed_out' });
    expect(solutionPressOf({ outcome: 'unrestored', why: 'clash' }, 'next')).toEqual({ status: 'unrestored', why: 'clash' });
    expect(solutionPressOf({ outcome: 'lost', cause: 'load' }, 'previous')).toEqual({ status: 'lost', cause: 'load' });
    expect(solutionPressOf({ outcome: 'cancelled' }, 'next')).toEqual({ status: 'stopped' });
  });
});
