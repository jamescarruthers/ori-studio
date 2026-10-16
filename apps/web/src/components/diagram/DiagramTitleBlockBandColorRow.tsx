import { useTranslation } from 'react-i18next';
import { useTitleBlockBandColor } from '../../diagram/pages/useTitleBlockBandColor';
import { ColorRow } from '../ui/fieldRows';

/**
 * The title block's Band color row, under its toggle. Its own component, as
 * the path's colour row is (`DiagramPathColorRow`), so that a pick's moves
 * re-render this row and not the block's other rows; the bindings are
 * `useTitleBlockBandColor`'s.
 */
export function DiagramTitleBlockBandColorRow() {
  const { t } = useTranslation();
  const color = useTitleBlockBandColor();
  return (
    <ColorRow
      label={t('panels:diagram.pagePane.titleBlock.bandColor', 'Band color')}
      help={t(
        'panels:diagram.pagePane.titleBlock.bandColorHelp',
        'The band behind the title. It follows the paper’s color until you pick one.'
      )}
      nested
      value={color.value}
      disabled={color.readOnly}
      onChange={color.onPick}
      onCommit={color.onPickEnd}
      onClear={color.onReset}
    />
  );
}
