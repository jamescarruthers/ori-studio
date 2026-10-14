import type { ContextMenuItem } from '../../components/ui/contextMenuTypes';
import { shortcutLabelForAction, type ShortcutResolutionInput } from '../../keyboard/shortcuts';
import { diagramActionIconNode, hasDiagramActionIcon } from './diagramActionIcons';
import type { DiagramStepAction } from './diagramActions';
import type { DiagramPageCommand } from './diagramPageActions';

/**
 * A step card's context menu: the step verbs, as rows, the catalog's groups
 * as submenus — or a turn's verbs (`diagramTurnActions.ts`), which share the
 * shape. Each row shows the key that runs the same verb, resolved against the
 * user's bindings, so a rebind reads true here, and the verb's icon
 * (`diagramActionIcons.tsx`); a row that is one of a set of ways draws its
 * check there instead.
 */
export function diagramStepMenuItems(
  actions: readonly DiagramStepAction[],
  shortcuts?: ShortcutResolutionInput
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  for (const action of actions) {
    if (action.kind === 'separator') {
      // Collapse a separator that would lead or double up.
      const last = items[items.length - 1];
      if (!last || last.kind === 'separator') continue;
      items.push({ kind: 'separator' });
      continue;
    }
    const icon = hasDiagramActionIcon(action.id) ? diagramActionIconNode(action.id) : undefined;
    if (action.kind === 'group') {
      items.push({
        kind: 'submenu',
        id: action.id,
        label: action.label,
        icon,
        disabled: action.disabled,
        hint: action.hint,
        items: diagramStepMenuItems(action.items, shortcuts),
      });
      continue;
    }
    if (action.kind === 'choice') {
      // Show as marks the way the step is shown; Duplicate as is a verb per way.
      items.push({
        kind: 'submenu',
        id: action.id,
        label: action.label,
        icon,
        disabled: action.disabled,
        hint: action.hint,
        items: action.options.map((option) =>
          option.checked !== undefined
            ? { kind: 'radio' as const, id: `${action.id}-${option.id}`, label: option.label, checked: option.checked, onSelect: option.run }
            : { kind: 'action' as const, id: `${action.id}-${option.id}`, label: option.label, onSelect: option.run }
        ),
      });
      continue;
    }
    if (action.checked !== undefined && action.radio) {
      items.push({
        kind: 'radio',
        id: action.id,
        label: action.label,
        checked: action.checked,
        disabled: action.disabled,
        hint: action.hint,
        onSelect: action.run,
      });
      continue;
    }
    if (action.checked !== undefined) {
      items.push({
        kind: 'checkbox',
        id: action.id,
        label: action.label,
        icon,
        checked: action.checked,
        disabled: action.disabled,
        hint: action.hint,
        onToggle: action.run,
      });
      continue;
    }
    items.push({
      kind: 'action',
      id: action.id,
      label: action.label,
      icon,
      shortcut: action.shortcutId ? shortcutLabelForAction(action.shortcutId, shortcuts) : undefined,
      disabled: action.disabled,
      hint: action.hint,
      danger: action.danger,
      onSelect: action.run,
    });
  }
  while (items.length > 0 && items[items.length - 1].kind === 'separator') items.pop();
  return items;
}

/** A page's verbs (`diagramPageActions.ts`) as context-menu rows, for a press on a page in the Pages view. */
export function diagramPageMenuItems(actions: readonly DiagramPageCommand[]): ContextMenuItem[] {
  return actions.map((action) => ({
    kind: 'action',
    id: action.id,
    label: action.label,
    disabled: action.disabled,
    hint: action.hint,
    onSelect: action.run,
  }));
}
