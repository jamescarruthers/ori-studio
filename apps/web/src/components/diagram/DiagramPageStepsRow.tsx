import { useTranslation } from 'react-i18next';
import { PAGE_STEPS_RANGE } from '../../diagram/document/diagramDocument';
import type { CurrentDiagramPage } from '../../diagram/pages/useCurrentDiagramPage';
import { Button } from '../ui/Button';
import { NumberRow } from '../ui/fieldRows';
import styles from './DiagramPageStepsRow.module.css';

/**
 * The Page pane's count for one flow page, under Steps per page, which stays
 * the default for every page without one
 * (`implementation-plans/diagram-flow-pages.md`, UI): the current page — the
 * page in view in the Pages view, else the selected step's — with its own
 * count and Use default, or what it is cut for now and a quiet "Default".
 *
 * A page without a count shows the steps it is laid out for (`layoutCount`):
 * its steps, but on an automatic last page the default, which its few steps
 * fill in order — so typing their number gives them the page to themselves.
 *
 * The line under the field holds the note or the action, so the stepper
 * stays where it is as one gives way to the other.
 */
export function DiagramPageStepsRow({
  current,
  disabled,
  onChange,
}: {
  current: CurrentDiagramPage;
  disabled: boolean;
  /** A count for the page, or null to return it to the default. */
  onChange: (count: number | null) => void;
}) {
  const { t } = useTranslation();
  const { page, index, name } = current;
  const own = page.ownCount;
  return (
    <div className={styles.row}>
      <NumberRow
        // Another page, another field: a number half typed for one page is never committed to the next.
        key={index}
        label={t('panels:diagram.pagePane.pageSteps', 'Steps on page {{number}}', { number: name })}
        value={own ? page.capacity : page.layoutCount}
        min={PAGE_STEPS_RANGE.min}
        max={PAGE_STEPS_RANGE.max}
        step={1}
        disabled={disabled}
        divider={false}
        onCommit={onChange}
      />
      <div className={styles.foot}>
        {own ? (
          <Button size="sm" variant="ghost" className={styles.action} disabled={disabled} onClick={() => onChange(null)}>
            {t('panels:diagram.pagePane.pageStepsUseDefault', 'Use default')}
          </Button>
        ) : (
          <span className={styles.note}>{t('panels:diagram.pagePane.pageStepsDefault', 'Default')}</span>
        )}
      </div>
    </div>
  );
}
