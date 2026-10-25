import { useTranslation } from 'react-i18next';
import type { LayerStatusView } from '../../layer-order/model/layerOrderSelectors';
import type { LayerSide } from '../../layer-order/engine/layerOrderEngine';
import { Pager } from '../ui/Pager';
import type { LayerOrderCopy } from './layerOrderInspectorCopy';
import styles from './LayerOrderStatus.module.css';

export interface LayerOrderStatusProps {
  readonly status: LayerStatusView;
  readonly copy: LayerOrderCopy;
  /** The count runs (D7): "Counting solutions…" until it has a number. */
  readonly counting: boolean;
  readonly side: LayerSide;
  readonly onStep: (direction: 'previous' | 'next') => void;
}

/**
 * The inspector's first row (A3, `Round4-States`' counting states): how many
 * solutions fit, with the dot that turns to success once one order is
 * decided, and ‹ n of N › through them in a stable order. "At least N" and
 * "n of N+" while the count runs; with the count skipped (D7) the status
 * names the solution shown and the stepper has no total. With X-ray on it
 * counts and steps through every layer order (D5).
 */
export function LayerOrderStatus({ status, copy, counting, side, onStep }: LayerOrderStatusProps) {
  const { t } = useTranslation();
  const { stepper } = status;
  const one = stepper?.total?.exact && stepper.total.n <= 1;
  const endHint = (end: string) =>
    stepper?.busy
      ? t('dialogs:layerOrder.status.stepping', 'Finding the solution…')
      : one
        ? side === 'back'
          ? t('dialogs:layerOrder.status.onlyBack', 'There is one solution from the back')
          : t('dialogs:layerOrder.status.onlyFront', 'There is one solution from the front')
        : end;
  return (
    <section className={styles.status} aria-label={t('dialogs:layerOrder.status.label', 'Solutions')}>
      <p className={styles.line} role="status" aria-live="polite" title={copy.statusTitle(status)}>
        <span className={styles.dot} data-state={status.dot} aria-hidden="true" />
        {copy.status(status.text, counting)}
      </p>
      {stepper && (
        <Pager
          label={t('dialogs:layerOrder.status.stepper', 'Solution shown')}
          previous={{
            label: t('dialogs:layerOrder.status.previous', 'Previous solution'),
            disabled: !stepper.previous || stepper.busy,
            hint: endHint(t('dialogs:layerOrder.status.first', 'This is the first solution')),
            run: () => {
              if (stepper.previous && !stepper.busy) onStep('previous');
            },
          }}
          next={{
            label: t('dialogs:layerOrder.status.next', 'Next solution'),
            disabled: !stepper.next || stepper.busy,
            hint: endHint(t('dialogs:layerOrder.status.last', 'This is the last solution')),
            run: () => {
              if (stepper.next && !stepper.busy) onStep('next');
            },
          }}
        >
          {copy.stepperCount(stepper)}
        </Pager>
      )}
    </section>
  );
}
