import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Bird, BookOpen, CirclePlay, Link2, PenTool, Plus } from 'lucide-react';
import { trackDiagramTutorialOpened } from '../../analytics';
import type { DiagramImportWayId } from '../../diagram/actions/diagramImportWays';
import { DIAGRAM_TUTORIAL_URL } from '../../diagram/example/diagramExample';
import { useOpenDiagramExample } from '../../diagram/example/useOpenDiagramExample';
import { Button, ButtonLink } from '../ui/Button';
import { externalAnchorProps } from '../ui/ExternalAnchor';
import { DiagramImportMenu } from './DiagramImportMenu';
import styles from './DiagramEmptyState.module.css';

/**
 * A diagram with no steps yet. Useful with no crease pattern at all: a step can
 * be written before it has a picture, or start from a drawing, so the ways in
 * are to add one, or to import — files (or drop them here), cards from
 * References or steps from Fold, under one Import menu — and, with a crease
 * pattern open, to link a step to one of its patterns; with none open, Go to
 * Edit stands in for that (D12). The diagram itself comes into being with
 * that first step, never on open.
 *
 * Under them, for someone new to diagrams, a finished one to open — the
 * example crane, opened as any file is — and the video walkthrough.
 */
export function DiagramEmptyState({
  readOnly,
  dropTarget,
  onAddStep,
  onImport,
  patternOpen,
  foldSteps,
  onLink,
  onGoToEdit,
}: {
  readOnly: boolean;
  /** Pictures are being dragged over it. */
  dropTarget: boolean;
  onAddStep: () => void;
  /**
   * A row of the Import menu: the step import dialog, or the References or
   * Fold browser, whose cards or steps become the first steps.
   */
  onImport: (way: DiagramImportWayId) => void;
  /** A crease pattern is open to link a step to. */
  patternOpen: boolean;
  /** The project's Fold sequence has a step to take. */
  foldSteps: boolean;
  /** Add a step and choose its pattern. */
  onLink: () => void;
  /** Go to Edit, to open or draw the crease pattern a step links to. */
  onGoToEdit: () => void;
}) {
  const { t } = useTranslation();
  const example = useOpenDiagramExample();
  return (
    <div className={styles.state} data-drop-target={dropTarget || undefined}>
      <div className={styles.icon} aria-hidden="true">
        <BookOpen size={22} />
      </div>
      <h2 className={styles.title}>{t('panels:diagram.empty.title', 'Start a diagram')}</h2>
      <p className={styles.message}>
        {t(
          'panels:diagram.empty.message',
          'A diagram is your folding sequence, one step at a time. Add a step, then give it a picture and an instruction — or import crease patterns, pictures or a Defox project.'
        )}
      </p>
      <div className={styles.actions}>
        <Button variant="primary" disabled={readOnly} onClick={onAddStep}>
          <Plus size={15} aria-hidden="true" />
          {t('panels:diagram.empty.addStep', 'Add step')}
        </Button>
        <DiagramImportMenu
          from="empty_state"
          disabled={readOnly}
          patternOpen={patternOpen}
          foldSteps={foldSteps}
          onChoose={onImport}
        />
        {patternOpen && (
          <Button variant="secondary" disabled={readOnly} onClick={onLink}>
            <Link2 size={15} aria-hidden="true" />
            {t('panels:diagram.empty.link', 'Link a pattern…')}
          </Button>
        )}
        {!patternOpen && (
          <Button variant="ghost" onClick={onGoToEdit}>
            <PenTool size={15} aria-hidden="true" />
            {t('panels:diagram.empty.goToEdit', 'Go to Edit')}
          </Button>
        )}
      </div>
      <div className={styles.learn}>
        <p className={styles.learnLabel}>{t('panels:diagram.empty.learn', 'New to diagrams?')}</p>
        <div className={styles.actions}>
          {/* Not read-only's to refuse: it opens another file, as File › Open does. */}
          <Button variant="ghost" disabled={example.opening} onClick={example.open}>
            <Bird size={15} aria-hidden="true" />
            {example.opening
              ? t('panels:diagram.empty.openingExample', 'Opening the example…')
              : t('panels:diagram.empty.openExample', 'Open the example crane')}
          </Button>
          <ButtonLink variant="ghost" {...externalAnchorProps(DIAGRAM_TUTORIAL_URL, () => trackDiagramTutorialOpened())}>
            <CirclePlay size={15} aria-hidden="true" />
            {t('panels:diagram.empty.tutorial', 'Watch the walkthrough')}
            <ArrowUpRight size={13} aria-hidden="true" />
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
