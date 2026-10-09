import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Origami } from 'lucide-react';
import type { SendToEditButtonModel } from '../../designKinds/sendToEditActions';
import { foldCommand, type FoldAction, type FoldCommand } from '../../fold/foldActions';
import type { FoldView } from '../../fold/sequence/foldViewMode';
import { stepCountLabel } from '../../fold/sequence/foldSequenceWords';
import { useIsPhoneLayout } from '../../platform/phoneLayout';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { SplitButton } from '../ui/SplitButton';
import { TouchHistoryButtons } from '../ui/TouchHistoryButtons';
import { WorkspaceTab, WorkspaceTabStrip } from '../ui/WorkspaceTabStrip';
import { FoldActionIcon } from './FoldActionIcon';
import styles from './FoldHeader.module.css';

/**
 * A catalog command as a header button: its icon, label and gating. On a
 * phone its icon alone, named by its label — three verbs, undo and redo and
 * the drawer's pill are wider together than the screen.
 */
function CommandButton({ command, compact }: { command: FoldCommand; compact: boolean }) {
  if (compact) {
    return (
      <IconButton
        size="sm"
        variant="toolbar"
        aria-label={command.label}
        title={command.hint ?? command.label}
        disabled={command.disabled}
        onClick={command.run}
      >
        <FoldActionIcon icon={command.icon} size={15} />
      </IconButton>
    );
  }
  return (
    <Button size="sm" variant="secondary" disabled={command.disabled} title={command.hint} onClick={command.run}>
      <FoldActionIcon icon={command.icon} />
      {command.label}
    </Button>
  );
}

/**
 * The Fold workspace's header (plan D14, shot-0): the canvas and the Steps
 * grid as two tabs with the count of steps, then the verbs that act on the
 * whole sequence — Import CP, Send to Edit, and the exports — as the action
 * catalog words and gates them (`fold/foldActions`), so they read here as they
 * do in the menus.
 *
 * Send to Edit is the design kinds' split button when `sendToEdit` is given
 * (its variants behind the caret), and the catalog's plain button otherwise.
 *
 * It wears the shared `panel-toolbar` frame, so it meets the Step pane's tab
 * bar at the same height. On a coarse pointer it carries undo and redo, the
 * phone's pane switch (`paneToggle`) and the slot the touch drawer seats its
 * pill in (`drawerSlot`): the canvas pill lane would sit over this header.
 * Presentation only: the view, the verbs and every call are props.
 */
export function FoldHeader({
  view,
  onViewChange,
  stepCount,
  actions,
  sendToEdit: sendToEditButton,
  paneToggle,
  drawerSlot,
}: {
  view: FoldView;
  onViewChange: (view: FoldView) => void;
  /** The steps that fold on the path shown: turns are not counted. */
  stepCount: number;
  /** The catalog, for the step on screen. */
  actions: readonly FoldAction[];
  /**
   * Send to Edit as the shared split button model (`useFoldSendToEditButton`),
   * built over the catalog's Send to Edit: its gate and its tooltip are the
   * model's, so a reason it is disabled is said in the one place.
   */
  sendToEdit?: SendToEditButtonModel;
  /** The phone's switch between the two canvases, mounted by the canvas. */
  paneToggle?: ReactNode;
  /** Where the touch layer seats the Step pane's pill (`viewDrawerSlot`). */
  drawerSlot: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const phone = useIsPhoneLayout();
  const importCp = foldCommand(actions, 'import-cp');
  const sendToEdit = foldCommand(actions, 'send-to-edit');
  const exportFold = foldCommand(actions, 'export-fold');
  const exportSteps = foldCommand(actions, 'export-steps');
  return (
    <div className={`panel-toolbar ${styles.header}`}>
      <div className={styles.lead}>
        <WorkspaceTabStrip
          className={styles.views}
          value={view}
          onValueChange={(value) => onViewChange(value === 'steps' ? 'steps' : 'fold')}
          label={t('panels:fold.header.views', 'View')}
          embedded
          tone="peers"
          fill={phone}
        >
          <WorkspaceTab
            value="fold"
            icon={<Origami size={13} aria-hidden="true" />}
            title={t('panels:fold.header.fold', 'Fold')}
            hint={t('panels:fold.header.foldHint', 'The step on screen, folded and as a crease pattern')}
          />
          <WorkspaceTab
            value="steps"
            icon={<LayoutGrid size={13} aria-hidden="true" />}
            title={t('panels:fold.header.steps', 'Steps')}
            hint={t('panels:fold.header.stepsHint', 'Every step of the path as a card')}
          />
        </WorkspaceTabStrip>
        <span className={styles.count}>{stepCountLabel(t, stepCount)}</span>
      </div>
      <div className={`panel-toolbar__group ${styles.actions}`}>
        <TouchHistoryButtons />
        {importCp && <CommandButton command={importCp} compact={phone} />}
        {sendToEdit &&
          (sendToEditButton && !phone ? (
            <SplitButton
              size="sm"
              variant="secondary"
              icon={<FoldActionIcon icon={sendToEdit.icon} />}
              label={sendToEditButton.label}
              title={sendToEditButton.title}
              disabled={sendToEditButton.disabled}
              onClick={sendToEditButton.run}
              menuLabel={sendToEditButton.menuLabel}
              actions={sendToEditButton.actions}
            />
          ) : (
            <CommandButton command={sendToEdit} compact={phone} />
          ))}
        {exportFold && (
          <SplitButton
            size="sm"
            variant="primary"
            icon={<FoldActionIcon icon={exportFold.icon} />}
            label={exportFold.label}
            title={exportFold.hint}
            disabled={exportFold.disabled}
            onClick={exportFold.run}
            menuLabel={t('panels:fold.header.moreExports', 'More ways to export')}
            actions={
              exportSteps
                ? [
                    {
                      id: exportSteps.id,
                      label: exportSteps.label,
                      title: exportSteps.hint,
                      disabled: exportSteps.disabled,
                      opensDialog: true,
                      onSelect: exportSteps.run,
                    },
                  ]
                : []
            }
          />
        )}
        {paneToggle}
        <div className="panel-toolbar__pills" ref={drawerSlot} />
      </div>
    </div>
  );
}
