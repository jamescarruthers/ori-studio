import type { ReactNode } from 'react';
import styles from './DiagramLayerList.module.css';

/**
 * A Layers pane's list (Zach, 2026-10-05): what is drawn on the step open in
 * Annotate (`DiagramLayers`), or in the Pages view the steps on the current
 * page (`DiagramPageLayers`), one row a layer in the order it paints — or,
 * when there is nothing to list, the one line `empty` says instead. A
 * `nested` list is a row's own, under it: a step's parts.
 */
export function DiagramLayerList({
  label,
  empty = null,
  nested = false,
  children,
}: {
  /** The list's name for assistive technology. */
  label: string;
  /** Said in place of the list while it has nothing in it; null shows the list. */
  empty?: string | null;
  nested?: boolean;
  children: ReactNode;
}) {
  if (empty !== null) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles.list} aria-label={label} data-nested={nested || undefined}>
      {children}
    </ul>
  );
}

/**
 * One row of a {@link DiagramLayerList}: its glyph, its name, and under the
 * name what it says of itself — a note, badges. Pressed, it selects what it
 * names; `pressed` says it is the selection.
 */
export function DiagramLayerRow({
  glyph,
  name,
  note = null,
  badge = null,
  pressed,
  disabled = false,
  onPress,
  data,
}: {
  glyph: ReactNode;
  name: ReactNode;
  /** A line under the name: an area's enlarged steps, a frame's area. */
  note?: ReactNode;
  /** Badges under the name, side by side, each as wide as its words. */
  badge?: ReactNode;
  pressed: boolean;
  /** Nothing to select: a part a step does not have. */
  disabled?: boolean;
  onPress: () => void;
  /** Data attributes a test or a caller finds the row by. */
  data?: Readonly<Record<`data-${string}`, string>>;
}) {
  return (
    <button type="button" className={styles.row} aria-pressed={pressed} disabled={disabled} onClick={onPress} {...data}>
      {glyph}
      <span className={styles.rowText}>
        <span className={styles.rowName}>{name}</span>
        {note !== null && <span className={styles.rowNote}>{note}</span>}
        {/* Under its name, as a note is: beside it, the badge took the row's width and cut the name off. */}
        {badge !== null && <span className={styles.rowBadge}>{badge}</span>}
      </span>
    </button>
  );
}

/** The selected layer's own controls, under the list. */
export function DiagramLayerControls({ children }: { children: ReactNode }) {
  return <div className={styles.controls}>{children}</div>;
}
