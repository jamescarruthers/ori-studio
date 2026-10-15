import { describe, expect, it } from 'vitest';
import { resolveFoldReturn } from './foldReturn';
import { sequenceOf, step } from './foldSequence.fixtures';
import { appendFoldStep } from './foldSequenceEdits';
import type { FoldReturnOp } from './foldSequenceDocument';

const document = sequenceOf([step('a', null), step('b', 'a'), step('sibling', 'a'), step('c', 'b')]);
const state = (id: number) => ({ state: id, status: 'ok' as const, path: `fh1:${id}`, fingerprint: `fs1:${id}` as const });
const nodes = new Map([['a', state(1)], ['b', state(2)], ['sibling', state(3)], ['c', state(4)]]);
const op: FoldReturnOp = { kind: 'unfold-to', target: 'a', source: { path: 'fh1:2', state: 'fs1:2', targetState: 'fs1:1' } };
describe('return dependencies', () => {
  it('resolves only the source ancestor path, including the sheet with a zero engine handle', () => {
    expect(resolveFoldReturn(document, 'b', op, state(0), nodes)).toEqual({ target: 1, history: [0, 1, 2] });
    expect(resolveFoldReturn(document, 'b', { ...op, target: null, source: { ...op.source, targetState: 'fs1:0' } }, state(0), nodes))
      .toEqual({ target: 0, history: [0, 1, 2] });
  });
  it.each(['b', 'c', 'sibling', 'foreign'])('rejects non-ancestor %s at replay and append', (target) => {
    expect(resolveFoldReturn(document, 'b', { ...op, target }, state(0), nodes)).toEqual({ code: 'return_target_invalid' });
    expect(appendFoldStep(document, { parent: 'b', op: { ...op, target } })).toBeNull();
  });
  it('refuses changed paths, changed target state, and unavailable history', () => {
    for (const source of [{ ...op.source, path: 'fh1:changed' }, { ...op.source, targetState: 'fs1:changed' }]) {
      expect(resolveFoldReturn(document, 'b', { ...op, source }, state(0), nodes)).toEqual({ code: 'return_source_changed' });
    }
    expect(resolveFoldReturn(document, 'b', op, { ...state(0), state: null }, nodes)).toEqual({ code: 'return_state_unavailable' });
  });
});
