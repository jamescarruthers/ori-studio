import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  foldDrift,
  foldNodeDigest,
  foldPathDigest,
  foldStateFingerprint,
  foldStepKey,
} from './foldDigest';
import { rectangleShape, type FoldLockedStep, type FoldPaper, type FoldStep } from './foldSequenceDocument';
import { readFoldSequence, writeFoldOp, writeFoldSequence } from './foldSequenceFile';
import { setFoldMarks, setFoldStepNote } from './foldSequenceEdits';
import { sequenceOf, step, valleyAt, writtenSequence } from './foldSequence.fixtures';

const axiomValley = (d: number): FoldStep =>
  step('x', 'a', {
    kind: 'valley',
    line: {
      via: 'axiom',
      axiom: 5,
      inputs: [
        { kind: 'point', at: [0, 0.5] },
        { kind: 'point', at: [1, 0] },
        { kind: 'edge', a: [0, 1], b: [1, 1] },
      ],
    },
    seed: { scope: 'flaps', at: [[0.9, 0.1]] },
  }, { choices: { root: { n: [0.6, 0.8], d } } });

describe('fh1', () => {
  it('tells apart siblings that differ only in their choices', () => {
    const first = { ...axiomValley(0.4), id: 'x' };
    const second = { ...axiomValley(0.6), id: 'y' };
    const document = sequenceOf([step('a', null), first, second]);
    expect(foldNodeDigest(document, 'x')).not.toBe(foldNodeDigest(document, 'y'));
  });

  it('gives siblings with the same op and choices one digest: the same path is the same state', () => {
    const document = sequenceOf([step('a', null), step('x', 'a'), step('y', 'a')]);
    expect(foldNodeDigest(document, 'x')).toBe(foldNodeDigest(document, 'y'));
  });

  it('tells apart sequences that differ only in their paper', () => {
    const steps = [step('a', null), step('b', 'a', valleyAt(0.25))];
    const papers: FoldPaper[] = [
      { shape: { kind: 'square' }, startSide: 'front' },
      { shape: { kind: 'square' }, startSide: 'back' },
      { shape: rectangleShape(1, Math.SQRT2)!, startSide: 'front' },
      { shape: rectangleShape(3, 4)!, startSide: 'front' },
    ];
    const digests = papers.map((paper) => foldNodeDigest(sequenceOf(steps, paper), 'b'));
    expect(new Set(digests).size).toBe(papers.length);
    const sheets = papers.map((paper) => foldPathDigest(paper, []));
    expect(new Set(sheets).size).toBe(papers.length);
  });

  it('depends on the whole path, not only the node', () => {
    const document = sequenceOf([
      step('a', null, valleyAt(0.5)),
      step('b', null, valleyAt(0.25)),
      step('x', 'a', valleyAt(0.75)),
      step('y', 'b', valleyAt(0.75)),
    ]);
    expect(foldNodeDigest(document, 'x')).not.toBe(foldNodeDigest(document, 'y'));
  });

  it('is unchanged by a note, marks or an expect', () => {
    const document = sequenceOf([step('a', null), step('b', 'a', valleyAt(0.25))]);
    const before = foldNodeDigest(document, 'b');
    const noted = setFoldStepNote(document, 'a', 'Fold in half.');
    const marked = setFoldMarks(noted, 'a', [
      { id: 'fmark-1', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 4 } },
    ]);
    const sheetMarked = setFoldMarks(marked, null, [
      { id: 'fmark-2', from: [0, 0], to: [0, 1], divide: { mode: 'count', parts: 2 } },
    ]);
    const expected = {
      ...sheetMarked,
      steps: sheetMarked.steps.map((node) => ({ ...node, expect: 'fs1:0000000000000000' })),
    };
    expect(noted).not.toBe(document);
    for (const edited of [noted, marked, sheetMarked, expected]) expect(foldNodeDigest(edited, 'b')).toBe(before);
  });

  it('survives a write and a read', () => {
    const held = readFoldSequence(writtenSequence())!;
    const again = readFoldSequence(JSON.parse(JSON.stringify(writeFoldSequence(held))))!;
    for (const node of held.document.steps) {
      expect(foldNodeDigest(again.document, node.id)).toBe(foldNodeDigest(held.document, node.id));
    }
  });

  it('spells a locked node from the op and choices it came with, as the build that reads it does', () => {
    const known = axiomValley(0.4);
    const locked: FoldLockedStep = {
      id: known.id,
      parent: known.parent,
      unknown: { id: known.id, parent: known.parent, op: writeFoldOp(known.op), choices: known.choices, note: 'x' },
    };
    expect(foldStepKey(locked)).toBe(foldStepKey(known));
  });

  it('tells apart crimps and tucks by every field they fold by, and by their stored order', () => {
    const line = { via: 'free', through: [[0, 0.5], [1, 0.5]] } as const;
    const second = { via: 'free', through: [[0, 0.3], [1, 0.3]] } as const;
    const crimp = step('x', 'a', { kind: 'crimp', line, second, crimp: 'inside', seed: { scope: 'all' } });
    const tuck = step('x', 'a', { kind: 'tuck', line, direction: 'valley', seed: { scope: 'all' }, target: [0.5, 0.75] });
    const order = (s: 1 | -1) => ({
      completion: {
        faces: [
          [0.1, 0.1],
          [0.9, 0.1],
        ] as const,
        orders: [[0, 1, s]] as const,
      },
    });
    const keys = [
      crimp,
      { ...crimp, op: { ...crimp.op, crimp: 'outside' } },
      { ...crimp, op: { ...crimp.op, second: line } },
      { ...crimp, choices: { opening: [{ upper: [[0.2, 0.2]] }] } },
      { ...crimp, choices: order(1) },
      { ...crimp, choices: order(-1) },
      tuck,
      { ...tuck, op: { ...tuck.op, direction: 'mountain' } },
      { ...tuck, op: { ...tuck.op, target: [0.5, 0.8] } },
      { ...tuck, choices: order(1) },
    ].map((node) => foldStepKey(node as FoldStep));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is null for a node the document does not hold', () => {
    expect(foldNodeDigest(sequenceOf([step('a', null)]), 'missing')).toBeNull();
  });

  it('names its algorithm', () => {
    expect(foldPathDigest({ shape: { kind: 'square' }, startSide: 'front' }, [])).toMatch(/^fh1:[0-9a-f]{16}$/);
  });
});

