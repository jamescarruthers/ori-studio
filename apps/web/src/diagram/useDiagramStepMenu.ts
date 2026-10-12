import { useCallback, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useShortcutStore } from '../store/shortcutStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import {
  contextMenuKeyboardAnchor,
  useContextMenuController,
  type ContextMenuController,
} from '../menus/context/useContextMenuController';
import { diagramPageMenuItems, diagramStepMenuItems } from './actions/diagramContextMenu';
import { diagramPageActions } from './pages/repackActions';
import { addDiagramStep, diagramStepActions } from './useDiagramActions';

/**
 * The Diagram's context menu: a card's or a page's step verbs, or Add Step on
 * the space between them — and on a flow page in the Pages view, past its
 * steps, the page's verbs (`diagramPageActions.ts`). A right-click selects
 * the step it lands on first, so the Step pane and the menu are about the
 * same step.
 *
 * The rows are built when the menu opens, from the store as it is then.
 */
export function useDiagramStepMenu(root: RefObject<HTMLElement | null>): {
  controller: ContextMenuController;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** Open the menu for a step from the keyboard, at its card. Whether it opened. */
  openStepMenu: (stepId: string) => boolean;
} {
  const { t } = useTranslation();
  const controller = useContextMenuController('diagram', {
    returnFocusTo: () => gridFocusTarget(root.current),
  });
  const request = controller.request;

  const requestStepMenu = useCallback(
    (stepId: string, at: { clientX: number; clientY: number }, source: 'pointer' | 'keyboard') => {
      request({
        ...at,
        source,
        targetKind: 'step',
        hasSelection: true,
        build: () =>
          diagramStepMenuItems(diagramStepActions(stepId, t), {
            overrides: useShortcutStore.getState().overrides,
            defaultsSource: useShortcutStore.getState().defaultsSource,
          }),
      });
    },
    [request, t]
  );

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      const card = (event.target as Element).closest<HTMLElement>('[data-step-id]');
      const stepId = card?.dataset.stepId;
      const at = { clientX: event.clientX, clientY: event.clientY };
      if (stepId) {
        useWorkspaceStore.getState().selectDiagramStep(stepId);
        requestStepMenu(stepId, at, 'pointer');
        return;
      }
      // A press on a page in the Pages view, past its steps: the page's own verbs too.
      const pageIndex = Number((event.target as Element).closest<HTMLElement>('[data-page]')?.dataset.page);
      request({
        ...at,
        targetKind: 'empty',
        hasSelection: useWorkspaceStore.getState().diagramSelectedStepId !== null,
        build: () => {
          if (useWorkspaceStore.getState().diagramReadOnly) return [];
          const pageItems = Number.isInteger(pageIndex)
            ? diagramPageMenuItems(diagramPageActions(pageIndex, t, 'context_menu'))
            : [];
          return [
            {
              kind: 'action',
              id: 'add-step',
              label: t('panels:diagram.actions.addStep', 'Add Step'),
              onSelect: () => {
                addDiagramStep();
              },
            },
            ...(pageItems.length > 0 ? [{ kind: 'separator' as const }, ...pageItems] : []),
          ];
        },
      });
    },
    [request, requestStepMenu, t]
  );

  const openStepMenu = useCallback(
    (stepId: string) => {
      const anchor = contextMenuKeyboardAnchor(stepCard(root.current, stepId));
      if (!anchor) return false;
      requestStepMenu(stepId, anchor, 'keyboard');
      return true;
    },
    [requestStepMenu, root]
  );

  return { controller, onContextMenu, openStepMenu };
}

/**
 * The card for a step, in the Steps view under `root`. Compared, not put in a
 * selector: an id read from a file can hold any character a selector would
 * need escaped.
 */
function stepCard(root: HTMLElement | null, stepId: string): HTMLElement | null {
  const cards = root?.querySelectorAll<HTMLElement>('[data-step-id]') ?? [];
  return [...cards].find((element) => element.dataset.stepId === stepId) ?? null;
}

/**
 * Where focus goes back to when the menu closes: the selected card — which a
 * row may have changed (Duplicate selects the copy) — or the grid itself when
 * nothing is selected (Delete took the last step). After a confirmation, the
 * same place, once the dialog closes.
 */
function gridFocusTarget(root: HTMLElement | null): HTMLElement | null {
  const selected = useWorkspaceStore.getState().diagramSelectedStepId;
  return (
    (selected !== null ? stepCard(root, selected) : null) ??
    root?.querySelector<HTMLElement>('[role="listbox"]') ??
    null
  );
}
