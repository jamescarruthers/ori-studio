import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Import } from 'lucide-react';
import { trackDiagramImportWayChosen, type DiagramImportMenuFrom } from '../../analytics';
import { DIAGRAM_ACTION_ICONS } from '../../diagram/actions/diagramActionIcons';
import {
  diagramImportWays,
  type DiagramImportWayId,
} from '../../diagram/actions/diagramImportWays';
import { Button, type ButtonProps } from '../ui/Button';
import { MenuContent, MenuItem, MenuItemIcon, MenuItemLabel } from '../ui/Menu';

/** Each way, in the event's own spelling. */
const TRACKED_WAY = { 'import-steps': 'file', 'from-references': 'references', 'from-fold': 'fold' } as const;

/**
 * Import, as a menu of the ways steps come in from elsewhere
 * (`diagramImportWays`): files through the step import dialog, the
 * References browser, the Fold browser. On the empty Diagram, where they add
 * steps, and on an empty step's card, where each fills that step.
 *
 * On the card it is one of the card's pointer shortcuts (`pointerOnly`):
 * hidden from assistive technology and out of the tab order, as the card's
 * other buttons are, the same ways being in its menu and the Step pane. Its
 * trigger never takes the focus — a press opens the menu without moving it —
 * so as the menu closes the focus goes back to what had it, or, when that went
 * with the step the way selected, to the card; never to a button no keyboard
 * can reach. A row that opens a dialog leaves the focus where the dialog put
 * it.
 */
export function DiagramImportMenu({
  from,
  patternOpen,
  foldSteps,
  disabled = false,
  pointerOnly = false,
  size,
  variant = 'secondary',
  onChoose,
}: {
  /** Where the menu is, for the count of which way is chosen. */
  from: DiagramImportMenuFrom;
  /** A crease pattern is open: References plans its folds. */
  patternOpen: boolean;
  /** The project's Fold sequence has a step to take. */
  foldSteps: boolean;
  disabled?: boolean;
  pointerOnly?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  onChoose: (way: DiagramImportWayId) => void;
}) {
  const { t } = useTranslation();
  const ways = diagramImportWays({ patternOpen, foldSteps }, t);
  // Set by a row that opened a dialog, read as the menu closes (`SplitButton`'s rule).
  const openedDialog = useRef(false);
  // What had the focus as the menu opened, for a trigger that never takes it.
  const focusedBefore = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (!open) return;
        openedDialog.current = false;
        focusedBefore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }}
    >
      <DropdownMenu.Trigger asChild>
        <Button
          ref={trigger}
          size={size}
          variant={variant}
          disabled={disabled}
          {...(pointerOnly
            ? {
                tabIndex: -1,
                'aria-hidden': true,
                onMouseDown: (event) => event.preventDefault(),
                // A press on a card's shortcut is not a press on the card: each way selects the step itself.
                onClick: (event) => event.stopPropagation(),
              }
            : {})}
        >
          <Import size={size === 'sm' ? 13 : 15} aria-hidden="true" />
          {t('panels:diagram.import.menuButton', 'Import')}
          <ChevronDown size={size === 'sm' ? 12 : 14} aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        loop
        onCloseAutoFocus={(event) => {
          if (openedDialog.current) {
            event.preventDefault();
            return;
          }
          if (!pointerOnly) return;
          event.preventDefault();
          // Nothing had it, or it went with the step the way just selected: the card the menu is on.
          const before = focusedBefore.current;
          const home =
            before && before !== document.body && before.isConnected
              ? before
              : trigger.current?.closest<HTMLElement>('[role="option"]');
          home?.focus({ preventScroll: true });
        }}
      >
        {ways.map((way) => {
          const Icon = DIAGRAM_ACTION_ICONS[way.id];
          return (
            <MenuItem
              key={way.id}
              disabled={way.disabled}
              title={way.hint}
              onSelect={() => {
                // The browsers are dialogs, opened as the row is chosen; the
                // import dialog opens once its code has loaded, after the menu
                // has given the focus back, which it then returns to.
                if (way.id !== 'import-steps') openedDialog.current = true;
                trackDiagramImportWayChosen(TRACKED_WAY[way.id], from);
                onChoose(way.id);
              }}
            >
              <MenuItemIcon>
                <Icon size={14} aria-hidden="true" />
              </MenuItemIcon>
              <MenuItemLabel>{way.label}</MenuItemLabel>
            </MenuItem>
          );
        })}
      </MenuContent>
    </DropdownMenu.Root>
  );
}
