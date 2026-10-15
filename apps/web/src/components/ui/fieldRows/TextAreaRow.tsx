import { useId, type Ref } from 'react';
import { FieldRowHelp } from './FieldRow';
import { isComposingKey } from './isComposingKey';
import styles from './TextAreaRow.module.css';
import { usePendingText } from './usePendingText';

/**
 * A multi-line text field in a row, its label above it.
 *
 * Commits as it is typed (`usePendingText`): on blur, after `idleMs` without
 * typing, before any undo or redo runs, before a save or any question about
 * unsaved work, and when the row goes away — so nothing typed is ever lost.
 * Each commit carries the session it belongs to (one per focus), so a
 * consumer that records history can make one sitting at the field one entry.
 *
 * Enter is a newline; Escape and Cmd/Ctrl+Enter leave the field, keeping what
 * was typed. There is nothing to revert to: the idle commits have already
 * written most of it, and undo is how a session is taken back.
 */
export function TextAreaRow({
  label,
  labelHidden = false,
  help,
  value,
  placeholder,
  disabled = false,
  nested = false,
  title,
  rows = 3,
  maxLength,
  idleMs = 600,
  singleLine = false,
  fieldRef,
  onCommit,
  onEscape,
}: {
  label: string;
  /**
   * Keep the label for assistive technology only, for a field whose section
   * title already says what it is.
   */
  labelHidden?: boolean;
  /** What the field is for, behind a help mark after its label, as a `FieldRow`'s (`FieldRow.help`). */
  help?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  /** A step in, for a field that belongs to the row above it (`FieldRow.nested`). */
  nested?: boolean;
  /** Why the row is disabled, shown on hover. */
  title?: string;
  rows?: number;
  maxLength?: number;
  /** How long typing must pause before the draft commits. */
  idleMs?: number;
  /**
   * One line of text, wrapped where it does not fit: Enter leaves the field
   * as Escape does, and a line break pasted in is a space.
   */
  singleLine?: boolean;
  /** The field itself, for a caller that puts the focus in it. */
  fieldRef?: Ref<HTMLTextAreaElement>;
  onCommit: (value: string, session: number) => void;
  /** Called after Escape leaves the editor. */
  onEscape?: () => void;
}) {
  const fieldId = useId();
  const text = usePendingText({ value, idleMs, onCommit });

  const labelElement = (
    <label className={labelHidden ? styles.labelHidden : styles.label} htmlFor={fieldId}>
      {label}
    </label>
  );
  return (
    <div
      className={styles.row}
      data-nested={nested || undefined}
      data-disabled={disabled || undefined}
      title={title}
    >
      {help ? (
        // Beside the label, not in it: a mark inside would join the field's name.
        <span className={styles.head}>
          {labelElement}
          <FieldRowHelp help={help} />
        </span>
      ) : (
        labelElement
      )}
      <textarea
        ref={fieldRef}
        id={fieldId}
        className={styles.field}
        value={text.shown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        onFocus={text.begin}
        onChange={(event) => text.change(singleLine ? event.target.value.replace(/[\r\n]+/g, ' ') : event.target.value)}
        onBlur={text.end}
        onKeyDown={(event) => {
          // An input method's Enter and Escape accept or cancel a conversion.
          if (isComposingKey(event)) return;
          if (
            event.key === 'Escape' ||
            (event.key === 'Enter' && (singleLine || event.metaKey || event.ctrlKey))
          ) {
            event.preventDefault();
            event.currentTarget.blur();
            if (event.key === 'Escape') onEscape?.();
          }
        }}
      />
    </div>
  );
}
