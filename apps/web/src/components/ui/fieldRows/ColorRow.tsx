import { ColorField } from '../ColorField';

/**
 * A colour swatch in a row — `ColorField`'s `row` layout already is one, so
 * this is the kit's name for it rather than a second implementation.
 * `onChange` fires per pointer move while the picker is open; `onCommit` once
 * on blur, which is the caller's commit point for one undo entry per pick.
 */
export function ColorRow({
  label,
  help,
  value,
  disabled,
  clearDisabled,
  nested,
  title,
  onChange,
  onCommit,
  onClear,
}: {
  label: string;
  /** What the colour does, for one whose name cannot carry it (`FieldRow.help`). */
  help?: string;
  value: string;
  disabled?: boolean;
  /** Whether the reset is disabled; defaults to {@link disabled}. */
  clearDisabled?: boolean;
  /** A step in, for a colour that qualifies the setting above it (`FieldRow.nested`). */
  nested?: boolean;
  /** Why the row is disabled, shown on hover. */
  title?: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  onClear?: () => void;
}) {
  return (
    <ColorField
      label={label}
      help={help}
      layout="row"
      value={value}
      disabled={disabled}
      clearDisabled={clearDisabled}
      nested={nested}
      title={title}
      onChange={onChange}
      onCommit={onCommit}
      onClear={onClear}
    />
  );
}
