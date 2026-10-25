/**
 * The Layer order dialog's two ways out, bound to its session and its host's
 * waiting promise (`implementation-plans/layer-order-dialog.md`, row U4):
 * Cancel (and the close button and Escape) and Apply.
 *
 * - **Cancel** answers `cancelled`. The dialog goes as the opening settles,
 *   and its worker with it (`useLayerOrderSession`), mid-call or not: the
 *   Opening frame's Cancel included.
 * - **Apply** decides D16 itself: what is on screen against what the session
 *   opened on (U9's `openedBaseline` and `applyChangedNothing`). Nothing
 *   changed answers `unchanged` with no save, and the host writes nothing.
 *   Otherwise it saves through the engine and answers `applied`, with the
 *   record and relations for the host to fold (`applyLayerOrderSession`). A
 *   save the engine refuses (a record over its budget) keeps the dialog open
 *   with the reason.
 *
 * What is on screen is the open's own order and rows until an inspector
 * (U10) changes them, and passes them to {@link LayerOrderSettle.apply}: the
 * state, never a verdict. So the shell's Apply, with no inspector yet,
 * answers `unchanged` on a session opened on the host's own order.
 */
import { useCallback, useState } from 'react';
import type { LayerRefusal } from '../engine/layerOrderEngine';
import { applyChangedNothing, openedBaseline, type LayerOrderAtApply } from '../model/layerOrderDecisions';
import { settleLayerOrderDialog, type LayerOrderDialogOpening } from './layerOrderDialogStore';
import type { LayerOrderSession } from './useLayerOrderSession';

export interface LayerOrderSettle {
  readonly cancel: () => void;
  /**
   * Apply, with what is on screen now (an inspector's rows and order); the
   * open's own when left out.
   */
  readonly apply: (now?: LayerOrderAtApply) => Promise<void>;
  /** An Apply is saving: Apply waits, Cancel still closes. */
  readonly applying: boolean;
  /** Why the last Apply could not save, until the next. */
  readonly applyRefusal: LayerRefusal | null;
}

export function useLayerOrderSettle(opening: LayerOrderDialogOpening, session: LayerOrderSession): LayerOrderSettle {
  const [applying, setApplying] = useState(false);
  const [applyRefusal, setApplyRefusal] = useState<LayerRefusal | null>(null);
  const { id, request } = opening;
  const { status, apply: save } = session;

  const cancel = useCallback(() => {
    settleLayerOrderDialog(id, { kind: 'cancelled' });
  }, [id]);

  const apply = useCallback(
    async (now?: LayerOrderAtApply) => {
      if (applying || status.kind !== 'ready') return;
      const { open } = status;
      const baseline = openedBaseline(open.facts, request.record?.attention !== undefined);
      const onScreen = now ?? { constraints: open.facts.constraints, carried: baseline.carried, stacks: open.stacks };
      if (applyChangedNothing(baseline, onScreen)) {
        settleLayerOrderDialog(id, { kind: 'unchanged' });
        return;
      }
      setApplying(true);
      setApplyRefusal(null);
      const answer = await save();
      setApplying(false);
      // No session, or it went away while saving: the session's status says which.
      if (!answer) return;
      if (answer.kind === 'refused') {
        setApplyRefusal(answer.refusal);
        return;
      }
      settleLayerOrderDialog(id, { kind: 'applied', applied: answer.applied });
    },
    [applying, id, request, save, status]
  );

  return { cancel, apply, applying, applyRefusal };
}
