import { useTranslation } from 'react-i18next';
import { stepById } from '../../diagram/document/diagramDocument';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isDiagramAnnotating } from '../../store/workspaceStore/diagramState';
import { DiagramLayers } from '../diagram/DiagramLayers';
import { DiagramPageLayers } from '../diagram/DiagramPageLayers';
import styles from './DiagramLayersPanel.module.css';

/**
 * The Layers pane (Zach, 2026-10-05): what is drawn on the step open in
 * Annotate and the selected one's controls, a tab beside Step and Page — the
 * Diagram's Properties, brought forward when a mark is selected
 * (`useDiagramPaneReveal`). In the Pages view, the steps on the current page
 * and the selected one's placement, brought forward when a step is selected
 * there (Zach, 2026-10-12).
 *
 * A composition site (AGENTS.md › Panel components): it picks Annotate's
 * layers (`DiagramLayers`, handed the step) or the page's
 * (`DiagramPageLayers`). Elsewhere it says so, in one line.
 */
export function DiagramLayersPanel() {
  const { t } = useTranslation();
  const step = useWorkspaceStore((state) =>
    state.diagram && state.diagramSelectedStepId !== null && isDiagramAnnotating(state)
      ? stepById(state.diagram, state.diagramSelectedStepId)
      : null
  );
  const pages = useWorkspaceStore((state) => state.diagramView === 'pages' && state.diagramDetail === null);

  return (
    <section className="panel-shell">
      {step ? (
        <div className="panel-body">
          <DiagramLayers step={step} />
        </div>
      ) : pages ? (
        <div className="panel-body">
          <DiagramPageLayers />
        </div>
      ) : (
        <div className={`panel-body ${styles.empty}`}>
          <p className={styles.emptyNote}>
            {t('panels:diagram.layers.empty', 'Open a step in Annotate to see its layers.')}
          </p>
        </div>
      )}
    </section>
  );
}
