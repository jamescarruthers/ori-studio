import { describe, expect, it } from 'vitest';
import { sequenceOf, step } from '../document/foldSequence.fixtures';
import { foldStepNoteAction, foldStepNoteOf } from './useFoldStepNote';

describe('a Fold step’s note', () => {
  it('reads a step’s note, empty for none or no such step', () => {
    const document = sequenceOf([step('a', null, undefined, { note: 'Book fold.' }), step('b', 'a')]);
    expect(foldStepNoteOf(document, 'a')).toBe('Book fold.');
    expect(foldStepNoteOf(document, 'b')).toBe('');
    expect(foldStepNoteOf(document, 'gone')).toBe('');
  });

  it('says what a change did: wrote one, rewrote it, or cleared it', () => {
    expect(foldStepNoteAction('', 'Book fold.')).toBe('added');
    expect(foldStepNoteAction('Book fold.', 'Book fold, left over right.')).toBe('changed');
    expect(foldStepNoteAction('Book fold.', '')).toBe('cleared');
  });
});
