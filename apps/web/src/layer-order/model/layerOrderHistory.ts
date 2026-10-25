/**
 * The dialog's own undo history, independent of the workspace's
 * (spec §6.5; plan, "The inspector's behaviour").
 *
 * An entry is the whole list of rows, never an order: as on the approved
 * artboard (Round3 `undo`, `redo`), stepping back commits the earlier list
 * and shows the fitting order closest to the one on screen, so undo never
 * jumps the figure back to an order the user has since moved away from. Add,
 * remove and Clear all are entries; previews and the stepper are not (the
 * stepper adds no constraints, spec §6.6).
 *
 * The history moves only when the commit it asks for lands: an undo whose
 * re-solve runs out of time leaves the history where it was.
 *
 * Pure: no React, no store, no engine calls.
 */

export interface LayerHistory<T> {
  /** The lists before the present one, oldest first. */
  readonly past: readonly T[];
  /** The lists undone, the next redo first. */
  readonly future: readonly T[];
}

export function emptyHistory<T>(): LayerHistory<T> {
  return { past: [], future: [] };
}

/** A new edit from `present`: it goes on the past, and the future is gone (Round3 `commit` with no history given). */
export function recorded<T>(history: LayerHistory<T>, present: T): LayerHistory<T> {
  return { past: [...history.past, present], future: [] };
}

export function canUndo<T>(history: LayerHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: LayerHistory<T>): boolean {
  return history.future.length > 0;
}

/** The list undo goes back to, or null. */
export function undoTarget<T>(history: LayerHistory<T>): T | null {
  return history.past.length > 0 ? history.past[history.past.length - 1]! : null;
}

/** The list redo goes forward to, or null. */
export function redoTarget<T>(history: LayerHistory<T>): T | null {
  return history.future.length > 0 ? history.future[0]! : null;
}

/** The history once an undo from `present` landed (Round3 `undo`). */
export function afterUndo<T>(history: LayerHistory<T>, present: T): LayerHistory<T> {
  return { past: history.past.slice(0, -1), future: [present, ...history.future] };
}

/** The history once a redo from `present` landed (Round3 `redo`). */
export function afterRedo<T>(history: LayerHistory<T>, present: T): LayerHistory<T> {
  return { past: [...history.past, present], future: history.future.slice(1) };
}
