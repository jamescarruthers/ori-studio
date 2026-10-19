import { useTranslation } from 'react-i18next';
import { isLockedStep, type DiagramStep } from '../../diagram/document/diagramDocument';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { TextAreaRow } from '../ui/fieldRows';

/**
 * Longest instruction the field takes. A guard against a paste of something
 * that was never an instruction, not a format rule: a page shows five lines of
 * one, and a longer one is cut there with a notice (Phase 5).
 */
const INSTRUCTION_MAX_LENGTH = 1000;

/**
 * A step's instruction, in a section of its own: the Step pane's, and the
 * Pages view's Layers inspector's (Zach, 2026-10-19) — one field, so the two
 * never drift. A sitting at it is one undo step; a step of a newer build, or
 * a diagram that cannot change, shows it without taking edits.
 */
export function DiagramStepInstruction({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const loadId = useWorkspaceStore((state) => state.diagramLoadId);
  const setStepText = useWorkspaceStore((state) => state.setDiagramStepText);
  return (
    <CollapsibleSection title={t('panels:diagram.stepPane.instruction', 'Instruction')}>
      <TextAreaRow
        // One field per step: a draft never carries over to the next one.
        key={step.id}
        label={t('panels:diagram.stepPane.instructionLabel', 'Instruction')}
        labelHidden
        value={step.text}
        placeholder={t('panels:diagram.stepPane.instructionPlaceholder', 'Describe this step…')}
        rows={4}
        maxLength={INSTRUCTION_MAX_LENGTH}
        disabled={readOnly || isLockedStep(step)}
        onCommit={(text, session) => setStepText(step.id, text, { loadId, session })}
      />
    </CollapsibleSection>
  );
}
