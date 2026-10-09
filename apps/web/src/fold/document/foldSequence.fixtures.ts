/**
 * Small Fold sequences for the document modules' tests: ids that are the same
 * on every run, steps built in one line, and one file value that holds every
 * op kind, choice and mark this build reads, in the order it writes them.
 */

import {
  FOLD_SEQUENCE_FORMAT_VERSION,
  SQUARE_PAPER,
  type FoldIdFactory,
  type FoldOp,
  type FoldPaper,
  type FoldPlainOp,
  type FoldSequenceDocument,
  type FoldStep,
  type FoldStepNode,
} from './foldSequenceDocument';

/** `fold-1`, `fstep-2`, …: one counter across prefixes. */
export function sequentialIds(): FoldIdFactory {
  let next = 0;
  return (prefix) => `${prefix}-${(next += 1)}`;
}

/** A valley through all layers along the free horizontal line at `y`, the part above it moving. */
export function valleyAt(y: number): FoldPlainOp {
  return {
    kind: 'valley',
    line: { via: 'free', through: [[0, y], [1, y]] },
    moving: [0.5, (1 + y) / 2],
    seed: { scope: 'all' },
  };
}

export function step(id: string, parent: string | null, op: FoldOp = valleyAt(0.5), rest: Partial<FoldStep> = {}): FoldStep {
  return { id, parent, op, ...rest };
}

export function sequenceOf(
  steps: readonly FoldStepNode[],
  paper: FoldPaper = SQUARE_PAPER,
  id = 'fold-a'
): FoldSequenceDocument {
  return { formatVersion: FOLD_SEQUENCE_FORMAT_VERSION, id, title: 'Test', paper, steps };
}

/**
 * A sequence as this build writes one — every key in its written order — so
 * reading it and writing it back gives the same JSON, byte for byte.
 */
export function writtenSequence(): Record<string, unknown> {
  return {
    formatVersion: 1,
    id: 'fold-full',
    title: 'Every kind',
    paper: { shape: { kind: 'rectangle', aspect: [1, 0.5] }, startSide: 'back' },
    appearance: { front: '#336699' },
    sheetMarks: [{ id: 'fmark-1', from: [0, 0], to: [1, 0], divide: { mode: 'count', parts: 3 } }],
    steps: [
      {
        id: 'fstep-1',
        parent: null,
        op: {
          kind: 'valley',
          line: {
            via: 'axiom',
            axiom: 2,
            inputs: [
              { kind: 'point', at: [0, 0] },
              { kind: 'mark', at: [1 / 3, 0], mark: 'fmark-1' },
            ],
          },
          moving: [0.1, 0.05],
          seed: { scope: 'all' },
        },
        choices: { root: { n: [1, 0], d: 1 / 6 } },
        expect: 'fs1:0123456789abcdef',
        note: 'Bring the corner to the mark.',
        marks: [
          {
            id: 'fmark-2',
            from: [0, 0.5],
            to: [1, 0.5],
            divide: { mode: 'ratio', ratio: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 2 } },
          },
        ],
      },
      {
        id: 'fstep-2',
        parent: 'fstep-1',
        op: {
          kind: 'mountain',
          line: {
            via: 'axiom',
            axiom: 5,
            inputs: [
              { kind: 'point', at: [0, 0.5] },
              { kind: 'point', at: [1, 0] },
              { kind: 'edge', a: [0, 0], b: [1, 0] },
            ],
          },
          seed: { scope: 'depth', at: [0.9, 0.1], layers: 2 },
        },
        choices: {
          root: { n: [0.6, 0.8], d: 0.4 },
          completion: {
            faces: [
              [0.2, 0.2],
              [0.8, 0.3],
              [0.5, 0.9],
            ],
            orders: [
              [0, 1, 1],
              [2, 1, -1],
            ],
          },
          pocket: [
            [0.1, 0.1],
            [0.2, 0.2],
          ],
          opening: [{ upper: [[0.3, 0.3]] }],
        },
      },
      {
        id: 'fstep-3',
        parent: 'fstep-1',
        op: {
          kind: 'precrease',
          line: { via: 'crease', at: [0.5, 0.25] },
          direction: 'mountain',
          seed: { scope: 'flaps', at: [[0.7, 0.1]] },
        },
      },
      {
        id: 'fstep-4',
        parent: 'fstep-3',
        op: { kind: 'refold', crease: [0.5, 0.25], direction: 'valley', moving: [0.5, 0.4], seed: { scope: 'all' } },
      },
      {
        id: 'fstep-5',
        parent: 'fstep-4',
        op: { kind: 'unfold', crease: [0.5, 0.25], direction: 'valley', seed: { scope: 'flaps', at: [[0.5, 0.4]] } },
      },
      { id: 'fstep-6', parent: 'fstep-5', op: { kind: 'turn', axis: 'vertical' } },
      { id: 'fstep-7', parent: 'fstep-6', op: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'ccw' } } },
      {
        id: 'fstep-8',
        parent: 'fstep-7',
        op: { kind: 'cp-jump', cpJson: '{"vertices_coords":[]}', orderJson: '[]', origin: 'sample' },
      },
      {
        id: 'fstep-9',
        parent: 'fstep-8',
        op: {
          kind: 'valley',
          line: { via: 'free', through: [[0, 0.25], [1, 0.25]] },
          moving: [0.5, 0.4],
          seed: { scope: 'all' },
        },
      },
      {
        id: 'fstep-10',
        parent: 'fstep-9',
        op: {
          kind: 'crimp',
          line: { via: 'crease', at: [0.3, 0.1] },
          second: { via: 'free', through: [[0, 0.2], [1, 0.3]] },
          crimp: 'outside',
          moving: [0.8, 0.1],
          seed: { scope: 'flaps', at: [[0.8, 0.1]] },
        },
        choices: {
          completion: {
            faces: [
              [0.8, 0.1],
              [0.7, 0.2],
            ],
            orders: [[1, 0, -1]],
          },
          opening: [{ upper: [[0.75, 0.15]] }],
        },
      },
      {
        id: 'fstep-11',
        parent: 'fstep-9',
        op: {
          kind: 'tuck',
          line: { via: 'free', through: [[0, 0.3], [0.3, 0]] },
          direction: 'mountain',
          moving: [0.05, 0.05],
          seed: { scope: 'flaps', at: [[0.05, 0.05]] },
          target: [0.75, 0.5],
        },
      },
    ],
  };
}
