/**
 * A Fold step captured for the Diagram is worded as Fold's strip words it
 * (plan D17): the capture reads the line a step folded along — a plain fold's
 * report, or a compound fold's — through the strip's own reading, so the
 * inputs an axiom brings together are named mover first in both, and the
 * card the author picks says what the step it adds says.
 *
 * Over the session itself, its replay landing each step through a fake
 * engine as the bridge lands a compound fold: no plain report, the line in
 * the compound one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { initialFoldReaderState, withFoldCursor } from '../../fold/document/foldReaderState';
import { sequenceOf, step } from '../../fold/document/foldSequence.fixtures';
import type { FoldCrimpOp, FoldModelLine, FoldOp, FoldReverseOp } from '../../fold/document/foldSequenceDocument';
import {
  foldedLineOf,
  type FoldCompoundReport,
  type FoldCompoundReportBase,
} from '../../fold/engine/foldEngineCompoundWire';
import type { FoldEngineOp, FoldReport } from '../../fold/engine/foldEngineWire';
import { diagonalHalfScene, squareScene } from '../../fold/sequence/foldScene.fixtures';
import { foldNodeSentenceStep } from '../../fold/sequence/foldSentenceStep';
import { foldStateFrame } from '../../fold/sequence/foldStateFrame';
import { createFoldSession, type FoldSession } from '../../fold/session/foldSession';
import { fakeFoldEngine, inProcessFoldRuntime, memoryFoldDocument, settle } from '../../fold/session/foldSession.fixtures';
import { selectFoldNode } from '../../fold/session/foldSessionState';
import { foldStepSentence } from '../../fold/stepSentence';
import { FOLD_PULL_RENDER } from './foldPull';
import { captureFoldStep } from './foldStepCapture';

// The app's own i18next, started on the inline English defaults.
const t = i18n.t.bind(i18n);

const SQUARE: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * O2 between the bottom-right corner and the top-left, listed in that order:
 * its line is the diagonal y = x, and the side the fold moves — the
 * negative one of this normal — holds the second input, the top-left corner.
 */
const AXIOM = {
  via: 'axiom',
  axiom: 2,
  inputs: [
    { kind: 'point', at: [1, 0] },
    { kind: 'point', at: [0, 1] },
  ],
} as const satisfies FoldReverseOp['line'];
const DIAGONAL: FoldModelLine = { n: [Math.SQRT1_2, -Math.SQRT1_2], d: 0 };
const SNAP = { clusters: 0, angle: 0, max_shift: 0 };

const REVERSE: FoldReverseOp = { kind: 'inside-reverse', line: AXIOM, moving: [0.1, 0.9], seed: { scope: 'all' } };
const CRIMP: FoldCrimpOp = {
  kind: 'crimp',
  line: AXIOM,
  second: { via: 'free', through: [[0.2, 0], [1, 0.8]] },
  crimp: 'inside',
  moving: [0.1, 0.9],
  seed: { scope: 'all' },
};

const BASE: FoldCompoundReportBase = {
  moving: [0],
  blocks: [[0]],
  created: [4],
  unfolded: [],
  refolded: [],
  reversed: [],
  split: 1,
  motion: { kind: 'visual', legs: [] },
};

/** What the bridge lands each op with: a compound report folding along the diagonal, its top-left side moving. */
function reportOf(op: FoldEngineOp): FoldCompoundReport | null {
  switch (op.kind) {
    case 'inside-reverse':
      return { family: 'reverse', ...BASE, line: DIAGONAL, side: 'negative', snap: SNAP, kind: 'inside', openings: [], whole: [], stored: {} };
    case 'crimp':
      return {
        family: 'crimp',
        ...BASE,
        first: DIAGONAL,
        side: 'negative',
        snap: SNAP,
        second: { n: [Math.SQRT1_2, -Math.SQRT1_2], d: 0.2 * Math.SQRT1_2 },
        second_side: 'negative',
        second_snap: SNAP,
        kind: 'inside',
        openings: [],
        whole: [],
        stored: {},
      };
    default:
      return null;
  }
}

