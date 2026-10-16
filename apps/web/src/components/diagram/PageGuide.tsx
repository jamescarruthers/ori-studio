import type { CSSProperties, HTMLAttributes } from 'react';
import styles from './PageGuide.module.css';

/**
 * A guide over a page of the Pages view, for the screen and never in the
 * page: a dashed outline in the accent, drawn just outside the area it
 * outlines so that it never runs over what prints at its edge — the margin,
 * or the first page's title block, whose top and sides are the margin's and
 * which draws its foot alone (`edges="foot"`). Placed by its parent; a press
 * passes through it to the page.
 */
export function PageGuide({
  edges = 'all',
  style,
  ...rest
}: { edges?: 'all' | 'foot'; style: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={styles.guide} data-edges={edges} aria-hidden="true" style={style} />;
}
