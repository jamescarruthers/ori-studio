import { useMemo } from 'react';
import type { SheetThumbnail, SheetStrokeRole } from '../../cp-workspace/sheets/sheetThumbnail';
import styles from './DiagramSheetThumbnail.module.css';

/**
 * A pattern drawn small, as the pattern pickers draw one: hairlines in the
 * theme's crease inks (the `--sheet-thumb-*` tokens), never the paper style's
 * dashes, which at this size are a field of dots. The Diagram's own, for the
 * pattern picker and a linked card's corner; the rails' `SheetGrid` keeps its
 * cards.
 *
 * Decorative: what it shows is said in words beside it.
 */
export function DiagramSheetThumbnail({
  thumbnail,
  className,
}: {
  thumbnail: SheetThumbnail;
  /** The parent's placement: its size and position. */
  className?: string;
}) {
  // Independent M/L subpaths keep every segment and its drawing order, but
  // avoid one React/DOM element per crease in a long imported diagram.
  const paths = useMemo(() => {
    const runs: Array<{ role: SheetStrokeRole; commands: string[] }> = [];
    for (const stroke of thumbnail.strokes) {
      let run = runs.at(-1);
      if (!run || run.role !== stroke.role) {
        run = { role: stroke.role, commands: [] };
        runs.push(run);
      }
      run.commands.push(`M${stroke.x1} ${stroke.y1}L${stroke.x2} ${stroke.y2}`);
    }
    return runs.map((run) => ({ role: run.role, d: run.commands.join('') }));
  }, [thumbnail]);
  return (
    <svg
      viewBox={thumbnail.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className ? `${styles.thumbnail} ${className}` : styles.thumbnail}
    >
      {paths.map((path, index) => (
        <path key={index} className={styles.stroke} data-role={path.role} d={path.d} />
      ))}
    </svg>
  );
}
