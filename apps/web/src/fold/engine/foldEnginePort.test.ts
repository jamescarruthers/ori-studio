/**
 * The replay port over a fake engine source: outcomes map to landed or not,
 * handles carry their engine's generation, and releases batch per turn and
 * never reach an engine that did not make them.
 */
import { describe, expect, it, vi } from 'vitest';
import { createFoldEnginePort, type FoldEngineSource } from './foldEnginePort';
import type { FoldEngineOp, FoldStateSummary } from './foldEngineWire';

const SUMMARY: FoldStateSummary = {
  step: 0,
  faces: 1,
  pairs: 0,
  creases: { border: 4, mountain: 0, valley: 0, flat: 0 },
  view: { flipped: false, rotation: 0 },
  residual: 0,
  sheet: [],
};

const BOOK: FoldEngineOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0.5, 0], [0.5, 1]] },
  moving: [0.75, 0.5],
  seed: { scope: 'all' },
};

function fakeSource() {
  let generation = 0;
  let next = 0;
  const released: number[][] = [];
  const source: FoldEngineSource = {
    generation: () => generation,
    sheet: vi.fn(async () => ({
      status: 'ok' as const,
      state: ++next,
      summary: SUMMARY,
      fingerprint: 'fs1:0000000000000000' as const,
    })),
    step: vi.fn(async (_state: number, op: FoldEngineOp) =>
      op.kind === 'cp-jump'
        ? {
            status: 'refused' as const,
            refusal: { code: 'unsupported_op' as const, feature: 'cp_jump' },
            fixes: [],
            faces: [],
            vertices: [],
          }
        : {
            status: 'ok' as const,
            state: ++next,
            report: null,
            summary: SUMMARY,
            fingerprint: 'fs1:1111111111111111' as const,
          }
    ),
    release: vi.fn(async (states: readonly number[]) => {
      released.push([...states]);
      return states.length;
    }),
  };
  return {
    source,
    released,
    lose: () => {
      generation += 1;
      next = 0;
    },
  };
}

describe('the Fold engine port', () => {
  it('lands states as handles of the generation that made them', async () => {
    const { source } = fakeSource();
    const port = createFoldEnginePort(source, 3);
    expect(port.engineVersion).toBe(3);
    const sheet = await port.sheet({ shape: { kind: 'square' }, startSide: 'front' });
    expect(sheet).toEqual({
      landed: true,
      state: { generation: 0, id: 1 },
      fingerprint: 'fs1:0000000000000000',
    });
    if (!sheet.landed) throw new Error('sheet');
    const step = await port.step(sheet.state, { op: BOOK });
    expect(step).toEqual({
      landed: true,
      state: { generation: 0, id: 2 },
      fingerprint: 'fs1:1111111111111111',
    });
    expect(source.step).toHaveBeenCalledWith(1, BOOK, undefined);
  });

  it('a refusal is the step not landing, with its code', async () => {
    const { source } = fakeSource();
    const port = createFoldEnginePort(source, 1);
    const jump: FoldEngineOp = { kind: 'cp-jump', cpJson: '{}', orderJson: '{}', origin: 'cp' };
    await expect(port.step({ generation: 0, id: 1 }, { op: jump })).resolves.toEqual({
      landed: false,
      code: 'unsupported_op',
    });
  });

  it('refuses a handle whose engine has gone, rather than fold another state of its number', async () => {
    const { source, lose } = fakeSource();
    const port = createFoldEnginePort(source, 1);
    const sheet = await port.sheet({ shape: { kind: 'square' } });
    if (!sheet.landed) throw new Error('sheet');
    lose();
    await expect(port.step(sheet.state, { op: BOOK })).rejects.toMatchObject({ code: 'fold_state_lost' });
    expect(source.step).not.toHaveBeenCalled();
  });

  it('batches the releases of one turn and drops those of a lost engine', async () => {
    const { source, released, lose } = fakeSource();
    const port = createFoldEnginePort(source, 1);
    port.release?.({ generation: 0, id: 4 });
    port.release?.({ generation: 0, id: 5 });
    port.release?.({ generation: 0, id: 6 });
    expect(released).toEqual([]);
    await Promise.resolve();
    expect(released).toEqual([[4, 5, 6]]);

    // Released, then the engine went before the batch left: nothing is sent.
    port.release?.({ generation: 0, id: 7 });
    lose();
    await Promise.resolve();
    // A handle of an older generation is never sent at all.
    port.release?.({ generation: 0, id: 8 });
    port.release?.({ generation: 1, id: 1 });
    await Promise.resolve();
    expect(released).toEqual([[4, 5, 6], [1]]);
  });
});
