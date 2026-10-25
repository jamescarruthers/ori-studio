import { useTranslation } from 'react-i18next';
import { PictureLoading } from '../ui/PictureLoading';
import type { LayerOrderPanesProps } from './LayerOrderDialogFrame';
import styles from './LayerOrderPanesPlaceholder.module.css';

/**
 * The panes region's places, until U8's `LayerOrderPanes` draws in them: the
 * crease pattern's, and the folded figure's, which shows the picture loading
 * while the session opens. Holds the region's contract
 * ({@link LayerOrderPanesProps}) so the shell's states can be seen and tested.
 */
export function LayerOrderPanesPlaceholder({ status, phonePane }: LayerOrderPanesProps) {
  const { t } = useTranslation();
  const folded = status.kind === 'opening' || status.kind === 'ready';
  const one = phonePane === null ? null : folded ? phonePane : 'crease';
  return (
    <div className={styles.panes}>
      {one !== 'folded' && (
        <section className={styles.pane} aria-label={t('dialogs:layerOrder.creasePane', 'Crease pattern')} />
      )}
      {folded && one !== 'crease' && (
        <section className={styles.pane} aria-label={t('dialogs:layerOrder.foldedPane', 'Folded figure')}>
          {status.kind === 'opening' && (
            <span className={styles.loading} role="status" aria-label={t('dialogs:layerOrder.foldedLoading', 'Loading the folded figure')}>
              <PictureLoading />
            </span>
          )}
        </section>
      )}
    </div>
  );
}
