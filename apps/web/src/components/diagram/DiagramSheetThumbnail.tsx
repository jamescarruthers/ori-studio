import { memo, useMemo } from 'react';
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
export const DiagramSheetThumbnail = memo(function DiagramSheetThumbnail({
  thumbnail,
  className,
}: {
  thumbnail: SheetThumbnail;
  /** The parent's placement: its size and position. */
  className?: string;
}) {
  // Independent M/L subpaths keep every segment and its drawing order, but
  // avoid one element per crease. Mount the generated SVG in one operation:
  // alternating mountain/valley runs can still number in the thousands, and
  // a React fiber per run made scrolling stall. Drawing order and live theme
  // tokens remain intact.
  const markup = useMemo(() => {
    const runs: Array<{ role: SheetStrokeRole; commands: string[] }> = [];
    for (const stroke of thumbnail.strokes) {
      // Only finite numbers enter the generated path markup; no uploaded SVG
      // or arbitrary text crosses this boundary.
      if (![stroke.x1, stroke.y1, stroke.x2, stroke.y2].every(Number.isFinite)) continue;
      if (!['edge', 'mountain', 'valley', 'unassigned', 'aux'].includes(stroke.role)) continue;
      let run = runs.at(-1);
      if (!run || run.role !== stroke.role) {
        run = { role: stroke.role, commands: [] };
        runs.push(run);
      }
      run.commands.push(`M${stroke.x1} ${stroke.y1}L${stroke.x2} ${stroke.y2}`);
    }
    return runs
      .map((run) => `<path class="${styles.stroke}" data-role="${run.role}" d="${run.commands.join('')}"/>`)
      .join('');
  }, [thumbnail]);
  const content = useMemo(() => ({ __html: markup }), [markup]);
  return (
    <svg
      viewBox={thumbnail.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className ? `${styles.thumbnail} ${className}` : styles.thumbnail}
      dangerouslySetInnerHTML={content}
    />
  );
});
