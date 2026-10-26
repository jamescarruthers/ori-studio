import { useTranslation } from 'react-i18next';
import { Import } from 'lucide-react';
import { trackDiagramImportWayChosen, type DiagramImportMenuFrom } from '../../analytics';
import { DIAGRAM_ACTION_ICONS } from '../../diagram/actions/diagramActionIcons';
import { diagramImportWays, type DiagramImportWayId } from '../../diagram/actions/diagramImportWays';
import type { ButtonProps } from '../ui/Button';
import { MenuButton } from '../ui/MenuButton';

/** Each way, in the event's own spelling. */
const TRACKED_WAY = { 'import-steps': 'file', 'from-references': 'references', 'from-fold': 'fold' } as const;

/**
 * Import, as a menu of the ways steps come in from elsewhere
 * (`diagramImportWays`): files through the step import dialog, the
 * References browser, the Fold browser. On the empty Diagram, where they add
 * steps, and on an empty step's card, where each fills that step and the
 * button is one of the card's pointer shortcuts (`pointerOnly`). Counts which
 * way is chosen, and where.
 */
export function DiagramImportMenu({
  from,
  patternOpen,
  foldSteps,
  disabled = false,
  pointerOnly = false,
  size,
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
  onChoose: (way: DiagramImportWayId) => void;
}) {
  const { t } = useTranslation();
  return (
    <MenuButton
      label={t('panels:diagram.import.menuButton', 'Import')}
      icon={<Import size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
      size={size}
      disabled={disabled}
      pointerOnly={pointerOnly}
      actions={diagramImportWays({ patternOpen, foldSteps }, t).map((way) => {
        const Icon = DIAGRAM_ACTION_ICONS[way.id];
        return {
          id: way.id,
          label: way.label,
          icon: <Icon size={14} aria-hidden="true" />,
          title: way.hint,
          disabled: way.disabled,
          // The browsers are dialogs, opened as the row is chosen. The import
          // dialog opens once its code has loaded, after the menu has given
          // the focus back, which it then returns to.
          opensDialog: way.id !== 'import-steps',
          onSelect: () => {
            trackDiagramImportWayChosen(TRACKED_WAY[way.id], from);
            onChoose(way.id);
          },
        };
      })}
    />
  );
}
