import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Origami } from 'lucide-react';
import type { SendToEditButtonModel } from '../../designKinds/sendToEditActions';
import { foldCommand, type FoldAction, type FoldCommand } from '../../fold/foldActions';
import type { FoldView } from '../../fold/sequence/foldViewMode';
import { stepCountLabel } from '../../fold/sequence/foldSequenceWords';
import { useIsPhoneLayout } from '../../platform/phoneLayout';
import { ViewportToolbarOverflowMenu } from '../panels/ViewportToolbarOverflowMenu';
import type { ViewportToolbarAction, ViewportToolbarOverflowGroup } from '../panels/viewportToolbarLayout';
import { Button } from '../ui/Button';
import { SplitButton } from '../ui/SplitButton';
import { TouchHistoryButtons } from '../ui/TouchHistoryButtons';
import { WorkspaceTab, WorkspaceTabStrip } from '../ui/WorkspaceTabStrip';
import { FoldActionIcon } from './FoldActionIcon';
import styles from './FoldHeader.module.css';

/** A catalog command as a header button: its icon, label and gating. */
function CommandButton({ command }: { command: FoldCommand }) {
  return (
    <Button size="sm" variant="secondary" disabled={command.disabled} title={command.hint} onClick={command.run}>
      <FoldActionIcon icon={command.icon} />
      {command.label}
    </Button>
  );
}

/** A catalog command as a row of the phone's `⋯` menu. */
function commandRow(command: FoldCommand | undefined, opensDialog: boolean): ViewportToolbarAction | null {
  return command
    ? {
        kind: 'action',
        id: command.id,
        label: command.label,
        title: command.hint,
        icon: <FoldActionIcon icon={command.icon} />,
        disabled: command.disabled,
        opensDialog,
        onSelect: command.run,
      }
    : null;
}

/**
 * The verbs for the whole sequence as the phone's `⋯` menu holds them, in the
 * header's order: Import CP; Send to Edit and its variants, as the split
 * button offers them; the two exports.
 */
function phoneVerbGroups(
  actions: readonly FoldAction[],
  sendToEditButton: SendToEditButtonModel | undefined
): ViewportToolbarOverflowGroup[] {
  const sendToEdit = foldCommand(actions, 'send-to-edit');
  const send: (ViewportToolbarAction | null)[] =
    sendToEdit && sendToEditButton
      ? [
          {
            kind: 'action',
            id: sendToEdit.id,
            label: sendToEditButton.label,
            title: sendToEditButton.title,
            icon: <FoldActionIcon icon={sendToEdit.icon} />,
            disabled: sendToEditButton.disabled,
            onSelect: sendToEditButton.run,
          },
          ...sendToEditButton.actions.map(
            (variant): ViewportToolbarAction => ({
              kind: 'action',
              id: `${sendToEdit.id}-${variant.id}`,
              // A variant names the verb itself ("Send to Edit (include circles)").
              label: variant.label,
              title: variant.title,
              icon: <FoldActionIcon icon={sendToEdit.icon} />,
              disabled: sendToEditButton.disabled || variant.disabled,
              onSelect: variant.onSelect,
            })
          ),
        ]
      : [commandRow(sendToEdit, false)];
  const groups: { id: string; items: (ViewportToolbarAction | null)[] }[] = [
    { id: 'return', items: [commandRow(foldCommand(actions, 'unfold-to'), false), commandRow(foldCommand(actions, 'repeat'), false)] },
    { id: 'in', items: [commandRow(foldCommand(actions, 'import-cp'), true)] },
    { id: 'send', items: send },
    {
      id: 'out',
      items: [commandRow(foldCommand(actions, 'export-fold'), true), commandRow(foldCommand(actions, 'export-steps'), true)],
    },
  ];
  return groups
    .map((group) => ({ id: group.id, items: group.items.filter((item): item is ViewportToolbarAction => item !== null) }))
    .filter((group) => group.items.length > 0);
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
 * bar at the same height. On a coarse pointer it carries undo and redo and the
 * slot the touch drawer seats its pill in (`drawerSlot`): the canvas pill lane
 * would sit over this header. On a phone it keeps to one row — the tabs their
 * icons alone, the count left to the strip's numbers, and the verbs in one
 * `⋯` menu — so the paper keeps the height; the canvas's own pills (its tools,
 * the pane switch) are on the canvas's bar. Presentation only: the view, the
 * verbs and every call are props.
 */
export function FoldHeader({
  view,
  onViewChange,
  stepCount,
  actions,
  sendToEdit: sendToEditButton,
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
  /** Where the touch layer seats the Step pane's pill (`viewDrawerSlot`). */
  drawerSlot: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const phone = useIsPhoneLayout();
  const unfold = foldCommand(actions, 'unfold-to');
  const importCp = foldCommand(actions, 'import-cp');
  const sendToEdit = foldCommand(actions, 'send-to-edit');
  const exportFold = foldCommand(actions, 'export-fold');
  const exportSteps = foldCommand(actions, 'export-steps');
  return (
    <div className={`panel-toolbar ${styles.header}`} data-phone={phone || undefined}>
      <div className={styles.lead}>
        <WorkspaceTabStrip
          className={styles.views}
          value={view}
          onValueChange={(value) => onViewChange(value === 'steps' ? 'steps' : 'fold')}
          label={t('panels:fold.header.views', 'View')}
          embedded
          tone="peers"
        >
          <WorkspaceTab
            value="fold"
            icon={<Origami size={phone ? 16 : 13} aria-hidden="true" />}
            title={t('panels:fold.header.fold', 'Fold')}
            hint={t('panels:fold.header.foldHint', 'The step on screen, folded and as a crease pattern')}
            iconOnly={phone}
          />
          <WorkspaceTab
            value="steps"
            icon={<LayoutGrid size={phone ? 16 : 13} aria-hidden="true" />}
            title={t('panels:fold.header.steps', 'Steps')}
            hint={t('panels:fold.header.stepsHint', 'Every step of the path as a card')}
            iconOnly={phone}
          />
        </WorkspaceTabStrip>
        {!phone && <span className={styles.count}>{stepCountLabel(t, stepCount)}</span>}
      </div>
      <div className={`panel-toolbar__group ${styles.actions}`}>
        <TouchHistoryButtons />
        {phone ? (
          <ViewportToolbarOverflowMenu
            groups={phoneVerbGroups(actions, sendToEditButton)}
            label={t('panels:fold.header.moreVerbs', 'Import, send and export')}
            side="bottom"
          />
        ) : (
          <>
            {unfold && <CommandButton command={unfold} />}
            {importCp && <CommandButton command={importCp} />}
            {sendToEdit &&
              (sendToEditButton ? (
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
                <CommandButton command={sendToEdit} />
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
          </>
        )}
        <div className="panel-toolbar__pills" ref={drawerSlot} />
      </div>
    </div>
  );
}
