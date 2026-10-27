import type { TFunction } from 'i18next';
import type { DiagramStepActionId } from './diagramActions';

/**
 * The ways steps come in from elsewhere, as the Import menu offers them — on
 * the empty diagram and on an empty step's card: files through the step
 * import dialog, cards from the References browser, steps from the Fold
 * browser. Each is the step verb of the same name, so it is drawn with that
 * verb's icon (`DIAGRAM_ACTION_ICONS`) and labelled as the Step pane labels it.
 *
 * React-free and store-free, as the step catalog is (`diagramActions.ts`).
 */
export type DiagramImportWayId = Extract<DiagramStepActionId, 'import-steps' | 'from-references' | 'from-fold'>;

export interface DiagramImportWay {
  id: DiagramImportWayId;
  label: string;
  disabled: boolean;
  /** Why it is disabled. */
  hint?: string;
}

/** The step import dialog's way in, wherever it is offered as one of these. */
export function importFromFileLabel(t: TFunction): string {
  return t('panels:diagram.actions.importFromFile', 'From File (CP, Defox)…');
}

/**
 * The Import menu's rows. Each always shows, so the menu keeps its shape:
 * References needs a crease pattern open to plan its folds, and Fold a
 * sequence with a step to take, and each says so while it is not there.
 */
export function diagramImportWays(
  { patternOpen, foldSteps }: { patternOpen: boolean; foldSteps: boolean },
  t: TFunction
): DiagramImportWay[] {
  return [
    { id: 'import-steps', label: importFromFileLabel(t), disabled: false },
    {
      id: 'from-references',
      label: t('panels:diagram.actions.fromReferences', 'From References…'),
      disabled: !patternOpen,
      ...(patternOpen
        ? {}
        : { hint: t('panels:diagram.actions.noPatternReferencesHint', 'Open a crease pattern in Edit to plan its folds') }),
    },
    {
      id: 'from-fold',
      label: t('panels:diagram.fold.fromFold', 'From Fold…'),
      disabled: !foldSteps,
      ...(foldSteps ? {} : { hint: t('panels:diagram.fold.noStepsHint', 'Fold a step in Fold to take it from there') }),
    },
  ];
}
