/**
 * The Layer order engine's worker lifetime, against a fake worker that runs
 * the real worker shell over a fake backend through comlink
 * (`layerOrderEngine.fixtures.ts`): everything but the bridge.
 *
 * `terminate()` settles nothing comlink has in flight, so every way a worker
 * goes away (the dialog's Cancel, its close, a crash) must reject what is
 * waiting on it, as a typed loss, before the worker goes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_LAYER_ORDER_SOURCE,
  FAKE_LIMITS,
  createFakeLayerOrderBackend,
  fakeLayerOrderWorkers,
  type FakeLayerOrderWorker,
} from './layerOrderEngine.fixtures';
import { createLayerOrderRuntime, isLayerOrderEngineLost } from './layerOrderRuntime';

const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock('../../monitoring', () => ({ reportError: monitoring.reportError }));

beforeEach(() => {
  monitoring.reportError.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Let the fake worker's messages, a task each way, arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function opened() {
  const fake = fakeLayerOrderWorkers();
  const runtime = createLayerOrderRuntime({ role: 'dialog', spawn: fake.spawn });
  const worker = (index = 0): FakeLayerOrderWorker => fake.workers[index]!;
  return { fake, runtime, worker };
}

describe('spawning', () => {
  it('spawns nothing until the first call, then answers every call from one worker', async () => {
    const { fake, runtime, worker } = opened();
    expect(fake.workers).toHaveLength(0);
    expect(runtime.running()).toBe(false);

    const open = await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    const preview = await runtime.engine.preview([2, 3, 1], FAKE_LIMITS);

    expect(open).toMatchObject({ status: 'ok', faces: 4, spots: 1 });
    expect(preview).toMatchObject({ verdict: 'fits' });
    expect(fake.workers).toHaveLength(1);
    expect(runtime.running()).toBe(true);
    expect(worker().backend.calls).toEqual(['open', 'preview']);
  });

  it('typed arrays cross the worker as typed arrays', async () => {
    const { runtime } = opened();
    const open = await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    if (open.status !== 'ok') throw new Error('expected an open session');
    // By tag: under jsdom the clone's typed arrays are of another realm than the test's.
    const tag = (value: unknown) => Object.prototype.toString.call(value);
    expect(tag(open.open_pairs)).toBe('[object Uint32Array]');
    expect([...open.open_pairs]).toEqual([0, 2, 0, 3, 1, 2, 1, 3, 2, 3]);
    expect(tag(open.front_up)).toBe('[object Uint8Array]');
    const back = await runtime.engine.stacks('back');
    expect(tag(back.faces)).toBe('[object Uint32Array]');
    expect([...back.faces]).toEqual([3, 2, 1, 0]);
  });
});

describe('dispose', () => {
  it('rejects every call in flight as closed, then terminates the worker; later calls reject without spawning', async () => {
    const { fake, runtime, worker } = opened();
    const heard: string[] = [];
    runtime.onLost((reason) => heard.push(reason));
    const pending = runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    worker().backend.hold('open');

    runtime.dispose();

    await expect(pending).rejects.toEqual({
      code: 'layer_order_engine_lost',
      reason: 'closed',
      message: 'The layer order engine was closed while it was running.',
    });
    expect(worker().terminated).toBe(true);
    expect(runtime.running()).toBe(false);
    expect(runtime.generation()).toBe(1);
    expect(heard).toEqual(['closed']);

    await expect(runtime.engine.openPairs()).rejects.toMatchObject({ reason: 'closed' });
    await expect(runtime.ask(async () => 1)).rejects.toMatchObject({ reason: 'closed' });
    expect(fake.workers).toHaveLength(1);

    // Again: nothing more happens.
    runtime.dispose();
    expect(heard).toEqual(['closed']);
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('disposing a runtime that never spawned spawns nothing', async () => {
    const { fake, runtime } = opened();
    runtime.dispose();
    await expect(runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS)).rejects.toMatchObject({ reason: 'closed' });
    expect(fake.workers).toHaveLength(0);
    expect(runtime.generation()).toBe(0);
  });
});

describe('cancel', () => {
  it('terminates the worker, rejects what is in flight as cancelled, and the next call reaches a fresh worker with no session', async () => {
    const { fake, runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    const held = worker().backend.hold('commit');
    const pending = runtime.engine.commit([[2, 3, 1]], FAKE_LIMITS).catch((error: unknown) => error);
    await settle();

    expect(runtime.cancel()).toBe(true);

    const failure = await pending;
    expect(isLayerOrderEngineLost(failure)).toBe(true);
    expect(failure).toMatchObject({ reason: 'cancelled' });
    expect(worker().terminated).toBe(true);
    expect(runtime.generation()).toBe(1);
    // The commit the worker was holding never answers: the worker is gone.
    held.release();
    await settle();

    // The runtime is still usable; the session went with the worker.
    await expect(runtime.engine.openPairs()).rejects.toMatchObject({ code: 'layer_order_session_not_open' });
    expect(fake.workers).toHaveLength(2);
    expect(worker(1).terminated).toBe(false);
    expect(worker(1).backend.calls).toEqual(['openPairs']);
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('with nothing running, cancels nothing and keeps the generation', () => {
    const { runtime } = opened();
    expect(runtime.cancel()).toBe(false);
    expect(runtime.generation()).toBe(0);
  });
});

describe('stale results', () => {
  it('drops an answer asked before the generation moved, and answers one asked after', async () => {
    const { runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    const held = worker().backend.hold('countSolutions');
    const slice = runtime.askCurrent((client) => client.countSolutions(FAKE_LIMITS));
    await settle();

    // A commit changed the list the count was counting.
    await runtime.engine.commit([[2, 3, 1]], FAKE_LIMITS);
    runtime.invalidate();
    held.release();

    await expect(slice).resolves.toEqual({ status: 'stale' });
    await expect(runtime.askCurrent((client) => client.countSolutions(FAKE_LIMITS))).resolves.toMatchObject({
      status: 'answered',
      // 0 above 1 (the creases) and 3 above 2 (the constraint): 6 of the 24 orders.
      value: { status: 'counted', count: { orders: { n: 6, exact: true } } },
    });
    // The worker never went away for it.
    expect(worker().terminated).toBe(false);
  });

  it('a call asked under a worker that went away rejects as its loss rather than coming back stale', async () => {
    const { runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    worker().backend.hold('countSolutions');
    const slice = runtime.askCurrent((client) => client.countSolutions(FAKE_LIMITS));
    runtime.cancel();
    await expect(slice).rejects.toMatchObject({ code: 'layer_order_engine_lost', reason: 'cancelled' });
  });
});

describe('previews: latest wins', () => {
  it('keeps one preview in flight and the newest waiting; those between never reach the worker', async () => {
    const { runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    const channel = runtime.channel();
    const held = worker().backend.hold('preview');

    const a = channel.request((client) => client.preview([2, 3, 1], FAKE_LIMITS));
    const b = channel.request((client) => client.preview([3, 2, 1], FAKE_LIMITS));
    const c = channel.request((client) => client.preview([1, 3, -1], FAKE_LIMITS));

    await expect(b).resolves.toEqual({ status: 'superseded' });
    held.release();
    await expect(a).resolves.toEqual({ status: 'superseded' });
    await expect(c).resolves.toMatchObject({ status: 'answered', value: { verdict: 'fits' } });
    expect(worker().backend.calls).toEqual(['open', 'preview', 'preview']);
  });

  it('the newest preview rejects as cancelled when the worker is stopped under it', async () => {
    const { runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    const channel = runtime.channel();
    worker().backend.hold('preview');
    const pending = channel.request((client) => client.preview([2, 3, 1], FAKE_LIMITS)).catch((e: unknown) => e);
    await settle();

    runtime.cancel();

    await expect(pending).resolves.toMatchObject({ code: 'layer_order_engine_lost', reason: 'cancelled' });
  });
});

describe('engine loss', () => {
  it('a worker that dies rejects every call on it as crashed, and is reported once', async () => {
    const { fake, runtime, worker } = opened();
    const heard: unknown[][] = [];
    runtime.onLost((...args) => heard.push(args));
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    worker().backend.hold('commit');
    worker().backend.hold('openPairs');
    const commit = runtime.engine.commit([[2, 3, 1]], FAKE_LIMITS).catch((e: unknown) => e);
    const pairs = runtime.engine.openPairs().catch((e: unknown) => e);
    await settle();

    worker().crash();

    await expect(commit).resolves.toEqual({
      code: 'layer_order_engine_lost',
      reason: 'crashed',
      message: 'The layer order engine stopped while it was running.',
    });
    await expect(pairs).resolves.toMatchObject({ reason: 'crashed' });
    expect(worker().terminated).toBe(true);
    expect(runtime.generation()).toBe(1);
    expect(heard).toEqual([['crashed', 'worker_error']]);
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
    const [error, context] = monitoring.reportError.mock.calls[0]!;
    expect(error).toMatchObject({
      name: 'LayerOrderEngineCrash',
      reason: 'worker_error',
      message: 'worker_error: The worker stopped unexpectedly.',
    });
    expect(context).toEqual({ surface: 'layer-order:engine', tags: { reason: 'worker_error', role: 'dialog' } });

    // The next call spawns a fresh worker; the dead one's late events change nothing.
    await expect(runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS)).resolves.toMatchObject({ status: 'ok' });
    worker(0).crash();
    expect(fake.workers).toHaveLength(2);
    expect(worker(1).terminated).toBe(false);
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
  });

  it('an engine that trapped drops its worker: the call rejects as crashed and the trap’s stack reaches Sentry', async () => {
    const { fake, runtime, worker } = opened();
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    worker().backend.trapNext('preview');

    await expect(runtime.engine.preview([2, 3, 1], FAKE_LIMITS)).rejects.toMatchObject({
      code: 'layer_order_engine_lost',
      reason: 'crashed',
    });

    expect(worker().terminated).toBe(true);
    expect(runtime.generation()).toBe(1);
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
    const [error, context] = monitoring.reportError.mock.calls[0]!;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'LayerOrderEngineCrash', message: 'wasm_trap: unreachable' });
    expect((error as Error).stack).toMatch(/RuntimeError/);
    expect(context).toEqual({ surface: 'layer-order:engine', tags: { reason: 'wasm_trap', role: 'dialog' } });
    expect(fake.workers).toHaveLength(1);
  });

  it('a refusal is an answer, and an engine’s own envelope a rejection; neither is a loss', async () => {
    const { runtime, worker } = opened();
    await expect(runtime.engine.openPairs()).rejects.toMatchObject({ code: 'layer_order_session_not_open' });
    await expect(runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, { ...FAKE_LIMITS, maxNodes: 0 })).resolves.toEqual({
      status: 'refused',
      refusal: { code: 'session_timed_out', limit: 'nodes', nodes: 0 },
    });
    await runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS);
    await expect(runtime.engine.preview([0, 9, 1], FAKE_LIMITS)).rejects.toMatchObject({
      code: 'session_bad_constraint',
    });
    await expect(runtime.engine.explain(null, FAKE_LIMITS)).rejects.toMatchObject({
      code: 'layer_order_unsupported_operation',
      operation: 'explain',
    });
    expect(worker().terminated).toBe(false);
    expect(runtime.generation()).toBe(0);
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('tags a crash with the role of the worker that crashed', async () => {
    const fake = fakeLayerOrderWorkers(() => createFakeLayerOrderBackend());
    const runtime = createLayerOrderRuntime({ role: 'count', spawn: fake.spawn });
    const pending = runtime.engine.open(FAKE_LAYER_ORDER_SOURCE, FAKE_LIMITS).catch((e: unknown) => e);
    fake.workers[0]!.crash('out of memory');
    await pending;
    expect(monitoring.reportError.mock.calls[0]![1]).toEqual({
      surface: 'layer-order:engine',
      tags: { reason: 'worker_error', role: 'count' },
    });
  });
});