let sessions: FoldSession[] = [];

afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions = [];
});

/** A session showing a sequence of one step, `op`, folded from the flat square to the square folded on its diagonal. */
async function sessionOf(op: FoldOp, report?: Partial<FoldReport>): Promise<FoldSession> {
  const document = sequenceOf([step('fstep-1', null, op)]);
  const runtime = inProcessFoldRuntime(() => {
    const fake = fakeFoldEngine({ compound: reportOf, ...(report ? { report: () => report } : {}) });
    const folded = (state: number) => (fake.trail(state)?.length ?? 0) > 1;
    return {
      ...fake,
      scene: (state: number) => (folded(state) ? diagonalHalfScene() : squareScene()),
      summary: (state: number) => ({ ...fake.summary(state), sheet: SQUARE }),
      stepAction: () => ({ status: 'ok' as const, action: null }),
    };
  });
  const source = memoryFoldDocument({
    held: { document, readOnlyRaw: null },
    reader: withFoldCursor(initialFoldReaderState(document.id), document, 'fstep-1'),
  });
  const session = createFoldSession({ document: source, runtime });
  sessions.push(session);
  session.retain();
  await settle();
  return session;
}

/** The step's sentence as Fold's strip words it: from the states either side and the line it folded along. */
function stripSentence(session: FoldSession, op: FoldOp): string {
  const node = selectFoldNode(session.store.getState(), 'fstep-1');
  if (!node) throw new Error('no node');
  const words = foldNodeSentenceStep(step('fstep-1', null, op), {
    parent: foldStateFrame(squareScene()),
    child: foldStateFrame(diagonalHalfScene()),
    report: foldedLineOf(node),
  });
  return foldStepSentence(t, words);
}

async function capturedSentence(session: FoldSession): Promise<string | undefined> {
  const result = await captureFoldStep(
    session,
    { sequence: 'fold-a', step: 'fstep-1', moment: 'before', render: FOLD_PULL_RENDER },
    { t }
  );
  if (result.status !== 'captured') throw new Error(`not captured: ${JSON.stringify(result)}`);
  return result.source.sentence;
}

describe('a Fold step captured for the Diagram, worded as Fold words it (D17)', () => {
  it('names an inside reverse fold’s mover first, from the line its compound report folded along', async () => {
    const session = await sessionOf(REVERSE);
    // The session holds the line in the compound report alone, as the bridge lands one.
    expect(selectFoldNode(session.store.getState(), 'fstep-1')).toMatchObject({
      status: 'ok',
      report: null,
      compound: { family: 'reverse' },
    });
    const sentence = await capturedSentence(session);
    expect(sentence).toBe('Inside reverse fold, bringing the top-left corner onto the bottom-right corner, through all layers.');
    expect(sentence).toBe(stripSentence(session, REVERSE));
  });

  it('names a crimp’s mover first, from its first line', async () => {
    const session = await sessionOf(CRIMP);
    const sentence = await capturedSentence(session);
    expect(sentence).toContain('bringing the top-left corner onto the bottom-right corner');
    expect(sentence).toBe(stripSentence(session, CRIMP));
  });

  it('says an unfold stored as a valley fold along a bend unfolds, as the engine reported', async () => {
    const UNFOLD: FoldOp = {
      kind: 'valley',
      landing: { kind: 'outer' },
      line: { via: 'crease', at: [0.5, 0.5] },
      seed: { scope: 'depth', at: [0.25, 0.75], layers: 1 },
    };
    const session = await sessionOf(UNFOLD, { created: [], unfolded: [4], refolded: [] });
    const sentence = await capturedSentence(session);
    expect(sentence).toBe('Unfold the top layer.');
    expect(sentence).toBe(stripSentence(session, UNFOLD));
  });
});
