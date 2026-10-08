import { useTranslation } from 'react-i18next';
import { Origami } from 'lucide-react';
import { useLayoutStore } from '../../store/layoutStore';
import styles from './FoldPanel.module.css';

/**
 * The Fold workspace's dock panel: the composition site for its header, the
 * split canvas, the tool rail and the step strip
 * (`implementation-plans/fold-workspace.md`, D14).
 *
 * The shell only, for now. Its header wears the shared `panel-toolbar` frame,
 * so it meets the Step pane's tab bar at the same height, and holds the slot
 * the touch drawer seats its pill in (`viewDrawerSlot`), so the Step and Paper
 * panes are reachable on a phone from the start. The body waits for the canvas.
 * No keyboard handling lives here: the `fold` shortcut scope is the route
 * (AGENTS.md › Panel components).
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
        <div className="panel-toolbar__pills" ref={setViewDrawerSlot} />
      </div>
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.mark} aria-hidden="true">
          <Origami size={22} />
        </div>
      </div>
    </section>
  );
}
