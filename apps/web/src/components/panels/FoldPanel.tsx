import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { foldCommand } from '../../fold/foldActions';
import { useFoldSendToEditButton } from '../../fold/io/foldIoActions';
import { FOLD_DROP_POLICY, useFoldDrop } from '../../fold/io/useFoldDrop';
import { foldActionsAt } from '../../fold/sequence/foldCommands';
import { useFoldKeyboard } from '../../fold/sequence/foldKeys';
import { foldedStepCount } from '../../fold/sequence/foldSequencePath';
import { setFoldView, useFoldView } from '../../fold/sequence/foldViewMode';
import { useFoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import { useFoldSession } from '../../fold/session/useFoldSession';
import { useLayoutStore } from '../../store/layoutStore';
import { FileDropOverlay } from '../FileDropOverlay';
import { FoldCanvas } from '../fold/canvas/FoldCanvas';
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
 * agree; Send to Edit is the split button every design kind's is
 * (`useFoldSendToEditButton`), its variants behind the caret. On a phone the
 * header keeps to one row, seating the drawer's pill (the canvas pill lane
 * would sit over it, as it would over the Diagram's), and the canvas's own
 * controls are on its bar. A crease pattern dropped anywhere on the panel —
 * the panes, the strip, the header or the Steps view — is Import CP
 * (`useFoldDrop`).
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
  const sendToEdit = useFoldSendToEditButton(foldCommand(actions, 'send-to-edit'));
  const drop = useFoldDrop();

  return (
    <section
      className="panel-shell file-drop-region"
      aria-label={t('common:workspaceRail.fold', 'Fold workspace')}
      onPointerDownCapture={keys.onPointerDownCapture}
      {...drop.dropTargetProps}
    >
      {/* A crease pattern dropped anywhere on Fold is Import CP; anything else goes on to the app's target. */}
      <FileDropOverlay visible={drop.isDragActive} policy={FOLD_DROP_POLICY} />
      <FoldHeader
        view={view}
        onViewChange={setFoldView}
        stepCount={foldedStepCount(sequence.entries)}
        actions={actions}
        sendToEdit={sendToEdit}
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
