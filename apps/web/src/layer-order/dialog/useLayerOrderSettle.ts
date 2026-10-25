/**
 * The Layer order dialog's two ways out, bound to its session and its host's
 * waiting promise (`implementation-plans/layer-order-dialog.md`, row U4):
 * Cancel (and the close button, Escape, the backdrop) and Apply.
 *
 * - **Cancel** stops the worker at once, mid-call or not (the Opening
 *   frame's Cancel included), and answers `cancelled`.
 * - **Apply** saves through the engine and answers `applied` with the record
 *   and relations for the host to fold (`applyLayerOrderSession`). A save the
 *   engine refuses (a record over its budget) keeps the dialog open with the
 *   reason. `apply({ unchanged: true })` answers `unchanged` with no save:
 *   the inspector's word, from U9's `applyChangedNothing`, that Apply would
 *   write what the host already has (D16).
 *
 * The dialog closes when its opening settles; unmounting it terminates the
 * worker (`useLayerOrderSession`).
 */
import { useCallback, useState } from 'react';
import type { LayerRefusal } from '../engine/layerOrderEngine';
import { settleLayerOrderDialog, type LayerOrderDialogOpening } from './layerOrderDialogStore';
import type { LayerOrderSession } from './useLayerOrderSession';

export interface LayerOrderApplyOptions {
  /** The inspector found nothing to write (D16): answer `unchanged`, with no save. */
  readonly unchanged?: boolean;
}

export interface LayerOrderSettle {
  readonly cancel: () => void;
  readonly apply: (options?: LayerOrderApplyOptions) => Promise<void>;
  /** An Apply is saving: Apply waits, Cancel still stops it. */
  readonly applying: boolean;
  /** Why the last Apply could not save, until the next. */
  readonly applyRefusal: LayerRefusal | null;
}

export function useLayerOrderSettle(opening: LayerOrderDialogOpening, session: LayerOrderSession): LayerOrderSettle {
  const [applying, setApplying] = useState(false);
  const [applyRefusal, setApplyRefusal] = useState<LayerRefusal | null>(null);
  const { id } = opening;
  const { stop, apply: save } = session;

  const cancel = useCallback(() => {
    stop();
    settleLayerOrderDialog(id, { kind: 'cancelled' });
  }, [id, stop]);

  const apply = useCallback(
    async ({ unchanged = false }: LayerOrderApplyOptions = {}) => {
      if (applying) return;
      if (unchanged) {
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
    [applying, id, save]
  );

  return { cancel, apply, applying, applyRefusal };
}
