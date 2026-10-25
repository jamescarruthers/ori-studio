/**
 * The Layer order dialog on a Diagram step
 * (`implementation-plans/layer-order-dialog.md`, row H7): the Step pane's
 * Edit… and the Picture section's Review… (D14) open it on the step's flat
 * fold, and an Apply commits the order it hands back, as one undo step.
 *
 * - **Opening is a user action**, so it may fold (approach 5): the step's
 *   creases are folded as a capture folds them, as a visible, stoppable run,
 *   for what the dialog analyses — the source the kernel folded, and the
 *   paper scene it draws — and the figure is freed. Nothing is folded on
 *   render or selection; what the pane shows at rest is the record's.
 * - **The request** is the step's: its source, its record in the crease
 *   pattern's coordinates (through the step's paper frame), and the
 *   Diagram's look — the diagram's style as its steps are painted, the step's
 *   turn and side, no spread (D18). With no record, the scene it shows, so
 *   the dialog opens on the order the step draws.
 * - **Only `applied` writes** (D16): the order is folded as the dialog
 *   analysed it (`fold_with_order`) and committed with its record, as a
 *   capture is, one undo step. `unchanged`, `cancelled`, `busy` and
 *   `unavailable` write nothing.
 */
import { toast } from 'sonner';
import { ensureCpSheetIndex } from '../../cp-workspace/sheets/cpSheetIndex';
import { resolveFoldRoute } from '../../cp-workspace/folded/foldRoute';
import i18n from '../../i18n';
import { openLayerOrderDialog } from '../../layer-order/dialog/layerOrderDialogGateway';
import { lineContentFingerprint } from '../../lib/creaseFingerprint';
import type { LayerOrderApplied, LayerOrderLook, LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { layerOrderRecordToSource, type PaperFrame } from '../../lib/layerOrder/paperFrame';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  beginStepCapture,
  captureFailure,
  endStepCapture,
  runStepFold,
  type DiagramCaptureOutcome,
} from '../../store/workspaceStore/diagramCapture';
import {
  isLockedStep,
  stepById,
  stepNumber,
  type DiagramCpRender,
  type DiagramCpSource,
  type DiagramStyle,
} from '../document/diagramDocument';
import { DIAGRAM_STYLE_POLICY, diagramScenePaintStyle } from '../pictures/diagramPaperStyle';
import { chooseStepCreases, knownCreasesOf } from './captureCreases';
import { captureModel } from './captureFolded';
import { stepFoldSource, stepLayerOrderOf } from './captureLayerOrder';
import { abandonOnEngineLoss } from './engineLoss';
import { sayCaptureOutcome } from './stepCaptureActions';

const store = { get: useWorkspaceStore.getState, set: useWorkspaceStore.setState };

/** The undo step an Apply makes. */
const APPLY_LABEL = 'Change layer order';

/**
 * The Diagram's look for a step (approach 3, D18): its paper as a folded
 * step is painted, read through the Diagram's policy, the step's turn, no
 * X-ray. Its side is the request's model's; its spread is the dialog's to
 * leave out.
 */
export function diagramStepLayerOrderLook(style: DiagramStyle, render: Extract<DiagramCpRender, { mode: 'folded-flat' }>): LayerOrderLook {
  return {
    style: diagramScenePaintStyle(style, false),
    policy: DIAGRAM_STYLE_POLICY,
    turnDeg: render.rotationDeg,
    xray: false,
  };
}

/** A request made for a step: what the dialog opens on, and what its Apply is checked against. */
interface StepLayerOrderOpening {
  request: LayerOrderRequest;
  frame: PaperFrame;
  /** The step and pattern it was made from: an Apply onto anything else commits nothing. */
  guard: { loadId: number; revision: number; content: string };
}

