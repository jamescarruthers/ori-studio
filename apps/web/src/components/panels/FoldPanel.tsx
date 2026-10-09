import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Origami } from 'lucide-react';
import { foldActionsAt } from '../../fold/sequence/foldCommands';
import { useFoldKeyboard } from '../../fold/sequence/foldKeys';
import { foldedStepCount } from '../../fold/sequence/foldSequencePath';
import { setFoldView, useFoldView } from '../../fold/sequence/foldViewMode';
import { useFoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import { useFoldSession } from '../../fold/session/useFoldSession';
import { useLayoutStore } from '../../store/layoutStore';
import { FoldHeader } from '../fold/FoldHeader';
import { FoldStepStrip } from '../fold/steps/FoldStepStrip';
import { FoldStepsGrid } from '../fold/steps/FoldStepsGrid';
import styles from './FoldPanel.module.css';

/**
 * The Fold workspace's dock panel: the composition site for its header, the
 * step strip over the split canvas, and the Steps grid
 * (`implementation-plans/fold-workspace.md`, D14).
 *
 * It holds the Fold session while mounted (`useFoldSession`), so the worker
 * runs and the sequence is replayed while the workspace is open, and the keys
 * (`useFoldKeyboard`): the registry's `fold` scope and viewport surface,
 * never a `keydown` listener here (AGENTS.md › Panel components). The header's
 * Fold | Steps tabs switch the body between the canvas, under the strip, and
 * the grid. The verbs are the action catalog's, at the step on screen
 * (`foldActionsAt`), as the menus and the keys build it, so the three agree.
 */
export function FoldPanel() {
  const { t } = useTranslation();
  const setViewDrawerSlot = useLayoutStore((state) => state.setViewDrawerSlot);
  useFoldSession();
  const keys = useFoldKeyboard();
  const view = useFoldView();
  const sequence = useFoldSequenceView();
  const { document, entries, cursor, readOnly } = sequence;
  const actions = useMemo(
    () => foldActionsAt(t, document, entries, cursor, readOnly),
    [t, document, entries, cursor, readOnly]
  );

  return (
    <section
      className="panel-shell"
      aria-label={t('common:workspaceRail.fold', 'Fold workspace')}
      onPointerDownCapture={keys.onPointerDownCapture}
    >
      <FoldHeader
        view={view}
        onViewChange={setFoldView}
        stepCount={foldedStepCount(sequence.entries)}
        actions={actions}
        drawerSlot={setViewDrawerSlot}
      />
      {view === 'steps' ? (
        <div className={`panel-body ${styles.steps}`}>
          <FoldStepsGrid view={sequence} />
        </div>
      ) : (
        <>
          <FoldStepStrip view={sequence} />
          <div className={`panel-body ${styles.body}`}>
            <div className={styles.mark} aria-hidden="true">
              <Origami size={22} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
