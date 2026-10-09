import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { SheetThumbnail } from '../../../cp-workspace/sheets/sheetThumbnail';
import { DEFAULT_DIAGRAM_STYLE } from '../../../diagram/document/diagramDocument';
import { turnGlyphSvg } from '../../../diagram/annotate/turnGlyph';
import { handleMenuAction } from '../../../commands/menuActions';
import { FOLD_SHEET_KEY } from '../../../fold/document/foldStepTree';
import { foldCommandActionId } from '../../../fold/sequence/foldCommands';
import {
  foldGridEntries,
  isFoldGridTurn,
  type FoldGridStep,
  type FoldGridTurn,
} from '../../../fold/sequence/foldGridEntries';
import { foldedStepCount, type FoldPathEntry } from '../../../fold/sequence/foldSequencePath';
import { sheetBadge, sheetSentence, statusBadge, stepCountLabel } from '../../../fold/sequence/foldSequenceWords';
import { setFoldView } from '../../../fold/sequence/foldViewMode';
import { useFoldStepMenu } from '../../../fold/sequence/useFoldStepMenu';
import type { FoldSequenceView } from '../../../fold/sequence/useFoldSequenceView';
import { foldStepSentence, type FoldSentenceStep } from '../../../fold/stepSentence';
import { operationBadge } from '../../../fold/stepWords';
import type { TurnKind } from '../../../lib/steps/turn';
import { useWorkspaceStore } from '../../../store/workspaceStore/store';
import { DiagramSheetThumbnail } from '../../diagram/DiagramSheetThumbnail';
import { ContextMenu } from '../../ui/ContextMenu';
import { StepCard, StepCardBadge, StepCardDeleteVerb, StepCardPlaceholder } from '../../ui/steps/StepCard';
import { StepsGrid, type StepsGridCardProps } from '../../ui/steps/StepsGrid';
import { TurnCard } from '../../ui/steps/TurnCard';
import styles from './FoldStepsGrid.module.css';

/** Put the reader on a card's step: the sheet's key is the sheet. */
const select = (key: string | null) => {
  if (key !== null) useWorkspaceStore.getState().moveFoldCursor(key === FOLD_SHEET_KEY ? null : key);
};

/** A double-click: that step, folded, on the canvas. */
const open = (key: string) => {
  select(key);
  setFoldView('fold');
};

/** A card's Delete: the step and what follows it, through the verb every surface runs. */
const remove = (key: string) => {
  select(key);
  void handleMenuAction(foldCommandActionId('delete-step'));
};

const stepKeyAt = (target: Element) => target.closest<HTMLElement>('[data-step-id]')?.dataset.stepId ?? null;

/** A turn's glyph as its card shows it, drawn as a Diagram page prints it. */
function turnGlyph(turn: TurnKind): string | null {
  const svg = turnGlyphSvg(turn, DEFAULT_DIAGRAM_STYLE);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}

/**
 * The Steps view (plan D14, shot-steps): the sheet and every step of the path
 * as cards — its crease pattern, number, sentence and standing — on the shared
 * Steps grid. A turn is a card of its own, numbered none. Selecting a card
 * puts the reader there; a double-click goes back to the fold at that step; a
 * right-click offers the step's verbs.
 */