/** Fold the step's creases for the dialog, as a stoppable run, and build its request; or why it cannot open. */
async function openingFor(
  stepId: string,
  linked: DiagramCpSource & { render: Extract<DiagramCpRender, { mode: 'folded-flat' }> }
): Promise<StepLayerOrderOpening | DiagramCaptureOutcome | 'spatial'> {
  const start = beginStepCapture(store, stepId);
  if ('status' in start) return start;
  try {
    const document = start.cp.document;
    const sheets = await abandonOnEngineLoss(ensureCpSheetIndex(document));
    const choice = chooseStepCreases(document, linked.scope, sheets, knownCreasesOf(linked));
    if (choice.status !== 'found') return choice;
    const route = resolveFoldRoute(document, choice.creases.foldLineIds);
    if (route.kind === 'none') return { status: 'missing' };
    if (route.kind === 'spatial') return 'spatial';
    const { render } = linked;
    const folded = await runStepFold(store, start, 'diagram-capture', (runtime) =>
      stepFoldSource(runtime, route.lineIds, captureModel(document, render.side))
    );
    const saved = stepLayerOrderOf(linked.layerOrder);
    const diagram = store.get().diagram;
    const number = diagram ? stepNumber(diagram, stepId) : null;
    return {
      request: {
        source: folded.source,
        record: saved ? layerOrderRecordToSource(saved.record, folded.frame) : null,
        look: diagramStepLayerOrderLook(start.style, render),
        // With a record the dialog restores it; with none, it opens on the order the step draws.
        ...(saved || !folded.scene ? {} : { shown: folded.scene }),
        ...(number !== null
          ? { name: i18n.t('panels:diagram.layerOrder.stepName', 'Step {{number}}', { number }) }
          : {}),
      },
      frame: folded.frame,
      guard: { loadId: start.guard.loadId, revision: start.guard.revision, content: lineContentFingerprint(document) },
    };
  } catch (error) {
    return captureFailure(error);
  } finally {
    endStepCapture(store, stepId);
  }
}

/**
 * Commit an order the dialog applied: folded as it was analysed, into the
 * step's picture, with its record, as one undo step — onto the step and
 * pattern it was opened on, or not at all.
 */
async function applyToStep(stepId: string, opening: StepLayerOrderOpening, applied: LayerOrderApplied): Promise<boolean> {
  const now = store.get();
  const step = now.diagram ? stepById(now.diagram, stepId) : null;
  const document = now.oristudioCpDocument?.document;
  const { loadId, revision, content } = opening.guard;
  if (step?.source?.kind !== 'cp' || step.source.render.mode !== 'folded-flat' || !document) return false;
  if (now.diagramLoadId !== loadId || step.revision !== revision || lineContentFingerprint(document) !== content) return false;
  const outcome = await now.captureDiagramStep(stepId, {
    scope: step.source.scope,
    known: knownCreasesOf(step.source),
    render: step.source.render,
    kind: 'diagram-capture',
    label: APPLY_LABEL,
    layerOrderApplied: { applied, frame: opening.frame },
  });
  sayCaptureOutcome(outcome);
  return outcome.status === 'captured';
}

/**
 * Open the Layer order dialog on a linked step shown folded flat — from the
 * Step pane's Edit…, or its flag's Review… (D14) — and commit an Apply.
 * Whether it applied an order.
 */
export async function openDiagramStepLayerOrder(stepId: string): Promise<boolean> {
  const state = store.get();
  const step = state.diagram ? stepById(state.diagram, stepId) : null;
  if (!step || isLockedStep(step) || state.diagramReadOnly || step.source?.kind !== 'cp') return false;
  const linked = step.source;
  if (linked.render.mode !== 'folded-flat') return false;
  const opening = await openingFor(stepId, { ...linked, render: linked.render });
  if (opening === 'spatial') {
    toast.message(
      i18n.t(
        'toasts:diagram.layerOrder.folds3d',
        'This step’s creases fold in 3D now, and layer order works on flat folds. Refresh the step to see it.'
      )
    );
    return false;
  }
  if (!('request' in opening)) {
    sayCaptureOutcome(opening);
    return false;
  }
  const outcome = await openLayerOrderDialog(opening.request);
  if (outcome.kind !== 'applied') return false;
  return applyToStep(stepId, opening, outcome.applied);
}
