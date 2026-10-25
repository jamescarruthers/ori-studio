import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  buildDiagramStepLayerOrderFlag,
  buildDiagramStepLayerOrderRow,
  type DiagramStepLayerOrderFlag,
  type DiagramStepLayerOrderRow,
  type DiagramStepLayerOrderState,
} from '../actions/diagramStepLayerOrderActions';
import { isLockedStep, type DiagramStep } from '../document/diagramDocument';
import { stepLayerOrderOf } from './captureLayerOrder';
import { openDiagramStepLayerOrder } from './stepLayerOrderActions';

export interface DiagramStepLayerOrder {
  /** The Step pane's Layer order row's Edit… and note; null for a step with no such row. */
  row: DiagramStepLayerOrderRow | null;
  /** The Picture section's flag, while the step's constraints need a look; null otherwise. */
  flag: DiagramStepLayerOrderFlag | null;
}

const NONE: DiagramStepLayerOrder = { row: null, flag: null };

/**
 * A linked step's way into the Layer order dialog (H7), bound to the store:
 * the Step pane's row and the Picture section's flag
 * (`diagramStepLayerOrderActions.ts`), read from the step's saved source —
 * opening a diagram or selecting a step asks the engine nothing. Edit… and
 * Review… open the dialog (`stepLayerOrderActions.ts`).
 */
export function useDiagramStepLayerOrder(step: DiagramStep | null): DiagramStepLayerOrder {
  const { t } = useTranslation();
  const source = step && !isLockedStep(step) && step.source?.kind === 'cp' ? step.source : null;
  const stepId = source ? step!.id : null;
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const busy = useWorkspaceStore((state) => stepId !== null && Object.hasOwn(state.diagramCaptures, stepId));
  const layerOrder = source?.layerOrder;
  const record = useMemo(() => {
    const read = stepLayerOrderOf(layerOrder);
    return read ? { constraints: read.record.constraints.length, attention: read.record.attention ?? null } : null;
  }, [layerOrder]);
  const render = source?.render ?? null;
  const seeThrough = render?.mode === 'folded-flat' && step?.picture?.kind === 'fixed';
  return useMemo((): DiagramStepLayerOrder => {
    if (!render || stepId === null) return NONE;
    const state: DiagramStepLayerOrderState = { render, record, readOnly, busy, seeThrough };
    const deps = { t, open: () => void openDiagramStepLayerOrder(stepId) };
    return { row: buildDiagramStepLayerOrderRow(state, deps), flag: buildDiagramStepLayerOrderFlag(state, deps) };
  }, [render, record, readOnly, busy, seeThrough, stepId, t]);
}
