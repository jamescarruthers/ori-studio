import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FoldArtifacts } from './types';
import { analyzeCpFold } from './cpAnalysisClient';

const mocks = vi.hoisted(() => ({ analyzeFold: vi.fn(), terminate: vi.fn(), detach: vi.fn() }));
vi.mock('comlink', () => ({ wrap: () => ({ analyzeFold: mocks.analyzeFold }) }));
vi.mock('../lib/workerDiagnostics', () => ({ attachWorkerDiagnostics: () => mocks.detach }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('Worker', class { terminate = mocks.terminate; });
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('settles every queued caller when an analysis fails, then allows a fresh worker to recover', async () => {
  let fail!: (error: Error) => void;
  mocks.analyzeFold
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
    .mockImplementationOnce(() => new Promise(() => {}));
  const first = analyzeCpFold('bad');
  const queued = analyzeCpFold('queued');
  const settled = Promise.allSettled([first, queued]);
  const error = new Error('Invalid FOLD');
  fail(error);
  // No two-minute timeout needed to discover that the shared worker is gone.
  expect(await settled).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  expect(mocks.terminate).toHaveBeenCalledOnce();
  const artifacts = {} as FoldArtifacts;
  mocks.analyzeFold.mockResolvedValueOnce(artifacts);
  expect(await analyzeCpFold('valid')).toBe(artifacts);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.terminate).toHaveBeenCalledTimes(2);
});

it('settles queued calls together when one exceeds the analysis deadline', async () => {
  mocks.analyzeFold.mockImplementation(() => new Promise(() => {}));
  const first = analyzeCpFold('slow');
  await vi.advanceTimersByTimeAsync(60_000);
  const queued = analyzeCpFold('queued');
  const settled = Promise.allSettled([first, queued]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await settled).toEqual([
    { status: 'rejected', reason: expect.objectContaining({ message: 'Crease-pattern analysis timed out' }) },
    { status: 'rejected', reason: expect.objectContaining({ message: 'Crease-pattern analysis timed out' }) },
  ]);
  expect(mocks.terminate).toHaveBeenCalledOnce();
});
