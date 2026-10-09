import { describe, expect, it } from 'vitest';

import { rectangleShape, type FoldLockedStep, type FoldMark, type FoldStep } from './foldSequenceDocument';
import {
  appendFoldStep,
  deleteFoldStep,
  setFoldMarks,
  setFoldPaperShape,
  setFoldStepNote,
} from './foldSequenceEdits';
import { sequenceOf, sequentialIds, step, valleyAt } from './foldSequence.fixtures';

const locked: FoldLockedStep = { id: 'l', parent: 'a', unknown: { id: 'l', parent: 'a', op: { kind: 'sink' } } };
const document = () => sequenceOf([step('a', null), step('b', 'a', valleyAt(0.25)), locked, step('m', 'l')]);
const mark: FoldMark = { id: 'fmark-9', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 3 } };
const ids = (steps: readonly { id: string }[]) => steps.map((node) => node.id);

describe('appendFoldStep', () => {
  it('appends a step under its parent, making a branch at a step that has children', () => {
    const committed = appendFoldStep(
      document(),
      { parent: 'a', op: valleyAt(0.6), expect: 'fs1:0000000000000000' },
      sequentialIds()
    )!;
    expect(committed.id).toBe('fstep-1');
    expect(ids(committed.document.steps)).toEqual(['a', 'b', 'l', 'm', 'fstep-1']);
    expect(committed.document.steps[4]).toEqual({
      id: 'fstep-1',
      parent: 'a',
      op: valleyAt(0.6),
      expect: 'fs1:0000000000000000',
    });
  });

  it('commits from the flat sheet', () => {
    expect(appendFoldStep(document(), { parent: null, op: valleyAt(0.6) })?.document.steps).toHaveLength(5);
  });

  it('refuses a parent the sequence does not hold, or one that is locked', () => {
    for (const parent of ['missing', 'l', 'm']) {
      expect(appendFoldStep(document(), { parent, op: valleyAt(0.6) }), parent).toBeNull();
    }
  });

  it('adopts a sheet with the first step of an empty sequence, in the same edit (plan D16)', () => {
    const rectangle = rectangleShape(1, 0.5)!;
    const empty = { ...sequenceOf([]), sheetMarks: [mark] };
    const adopted = appendFoldStep(empty, { parent: null, op: valleyAt(0.25), adopt: rectangle }, sequentialIds())!;
    expect(adopted.document.paper).toEqual({ shape: rectangle, startSide: 'front' });
    // The shape changed, so the marks made on the old sheet go, as a change of shape takes them.
    expect(adopted.document.sheetMarks).toBeUndefined();
    // What the step stores is the op, never the sheet it adopted.
    expect(adopted.document.steps).toEqual([{ id: 'fstep-1', parent: null, op: valleyAt(0.25) }]);

    // The same shape is no change of shape: the marks stay.
    const square = appendFoldStep(empty, { parent: null, op: valleyAt(0.25), adopt: { kind: 'square' } })!;
    expect(square.document.paper).toBe(empty.paper);
    expect(square.document.sheetMarks).toEqual([mark]);
  });

  it('refuses to adopt a sheet for a sequence that already has steps, or for a step after another', () => {
    const adopt = rectangleShape(1, 0.5)!;
    expect(appendFoldStep(document(), { parent: null, op: valleyAt(0.6), adopt })).toBeNull();
    expect(appendFoldStep(document(), { parent: 'a', op: valleyAt(0.6), adopt })).toBeNull();
  });
});

describe('deleteFoldStep', () => {
  it('deletes a step and what follows it, locked or not', () => {
    expect(ids(deleteFoldStep(document(), 'l').steps)).toEqual(['a', 'b']);
    expect(ids(deleteFoldStep(document(), 'a').steps)).toEqual([]);
  });

  it('changes nothing for a step it does not hold', () => {
    const original = document();
    expect(deleteFoldStep(original, 'missing')).toBe(original);
  });
});

describe('notes and marks', () => {
  it('sets a note, and clears it when empty', () => {
    const noted = setFoldStepNote(document(), 'b', 'Fold\u000b down.');
    expect((noted.steps[1] as FoldStep).note).toBe('Fold down.');
    expect(noted.steps[1]).not.toBe(document().steps[1]);
    expect(setFoldStepNote(noted, 'b', '').steps[1]).not.toHaveProperty('note');
    expect(setFoldStepNote(noted, 'b', 'Fold down.')).toBe(noted);
  });

  it('edits nothing locked', () => {
    const original = document();
    expect(setFoldStepNote(original, 'l', 'x')).toBe(original);
    expect(setFoldStepNote(original, 'm', 'x')).toBe(original);
    expect(setFoldMarks(original, 'm', [mark])).toBe(original);
  });

  it('sets and clears the marks of a step and of the sheet', () => {
    const marked = setFoldMarks(setFoldMarks(document(), 'b', [mark]), null, [mark]);
    expect((marked.steps[1] as FoldStep).marks).toEqual([mark]);
    expect(marked.sheetMarks).toEqual([mark]);
    const cleared = setFoldMarks(setFoldMarks(marked, 'b', []), null, []);
    expect(cleared.steps[1]).not.toHaveProperty('marks');
    expect(cleared).not.toHaveProperty('sheetMarks');
    expect(setFoldMarks(cleared, null, [])).toBe(cleared);
  });
});

describe('setFoldPaperShape', () => {
  it('replaces the shape and empties the steps and the sheet’s marks, as one edit', () => {
    const changed = setFoldPaperShape(setFoldMarks(document(), null, [mark]), rectangleShape(1, Math.SQRT2)!);
    expect(changed.paper).toEqual({ shape: rectangleShape(1, Math.SQRT2), startSide: 'front' });
    expect(changed.steps).toEqual([]);
    expect(changed).not.toHaveProperty('sheetMarks');
  });

  it('changes nothing for the same shape', () => {
    const original = document();
    expect(setFoldPaperShape(original, { kind: 'square' })).toBe(original);
  });
});