describe('canonicalJson', () => {
  it('spells a value one way, whatever order its keys were made in', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: 0 } })).toBe(
      canonicalJson({ a: { c: 0, d: [1, { e: 3, f: 2 }] }, b: 1 })
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('writes numbers in their shortest round-trip form, and -0 as 0', () => {
    expect(canonicalJson([0.1 + 0.2, 1 / 3, -0, 1e21, 5e-324])).toBe(
      '[0.30000000000000004,0.3333333333333333,0,1e+21,5e-324]'
    );
  });

  it('leaves out undefined fields, so an absent field and an undefined one are the same', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('spells empty choices as none', () => {
    const plain = step('a', null);
    expect(foldStepKey({ ...plain, choices: {} })).toBe(foldStepKey({ ...plain }));
    expect(foldStepKey({ ...plain, choices: { completion: { faces: [], orders: [] } } })).toBe(
      foldStepKey({ ...plain })
    );
  });
});

describe('fs1', () => {
  it('does not depend on the order the engine lists a state’s keys in', () => {
    expect(foldStateFingerprint({ keys: ['crease:a', 'order:b', 'view:c'] })).toBe(
      foldStateFingerprint({ keys: ['view:c', 'crease:a', 'order:b'] })
    );
    expect(foldStateFingerprint({ keys: ['crease:a'] })).not.toBe(foldStateFingerprint({ keys: ['crease:b'] }));
    expect(foldStateFingerprint({ keys: [] })).toMatch(/^fs1:[0-9a-f]{16}$/);
  });

  it('says whether an expect matches, differs, or cannot be judged', () => {
    const fingerprint = foldStateFingerprint({ keys: ['a'] });
    expect(foldDrift(fingerprint, fingerprint)).toBe('same');
    expect(foldDrift(foldStateFingerprint({ keys: ['b'] }), fingerprint)).toBe('changed');
    expect(foldDrift(undefined, fingerprint)).toBe('unknown');
    expect(foldDrift('fs2:0123456789abcdef', fingerprint)).toBe('unknown');
  });
});
