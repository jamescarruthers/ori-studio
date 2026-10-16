import type { KeyboardEvent, Ref } from 'react';
import { isComposingKey } from './isComposingKey';
import styles from './TextField.module.css';
import { usePendingText } from './usePendingText';

/**
 * A text field in the panes' look, committed as it is typed
 * (`usePendingText`): on blur, after `idleMs` without typing, before any undo
 * or redo runs, before a save or any question about unsaved work, and when it
 * goes away — so nothing typed is ever lost. Each commit carries the session
 * it belongs to (one per focus), so a consumer that records history can make
 * one sitting at the field one entry.
 *
 * How many lines it takes:
 * - `one`, an input: Enter and Escape leave it, keeping what was typed;
 * - `wrap`, one line of text wrapped where it does not fit, as tall as its
 *   lines: Enter leaves it as Escape does, and a line break pasted in is a
 *   space;
 * - `many`, `rows` tall: Enter is a newline; Escape and Cmd/Ctrl+Enter leave.
 *
 * There is nothing to revert to: the idle commits have already written most
 * of it, and undo is how a session is taken back. An input method's Enter and
 * Escape accept or cancel a conversion, and leave nothing. A read-only field
 * shows a value worked out for the author, to be read and never typed.
 */
export function TextField({
  id,
  label,
  value,
  lines,
  rows = 3,
  placeholder,
  disabled = false,
  readOnly = false,
  maxLength,
  idleMs = 600,
  describedBy,
  fieldRef,
  onCommit,
  onEscape,
  ...data
}: {
  id?: string;
  /** Its name where no `<label>` points at it. */
  label?: string;
  value: string;
  lines: 'one' | 'wrap' | 'many';
  /** How tall a `many` field stands. */
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  /** How long typing must pause before the draft commits. */
  idleMs?: number;
  describedBy?: string;
  /** A `wrap` or `many` field itself, for a caller that puts the focus in it. */
  fieldRef?: Ref<HTMLTextAreaElement>;
  /** Where what is typed goes; none for a read-only field. */
  onCommit?: (value: string, session: number) => void;
  /** Called after Escape leaves the field. */
  onEscape?: () => void;
} & { [data: `data-${string}`]: string | undefined }) {
  const text = usePendingText({ value, idleMs, onCommit: onCommit ?? ignore });
  const common = {
    ...data,
    id,
    className: styles.field,
    'data-lines': lines,
    'aria-label': label,
    'aria-describedby': describedBy,
    value: readOnly ? value : text.shown,
    placeholder,
    disabled,
    readOnly,
    maxLength,
    onFocus: readOnly ? undefined : text.begin,
    onBlur: readOnly ? undefined : text.end,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (readOnly || isComposingKey(event)) return;
      const leaves = event.key === 'Escape' || (event.key === 'Enter' && (lines !== 'many' || event.metaKey || event.ctrlKey));
      if (!leaves) return;
      event.preventDefault();
      event.currentTarget.blur();
      if (event.key === 'Escape') onEscape?.();
    },
  };
  return lines === 'one' ? (
    <input {...common} type="text" onChange={(event) => text.change(event.target.value)} />
  ) : (
    <textarea
      {...common}
      ref={fieldRef}
      rows={lines === 'wrap' ? 1 : rows}
      onChange={(event) => text.change(lines === 'wrap' ? event.target.value.replace(/[\r\n]+/g, ' ') : event.target.value)}
    />
  );
}

function ignore() {}