export function FoldStepsGrid({ view }: { view: FoldSequenceView }) {
  const { t } = useTranslation();
  const { entries, frames, words, cursor, readOnly, paper } = view;
  const gridEntries = useMemo(() => foldGridEntries(entries), [entries]);
  const glyphs = useMemo(
    () => new Map(gridEntries.filter(isFoldGridTurn).map((entry) => [entry.id, turnGlyph(entry.turn)])),
    [gridEntries]
  );
  const menu = useFoldStepMenu(stepKeyAt);

  return (
    <div className={styles.view} onContextMenu={menu.onContextMenu}>
      <div className={styles.heading}>
        <h2 className={styles.title}>{t('panels:fold.grid.title', 'Crease pattern by step')}</h2>
        <span className={styles.count}>{stepCountLabel(t, foldedStepCount(entries))}</span>
        <span className={styles.legend} aria-hidden="true">
          <span className={styles.key} data-role="mountain">
            {t('panels:fold.grid.mountain', 'Mountain')}
          </span>
          <span className={styles.key} data-role="valley">
            {t('panels:fold.grid.valley', 'Valley')}
          </span>
          <span className={styles.key} data-role="flat">
            {t('panels:fold.grid.flat', 'Flat')}
          </span>
        </span>
      </div>
      <StepsGrid<FoldGridStep, FoldGridTurn>
        entries={gridEntries}
        isTurn={isFoldGridTurn}
        label={t('panels:fold.grid.label', 'Steps')}
        selectedId={entries[cursor]?.key ?? null}
        onSelect={select}
        renderCard={(slot, card) =>
          slot.kind === 'turn' ? (
            <TurnCard
              turn={{ ...slot.entry.turn, id: slot.entry.id }}
              between={slot.entry.between}
              glyph={glyphs.get(slot.entry.id) ?? null}
              selected={card.selected}
              tabStop={card.tabStop}
              onSelect={select}
              onDelete={readOnly ? undefined : remove}
            />
          ) : (
            <FoldStepCard
              entry={entries[slot.entry.index]!}
              words={words[slot.entry.index] ?? { op: 'unknown' }}
              sheet={slot.entry.index === 0 ? sheetSentence(t, paper) : null}
              picture={frames[slot.entry.index]?.pattern ?? null}
              card={card}
              readOnly={readOnly}
            />
          )
        }
      />
      <ContextMenu
        open={menu.controller.open}
        x={menu.controller.x}
        y={menu.controller.y}
        items={menu.controller.items}
        onOpenChange={menu.controller.onOpenChange}
        onCloseAutoFocus={menu.controller.onCloseAutoFocus}
      />
    </div>
  );
}

/** One step's card, or the sheet's: its number and kind, its crease pattern, its sentence. */
function FoldStepCard({
  entry,
  words,
  sheet,
  picture,
  card,
  readOnly,
}: {
  entry: FoldPathEntry;
  words: FoldSentenceStep;
  /** The sheet's sentence, for the sheet's card. */
  sheet: string | null;
  picture: SheetThumbnail | null;
  card: StepsGridCardProps;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const status = statusBadge(t, entry.status);
  const kind = sheet !== null ? sheetBadge(t) : operationBadge(t, words);
  return (
    <StepCard
      id={entry.key}
      selected={card.selected}
      tabStop={card.tabStop}
      attributes={{ 'data-fold-status': entry.status }}
      title={String(entry.number ?? '')}
      kind={
        <>
          <StepCardBadge>{kind}</StepCardBadge>
          {status && <StepCardBadge>{status}</StepCardBadge>}
        </>
      }
      paper={false}
      verbs={
        entry.id !== null && !readOnly ? (
          <StepCardDeleteVerb label={t('panels:fold.grid.delete', 'Delete this step and what follows')} onDelete={() => remove(entry.key)} />
        ) : undefined
      }
      instruction={sheet ?? foldStepSentence(t, words)}
      onSelect={select}
      onOpen={open}
    >
      {picture ? (
        <DiagramSheetThumbnail thumbnail={picture} className={styles.picture} />
      ) : (
        <StepCardPlaceholder>
          {entry.status === 'locked' && <Lock size={18} aria-hidden="true" />}
          {placeholderWords(t, entry)}
        </StepCardPlaceholder>
      )}
    </StepCard>
  );
}

/** What a card says where its picture would be. */
function placeholderWords(t: TFunction, entry: FoldPathEntry): string {
  switch (entry.status) {
    case 'broken':
      return t('panels:fold.grid.broken', 'This step no longer folds');
    case 'brokenAbove':
      return t('panels:fold.grid.brokenAbove', 'A step before this one no longer folds');
    case 'locked':
      return t('panels:fold.grid.locked', 'Made with a newer Ori Studio');
    default:
      return t('panels:fold.grid.folding', 'Folding…');
  }
}
