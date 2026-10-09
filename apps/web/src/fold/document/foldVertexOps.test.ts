import { describe, expect, it } from 'vitest';

import { foldStepKey } from './foldDigest';
import { sequenceOf, step } from './foldSequence.fixtures';
import {
  FOLD_OP_KINDS,
  FOLD_VERTEX_OP_KINDS,
  isLockedStep,
  isVertexOp,
  type FoldRabbitEarOp,
  type FoldSquashOp,
  type FoldStep,
} from './foldSequenceDocument';
import { readFoldSequence, writeFoldOp, writeFoldSequence } from './foldSequenceFile';

/**
 * The vertex folds' ops in the document (plan Phase 11, D6): sheet points
 * and the directions their choices stored, read and written exactly; an
 * absent optional direction is none; anything that does not read locks the
 * node, as a newer build's op does; and `fh1` tells every field apart.
 */

const squash: FoldSquashOp = { kind: 'squash', flap: [0.1, 0.4], direction: 'valley' };

const ear: FoldRabbitEarOp = {
  kind: 'rabbit-ear',
  corners: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  emergent: [-1, 0],
  seed: { scope: 'all' },
  stayer: [0.6, 0.35],
  direction: 'valley',
};

/** The steps a file of these raw ops reads as, each folding from the one before. */
function readOps(ops: unknown[]) {
  const steps = ops.map((op, k) => ({ id: `s${k}`, parent: k === 0 ? null : `s${k - 1}`, op }));
  const held = readFoldSequence({ formatVersion: 1, id: 'fold-a', title: '', steps });
  if (!held) throw new Error('expected a sequence');
  return held;
}

describe('the vertex folds’ ops', () => {
  it('are op kinds of this build', () => {
    for (const kind of FOLD_VERTEX_OP_KINDS) expect(FOLD_OP_KINDS).toContain(kind);
    expect(isVertexOp(squash)).toBe(true);
    expect(isVertexOp({ kind: 'turn', axis: 'vertical' })).toBe(false);
  });

  it('read and write back exactly, with and without their optional directions', () => {
    const ops = [
      squash,
      { ...squash, target: [-1, 0.5] },
      { kind: 'petal', crease: [0.3, 0.2], petal: [0.25, 0.1], direction: 'mountain' },
      ear,
      { ...ear, ridge: [0, -1], seed: { scope: 'flaps', at: [[0.2, 0.1]] } },
      {
        kind: 'swivel',
        vertex: [0.5, 0.3],
        toward: [
          [1, 0.6],
          [0, 0.6],
          [0.5, 0],
        ],
        emergent: [0, 1],
        seed: { scope: 'depth', at: [0.5, 0.3], layers: 2 },
        stayer: [0.3, 0.9],
        direction: 'valley',
      },
    ];
    const held = readOps(ops);
    expect(held.document.steps.map(isLockedStep)).toEqual(ops.map(() => false));
    const written = writeFoldSequence(held).steps as { op: unknown }[];
    expect(written.map((node) => node.op)).toEqual(ops);
  });

  it('lock a node whose op does not read, or that a newer build extended', () => {
    const malformed = [
      { ...squash, flap: [0.1] },
      { ...squash, direction: 'sideways' },
      // A target with no direction.
      { ...squash, target: [0, 0] },
      { ...squash, target: [Number.NaN, 1] },
      { kind: 'petal', crease: [0.3, 0.2], direction: 'valley' },
      { ...ear, corners: [[0, 0], [1, 0]] },
      { ...ear, seed: { scope: 'depth', at: [0.2, 0.1], layers: 0 } },
      { ...ear, emergent: 'left' },
      { ...ear, ridge: null },
      { ...ear, stayer: undefined },
      // A key this build does not know.
      { ...ear, layers: 2 },
      { ...squash, pleat: true },
    ];
    for (const op of malformed) {
      const held = readOps([op]);
      expect(isLockedStep(held.document.steps[0]), JSON.stringify(op)).toBe(true);
      // Written back as it came.
      expect((writeFoldSequence(held).steps as { op: unknown }[])[0]?.op).toBe(op);
    }
  });

  it('give fh1 every field: a target, an emergent ray or a ridge is another path', () => {
    const key = (node: FoldStep) => foldStepKey(node);
    const keys = [
      key(step('x', null, squash)),
      key(step('x', null, { ...squash, target: [-1, 0.5] })),
      key(step('x', null, { ...squash, direction: 'mountain' })),
      key(step('x', null, ear)),
      key(step('x', null, { ...ear, emergent: [0, -1] })),
      key(step('x', null, { ...ear, ridge: [-1, 0] })),
      key(step('x', null, ear, { choices: { completion: [{ above: [0.2, 0.2], below: [0.6, 0.2] }] } })),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    // The written op is what fh1 spells: no key for an absent direction.
    expect(Object.keys(writeFoldOp(squash))).toEqual(['kind', 'flap', 'direction']);
    expect(sequenceOf([step('a', null, ear)]).steps).toHaveLength(1);
  });
});
