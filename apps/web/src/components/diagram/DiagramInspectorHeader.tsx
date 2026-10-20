import type { ReactNode } from 'react';
import styles from './DiagramInspectorHeader.module.css';

/**
 * The top of a Layers pane's inspector (redesign, 2026-10-18): what is
 * selected — "Step 3 › Text", "Valley Fold Arrow 1" — over where it lives, and
 * at its end the selection's own verb, where it has one: Reset Layout. Words
 * only: a glyph tile here was taken for a button.
 */
export function DiagramInspectorHeader({
  title,
  detail = null,
  action = null,
}: {
  title: ReactNode;
  /** Where it lives, quieter, under the title: a step's instruction. */
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.header} data-inspector-header="">
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {detail !== null && <div className={styles.detail}>{detail}</div>}
      </div>
      {action !== null && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/** A step and its part in a header's title: "Step 3 › Text". */
export function DiagramInspectorCrumb({ parent, child }: { parent: ReactNode; child: ReactNode }) {
  return (
    <>
      {parent}
      <span className={styles.crumb} aria-hidden="true">
        {' › '}
      </span>
      {child}
    </>
  );
}
