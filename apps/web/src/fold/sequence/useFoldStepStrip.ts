import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StepFilmstripWays } from '../../components/steps/StepFilmstrip';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { foldStepSpread } from '../document/foldStepSpread';
import { cycledBranch, foldPathMoves } from './foldSequencePath';
import { branchReadout, branchesLabel, moveLabel, replayNote, stripLabel } from './foldSequenceWords';
import { foldStripCards, type FoldStripCard } from './foldStripCards';
import { moveFoldReader } from './foldKeys';
import { foldCardPictureSource } from './useFoldCardPictures';
import type { FoldSequenceView } from './useFoldSequenceView';
import { useFoldRepeatUi } from '../repeat/foldRepeatUi';

/** Everything the strip takes but its pictures: the cards, which is active, the moves and their words. */
export interface FoldStepStripModel {
  cards: FoldStripCard[];
  active: number;
  label: string;
  note: string;
  onSelectStep: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPreviousWay: () => void;
  onNextWay: () => void;
  onShiftWay: (index: number, delta: -1 | 1) => void;
  previousWayLabel: string;
  nextWayLabel: string;
  previousWayDisabled: boolean;
  nextWayDisabled: boolean;
  waysLabel: string;
  wayReadout: (ways: StepFilmstripWays, short: boolean) => string;
  /** A phone's tap on the branch readout: the next branch, the first after the last (`cycledBranch`). */
  onCycleWay: () => void;
  cycleWayLabel: string;
  cycleWayDisabled: boolean;
}

const previous = () => void moveFoldReader('previous');
const next = () => void moveFoldReader('next');
const previousBranch = () => void moveFoldReader('previousBranch');
const nextBranch = () => void moveFoldReader('nextBranch');

/**
 * The step strip of the sequence on screen (plan D14): its cards, and the
 * moves its chevrons, its branch row and a swipe make — the same moves as the
 * keys (`moveFoldReader`), so the two cannot step differently.
 */
export function useFoldStepStrip(view: FoldSequenceView): FoldStepStripModel {
  const { t } = useTranslation();
  const { document, paper, entries, words, cursor, pending, progress, failed } = view;
  const repeating = useFoldRepeatUi((s) => s.opening);
  const repeatFirst = useFoldRepeatUi((s) => s.first);
  const rangeStart = repeating ? entries.findIndex((entry) => entry.id === repeatFirst) : -1;
  const rangeEnd = repeating ? entries.findIndex((entry) => entry.id === repeating.parent) : -1;
  // Each card pictures its landed state, kept by its fingerprint across replays, with
  // the layer spread the folded pane shows it with.
  const pictures = useMemo(
    () =>
      entries.map((entry) =>
        foldCardPictureSource(entry.session.state, entry.session.fingerprint, foldStepSpread(document, entry.id))
      ),
    [entries, document]
  );
  // The step a tool is folding lands under the step on screen, whose spread it takes.
  const pendingState = pending?.state ?? null;
  const pendingSpread = foldStepSpread(document, entries[cursor]?.id ?? null);
  const pendingPicture = useMemo(
    () => foldCardPictureSource(pendingState, null, pendingSpread),
    [pendingState, pendingSpread]
  );
  const { cards, active } = useMemo(
    () =>
      foldStripCards(t, {
        paper,
        entries,
        words,
        pictures,
        cursor,
        pending: pending && {
          refused: pending.status === 'refused',
          words: pending.words,
          picture: pendingPicture,
          branch: pending.branch,
        },
      }),
    [t, paper, entries, words, pictures, cursor, pending, pendingPicture]
  );
  const moves = foldPathMoves(entries, cursor);

  const onSelectStep = useCallback(
    (index: number) => {
      const entry = cards[index]?.entry;
      // The step being folded is not a step yet: there is nothing to go to.
      if (entry === null || entry === undefined) return;
      if (repeating) {
        if (entry > 0 && entry <= rangeEnd) useFoldRepeatUi.getState().setFirst(entries[entry]!.id!);
        return;
      }
      useWorkspaceStore.getState().moveFoldCursor(entries[entry]?.id ?? null);
    },
    [cards, entries, repeating, rangeEnd]
  );
  const onShiftWay = useCallback(
    // The strip has put the reader on the card first.
    (_index: number, delta: -1 | 1) => {
      if (!repeating) void moveFoldReader(delta > 0 ? 'nextBranch' : 'previousBranch');
    },
    [repeating]
  );
  const wayReadout = useCallback(
    (ways: StepFilmstripWays, short: boolean) => branchReadout(t, ways.index, ways.count, short),
    [t]
  );
  const cycled = cycledBranch(entries, cursor);
  const onCycleWay = useCallback(() => {
    if (!repeating && cycled !== undefined) useWorkspaceStore.getState().moveFoldCursor(cycled);
  }, [repeating, cycled]);

  return {
    cards: repeating ? cards.map((card) => ({ ...card,
      repeatSource: card.entry !== null && rangeStart > 0 && card.entry >= rangeStart && card.entry <= rangeEnd,
    })) : cards,
    active,
    label: stripLabel(t),
    note: replayNote(t, progress, failed),
    onSelectStep,
    onPrevious: previous,
    onNext: next,
    previousLabel: moveLabel(t, 'previous'),
    nextLabel: moveLabel(t, 'next'),
    previousDisabled: !!repeating || moves.previous === undefined,
    nextDisabled: !!repeating || moves.next === undefined,
    onPreviousWay: previousBranch,
    onNextWay: nextBranch,
    onShiftWay,
    previousWayLabel: moveLabel(t, 'previousBranch'),
    nextWayLabel: moveLabel(t, 'nextBranch'),
    previousWayDisabled: !!repeating || moves.previousBranch === undefined,
    nextWayDisabled: !!repeating || moves.nextBranch === undefined,
    waysLabel: branchesLabel(t),
    wayReadout,
    onCycleWay,
    cycleWayLabel: t('panels:fold.sequence.switchBranch', 'Switch branch'),
    cycleWayDisabled: !!repeating || cycled === undefined,
  };
}
