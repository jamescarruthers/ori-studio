/**
 * "Layer order…" on an Edit folded figure (`implementation-plans/layer-order-dialog.md`,
 * row H3): open the Layer order dialog on the fold the figure shows, and
 * commit its Apply as one undo entry.
 *
 * - **On the press, never before.** The fold is read (or, for a figure
 *   reopened from a file, made: `prepareOristudioCpFigureLayerOrder`) only
 *   now, and the dialog's code and its worker only load when it opens
 *   (`layerOrderDialogGateway.ts`). When the fold can't be made, the dialog
 *   still opens, on the source and the record: it restores the record itself
 *   and says why in its own frames. Only an engine that never loaded at all
 *   is a toast, the one the gateway says (`sayLayerOrderUnavailable`).
 * - **One door.** The dialog is reached through its gateway alone, which
 *   answers every open; only `applied` writes. `unchanged`, `cancelled`,
 *   `busy` and `unavailable` leave the figure and the history as they were.
 * - **One undo entry.** Apply runs inside the folded layer's bracket, so it
 *   lands as "Set layer order" — or as nothing, when it changed nothing.
 *
 * React-free, as the figure's other verbs are (`foldedFigureVerbs.ts`), so the
 * toolbar, the context menu and the Properties pane run the same one.
 */
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import type { OristudioCpFoldedFigureEntry, OristudioCpFoldedFigureModel } from '../../engine/oristudioCpTypes';
import {
  openLayerOrderDialog,
  prefetchLayerOrderDialog,
  type LayerOrderDialogOutcome,
} from '../../layer-order/dialog/layerOrderDialogGateway';
import { sayLayerOrderUnavailable } from '../../layer-order/engine/layerOrderLoadFailure';
import { EDIT_PAPER_FRAME, layerOrderRecordToSource } from '../../lib/layerOrder/paperFrame';
import type { LayerOrderApplied, LayerOrderLook, LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { layerOrderSourceOf } from '../../lib/layerOrder/layerOrderSource';
import { radiansToDegrees, wrapDegrees } from '../../lib/angleUnits';
import {
  DEFAULT_ORISTUDIO_CP_LINE_STYLE,
  DEFAULT_ORISTUDIO_CP_LINE_WIDTH,
  type OristudioCpLineStyle,
} from '../../lib/creasePatternViewport';
import type { PaperStyle } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import { useSettingsStore } from '../../store/settingsStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { OristudioCpFigureLayerOrderOpening, WorkspaceState } from '../../store/workspaceStore/types';
import { effectiveObjectPaperStyle } from '../paper/objectPaperStyle';
import { foldedFigureGesture } from './foldedFigureGesture';
import { foldedFigureLayerOrderRecord } from './foldedFigureLayerOrderState';
import { foldPressMoved, foldPressMovedMessage, markFoldPress, type FoldPress } from './foldPress';

/** How a press ended: the dialog's answer, or that it never opened. */
export type FoldedFigureLayerOrderPress = LayerOrderDialogOutcome['kind'] | 'not-opened';

/** What the Edit canvas adds to a figure's look: the app's display style, how far the canvas is turned, its creases' pen. */
export interface EditFigureView {
  /** The app's display style: what a figure shows for a field it does not pin. */
  display: PaperStyle;
  /** The Edit camera's view rotation, in radians, clockwise on screen (`renderer/camera.ts`). */
  cameraRotation: number;
  /** The line style and width Edit's view draws creases in (`oristudioCpViewport`). */
  lineStyle: OristudioCpLineStyle;
  lineWidth: number;
}

/** Edit's view of the canvas, as `state` holds it. */
export function editFigureView(state: WorkspaceState): EditFigureView {
  return {
    display: useSettingsStore.getState().paperStyle.display,
    cameraRotation: state.oristudioCpCamera?.rotation ?? 0,
    lineStyle: state.oristudioCpViewport.lineStyle ?? DEFAULT_ORISTUDIO_CP_LINE_STYLE,
    lineWidth: state.oristudioCpViewport.lineWidth ?? DEFAULT_ORISTUDIO_CP_LINE_WIDTH,
  };
}

/**
 * What the dialog opens on for `figure`, from the fold its kernel answered
 * (`opening`) and the canvas it is on (`view`):
 *
 * - **the source** that fold folded, with the model the figure folds with;
 * - **its record**, its points in the crease pattern's coordinates (Edit's
 *   frame is the crease pattern's own);
 * - **Edit's look** (approach 3, D18): the figure's effective paper style
 *   (`effectiveObjectPaperStyle`), read through the flat figure's policy;
 *   on the side the figure shows, turned as the canvas shows it — the
 *   figure's own rotation and the canvas's — with X-ray on when the figure
 *   is drawn see-through (Transparent3), and the creases in Edit's line
 *   style and width;
 * - **what it shows** (`shown`), so the dialog opens on the order on the
 *   canvas (D19); left out when no fold could show it, and the dialog
 *   restores the record itself;
 * - **the figure's name**, and the surface for the dialog's analytics.
 */
export function foldedFigureLayerOrderRequest(
  figure: OristudioCpFoldedFigureEntry,
  opening: Extract<OristudioCpFigureLayerOrderOpening, { status: 'ready' }>,
  view: EditFigureView
): LayerOrderRequest {
  const record = foldedFigureLayerOrderRecord(figure);
  return {
    surface: 'edit_figure',
    source: layerOrderSourceOf(opening.source, opening.model),
    record: record ? layerOrderRecordToSource(record, EDIT_PAPER_FRAME) : null,
    look: editFigureLook(view, {
      style: effectiveObjectPaperStyle(figure, view.display),
      rotation: figure.placement.rotation,
      model: figure.snapshot?.model ?? opening.model,
      xray: figure.displayStyle === 'Transparent3',
    }),
    ...(opening.shown ? { shown: opening.shown } : {}),
    name: figure.title,
  };
}

/**
 * Edit's look for a flat figure on the canvas `view` (D18): drawn in `style`
 * through the flat figure's policy, on the side its `model` shows, turned by
 * its own `rotation` and the canvas's, see-through when `xray`, its creases in
 * Edit's line style and width. A figure "Layer order…" opens on, or the one
 * "Fold with layer order…" will make.
 */
export function editFigureLook(
  view: EditFigureView,
  figure: { style: PaperStyle; rotation: number; model: Pick<OristudioCpFoldedFigureModel, 'state'>; xray: boolean }
): LayerOrderLook {
  return {
    style: figure.style,
    policy: PAPER_STYLE_POLICIES['folded-flat'],
    // Both turn the paper clockwise on screen by their angle, as a Diagram
    // step's `rotationDeg` does: the figure on the canvas, the canvas on the screen.
    turnDeg: wrapDegrees(radiansToDegrees(figure.rotation + view.cameraRotation)),
    // The kernel's back pass; Both and Transparent are views of the front.
    side: figure.model.state === 'Back1' ? 'back' : 'front',
    xray: figure.xray,
    lineStyle: view.lineStyle,
    lineWidth: view.lineWidth,
  };
}

/**
 * Open the Layer order dialog on figure `id`, and commit its Apply. Answers
 * how the press ended; every way but `applied` leaves the figure as it was.
 */
export async function openFoldedFigureLayerOrder(id: string, t: TFunction): Promise<FoldedFigureLayerOrderPress> {
  const store = useWorkspaceStore;
  const figure = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
  if (!figure) return 'not-opened';
  // What the press found open: Apply writes only onto the same document's figure (`foldPress.ts`).
  const press = markFoldPress(store.getState());
  // The dialog's code, while the fold is read or made: loads, never spawns.
  prefetchLayerOrderDialog();
  const opening = await store.getState().prepareOristudioCpFigureLayerOrder(id);
  if (opening.status !== 'ready') {
    // An engine that never loaded is said once, as the dialog's gateway says
    // it; every other way out has said what it had to, or has nothing to say.
    if (opening.reason === 'unavailable') sayLayerOrderUnavailable(t);
    return 'not-opened';
  }
  try {
    const state = store.getState();
    // A crease edited or another document opened while the fold was read or
    // made: its Apply would be refused, so the dialog does not open.
    if (foldPressMoved(press, state)) {
      toast.error(foldPressMovedMessage(t));
      return 'not-opened';
    }
    const shown = state.oristudioCpFoldedFigures.find((entry) => entry.id === id) ?? figure;
    const outcome = await openLayerOrderDialog(foldedFigureLayerOrderRequest(shown, opening, editFigureView(state)));
    if (outcome.kind === 'applied') await applyFoldedFigureLayerOrder(id, outcome.applied, press, t);
    return outcome.kind;
  } finally {
    await opening.release();
  }
}

/**
 * Commit an Apply on figure `id` as one undo entry, "Set layer order": a new
 * fold with the chosen order, the fold before kept by the entry, so an undo
 * shows the order it draws. The bracket holds that fold until the entry has
 * taken it (`foldedFigureGesture.ts`). Nothing, and why, when the crease
 * pattern changed or was replaced since `press`.
 */
export async function applyFoldedFigureLayerOrder(
  id: string,
  applied: LayerOrderApplied,
  press: FoldPress,
  t: TFunction
): Promise<boolean> {
  const done = await foldedFigureGesture.run(
    'verb',
    t('panels:creasePattern.setLayerOrderAction', 'Set layer order'),
    () => useWorkspaceStore.getState().applyOristudioCpFigureLayerOrder(id, applied, press)
  );
  return done === true;
}
