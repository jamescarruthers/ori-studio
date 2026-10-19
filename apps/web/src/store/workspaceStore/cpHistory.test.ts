import { afterEach, describe, expect, it } from 'vitest';
import {
  foldedFigureHandleRefCount,
  resetFoldedFigureHandles,
  retainFoldedFigureHandles,
} from '../../cp-workspace/folded/foldedFigureHandles';
import { MAX_CP_HISTORY, withCpHistoryEntry } from './cpHistory';
import type { OristudioCpHistoryEntry } from './types';

/** An entry holding the figures it names, retained the way `cpHistoryEntry` retains them. */
function entry(label: string, handle: number | null = null): OristudioCpHistoryEntry {
  const foldedFigures = (handle === null ? [] : [{ handle }]) as OristudioCpHistoryEntry['foldedFigures'];
  retainFoldedFigureHandles(foldedFigures);
  return { label, foldedFigures } as unknown as OristudioCpHistoryEntry;
}

afterEach(async () => {
  await resetFoldedFigureHandles();
});

describe('withCpHistoryEntry', () => {
  it('keeps the newest MAX_CP_HISTORY entries', () => {
    let past: OristudioCpHistoryEntry[] = [];
    for (let index = 0; index < MAX_CP_HISTORY + 5; index += 1) {
      past = withCpHistoryEntry(past, entry(`edit ${index}`));
    }
    expect(past).toHaveLength(MAX_CP_HISTORY);
    expect(past[0]!.label).toBe('edit 5');
    expect(past.at(-1)!.label).toBe(`edit ${MAX_CP_HISTORY + 4}`);
  });

  it('lets go of the folded-figure handles of the entry it drops', () => {
    let past = [entry('oldest', 7)];
    for (let index = 1; index < MAX_CP_HISTORY; index += 1) {
      past = withCpHistoryEntry(past, entry(`edit ${index}`));
    }
    expect(foldedFigureHandleRefCount(7)).toBe(1);

    past = withCpHistoryEntry(past, entry('one more'));
    expect(past).toHaveLength(MAX_CP_HISTORY);
    expect(foldedFigureHandleRefCount(7)).toBe(0);
  });
});
