import { describe, expect, it } from 'vitest';

import { isLockedStep, type FoldStep, type FoldStepNode } from './foldSequenceDocument';
import {
  readFoldSequence,
  readFoldSequences,
  writeFoldSequence,
  writeFoldSequences,
  type HeldFoldSequence,
} from './foldSequenceFile';
import { sequentialIds, writtenSequence } from './foldSequence.fixtures';
import { foldStepTree, lockedIds } from './foldStepTree';

const valleyOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0, 0.5], [1, 0.5]] },
  moving: [0.5, 0.75],
  seed: { scope: 'all' },
};

/** A raw node folding a valley from `parent`. */
const raw = (id: unknown, parent: unknown, extra: Record<string, unknown> = {}) => ({ id, parent, op: valleyOp, ...extra });

/** The sequence a file of these raw steps reads as. */
function readSteps(steps: unknown[], extra: Record<string, unknown> = {}): HeldFoldSequence {
  const held = readFoldSequence({ formatVersion: 1, id: 'fold-a', title: '', steps, ...extra }, { newId: sequentialIds() });
  if (!held) throw new Error('expected a sequence');
  return held;
}

const ids = (steps: readonly FoldStepNode[]) => steps.map((node) => node.id);

describe('readFoldSequence and writeFoldSequence', () => {
  it('writes a well-formed sequence back byte for byte, with every op kind, choice and mark', () => {
    const value = writtenSequence();
    const held = readFoldSequence(JSON.parse(JSON.stringify(value)));
    expect(held?.readOnlyRaw).toBeNull();
    expect(held?.document.steps.every((node) => !isLockedStep(node))).toBe(true);
    expect(JSON.stringify(writeFoldSequence(held!))).toBe(JSON.stringify(value));
  });

  it('reads what it writes', () => {
    const held = readFoldSequence(writtenSequence())!;
    const again = readFoldSequence(JSON.parse(JSON.stringify(writeFoldSequence(held))))!;
    expect(again.document).toEqual(held.document);
  });

  it('is no sequence for a value that is not a record', () => {
    for (const value of [undefined, null, 3, 'fold', [writtenSequence()]]) {
      expect(readFoldSequence(value), String(value)).toBeNull();
    }
  });

  it('gives a sequence with no id a new one, and passes its title through xmlText', () => {
    const held = readFoldSequence({ formatVersion: 1, title: 'A\u000bB', steps: [] }, { newId: sequentialIds() })!;
    expect(held.document.id).toBe('fold-1');
    expect(held.document.title).toBe('AB');
  });
});

