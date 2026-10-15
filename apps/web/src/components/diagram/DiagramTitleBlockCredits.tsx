import { useEffect, useId, useRef, useState } from 'react';
import { Minus, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DiagramTitleBlockCredit } from '../../diagram/document/diagramDocument';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { FieldRowHelp } from '../ui/fieldRows/FieldRow';
import { isComposingKey } from '../ui/fieldRows/isComposingKey';
import { usePendingText } from '../ui/fieldRows/usePendingText';
import styles from './DiagramTitleBlockCredits.module.css';

/** The field to put the focus in once it appears: a credit's just added, or one just made to take typing. */
type Focus = { at: number; part: 'label' | 'value' } | null;

/**
 * The title block's credits, as the Page pane edits them (Zach, 2026-10-15:
 * label + value fields): a row each — its label, and its value typed or the
 * live step count, with the way to type one instead — and a credit added at
 * the end, or the step count where no credit follows it. Only what can be
 * done is offered; each field commits as it is typed (`usePendingText`), a
 * sitting at it one undo step.
 */
export function DiagramTitleBlockCredits({
  credits,
  stepCount,
  hasStepCount,
  disabled = false,
  nested = false,
  onAdd,
  onAddStepCount,
  onRemove,
  onLabel,
  onValue,
  onTypeValue,
}: {
  credits: readonly DiagramTitleBlockCredit[];
  /** The number a live step count prints now. */
  stepCount: number;
  /** Whether a credit follows the step count already. */
  hasStepCount: boolean;
  disabled?: boolean;
  /** A step in, under the toggle the credits belong to (`FieldRow.nested`). */
  nested?: boolean;
  onAdd: () => void;
  onAddStepCount: () => void;
  onRemove: (at: number) => void;
  onLabel: (at: number, label: string, session: number) => void;
  onValue: (at: number, value: string, session: number) => void;
  onTypeValue: (at: number) => void;
}) {
  const { t } = useTranslation();
  const headId = useId();
  const [focus, setFocus] = useState<Focus>(null);
  return (
    <div
      className={styles.credits}
      role="group"
      aria-labelledby={headId}
      data-nested={nested || undefined}
      data-disabled={disabled || undefined}
      // Once a field asked for has the focus, nothing else is waiting for it.
      onFocus={() => setFocus(null)}
    >
      <span className={styles.head}>
        <span id={headId} className={styles.label}>
          {t('panels:diagram.pagePane.titleBlock.credits', 'Credits')}
        </span>
        <FieldRowHelp
          help={t(
            'panels:diagram.pagePane.titleBlock.creditsHelp',
            'A row under the title: each credit prints its label over its value. A value can be the step count, kept up to date.'
          )}
        />
      </span>
      {credits.length > 0 && (
        <ol className={styles.list}>
          {credits.map((credit, at) => {
            const number = at + 1;
            return (
              <li key={at} className={styles.credit} data-credit="">
                <CreditField
                  label={t('panels:diagram.pagePane.titleBlock.creditLabel', 'Label of credit {{number}}', { number })}
                  placeholder={t('panels:diagram.pagePane.titleBlock.creditLabelPlaceholder', 'Label')}
                  value={credit.label}
                  disabled={disabled}
                  focusOnMount={focus?.at === at && focus.part === 'label'}
                  onCommit={(text, session) => onLabel(at, text, session)}
                />
                {typeof credit.value === 'string' ? (
                  <CreditField
                    label={t('panels:diagram.pagePane.titleBlock.creditValue', 'Value of credit {{number}}', { number })}
                    placeholder={t('panels:diagram.pagePane.titleBlock.creditValuePlaceholder', 'Value')}
                    value={credit.value}
                    disabled={disabled}
                    focusOnMount={focus?.at === at && focus.part === 'value'}
                    onCommit={(text, session) => onValue(at, text, session)}
                  />
                ) : (
                  <span className={styles.live} data-credit-live="">
                    <span
                      className={styles.count}
                      title={t('panels:diagram.pagePane.titleBlock.stepCountHelp', 'The step count, kept up to date')}
                    >
                      {t('panels:diagram.pagePane.titleBlock.stepCount', 'Auto ({{number}})', { number: stepCount })}
                    </span>
                    <IconButton
                      size="sm"
                      title={t('panels:diagram.pagePane.titleBlock.typeValue', 'Type a value instead')}
                      disabled={disabled}
                      onClick={() => {
                        setFocus({ at, part: 'value' });
                        onTypeValue(at);
                      }}
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </IconButton>
                  </span>
                )}
                <IconButton
                  size="sm"
                  title={t('panels:diagram.pagePane.titleBlock.removeCredit', 'Remove credit {{number}}', { number })}
                  disabled={disabled}
                  onClick={() => onRemove(at)}
                >
                  <Minus size={14} aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ol>
      )}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setFocus({ at: credits.length, part: 'label' });
            onAdd();
          }}
        >
          <Plus size={14} aria-hidden="true" />
          {t('panels:diagram.pagePane.titleBlock.addCredit', 'Add Credit')}
        </Button>
        {!hasStepCount && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onAddStepCount}>
            <Plus size={14} aria-hidden="true" />
            {t('panels:diagram.pagePane.titleBlock.addStepCount', 'Add Step Count')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One of a credit's fields: one line, committed as it is typed. Enter and
 * Escape leave it, keeping what was typed, as a one-line `TextAreaRow` does.
 */
function CreditField({
  label,
  placeholder,
  value,
  disabled,
  focusOnMount,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  /** Take the focus as it appears: a field the author has just asked for. */
  focusOnMount: boolean;
  onCommit: (value: string, session: number) => void;
}) {
  const text = usePendingText({ value, idleMs: 600, onCommit });
  const field = useRef<HTMLInputElement>(null);
  const [focusFirst] = useState(focusOnMount);
  useEffect(() => {
    if (focusFirst) field.current?.focus();
  }, [focusFirst]);
  return (
    <input
      ref={field}
      className={styles.field}
      aria-label={label}
      placeholder={placeholder}
      value={text.shown}
      disabled={disabled}
      onFocus={text.begin}
      onChange={(event) => text.change(event.target.value)}
      onBlur={text.end}
      onKeyDown={(event) => {
        // An input method's Enter and Escape accept or cancel a conversion.
        if (isComposingKey(event)) return;
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
