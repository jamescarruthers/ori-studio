/**
 * Folded figures shown as `loading` while a press works on them outside any
 * undo bracket, and the entry each was before the press.
 *
 * A press that folds a figure again to read it — Layer order… on a figure
 * reopened from a file (`prepareOristudioCpFigureLayerOrder`), or a 3D
 * figure's rehydrate on a press — marks it `loading` so its verbs wait, and
 * records nothing: nothing about the document changes. But a gesture begun
 * meanwhile (a Delete, a drag) snapshots the live list for its undo entry, and
 * an entry holding `loading` puts back, on undo, a figure that waits forever.
 * So the folded layer's bracket reads each figure here as it was before the
 * press (`foldedFigureGesture.ts`), and an undo restores it as it was.
 *
 * Module state, like the handle registry: a press marks a figure, and its end
 * lets go, however it ended.
 */
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';

const atRest = new Map<string, OristudioCpFoldedFigureEntry>();

/**
 * `entry` as it was before a press marks it `loading`. Returns the press's
 * end, which lets go; idempotent.
 */
export function holdFoldedFigureAtRest(entry: OristudioCpFoldedFigureEntry): () => void {
  atRest.set(entry.id, entry);
  return () => {
    if (atRest.get(entry.id) === entry) atRest.delete(entry.id);
  };
}

/**
 * `figures` with each one a press is working on, still `loading`, read as it
 * was before the press; the very list when there is none.
 */
export function foldedFiguresAtRest(
  figures: readonly OristudioCpFoldedFigureEntry[]
): readonly OristudioCpFoldedFigureEntry[] {
  if (atRest.size === 0) return figures;
  let changed = false;
  const rested = figures.map((figure) => {
    const before = figure.status === 'loading' ? atRest.get(figure.id) : undefined;
    if (!before) return figure;
    changed = true;
    return before;
  });
  return changed ? rested : figures;
}

export function resetFoldedFiguresAtRestForTests(): void {
  atRest.clear();
}