describe('the step tree', () => {
  it('drops a node with a malformed id or parent, and its subtree', () => {
    const { document } = readSteps([
      raw('a', null),
      raw(7, null),
      raw('', null),
      raw('b', 'a'),
      raw('c', 5),
      raw('d', ''),
      raw('e', undefined),
      raw('c-child', 'c'),
      raw('d-child', 'd'),
      raw('b-child', 'b'),
    ]);
    expect(ids(document.steps)).toEqual(['a', 'b', 'b-child']);
  });

  it('keeps a node with an unknown op kind verbatim, locked, and writes it back unchanged', () => {
    const newer = { id: 'b', parent: 'a', op: { kind: 'squash', axis: [0, 1] }, note: 'Squash it.' };
    const held = readSteps([raw('a', null), newer, raw('c', 'b')]);
    const locked = held.document.steps[1];
    expect(isLockedStep(locked)).toBe(true);
    expect(locked).toMatchObject({ id: 'b', parent: 'a', note: 'Squash it.' });
    expect((writeFoldSequence(held).steps as unknown[])[1]).toBe(newer);
    // Its child still reads, and is locked with it.
    expect(ids(held.document.steps)).toEqual(['a', 'b', 'c']);
    expect([...lockedIds(foldStepTree(held.document.steps))].sort()).toEqual(['b', 'c']);
  });

  it('keeps a node whose op does not read locked, rather than dropping its subtree', () => {
    const malformed = [
      { ...valleyOp, moving: undefined },
      { ...valleyOp, seed: { scope: 'depth', at: [0.5, 0.75], layers: 0 } },
      // More layers than the engine's 32-bit usize holds.
      { ...valleyOp, seed: { scope: 'depth', at: [0.5, 0.75], layers: 2 ** 32 } },
      { ...valleyOp, seed: { scope: 'depth', at: [0.5, 0.75], layers: 1e20 } },
      { ...valleyOp, seed: { scope: 'flaps', at: [] } },
      { ...valleyOp, line: { via: 'free', through: [[0, 0.5]] } },
      { ...valleyOp, line: { via: 'axiom', axiom: 4, inputs: [{ kind: 'point', at: [0, 0] }] } },
      {
        ...valleyOp,
        line: { via: 'axiom', axiom: 4, inputs: [{ kind: 'point', at: [0, 0] }, { kind: 'point', at: [1, 1] }] },
      },
      { ...valleyOp, line: { via: 'axiom', axiom: 8, inputs: [] } },
      { ...valleyOp, moving: [0.5, Number.NaN] },
      { ...valleyOp, extent: { kind: 'pinches' } },
      { kind: 'precrease', line: valleyOp.line, moving: [0.5, 0.75], seed: { scope: 'all' } },
      { kind: 'turn', axis: 'diagonal' },
      { kind: 'rotate', rotate: { amount: 'third', direction: 'cw' } },
      { kind: 'cp-jump', cpJson: '{}', orderJson: '[]', origin: 'my-file.cp' },
      'valley',
      null,
    ];
    for (const op of malformed) {
      const { document } = readSteps([raw('a', null, { op }), raw('b', 'a')]);
      expect(ids(document.steps), JSON.stringify(op)).toEqual(['a', 'b']);
      expect(isLockedStep(document.steps[0]), JSON.stringify(op)).toBe(true);
    }
  });

  it('reads every seed and root the engine can take, up to its limits', () => {
    const { document } = readSteps([
      raw('a', null, { op: { ...valleyOp, seed: { scope: 'depth', at: [0.5, 0.75], layers: 2 ** 32 - 1 } } }),
      // A short normal the engine normalises.
      raw('b', 'a', { choices: { root: { n: [1e-6, 0], d: 0 } } }),
    ]);
    expect(document.steps.map(isLockedStep)).toEqual([false, false]);
  });

  it('locks a node with choices that do not read, or a key it does not know', () => {
    const cases = [
      { choices: { root: { n: [0, 0], d: 1 } } },
      // A normal the engine's line cannot be made from: shorter than its tolerance.
      { choices: { root: { n: [1e-200, 0], d: 1 } } },
      { choices: { root: { n: [5e-7, 5e-7], d: 0 } } },
      // A completion is FOLD triples over its witnesses: a sign of 1 or -1, whole indices.
      { choices: { completion: [{ above: [0, 0], below: [1, 1] }] } },
      { choices: { completion: { faces: [[0, 0]], orders: [[0, 1, 0]] } } },
      { choices: { completion: { faces: [[0, 0]], orders: [[0.5, 1, 1]] } } },
      { choices: { completion: { faces: [[0, 0]], orders: [[0, 1, 1]], pinned: true } } },
      { choices: { pocket: [[0, 0]] } },
      { choices: { rootIndex: 2 } },
      { choices: 'first' },
      { pinned: true },
    ];
    for (const extra of cases) {
      const { document } = readSteps([raw('a', null, extra)]);
      expect(isLockedStep(document.steps[0]), JSON.stringify(extra)).toBe(true);
    }
  });

  it('keeps the first of two nodes with one id, and hangs the later one’s children on it', () => {
    const { document } = readSteps([
      raw('a', null, { note: 'first' }),
      raw('a', null, { note: 'second' }),
      raw('b', 'a'),
    ]);
    expect(ids(document.steps)).toEqual(['a', 'b']);
    expect((document.steps[0] as FoldStep).note).toBe('first');
    expect(document.steps[1].parent).toBe('a');
  });

  it('drops orphans and cycles, with everything that folds from them, and keeps the file’s order', () => {
    const { document } = readSteps([
      raw('child-first', 'root'),
      raw('orphan', 'missing'),
      raw('orphan-child', 'orphan'),
      raw('loop-a', 'loop-b'),
      raw('loop-b', 'loop-a'),
      raw('loop-child', 'loop-a'),
      raw('self', 'self'),
      raw('root', null),
    ]);
    expect(ids(document.steps)).toEqual(['child-first', 'root']);
  });
});

describe('versions and newer builds', () => {
  it('opens a sequence with a newer formatVersion read-only, and writes its raw value back', () => {
    const value = { ...writtenSequence(), formatVersion: 2, steps: [{ id: 'x', parent: null, op: { kind: 'sink' } }] };
    const held = readFoldSequence(value)!;
    expect(held.readOnlyRaw).toBe(value);
    expect(writeFoldSequence(held)).toBe(value);
  });

  it('opens each sequence read-only on its own', () => {
    const newer = { ...writtenSequence(), id: 'fold-newer', formatVersion: 2 };
    const [first, second] = readFoldSequences([newer, writtenSequence()]);
    expect(first.readOnlyRaw).toBe(newer);
    expect(second.readOnlyRaw).toBeNull();
  });

  it('opens a sequence read-only when a newer build wrote its paper', () => {
    const papers = [
      { shape: { kind: 'star', points: 5 }, startSide: 'front' },
      { shape: { kind: 'square', rounded: true }, startSide: 'front' },
      { shape: { kind: 'square' }, startSide: 'front', thickness: 0.1 },
      { shape: { kind: 'square' }, startSide: 'edge' },
      {
        shape: { kind: 'polygon', points: Array.from({ length: 12 }, (_, k) => [Math.cos(k), Math.sin(k)]) },
        startSide: 'front',
      },
    ];
    for (const paper of papers) {
      const value = { formatVersion: 1, id: 'fold-a', title: '', paper, steps: [] };
      const held = readFoldSequence(value)!;
      expect(held.readOnlyRaw, JSON.stringify(paper)).toBe(value);
    }
  });

  it('reads a damaged paper as the square, front up, and keeps the sequence editable', () => {
    for (const paper of [7, { shape: 'square' }, { shape: { kind: 'rectangle', aspect: [0, 1] } }, { startSide: 3 }]) {
      const held = readFoldSequence({ formatVersion: 1, id: 'fold-a', title: '', paper, steps: [] })!;
      expect(held.readOnlyRaw, JSON.stringify(paper)).toBeNull();
      expect(held.document.paper, JSON.stringify(paper)).toEqual({ shape: { kind: 'square' }, startSide: 'front' });
    }
  });

  it('normalises a rectangle to longer side 1', () => {
    const held = readFoldSequence({
      formatVersion: 1,
      id: 'fold-a',
      paper: { shape: { kind: 'rectangle', aspect: [3, 4] }, startSide: 'front' },
      steps: [],
    })!;
    expect(held.document.paper.shape).toEqual({ kind: 'rectangle', aspect: [0.75, 1] });
  });

  it('carries unknown sequence-level keys verbatim, after its own, and stays editable', () => {
    const bookmarks = { list: ['fstep-1'] };
    const value = { ...writtenSequence(), bookmarks, zoom: 2 };
    const held = readFoldSequence(value)!;
    expect(held.readOnlyRaw).toBeNull();
    expect(held.document.carried).toEqual({ bookmarks, zoom: 2 });
    const written = writeFoldSequence(held);
    expect(written.bookmarks).toBe(bookmarks);
    expect(Object.keys(written).slice(-3)).toEqual(['steps', 'bookmarks', 'zoom']);
  });
});

