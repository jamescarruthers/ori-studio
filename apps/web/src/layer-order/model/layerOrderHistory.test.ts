/** The dialog's local history (Round3 `commit`, `undo`, `redo`). */
import { describe, expect, it } from 'vitest';
import {
  afterRedo,
  afterUndo,
  canRedo,
  canUndo,
  emptyHistory,
  recorded,
  redoTarget,
  undoTarget,
} from './layerOrderHistory';

describe('the local history', () => {
  it('starts empty', () => {
    const history = emptyHistory<string>();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(undoTarget(history)).toBeNull();
    expect(redoTarget(history)).toBeNull();
  });

  it('an edit puts the present on the past and drops the future (Round3 commit)', () => {
    const history = recorded(recorded(emptyHistory<string>(), 'a'), 'b');
    expect(history).toEqual({ past: ['a', 'b'], future: [] });
    const undone = afterUndo(history, 'c');
    expect(recorded(undone, 'b')).toEqual({ past: ['a', 'b'], future: [] });
  });

  it('undo steps back to the last list and keeps the present for redo (Round3 undo)', () => {
    const history = recorded(recorded(emptyHistory<string>(), 'a'), 'b');
    expect(undoTarget(history)).toBe('b');
    const undone = afterUndo(history, 'c');
    expect(undone).toEqual({ past: ['a'], future: ['c'] });
    expect(undoTarget(undone)).toBe('a');
    expect(redoTarget(undone)).toBe('c');
  });

  it('redo steps forward and puts the present back on the past (Round3 redo)', () => {
    const undone = afterUndo(afterUndo(recorded(recorded(emptyHistory<string>(), 'a'), 'b'), 'c'), 'b');
    expect(undone).toEqual({ past: [], future: ['b', 'c'] });
    const redone = afterRedo(undone, 'a');
    expect(redone).toEqual({ past: ['a'], future: ['c'] });
    expect(afterRedo(redone, 'b')).toEqual({ past: ['a', 'b'], future: [] });
  });
});
