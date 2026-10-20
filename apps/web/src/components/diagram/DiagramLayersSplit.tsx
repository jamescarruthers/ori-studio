import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLayersSplit } from '../../diagram/layers/useLayersSplit';
import styles from './DiagramLayersSplit.module.css';

/**
 * The Layers pane's two regions (redesign, 2026-10-18), as Photoshop's and
 * Affinity's Layers and Properties are: the list's header, the list, and —
 * while something is selected — a separator and the selection's inspector.
 * Each region scrolls on its own, so a long list never pushes the selection's
 * controls out of reach. A drag on the separator sets the list's height; a
 * double click gives it back its own (`useLayersSplit`).
 */
export function DiagramLayersSplit({
  header,
  list,
  inspector,
}: {
  header: ReactNode;
  list: ReactNode;
  /** The selection's controls; null with nothing selected, when the list takes the pane. */
  inspector: ReactNode | null;
}) {
  const { t } = useTranslation();
  const { containerRef, listRef, height, separator } = useLayersSplit();
  const sized = inspector !== null && height !== null;
  return (
    <div ref={containerRef} className={styles.split}>
      {header}
      <div
        ref={listRef}
        className={styles.list}
        data-alone={inspector === null || undefined}
        data-sized={sized || undefined}
        style={sized ? { height: height! } : undefined}
      >
        {list}
      </div>
      {inspector !== null && (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('panels:diagram.layers.separator', 'Drag to resize the list')}
            title={t('panels:diagram.layers.separator', 'Drag to resize the list')}
            className={styles.separator}
            data-layers-separator=""
            {...separator}
          />
          <div className={styles.inspector} data-layers-inspector="">
            {inspector}
          </div>
        </>
      )}
    </div>
  );
}
