import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const menu = vi.hoisted(() => ({ handleMenuAction: vi.fn(async () => true) }));
vi.mock('../../../commands/menuActions', () => ({ handleMenuAction: menu.handleMenuAction }));

import { sequenceOf, step, valleyAt } from '../../../fold/document/foldSequence.fixtures';
import type { FoldSequenceDocument } from '../../../fold/document/foldSequenceDocument';
import { foldPathEntries } from '../../../fold/sequence/foldSequencePath';
import type { FoldSequenceView } from '../../../fold/sequence/useFoldSequenceView';
import { FOLD_PENDING_NODE } from '../../../fold/session/foldSessionState';
import { FoldStepsGrid } from './FoldStepsGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A valley, a turn that folds from it, then two more steps: the turn is not the tip. */
const DOCUMENT = sequenceOf([
  step('a', null, valleyAt(0.5)),
  step('t', 'a', { kind: 'turn', axis: 'vertical' }),
  step('b', 't', valleyAt(0.25)),
  step('c', 'b', valleyAt(0.75)),
]);

function viewOf(document: FoldSequenceDocument, path: string[], readOnly = false): FoldSequenceView {
  const entries = foldPathEntries(document, path, FOLD_PENDING_NODE, new Map(), FOLD_PENDING_NODE);
  return {
    document,
    exists: true,
    paper: document.paper,
    readOnly,
    entries,
    frames: entries.map(() => null),
    words: [],
    cursor: 0,
    pending: null,
    progress: { replaying: false, activeSettled: 0, activeTotal: 0, settled: 0, total: 0 },
    failed: false,
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  menu.handleMenuAction.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Each card's id and what its corner's Delete says. */
function deleteLabels(): [string, string | null][] {
  return [...host.querySelectorAll<HTMLElement>('[data-step-id]')].map((card) => [
    card.dataset.stepId ?? '',
    card.querySelector('button[title]')?.getAttribute('title') ?? null,
  ]);
}

describe('FoldStepsGrid', () => {
  it('says what each card’s Delete takes: a turn takes the steps that fold from it, the tip only itself', () => {
    act(() => root.render(<FoldStepsGrid view={viewOf(DOCUMENT, ['a', 't', 'b', 'c'])} />));
    expect(deleteLabels()).toEqual([
      ['', null],
      ['a', 'Delete this step and what follows'],
      ['t', 'Delete this step and what follows'],
      ['b', 'Delete this step and what follows'],
      ['c', 'Delete this step'],
    ]);
  });

  it('names a turn at the tip as its own delete, and runs the one Delete verb from it', () => {
    const document = sequenceOf([step('a', null, valleyAt(0.5)), step('t', 'a', { kind: 'turn', axis: 'vertical' })]);
    act(() => root.render(<FoldStepsGrid view={viewOf(document, ['a', 't'])} />));
    expect(deleteLabels().at(-1)).toEqual(['t', 'Delete this step']);
    act(() => host.querySelector<HTMLButtonElement>('[data-step-id="t"] button[title]')?.click());
    expect(menu.handleMenuAction).toHaveBeenCalledWith('fold.delete-step');
  });

  it('offers no Delete on a sequence a newer build wrote', () => {
    act(() => root.render(<FoldStepsGrid view={viewOf(DOCUMENT, ['a', 't', 'b', 'c'], true)} />));
    expect(deleteLabels().every(([, label]) => label === null)).toBe(true);
  });
});
