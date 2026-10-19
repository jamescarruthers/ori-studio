import { useEffect, useId, useRef, useState } from 'react';
import { Minus, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DiagramTitleBlockCredit } from '../../diagram/document/diagramDocument';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StackedRow, TextField } from '../ui/fieldRows';
import styles from './DiagramTitleBlockCredits.module.css';

/**
 * Where the focus goes once an edit has landed: a credit's field or its remove button — the last credit's for one
 * just added — or Add Credit, once the list is empty.
 */
type Focus = { part: 'label' | 'value' | 'remove'; at: number | 'last' } | { part: 'add' } | null;

/**
 * The title block's credits, as the Page pane edits them (Zach, 2026-10-15:
 * label + value fields): a row each — its label, and its value typed or the
 * live step count, read with the way to type one instead — and a credit added
 * at the end, or the step count where no credit follows it. Only what can be
 * done is offered; each field commits as it is typed (`TextField`), a sitting
 * at it one undo step. The focus never falls out of the list: an added credit
 * takes it, and a removed one hands it on.
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
  const group = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus>(null);
  useEffect(() => {
    if (!focus) return;
    const at = focus.part === 'add' ? null : focus.at === 'last' ? credits.length - 1 : focus.at;
    const selector = focus.part === 'add' ? '[data-credits-add]' : `[data-credit="${at}"] [data-credit-part="${focus.part}"]`;
    const target = group.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.focus();
    setFocus(null);
  }, [focus, credits.length]);
  const remove = (at: number) => {
    // The next credit's remove takes the focus where it was; past the end, the one before it, or Add Credit.
    const left = credits.length - 1;
    setFocus(at < left ? { part: 'remove', at } : left > 0 ? { part: 'remove', at: left - 1 } : { part: 'add' });
    onRemove(at);
  };
  return (
    <StackedRow
      ref={group}
      label={t('panels:diagram.pagePane.titleBlock.credits', 'Credits')}
      labelId={headId}
      help={t(
        'panels:diagram.pagePane.titleBlock.creditsHelp',
        'A row under the title: each credit prints its label over its value. A value can be the step count, kept up to date.'
      )}
      nested={nested}
      disabled={disabled}
      role="group"
      aria-labelledby={headId}
    >
      {credits.length > 0 && (
        <ol className={styles.list}>
          {credits.map((credit, at) => {
            const number = at + 1;
            const value = t('panels:diagram.pagePane.titleBlock.creditValue', 'Value of credit {{number}}', { number });
            return (
              <li key={at} className={styles.credit} data-credit={at}>
                <TextField
                  lines="one"
                  label={t('panels:diagram.pagePane.titleBlock.creditLabel', 'Label of credit {{number}}', { number })}
                  placeholder={t('panels:diagram.pagePane.titleBlock.creditLabelPlaceholder', 'Label')}
                  value={credit.label}
                  disabled={disabled}
                  data-credit-part="label"
                  onCommit={(text, session) => onLabel(at, text, session)}
                />
                {typeof credit.value === 'string' ? (
                  <TextField
                    lines="one"
                    label={value}
                    placeholder={t('panels:diagram.pagePane.titleBlock.creditValuePlaceholder', 'Value')}
                    value={credit.value}
                    disabled={disabled}
                    data-credit-part="value"
                    onCommit={(text, session) => onValue(at, text, session)}
                  />
                ) : (
                  <span className={styles.live} data-credit-live="">
                    {/* Read, never typed: a field, so the keyboard reaches it and a reader hears what it holds. */}
                    <TextField
                      lines="one"
                      readOnly
                      label={value}
                      value={t('panels:diagram.pagePane.titleBlock.stepCount', 'Auto ({{number}})', { number: stepCount })}
                      disabled={disabled}
                      data-credit-part="count"
                    />
                    <IconButton
                      size="sm"
                      title={t('panels:diagram.pagePane.titleBlock.typeValue', 'Type a value for credit {{number}} instead', { number })}
                      disabled={disabled}
                      onClick={() => {
                        setFocus({ part: 'value', at });
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
                  data-credit-part="remove"
                  onClick={() => remove(at)}
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
          data-credits-add=""
          onClick={() => {
            setFocus({ part: 'label', at: 'last' });
            onAdd();
          }}
        >
          <Plus size={14} aria-hidden="true" />
          {t('panels:diagram.pagePane.titleBlock.addCredit', 'Add Credit')}
        </Button>
        {!hasStepCount && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setFocus({ part: 'label', at: 'last' });
              onAddStepCount();
            }}
          >
            <Plus size={14} aria-hidden="true" />
            {t('panels:diagram.pagePane.titleBlock.addStepCount', 'Add Step Count')}
          </Button>
        )}
      </div>
    </StackedRow>
  );
}
