import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FoldOrderPartView } from '../../../fold/orders/useFoldOrderResolution';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import styles from './FoldOrderChooser.module.css';

/**
 * Shared explicit acceptance controls. Display settings belong in the sidebar.
 * While a search for more orders runs (`searching`), the orders found so far
 * stay named and Stop ends it; once one has run (`searched`), an exact count
 * says so: there are no other orders.
 *
 * A fold whose orders fall into independent parts (`parts`, two or more)
 * shows one row per part, each stepping that part's own orders, so every
 * combination is reached by picking each part's; the active part (`part`)
 * is the one the arrow keys step and the canvas tints. Each pick is
 * previewed on the canvas.
 */
export function FoldOrderChooser({ index, count, exact, ready, waiting, onStep, onBack, onAccept, onSearch, onStop, acceptLabel, error = false, movingVaries = false, searching = false, searched = false, parts = [], part = 0, onStepPart, onSelectPart }: {
  index: number; count: number; exact: boolean; ready: boolean; waiting: boolean;
  onStep: (delta: number) => void; onBack: () => void; onAccept: () => void;
  onSearch?: () => void; onStop?: () => void; acceptLabel?: string; error?: boolean; movingVaries?: boolean;
  searching?: boolean; searched?: boolean;
  parts?: readonly FoldOrderPartView[]; part?: number;
  onStepPart?: (part: number, delta: number) => void; onSelectPart?: (part: number) => void;
}) {
  const { t } = useTranslation();
  const perPart = parts.length > 1 && !!onStepPart;
  const total = waiting && !searching ? t('tools:fold.order.loading', 'Loading order…') : count === 0 ? t('tools:fold.order.noneFound', 'No order found yet') : exact
    ? t('tools:fold.order.count', 'Order {{index}} of {{count}}', { index: index + 1, count })
    : t('tools:fold.order.found', 'Order {{index}} of {{count}} found', { index: index + 1, count });
  return <section className={styles.root} aria-label={t('tools:fold.order.choose', 'Choose layer order')}>
    <p className={styles.note}>{perPart
      ? t('tools:fold.order.partsHelp', 'These layers fall into parts that stack independently. Preview each part’s arrangements, then choose.')
      : t('tools:fold.order.help', 'Preview the arrangements, then choose the order you want.')}</p>
    {movingVaries && <p className={styles.note} role="status">{t('tools:fold.order.movingVaries', 'These orders move different layers. Check the highlighted paper.')}</p>}
    {perPart ? <>
      <div className={styles.parts} role="group" aria-label={t('tools:fold.order.parts', 'Parts')}>
        {parts.map((p, i) => {
          const number = i + 1;
          return <div key={i} className={styles.part} data-fold-order-part={i} data-active={i === part ? '' : undefined}>
            <Button size="sm" variant="ghost" aria-pressed={i === part} onClick={() => onSelectPart?.(i)}>
              {t('tools:fold.order.part', 'Part {{number}}', { number })}
            </Button>
            <IconButton size="sm" aria-label={t('tools:fold.order.partPrevious', 'Previous order of part {{number}}', { number })}
              disabled={waiting || p.orders < 2 || (!p.exact && p.pick === 0)} onClick={() => onStepPart(i, -1)}><ChevronLeft size={16} /></IconButton>
            <span className={styles.count}>{t('tools:fold.order.partCount', '{{index}} of {{total}}', { index: p.pick + 1, total: p.orders })}</span>
            <IconButton size="sm" aria-label={t('tools:fold.order.partNext', 'Next order of part {{number}}', { number })}
              disabled={waiting || p.orders < 2 || (!p.exact && p.pick >= p.orders - 1)} onClick={() => onStepPart(i, 1)}><ChevronRight size={16} /></IconButton>
          </div>;
        })}
      </div>
      <span className={styles.note} role="status" aria-live="polite">{total}</span>
    </> : <div className={styles.navigation}>
      <IconButton size="sm" aria-label={t('tools:fold.order.previous', 'Previous layer order')}
        disabled={waiting || count < 2 || (!exact && index === 0)} onClick={() => onStep(-1)}><ChevronLeft size={16} /></IconButton>
      <span role="status" aria-live="polite">{total}</span>
      <IconButton size="sm" aria-label={t('tools:fold.order.next', 'Next layer order')}
        disabled={waiting || count < 2 || (!exact && index >= count - 1)} onClick={() => onStep(1)}><ChevronRight size={16} /></IconButton>
    </div>}
    {error && <p role="alert" className={styles.note}>{t('tools:fold.order.failed', 'The order could not be loaded. Go back and try again, or choose another order.')}</p>}
    {searching
      ? <p className={styles.note} role="status">{t('tools:fold.order.searching', 'Searching for more orders…')}</p>
      : !exact
        ? <p className={styles.note}>{t('tools:fold.order.incomplete', 'Search incomplete. More orders may exist.')}</p>
        : searched && <p className={styles.note} role="status">{t('tools:fold.order.noOthers', 'Search finished. There are no other orders.')}</p>}
    {searching && onStop
      ? <Button size="sm" onClick={onStop}>{t('tools:fold.order.stop', 'Stop searching')}</Button>
      : onSearch && <Button size="sm" disabled={waiting} onClick={onSearch}>{t('tools:fold.order.search', 'Find more orders')}</Button>}
    <div className={styles.actions}>
      <Button size="sm" variant="secondary" onClick={onBack}>{t('tools:fold.order.back', 'Back')}</Button>
      <Button size="sm" variant="primary" disabled={!ready} onClick={onAccept} data-fold-order-accept="">
        {acceptLabel ?? t('tools:fold.order.accept', 'Use this order')}
      </Button>
    </div>
  </section>;
}
