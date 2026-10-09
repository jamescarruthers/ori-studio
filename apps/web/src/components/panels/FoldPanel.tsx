import { useTranslation } from 'react-i18next';
import { Origami } from 'lucide-react';
import { useLayoutStore } from '../../store/layoutStore';
import { FoldCanvas } from '../fold/canvas/FoldCanvas';
import { FoldPhoneCanvasPills } from '../fold/canvas/FoldPhoneCanvasPills';
import { TouchHistoryButtons } from '../ui/TouchHistoryButtons';
import styles from './FoldPanel.module.css';

/**
 * The Fold workspace's dock panel: the composition site for its header, the
 * split canvas, the tool rail and the step strip
 * (`implementation-plans/fold-workspace.md`, D14).
 *
 * Its header wears the shared `panel-toolbar` frame, so it meets the Step
 * pane's tab bar at the same height. On a coarse pointer it carries undo and
 * redo, and the slot the touch drawer seats its pill in (`viewDrawerSlot`), so
 * the Step and Paper panes are reachable on a phone from the start: the canvas
 * pill lane would sit over this header, as it would over the Diagram's — which
 * is why the canvas's own phone pills (its tools, and the pane switch) are
 * seated here too. The body is the canvas (`FoldCanvas`). No keyboard
 * handling lives here: the `fold` shortcut scope is the route (AGENTS.md ›
 * Panel components).
 */
export function FoldPanel() {
  const { t } = useTranslation();
  const setViewDrawerSlot = useLayoutStore((state) => state.setViewDrawerSlot);

  return (
    <section className="panel-shell" aria-label={t('common:workspaceRail.fold', 'Fold workspace')}>
      <div className="panel-toolbar">
        <div className="panel-toolbar__group">
          <Origami size={14} aria-hidden="true" />
          <span className="panel-title">{t('common:workspaceRail.tabFold', 'Fold')}</span>
        </div>
        <div className="panel-toolbar__group">
          <FoldPhoneCanvasPills />
          <TouchHistoryButtons />
          <div className="panel-toolbar__pills" ref={setViewDrawerSlot} />
        </div>
      </div>
      <div className={`panel-body ${styles.body}`}>
        <FoldCanvas />
      </div>
    </section>
  );
}
