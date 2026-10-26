import { useRef, type MouseEvent, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { ActionMenuContent, type MenuAction } from './ActionMenu';
import { Button, type ButtonProps } from './Button';

/**
 * A labelled button that opens a menu of actions: a caret after its label says
 * it does. For a set of verbs with no default among them — a `SplitButton`
 * when one is the default, a `MenuIconButton` when an icon names the set.
 *
 * `pointerOnly` makes it one of a surface's pointer shortcuts — a card's, say,
 * whose verbs a keyboard reaches through the card's menu instead: out of the
 * tab order, hidden from assistive technology, and never taking the focus. As
 * the menu closes the focus goes to that surface, the nearest focusable
 * element around the button, as a press on the surface's other shortcuts
 * leaves it there; with none around it, back to what had it. Never to a
 * button no keyboard can reach.
 */
export function MenuButton({
  label,
  icon,
  actions,
  disabled = false,
  size,
  variant = 'secondary',
  align = 'start',
  pointerOnly = false,
}: {
  label: string;
  icon?: ReactNode;
  actions: readonly MenuAction[];
  disabled?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  pointerOnly?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement | null>(null);
  // What had the focus as the menu opened, for a trigger that never takes it.
  const focusedBefore = useRef<HTMLElement | null>(null);
  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open) focusedBefore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }}
    >
      <DropdownMenu.Trigger asChild>
        {/* No `title`: it would compete with the dropdown trigger for the
            element, the same clash `MenuIconButton` documents. */}
        <Button
          ref={trigger}
          size={size}
          variant={variant}
          disabled={disabled}
          {...(pointerOnly
            ? { tabIndex: -1, 'aria-hidden': true, onMouseDown: (event: MouseEvent) => event.preventDefault() }
            : {})}
        >
          {icon}
          {label}
          <ChevronDown size={size === 'sm' ? 12 : 14} aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <ActionMenuContent
        actions={actions}
        align={align}
        onCloseAutoFocus={
          pointerOnly
            ? (event) => {
                event.preventDefault();
                const surface = trigger.current?.parentElement?.closest<HTMLElement>('[tabindex]');
                const before = focusedBefore.current;
                const home = surface ?? (before?.isConnected ? before : null);
                home?.focus({ preventScroll: true });
              }
            : undefined
        }
      />
    </DropdownMenu.Root>
  );
}
