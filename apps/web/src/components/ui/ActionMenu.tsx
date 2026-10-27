import { useRef, type ComponentProps, type ReactNode } from 'react';
import type * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MenuContent, MenuItem, MenuItemIcon, MenuItemLabel } from './Menu';

export interface MenuAction {
  /** Stable key, and the analytics-safe identifier for the action. */
  id: string;
  label: string;
  /** Drawn before the label; when any action has one, every row keeps its place. */
  icon?: ReactNode;
  /** Disabled reason, or the action's own tooltip when it is available. */
  title?: string;
  disabled?: boolean;
  /**
   * It opens a modal dialog. The menu then leaves focus where the dialog put
   * it rather than handing it back to its trigger as it closes — a restore
   * that lands after the dialog's own, and so outside it.
   */
  opensDialog?: boolean;
  onSelect: () => void;
}

/**
 * A dropdown's surface holding a list of actions, one row each: the menu half
 * of `SplitButton` and `MenuButton`. Owns the one rule every such menu needs,
 * that a row which opened a dialog keeps the menu from taking the focus back.
 * Otherwise the focus goes where `onCloseAutoFocus` says, or, by default, to
 * the trigger.
 */
export function ActionMenuContent({
  actions,
  align,
  onCloseAutoFocus,
}: {
  actions: readonly MenuAction[];
  align: 'start' | 'end';
  /** As the menu closes with no dialog opened from it. */
  onCloseAutoFocus?: ComponentProps<typeof DropdownMenu.Content>['onCloseAutoFocus'];
}) {
  // Set by the row that opened a dialog, read as the menu closes: a ref, as
  // `onCloseAutoFocus` fires during that same close. The surface mounts on
  // every open, so one dialog cannot swallow the next visit's focus return.
  const openedDialog = useRef(false);
  const icons = actions.some((action) => action.icon !== undefined);
  return (
    <MenuContent
      side="bottom"
      align={align}
      sideOffset={6}
      collisionPadding={8}
      loop
      onCloseAutoFocus={(event) => {
        if (openedDialog.current) event.preventDefault();
        else onCloseAutoFocus?.(event);
      }}
    >
      {actions.map((action) => (
        <MenuItem
          key={action.id}
          disabled={action.disabled}
          title={action.title}
          onSelect={() => {
            if (action.opensDialog) openedDialog.current = true;
            action.onSelect();
          }}
        >
          {icons && <MenuItemIcon>{action.icon}</MenuItemIcon>}
          <MenuItemLabel>{action.label}</MenuItemLabel>
        </MenuItem>
      ))}
    </MenuContent>
  );
}
