/**
 * Fold's io verbs for the surfaces that place them beside the menu: the
 * action catalog's bindings (`fold/foldActions.ts`) and the Send to Edit
 * button. Each dispatches its menu id through the shared chokepoint, so a
 * press is gated by the same capability as the menu row and counted once as
 * `command invoked`; nothing here runs a verb itself.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { handleMenuAction, type MenuActionId } from '../../commands/menuActions';
import {
  sendToEditButtonModel,
  type SendToEditButtonModel,
  type SendToEditVariant,
} from '../../designKinds/sendToEditActions';
import { useWorkspaceCapabilities } from '../../store/workspaceStore/useWorkspaceCapabilities';
import { foldSendToEditSource, type FoldActionDeps } from '../foldActions';

/** The action catalog's io commands, by the menu id each dispatches. */
export const FOLD_IO_COMMAND_MENU_IDS = {
  'import-cp': 'fold.import-cp',
  'send-to-edit': 'fold.send-to-edit',
  'send-to-diagram': 'fold.send-to-diagram',
  'send-path-to-diagram': 'fold.send-path-to-diagram',
  'export-fold': 'fold.export-fold',
  'export-steps': 'fold.export-steps',
} as const satisfies Record<string, MenuActionId>;

const dispatch = (id: MenuActionId) => () => {
  void handleMenuAction(id);
};

/** `buildFoldActions`' io bindings: Import CP, Send to Edit, Send to Diagram and the two exports. */
export const FOLD_IO_ACTION_DEPS: Pick<
  FoldActionDeps,
  'importCp' | 'sendToEdit' | 'sendToDiagram' | 'exportFold' | 'exportSteps'
> = {
  importCp: dispatch(FOLD_IO_COMMAND_MENU_IDS['import-cp']),
  sendToEdit: dispatch(FOLD_IO_COMMAND_MENU_IDS['send-to-edit']),
  sendToDiagram: (scope) =>
    dispatch(FOLD_IO_COMMAND_MENU_IDS[scope === 'step' ? 'send-to-diagram' : 'send-path-to-diagram'])(),
  exportFold: dispatch(FOLD_IO_COMMAND_MENU_IDS['export-fold']),
  exportSteps: dispatch(FOLD_IO_COMMAND_MENU_IDS['export-steps']),
};

/** The menu id a Send to Edit variant dispatches. */
function sendToEditMenuId(variant: SendToEditVariant): MenuActionId {
  return variant.id === 'precreases-as-aux' ? 'fold.send-to-edit-precreases-as-aux' : 'fold.send-to-edit';
}

/**
 * The Send to Edit button for a Fold sequence (plan D10, D14): the shared
 * model every design kind's button is (`sendToEditButtonModel`) over Fold's
 * source — its tooltip, and its precreases as auxiliary lines behind the
 * caret — gated by the menu row's capability.
 */
export function useFoldSendToEditButton(): SendToEditButtonModel {
  const { t } = useTranslation();
  const capability = useWorkspaceCapabilities()['fold.send-to-edit'];
  return useMemo(
    () =>
      sendToEditButtonModel(foldSendToEditSource(t), t, {
        send: (variant) => void handleMenuAction(sendToEditMenuId(variant)),
        disabled: !capability.enabled,
        reason: capability.reason,
      }),
    [t, capability.enabled, capability.reason]
  );
}
