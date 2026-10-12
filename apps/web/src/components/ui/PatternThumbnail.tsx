import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import styles from './PatternThumbnail.module.css';

/**
 * A pattern drawn small, as the pattern pickers draw one: hairlines in the
 * theme's crease inks (the `--sheet-thumb-*` tokens), never the paper style's
 * dashes, which at this size are a field of dots. The Diagram's pattern picker
 * and a linked card's corner draw one, and Fold's step strip, Steps grid and
 * Import CP's samples; the rails' `SheetGrid` keeps its cards.
 *
 * An aux line is the unassigned grey, as a sheet card draws it, unless
 * `auxInk` is `aux`: then it is in Edit's own auxiliary-line ink, as Edit's
 * canvas draws one — Fold's precreases, which its crease-pattern pane draws
 * as aux lines.
 *
 * Decorative: what it shows is said in words beside it.
 */
export function PatternThumbnail({
  thumbnail,
  className,
  auxInk = 'unassigned',
}: {
  thumbnail: SheetThumbnail;
  /** The parent's placement: its size and position. */
  className?: string;
  /** The ink an aux line is drawn in: the unassigned grey, or Edit's aux-line ink. */
  auxInk?: 'unassigned' | 'aux';
}) {
  return (
    <svg
      viewBox={thumbnail.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className ? `${styles.thumbnail} ${className}` : styles.thumbnail}
      data-aux-ink={auxInk === 'aux' ? 'aux' : undefined}
    >
      {thumbnail.strokes.map((stroke, index) => (
        <line
          key={index}
          className={styles.stroke}
          data-role={stroke.role}
          x1={stroke.x1}
          y1={stroke.y1}
          x2={stroke.x2}
          y2={stroke.y2}
        />
      ))}
    </svg>
  );
}
