import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { sequenceOf, step, valleyAt } from '../../fold/document/foldSequence.fixtures';
import type { FoldStepNode } from '../../fold/document/foldSequenceDocument';
import { foldNodeSentenceStep } from '../../fold/sequence/foldSentenceStep';
import { foldPathEntries } from '../../fold/sequence/foldSequencePath';
import { FOLD_PENDING_NODE, type FoldSessionNode } from '../../fold/session/foldSessionState';
import { foldSendTargets } from './foldBrowserActions';
import { foldBrowserCards } from './foldPull';

const t = ((_key: string, fallback: string | Record<string, unknown>, options?: Record<string, unknown>) => {
  const text = typeof fallback === 'string' ? fallback : String(fallback.defaultValue ?? _key);
  return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String((options ?? (typeof fallback === 'object' ? fallback : {}))[name] ?? ''));
}) as unknown as TFunction;

const TURN: FoldStepNode = step('fstep-2', 'fstep-1', { kind: 'turn', axis: 'vertical' });
const NODES: FoldStepNode[] = [
  step('fstep-1', null, valleyAt(0.5)),
  TURN,
  step('fstep-3', 'fstep-2', valleyAt(0.25)),
  step('fstep-4', 'fstep-3', valleyAt(0.75)),
];
const SEQUENCE = sequenceOf(NODES);

const landed = (id: number): FoldSessionNode => ({
  status: 'ok',
  path: null,
  state: { generation: 0, id },
  fingerprint: `fs1:${id}`,
  summary: null,
  report: null,
  refusal: null,
});

/** The path as the session has it: every step landed but the last, still folding. */
function view(lastLanded = false) {
  const nodes = new Map<string, FoldSessionNode>([
    ['fstep-1', landed(1)],
    ['fstep-2', landed(2)],
    ['fstep-3', landed(3)],
    ['fstep-4', lastLanded ? landed(4) : FOLD_PENDING_NODE],
  ]);
  const entries = foldPathEntries(SEQUENCE, NODES.map((node) => node.id), landed(0), nodes, FOLD_PENDING_NODE);
  return {
    entries,
    frames: entries.map(() => null),
    words: entries.map((entry) =>
      entry.node ? foldNodeSentenceStep(entry.node, { parent: null, child: null, report: null }) : { op: 'unknown' as const }
    ),
  };
}

describe('the Fold browser’s cards (D17)', () => {
  it('lists every step after the sheet — a turn as a turn — then Finished, each with what it adds', () => {
    const cards = foldBrowserCards(t, view(true));
    expect(cards.map((card) => [card.index, card.kind, card.number])).toEqual([
      [0, 'fold', 1],
      [1, 'turn-over', null],
      [2, 'fold', 2],
      [3, 'fold', 3],
      [4, 'done', null],
    ]);
    expect(cards.map((card) => card.step)).toEqual([
      { kind: 'step', step: 'fstep-1', moment: 'before' },
      { kind: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } },
      { kind: 'step', step: 'fstep-3', moment: 'before' },
      { kind: 'step', step: 'fstep-4', moment: 'before' },
      { kind: 'step', step: 'fstep-4', moment: 'after' },
    ]);
    expect(cards[1]!.sentence).toContain('Turn');
  });

  it('lists a step Fold has not landed, and offers nothing for it — nor Finished after it', () => {
    const cards = foldBrowserCards(t, view(false));
    expect(cards[3]!.step).toBeNull();
    expect(cards[4]!.step).toBeNull();
  });

  it('has no Finished for a path that only turns', () => {
    const turnOnly = sequenceOf([{ ...TURN, parent: null }]);
    const entries = foldPathEntries(turnOnly, ['fstep-2'], landed(0), new Map([['fstep-2', landed(2)]]), FOLD_PENDING_NODE);
    const cards = foldBrowserCards(t, { entries, frames: entries.map(() => null), words: entries.map(() => ({ op: 'unknown' as const })) });
    expect(cards.map((card) => card.kind)).toEqual(['turn-over']);
  });
});

describe('Send to Diagram from Fold (D17)', () => {
  const path = [NODES[0]!, NODES[1]!, NODES[2]!];

  it('sends the step on screen alone: the state before it, or a turn as a turn', () => {
    expect(foldSendTargets(path, 'step')).toEqual([{ kind: 'step', step: 'fstep-3', moment: 'before' }]);
    expect(foldSendTargets(path.slice(0, 2), 'step')).toEqual([{ kind: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } }]);
  });

  it('sends every step to it, then Finished: the state it leaves', () => {
    expect(foldSendTargets(path, 'path')).toEqual([
      { kind: 'step', step: 'fstep-1', moment: 'before' },
      { kind: 'turn', turn: { kind: 'turn-over', axis: 'vertical' } },
      { kind: 'step', step: 'fstep-3', moment: 'before' },
      { kind: 'step', step: 'fstep-3', moment: 'after' },
    ]);
  });

  it('sends nothing from the flat sheet', () => {
    expect(foldSendTargets([], 'step')).toEqual([]);
    expect(foldSendTargets([], 'path')).toEqual([]);
  });
});
