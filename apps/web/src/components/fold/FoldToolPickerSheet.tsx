import { useTranslation } from 'react-i18next';
import type { FoldRailGroup } from '../../fold/tools/foldRailGroups';
import { ToolPickerGroup, ToolPickerList } from '../ui/tools/ToolPickerGroup';
import { ToolPickerRow } from '../ui/tools/ToolPickerRow';
import { ToolPickerSheet } from '../ui/tools/ToolPickerSheet';
import { FoldToolGlyph } from './FoldToolGlyph';

/**
 * Every Fold tool, named, for the phone layout, which has no rail: the same
 * `foldRailGroups()` the rail draws, as the app's tool sheet — a titled list
 * per group, each row its glyph, its name and what it does, or why it cannot.
 * A pick closes the sheet, as Edit's and Simulate's do.
 *
 * The sheet's body only; the workspace's Tools pill (`ToolsTriggerButton`,
 * `useToolPickerSheet`) opens it and portals it to the page.
 */
export function FoldToolPickerSheet({
  pickerId,
  groups,
  close,
}: {
  /** DOM id the trigger points `aria-controls` at, and this dialog wears. */
  pickerId: string;
  groups: readonly FoldRailGroup[];
  close: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ToolPickerSheet
      pickerId={pickerId}
      title={t('tools:fold.picker.title', 'Fold tools')}
      closeLabel={t('tools:fold.picker.close', 'Close tool list')}
      close={close}
    >
      {groups.map((group) => (
        <ToolPickerGroup key={group.id} title={group.label}>
          <ToolPickerList label={group.label}>
            {group.items.map((item) => (
              <ToolPickerRow
                key={item.id}
                label={item.label}
                description={item.reason ?? item.description}
                glyph={<FoldToolGlyph id={item.id} />}
                isActive={item.active}
                available={item.available}
                onSelect={() => {
                  item.select();
                  close();
                }}
                data={{ 'data-fold-tool': item.id }}
              />
            ))}
          </ToolPickerList>
        </ToolPickerGroup>
      ))}
    </ToolPickerSheet>
  );
}