describe('marks, notes and expect', () => {
  it('drops a malformed mark, carries a newer build’s, and writes the carried one back unchanged', () => {
    const kept = { id: 'm-ok', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 2 } };
    const newerMode = { id: 'm-mode', from: [0, 0], to: [1, 0], divide: { mode: 'golden' } };
    const newerParts = { id: 'm-parts', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 64 } };
    const newerKey = { ...kept, id: 'm-key', color: 'red' };
    const marks = [
      kept,
      newerMode,
      newerParts,
      newerKey,
      { id: 'm-short', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 1 } },
      { id: 'm-ratio', from: [0, 0], to: [1, 0], divide: { mode: 'ratio', ratio: { a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 } } },
      { id: 'm-point', from: [0], to: [1, 0], divide: { mode: 'count', parts: 2 } },
    ];
    const held = readSteps([raw('a', null, { marks })]);
    const node = held.document.steps[0] as FoldStep;
    expect(node.marks?.map((mark) => mark.id)).toEqual(['m-ok', 'm-mode', 'm-parts', 'm-key']);
    const written = (writeFoldSequence(held).steps as Record<string, unknown>[])[0].marks as unknown[];
    expect(written[1]).toBe(newerMode);
    expect(written[2]).toBe(newerParts);
    expect(written[3]).toBe(newerKey);
  });

  it('drops an expect or a note that is not a string, and passes a note through xmlText', () => {
    const { document } = readSteps([raw('a', null, { expect: 3, note: ['x'] }), raw('b', null, { note: 'a\u0000b' })]);
    expect(document.steps[0]).not.toHaveProperty('expect');
    expect(document.steps[0]).not.toHaveProperty('note');
    expect((document.steps[1] as FoldStep).note).toBe('ab');
  });

  it('reads empty choices as none', () => {
    const { document } = readSteps([
      raw('a', null, { choices: { completion: { faces: [], orders: [] }, opening: [] } }),
      raw('b', null, { choices: {} }),
    ]);
    expect(document.steps[0]).not.toHaveProperty('choices');
    expect(document.steps[1]).not.toHaveProperty('choices');
  });
});

describe('readFoldSequences and writeFoldSequences', () => {
  it('writes no key for no sequences, so the file stays byte-identical', () => {
    expect(writeFoldSequences([])).toBeNull();
    const project = { workspace: { foldSequences: writeFoldSequences([]) ?? undefined } };
    expect(JSON.stringify(project)).toBe(JSON.stringify({ workspace: {} }));
  });

  it('is no sequences for a value that is not an array, and skips entries that are not records', () => {
    for (const value of [undefined, null, {}, 'fold']) expect(readFoldSequences(value)).toEqual([]);
    expect(readFoldSequences([3, null, writtenSequence()]).map((held) => held.document.id)).toEqual(['fold-full']);
  });

  it('gives a later sequence with an id already read a new one, and keeps its steps', () => {
    const [first, second] = readFoldSequences([writtenSequence(), writtenSequence()], { newId: sequentialIds() });
    expect(first.document.id).toBe('fold-full');
    expect(second.document.id).toBe('fold-1');
    expect(second.document.steps).toHaveLength(first.document.steps.length);
  });

  it('writes every sequence in order', () => {
    const sequences = readFoldSequences([writtenSequence(), { ...writtenSequence(), id: 'fold-other' }]);
    expect(writeFoldSequences(sequences)?.map((value) => value.id)).toEqual(['fold-full', 'fold-other']);
  });
});
