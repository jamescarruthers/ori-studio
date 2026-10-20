import { useTranslation } from 'react-i18next';
import styles from './DiagramPlacedMark.module.css';

/**
 * The mark of a step, or of one of its parts, placed by hand on the pages: a
 * dot, wherever it is shown — a Layers row, a step's card (Zach, 2026-10-18).
 * A pin said "pin this" and was reached for as a button; a dot reads as a
 * state, as an unsaved file's does in an editor. In its parent's ink, named
 * on hover and to assistive technology.
 */
export function DiagramPlacedMark() {
  const { t } = useTranslation();
  const label = t('panels:diagram.placement.placed', 'Placed by hand');
  return (
    <span className={styles.mark} title={label} data-placed-mark="">
      <svg width={6} height={6} viewBox="0 0 6 6" role="img" aria-label={label}>
        <circle cx={3} cy={3} r={3} fill="currentColor" />
      </svg>
    </span>
  );
}
