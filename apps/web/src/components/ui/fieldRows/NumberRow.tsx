import { useId, type Ref } from 'react';
import { NumberField } from '../NumberField';
import { FieldRow } from './FieldRow';

/**
 * A stepper field in a row. Commit semantics are `NumberField`'s: the draft
 * commits on blur, Enter or a step, Escape reverts, and a no-op commit is
 * skipped — which matters because a commit is usually an undo entry.
 */
export function NumberRow({
  label,
  help,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  title,
  normalize,
  minChars,
  fieldRef,
  divider,
  onCommit,
  onReset,
}: {
  label: string;
  /** What the row means, behind a help mark beside its label (`FieldRow.help`). */
  help?: string;
  /** Null while there is no number to show: the field is empty (`NumberField`). */
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
  normalize?: (value: number) => number;
  /** The fewest characters the number makes room for (`NumberField.minChars`), so a field whose values run longer keeps one width. */
  minChars?: number;
  /** The input itself, for a caller that puts the focus in it. */
  fieldRef?: Ref<HTMLInputElement>;
  /** The rule under the row (`FieldRow.divider`). */
  divider?: boolean;
  onCommit: (value: number) => void;
  onReset?: () => void;
}) {
  const inputId = useId();
  return (
    <FieldRow
      label={label}
      help={help}
      htmlFor={inputId}
      kind="input"
      disabled={disabled}
      title={title}
      divider={divider}
      onReset={onReset}
    >
      <NumberField
        id={inputId}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        disabled={disabled}
        normalize={normalize}
        minChars={minChars}
        inputRef={fieldRef}
        onCommit={onCommit}
      />
    </FieldRow>
  );
}
