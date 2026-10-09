import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { foldActionsAt } from '../../fold/sequence/foldCommands';
import { useFoldKeyboard } from '../../fold/sequence/foldKeys';
import { foldedStepCount } from '../../fold/sequence/foldSequencePath';
import { setFoldView, useFoldView } from '../../fold/sequence/foldViewMode';
import { useFoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import { useFoldSession } from '../../fold/session/useFoldSession';
import { useLayoutStore } from '../../store/layoutStore';
import { FoldCanvas } from '../fold/canvas/FoldCanvas';
import { FoldPhoneCanvasPills } from '../fold/canvas/FoldPhoneCanvasPills';
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
 * Fold | Steps tabs switch the body between the canvas (`FoldCanvas`), under
 * the strip, and the grid. The verbs are the action catalog's, at the step on
 * screen (`foldActionsAt`), as the menus and the keys build it, so the three
 * agree. On a phone the canvas's own pills (its tools, and the pane switch)
 * are seated in the header: the canvas pill lane would sit over it, as it
 * would over the Diagram's.
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
        paneToggle={view === 'fold' ? <FoldPhoneCanvasPills /> : undefined}
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
            <FoldCanvas />
          </div>
        </>
      )}
    </section>
  );
}
