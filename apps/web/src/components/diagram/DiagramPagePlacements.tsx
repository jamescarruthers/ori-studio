import { useTranslation } from 'react-i18next';
import { stepsOf, type DiagramStep } from '../../diagram/document/diagramDocument';
import { resetPagePlacements } from '../../diagram/pages/placementActions';
import { useCurrentDiagramPage } from '../../diagram/pages/useCurrentDiagramPage';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import styles from './DiagramPagePlacements.module.css';

const placed = (step: DiagramStep) => Boolean(step.place || step.placeNewer);

/**
 * The Page pane's steps placed by hand: how many, and the way back to the
 * layout's places for the current page — the page in view in the Pages
 * view, else the selected step's (`useCurrentDiagramPage`) — or for every
 * page.
 */
export function DiagramPagePlacements() {
  const { t } = useTranslation();
  const document = useWorkspaceStore((state) => state.diagram);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const current = useCurrentDiagramPage();
  const steps = document ? stepsOf(document) : [];
  const count = steps.filter(placed).length;
  const onPage = current ? current.page.steps.some((index) => placed(steps[index]!)) : false;
  if (!count) return null;
  return (
    <CollapsibleSection title={t('panels:diagram.placement.title', 'On the page')}>
      <div className={styles.content}>
        <p className={styles.note}>
          {t('panels:diagram.placement.count', 'Steps placed by hand: {{count}}', { count })}
        </p>
        <div className={styles.actions}>
          <Button
            size="sm"
            disabled={readOnly || !current || !onPage}
            onClick={() => current && resetPagePlacements(current.index)}
          >
            {t('panels:diagram.placement.resetPage', 'Reset This Page')}
          </Button>
          <Button size="sm" disabled={readOnly} onClick={() => resetPagePlacements(null)}>
            {t('panels:diagram.placement.resetAll', 'Reset All')}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
