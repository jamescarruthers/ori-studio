import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEFT_SHEET,
  RIGHT_SHEET,
  twoSheetDocument,
  twoSheetFold,
  twoSheetIndex,
} from '../sheets/twoSheetsTestFixture';
import { resolveInlineSimulationRegion } from './resolveSimulationRegion';

// The resolver reads the sheet index and one sheet's faces from their module
// caches (populated via the kernel); stub those so these tests drive it with
// fixed answers rather than a live kernel.
vi.mock('../sheets/cpSheetIndex', () => ({
  ensureCpSheetIndex: vi.fn(async () => twoSheetIndex()),
  peekCpSheetIndex: vi.fn(() => twoSheetIndex()),
}));
vi.mock('../sheets/cpSheetArtifacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sheets/cpSheetArtifacts')>();
  return {
    ...actual,
    ensureCpSheetArtifacts: vi.fn(async (_document: unknown, sheet: number) =>
      actual.sheetArtifactsFromFold(twoSheetFold(sheet), sheet)
    ),
  };
});

const { ensureCpSheetIndex, peekCpSheetIndex } = await import('../sheets/cpSheetIndex');
const { ensureCpSheetArtifacts } = await import('../sheets/cpSheetArtifacts');

describe('resolveInlineSimulationRegion', () => {
  beforeEach(() => {
    vi.mocked(ensureCpSheetIndex).mockClear();
    vi.mocked(ensureCpSheetArtifacts).mockClear();
    vi.mocked(peekCpSheetIndex).mockClear();
    vi.mocked(peekCpSheetIndex).mockReturnValue(twoSheetIndex());
  });

  it('resolves the sheet a complete set of crease ids makes up, as the whole sheet', async () => {
    const match = await resolveInlineSimulationRegion(twoSheetDocument(), RIGHT_SHEET);
    expect(match?.segmentId).toBe(1);
    expect(match?.cpLineIds).toEqual(RIGHT_SHEET);
    expect(match?.segment.faceIndices).toEqual([0, 1]);
    expect(vi.mocked(ensureCpSheetArtifacts)).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('accepts the ids in any order, so a caller need not sort a captured list', async () => {
    const match = await resolveInlineSimulationRegion(twoSheetDocument(), [5, 1, 4, 2, 3]);
    expect(match?.cpLineIds).toEqual(LEFT_SHEET);
  });

  it('rejects part of a sheet, and a selection spanning two', async () => {
    // The diagonal alone — no closed piece of paper to simulate.
    await expect(resolveInlineSimulationRegion(twoSheetDocument(), [5])).resolves.toBeNull();
    await expect(
      resolveInlineSimulationRegion(twoSheetDocument(), [...LEFT_SHEET, ...RIGHT_SHEET])
    ).resolves.toBeNull();
    expect(vi.mocked(ensureCpSheetArtifacts)).not.toHaveBeenCalled();
  });

  it('answers without the index when there is nothing to resolve', async () => {
    await expect(resolveInlineSimulationRegion(twoSheetDocument(), [])).resolves.toBeNull();
    await expect(resolveInlineSimulationRegion(null, LEFT_SHEET)).resolves.toBeNull();
    expect(vi.mocked(peekCpSheetIndex)).not.toHaveBeenCalled();
    expect(vi.mocked(ensureCpSheetIndex)).not.toHaveBeenCalled();
  });

  it('waits for the index when nothing is cached yet', async () => {
    // The dialog can be answered with no toolbar ever mounted to warm the cache,
    // so a peek miss has to await the real thing rather than report "no region".
    vi.mocked(peekCpSheetIndex).mockReturnValue(null);
    const match = await resolveInlineSimulationRegion(twoSheetDocument(), LEFT_SHEET);
    expect(vi.mocked(ensureCpSheetIndex)).toHaveBeenCalledOnce();
    expect(match?.cpLineIds).toEqual(LEFT_SHEET);
  });
});
