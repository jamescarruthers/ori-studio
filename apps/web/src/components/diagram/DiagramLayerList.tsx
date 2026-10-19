import type { ReactNode } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
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
 * What a Layers list holds, over it: the page or the step, how many rows, and
 * the list's own verb, where it has one — Re-pack Page (redesign, 2026-10-18).
 */
export function DiagramLayersHeader({ title, count, action = null }: { title: string; count: string; action?: ReactNode }) {
  return (
    <div className={styles.header}>
      <span className={styles.headerTitle}>{title}</span>
      <span className={styles.headerCount}>{count}</span>
      {action !== null && <span className={styles.headerAction}>{action}</span>}
    </div>
  );
}

/** A row's own Delete: what it takes away, and how. */
export interface DiagramLayerRemove {
  /** Its name, on hover and for assistive technology: "Delete step 3". */
  label: string;
  onRemove: () => void;
}

/** A row's disclosure: its parts shown or not. */
export interface DiagramLayerDisclosure {
  expanded: boolean;
  /** What it shows, for assistive technology: "Parts of step 3". */
  label: string;
  onToggle: () => void;
}

/**
 * One row of a {@link DiagramLayerList}, on one line (redesign, 2026-10-18):
 * its disclosure, where its list nests one; its glyph; its name, and after
 * it, quieter, what it says of itself; and at its end what it is — placed by
 * hand, past the margin — as marks, never as buttons. Pressed, it selects
 * what it names; `pressed` says it is the selection, and `holdsSelection`
 * that a row nested under it is. Last, its own Delete, always shown (Zach,
 * 2026-10-18, 2026-10-19).
 */
export function DiagramLayerRow({
  glyph,
  name,
  note = null,
  status = null,
  pressed,
  holdsSelection = false,
  dimmed = false,
  disabled = false,
  disclosure,
  remove,
  title,
  onPress,
  data,
}: {
  glyph: ReactNode;
  name: ReactNode;
  /** After the name, quieter: an area's enlarged steps, a frame's area. */
  note?: ReactNode;
  /** Marks at the row's end: placed by hand, past the margin. */
  status?: ReactNode;
  pressed: boolean;
  /** A row nested under this one is the selection: the step of a selected part. */
  holdsSelection?: boolean;
  /** Kept but not drawn as the rest are — a mark outside an enlarged step's frame: grey, never dashed. */
  dimmed?: boolean;
  /** Nothing to select: a part a step does not have. */
  disabled?: boolean;
  /** Its parts' disclosure; `'space'` keeps the column, so its glyph lines up with rows that have one. */
  disclosure?: DiagramLayerDisclosure | 'space';
  /** Its Delete; `'space'` keeps the room, so the marks of rows with one and without line up. */
  remove?: DiagramLayerRemove | 'space';
  /** What the row says on hover: why it is dimmed. */
  title?: string;
  onPress: () => void;
  /** Data attributes a test or a caller finds the row by. */
  data?: Readonly<Record<`data-${string}`, string>>;
}) {
  return (
    <div
      className={styles.row}
      data-pressed={pressed || undefined}
      data-holds-selection={holdsSelection || undefined}
      data-dimmed={dimmed || undefined}
      data-disabled={disabled || undefined}
    >
      {disclosure === 'space' ? (
        <span className={styles.disclosure} aria-hidden="true" />
      ) : disclosure ? (
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={disclosure.expanded}
          aria-label={disclosure.label}
          onClick={disclosure.onToggle}
        >
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.press}
        aria-pressed={pressed}
        disabled={disabled}
        title={title}
        onClick={onPress}
        {...data}
      >
        {glyph}
        <span className={styles.label}>
          <span className={styles.name}>{name}</span>
          {note !== null && <span className={styles.note}>{note}</span>}
        </span>
        {status !== null && <span className={styles.status}>{status}</span>}
      </button>
      {remove === 'space' ? (
        <span className={styles.remove} data-space="" aria-hidden="true" />
      ) : remove ? (
        <span className={styles.remove}>
          <IconButton size="sm" title={remove.label} aria-label={remove.label} onClick={remove.onRemove}>
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
        </span>
      ) : null}
    </div>
  );
}
