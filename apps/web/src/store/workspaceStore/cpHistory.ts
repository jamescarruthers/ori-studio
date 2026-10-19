import { releaseFoldedFigureHandles } from '../../cp-workspace/folded/foldedFigureHandles';
import type { OristudioCpHistoryEntry } from './types';

/** Cap on the CP undo stack (matches historySlice's MAX_HISTORY). */
export const MAX_CP_HISTORY = 100;

/**
 * The CP undo stack with `entry` on top, at most {@link MAX_CP_HISTORY} deep.
 *
 * Every push goes through here. The cap used to be applied to overlay entries
 * alone, while crease edits and selections — the entries that each hold a whole
 * document snapshot, 131 MiB apiece on a canvas of 489k creases — grew the
 * stack without bound. An entry the cap drops lets go of the folded-figure
 * handles it was keeping alive.
 */
export function withCpHistoryEntry(
  past: readonly OristudioCpHistoryEntry[],
  entry: OristudioCpHistoryEntry
): OristudioCpHistoryEntry[] {
  const grown = [...past, entry];
  const evicted = grown.length - MAX_CP_HISTORY;
  for (let index = 0; index < evicted; index += 1) {
    releaseFoldedFigureHandles(grown[index]!.foldedFigures ?? []);
  }
  return evicted > 0 ? grown.slice(evicted) : grown;
}
