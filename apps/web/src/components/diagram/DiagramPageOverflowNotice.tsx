import { useTranslation } from 'react-i18next';
import type { PreparedDiagramPages } from '../../diagram/pages/diagramPages';
import { pageUnfitSentence } from '../../diagram/pages/overflowLabels';
import { pageHoldsItsSteps } from '../../diagram/pages/pageOverflow';
import { useCurrentDiagramPage } from '../../diagram/pages/useCurrentDiagramPage';
import { Notice } from '../ui/Notice';
import styles from './DiagramPageOverflowNotice.module.css';

/**
 * The Pages view's notice about the current page (`useCurrentDiagramPage`)
 * when no plan fits its steps even at the smallest size
 * (`implementation-plans/diagram-flow-packing.md`, Decision 3): the
 * automatic layout failing, which a re-pack cannot mend, and fewer steps is
 * the way out. A step's own new picture or caption past its place is not
 * said: it shows on the page (Zach, 2026-10-12). Nothing on a page with
 * nothing to report, and nothing on a grid.
 */
export function DiagramPageOverflowNotice({
  pages,
  className,
}: {
  /** The pages as laid out, whose packing says whether each holds its steps. */
  pages: PreparedDiagramPages | null;
  /** Where the notice sits, for the surface it is over. */
  className?: string;
}) {
  const { t } = useTranslation();
  const current = useCurrentDiagramPage();
  const page = current ? pages?.layout.pages[current.index] : undefined;
  if (!current || !page || pageHoldsItsSteps(page)) return null;
  return (
    <div className={className} data-page-overflow={current.index}>
      <Notice tone="warning">
        <p className={styles.text}>{pageUnfitSentence(current.name, t)}</p>
      </Notice>
    </div>
  );
}
