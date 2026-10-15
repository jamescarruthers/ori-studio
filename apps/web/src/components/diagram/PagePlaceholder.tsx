import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import styles from './PagePlaceholder.module.css';

/**
 * Where a page of the Pages view prints nothing that it would: a dashed box
 * where the thing would be, and why, over the page and never in it. An empty
 * step's picture is tinted as paper, its words in the middle (`picture`); a
 * part of the first page's title block is not, since the art in front of it
 * may show through, and its words stand at the box's `words` end, clear of
 * what may stand at the other (`part`). Where the title block is cut, the
 * box is the strip under it, and its words a tag hanging at that strip's end,
 * over the page (`cut`). Its words in `ink` where they stand on something
 * printed in a colour of its own (the title's band). Placed by its parent.
 */
export function PagePlaceholder({
  kind,
  words = 'middle',
  ink,
  style,
  children,
  ...rest
}: {
  kind: 'picture' | 'part' | 'cut';
  words?: 'top' | 'middle' | 'bottom';
  ink?: string;
  style: CSSProperties;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={styles.placeholder}
      data-kind={kind}
      data-words={words}
      aria-hidden="true"
      style={ink ? ({ ...style, '--placeholder-ink': ink } as CSSProperties) : style}
    >
      {children}
    </div>
  );
}
