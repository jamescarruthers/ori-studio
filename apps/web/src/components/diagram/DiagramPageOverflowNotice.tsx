import { useTranslation } from 'react-i18next';
import type { PreparedDiagramPages } from '../../diagram/pages/diagramPages';
import { pageOverflowSentence, pageUnfitSentence } from '../../diagram/pages/overflowLabels';
import { pageOverflow } from '../../diagram/pages/pageOverflow';
import { useCurrentDiagramPage } from '../../diagram/pages/useCurrentDiagramPage';
import { useDiagramPageActions } from '../../diagram/pages/useDiagramPageActions';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import styles from './DiagramPageOverflowNotice.module.css';

/**
 * The Pages view's notice about the current page (`useCurrentDiagramPage`)
 * when a step on it no longer fits the place the page keeps for it
 * (`implementation-plans/diagram-flow-packing.md`, Decision 3): which steps,
 * and Re-pack Page, which gives them room — nothing moves until it is
 * pressed. A page no plan fits even at the smallest size says so instead,
 * and that fewer steps is the way out: a re-pack cannot mend it. Nothing on
 * a page with nothing to report, and nothing on a grid.
 */
export function DiagramPageOverflowNotice({
  pages,
  className,
}: {
  /** The pages as laid out, whose cells say which steps overflow. */
  pages: PreparedDiagramPages | null;
  /** Where the notice sits, for the surface it is over. */
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const current = useCurrentDiagramPage();
  const { repackPage } = useDiagramPageActions('notice');
  const page = current ? pages?.layout.pages[current.index] : undefined;
  const overflow = page ? pageOverflow(page) : null;
  if (!current || !overflow) return null;
  return (
    <div className={className} data-page-overflow={current.index}>
      <Notice tone="warning">
        {overflow.steps.length > 0 && (
          <p className={styles.text}>{pageOverflowSentence(overflow.steps, current.name, t, i18n.language)}</p>
        )}
        {!overflow.fits && <p className={styles.text}>{pageUnfitSentence(current.name, t)}</p>}
        {overflow.steps.length > 0 && repackPage && (
          <Button size="sm" variant="ghost" disabled={repackPage.disabled} title={repackPage.hint} onClick={repackPage.run}>
            {repackPage.label}
          </Button>
        )}
      </Notice>
    </div>
  );
}
