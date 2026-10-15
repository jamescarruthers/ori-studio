import type { CSSProperties, HTMLAttributes } from 'react';
import styles from './PageGuide.module.css';

/**
 * A guide over a page of the Pages view, for the screen and never in the
 * page: a dashed outline in the accent — the margin, or the first page's
 * title block. Placed by its parent; a press passes through it to the page.
 */
export function PageGuide({ style, ...rest }: { style: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={styles.guide} aria-hidden="true" style={style} />;
}
