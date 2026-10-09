import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useLayoutStore } from '../../store/layoutStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramFoldBrowserState } from '../../store/workspaceStore/types';
import { useFoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import {
  anchorTakesCard,
  stepNumber,
  stepNumbers,
  stepsAround,
  stepsOf,
  type DiagramDocument,
  type DiagramPullAnchor,
} from '../document/diagramDocument';
import { pullableCards } from '../references/referencesBrowserSelection';
import { usePullSelection, type PullSelection } from '../references/usePullSelection';
import { pullFromFold } from './foldBrowserActions';
import { foldBrowserCards, type FoldBrowserCard, type FoldPullTarget } from './foldPull';

/** Where the Fold browser's list stands. */
export type FoldBrowserCardsState =
  /** The project has no Fold sequence with a step. */
  | { status: 'empty' }
  | { status: 'ready'; sequence: string; cards: readonly FoldBrowserCard[] };

/**
 * Where the Fold browser's steps come from and how they are added (plan
 * D17): the app's Fold session ({@link APP_FOLD_PROVIDER}), or a fake one in a
 * test. `useCards` is a hook, called once per render of the browser.
 */
export interface FoldBrowserProvider {
  /** The shown sequence's active path as cards, kept current. */
  useCards: () => FoldBrowserCardsState;
  /** Add `targets` where `anchor` says, from the browser opening `opening`; how many entries it added. */
  pull: (targets: readonly FoldPullTarget[], anchor: DiagramPullAnchor, opening: number) => Promise<number>;
  /** Show Fold. */
  openFold: () => void;
}

/** The Fold session's shown sequence as cards: held while the browser is open, so it replays. */
function useAppFoldCards(): FoldBrowserCardsState {
  const { t } = useTranslation();
  useEffect(() => foldSession().retain(), []);
  const view = useFoldSequenceView();
  const { entries, frames, words, exists, document } = view;
  return useMemo(
    () =>
      exists && document.steps.length > 0
        ? { status: 'ready', sequence: document.id, cards: foldBrowserCards(t, { entries, frames, words }) }
        : { status: 'empty' },
    [t, exists, document, entries, frames, words]
  );
}

/** The app's Fold browser: the Fold session, and a pull that captures from it into the diagram. */
export const APP_FOLD_PROVIDER: FoldBrowserProvider = {
  useCards: useAppFoldCards,
  pull: (targets, anchor, opening) => pullFromFold(targets, anchor, { via: 'diagram_browser', opening }),
  openFold: () => useLayoutStore.getState().activateWorkspace('fold'),
};

export interface FoldBrowser extends PullSelection {
  state: DiagramFoldBrowserState;
  cards: FoldBrowserCardsState;
  /** The steps already made from a card of the sequence shown: card index to step number. */
  inDiagram: ReadonlyMap<number, number>;
  /** The entries the selection would add, in order. */
  pullable: FoldPullTarget[];
  pulling: boolean;
  /** The turn just before the selection, offered with it. */
  turnOverBefore: number | null;
  withTurnOver: boolean;
  setWithTurnOver: (value: boolean) => void;
  /** The diagram's step the anchor names, 1-based; null for the end. */
  anchorNumber: number | null;
  /** Whether the anchor's own step takes the first step: an empty step to fill, while it still is one. */
  anchorTakesFirst: boolean;
  add: () => void;
  close: () => void;
  openFold: () => void;
}

/**
 * The Fold browser, a modal over the Diagram (plan D17), as the References
 * browser is (D20): the shown Fold sequence's active path as cards, the
 * selection (`usePullSelection`), and the pull, bound to the store. Every
 * card can be chosen once its step has landed; Finished, once the path ends
 * on a step that folds.
 */
export function useFoldBrowser(state: DiagramFoldBrowserState, provider: FoldBrowserProvider = APP_FOLD_PROVIDER): FoldBrowser {
  const diagram = useWorkspaceStore((store) => store.diagram);
  const cards = provider.useCards();
  const shown = cards.status === 'ready' ? cards.cards : NO_CARDS;
  const listKey = cards.status === 'ready' ? cards.sequence : '';
  const { selection, ...choose } = usePullSelection(shown, listKey, null, true);
  const [withTurnOver, setWithTurnOver] = useState(true);
  const { pullable, turnOverBefore } = useMemo(
    () => pullableCards(shown, selection.indices, { finished: true, withTurnOver }),
    [shown, selection.indices, withTurnOver]
  );
  const inDiagram = useMemo(
    () => (cards.status === 'ready' ? diagramUse(diagram, cards.sequence, shown) : NO_USE),
    [diagram, cards, shown]
  );
  // Each step is captured as the pull lands: held meanwhile, so a second press cannot add them twice.
  const [pulling, setPulling] = useState(false);
  const { pull } = provider;
  const add = useCallback(() => {
    if (pullable.length === 0 || pulling) return;
    setPulling(true);
    void pull(pullable, state.anchor, state.opening).finally(() => setPulling(false));
  }, [pull, pullable, pulling, state.anchor, state.opening]);
  const anchorStep = 'stepId' in state.anchor ? state.anchor.stepId : null;
  // After a turn, the step before it: the steps go after both.
  const anchorNumber =
    diagram && anchorStep !== null ? (stepNumber(diagram, anchorStep) ?? stepsAround(diagram, anchorStep).before) : null;
  return {
    state,
    cards,
    inDiagram,
    selection,
    ...choose,
    pullable,
    pulling,
    turnOverBefore,
    withTurnOver,
    setWithTurnOver,
    anchorNumber,
    anchorTakesFirst: anchorTakesCard(diagram, state.anchor),
    add,
    close: () => useWorkspaceStore.getState().closeDiagramFoldBrowser(),
    openFold: () => {
      useWorkspaceStore.getState().closeDiagramFoldBrowser();
      provider.openFold();
    },
  };
}

const NO_CARDS: readonly FoldBrowserCard[] = [];
const NO_USE: ReadonlyMap<number, number> = new Map();

/** The steps the diagram already made from the shown sequence's cards: card index to the first such step's number. */
function diagramUse(
  diagram: DiagramDocument | null,
  sequence: string,
  cards: readonly FoldBrowserCard[]
): Map<number, number> {
  const used = new Map<number, number>();
  if (!diagram) return used;
  const numbers = stepNumbers(diagram);
  for (const step of stepsOf(diagram)) {
    const source = step.source;
    if (source?.kind !== 'fold-step' || source.sequence !== sequence) continue;
    const card = cards.find(
      (candidate) =>
        candidate.step?.kind === 'step' && candidate.step.step === source.step && candidate.step.moment === source.moment
    );
    if (card && !used.has(card.index)) used.set(card.index, numbers.get(step.id)!);
  }
  return used;
}
