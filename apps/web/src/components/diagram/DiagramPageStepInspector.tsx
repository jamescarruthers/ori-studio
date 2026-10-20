import { PenLine, Rotate3d, RotateCcw, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { diagramStepChoice, diagramStepCommand, type DiagramStepCommand } from '../../diagram/actions/diagramActions';
import { useCreasePatternSide } from '../../diagram/capture/useCreasePatternSide';
import { isLockedStep, stepNumber, type DiagramStep } from '../../diagram/document/diagramDocument';
import { resetPlacement } from '../../diagram/pages/placementActions';
import type { PagePart } from '../../diagram/pages/pagePlacement';
import { useDiagramPoseActions, useDiagramStepActions } from '../../diagram/useDiagramActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { IconButton } from '../ui/IconButton';
import { DiagramInspectorCrumb, DiagramInspectorHeader } from './DiagramInspectorHeader';
import { DiagramStepInstruction } from './DiagramStepInstruction';
import { DiagramStepPlacement } from './DiagramStepPlacement';
import { DiagramStepPose } from './DiagramStepPose';
import { DiagramStepShowAs } from './DiagramStepShowAs';

/**
 * The Pages view's Layers inspector for the selected step (Zach, 2026-10-19):
 * a header naming it, and the part selected — "Step 3 › Text" — with the
 * step's way into Pose and Annotate and Reset Layout as icons, as its card has
 * them; then its picture's main pose — Show as, a crease pattern's side, a
 * References step's way and side, a fold's turn and side
 * (`DiagramStepShowAs`, `DiagramStepPose` `main`); its instruction
 * (`DiagramStepInstruction`, the Step pane's own field); and last its
 * placement on the page (`DiagramStepPlacement`). The Step pane keeps all of
 * these too.
 */
export function DiagramPageStepInspector({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const number = useWorkspaceStore((state) => (state.diagram ? stepNumber(state.diagram, step.id) : null));
  const part: PagePart =
    useWorkspaceStore((state) => (state.diagramSelectedStepId === step.id ? state.diagramPagesPart : null)) ?? 'frame';
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const actions = useDiagramStepActions(step.id);
  const poseActions = useDiagramPoseActions(step.id);
  const side = useCreasePatternSide(step);
  const locked = isLockedStep(step);
  const labels: Record<PagePart, string> = {
    frame: t('panels:diagram.placement.frame', 'Frame'),
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  const stepName = t('panels:diagram.pages.step', 'Step {{number}}', { number: number ?? '' });
  // Whether it has a pose to show here: a way to be shown, or a References card's way and side.
  const posed =
    !locked &&
    (diagramStepChoice(actions, 'show-as') !== null ||
      (step.source?.kind === 'references-step' && step.picture?.kind === 'step-diagram'));
  return (
    <>
      <DiagramInspectorHeader
        title={part === 'frame' ? stepName : <DiagramInspectorCrumb parent={stepName} child={labels[part]} />}
        action={
          <>
            <CommandIcon command={diagramStepCommand(actions, 'adjust-pose')} icon={Rotate3d} />
            <CommandIcon command={diagramStepCommand(actions, 'annotate')} icon={PenLine} />
            <IconButton
              size="sm"
              title={t('panels:diagram.placement.resetLayout', 'Reset Layout')}
              aria-label={t('panels:diagram.placement.resetLayout', 'Reset Layout')}
              disabled={readOnly || (!step.place && !step.placeNewer)}
              onClick={() => resetPlacement(step.id, 'all')}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </IconButton>
          </>
        }
      />
      {posed && (
        <CollapsibleSection title={t('panels:diagram.stepPane.picture', 'Picture')}>
          <DiagramStepShowAs actions={actions} side={side} />
          <DiagramStepPose step={step} actions={poseActions} main />
        </CollapsibleSection>
      )}
      <DiagramStepInstruction step={step} />
      <DiagramStepPlacement step={step} />
    </>
  );
}

/**
 * One of the step's verbs from its catalog as an icon: refused rather than
 * disabled, saying why on hover, as the catalog's hint has it.
 */
function CommandIcon({ command, icon: Icon }: { command: DiagramStepCommand | null; icon: LucideIcon }) {
  if (!command) return null;
  return (
    <IconButton
      size="sm"
      title={command.disabled && command.hint ? command.hint : command.label}
      aria-label={command.label}
      aria-disabled={command.disabled || undefined}
      onClick={() => {
        if (!command.disabled) command.run();
      }}
    >
      <Icon size={15} aria-hidden="true" />
    </IconButton>
  );
}
