import { useTranslation } from 'react-i18next';
import { foldKindLetter, type FoldKind } from '../../fold/tools/foldToolCatalog';
import styles from './FoldKindMark.module.css';

/**
 * A fold's letter in the ink of the crease it leaves — V in the valley ink, M
 * in the mountain's, P in the flat crease's a precrease leaves — and IR for
 * the inside reverse fold: the icon of each fold on the rail, in the phone
 * tool sheet and in the tool window's V / M / P control. Edit's line-type
 * letters (`CpLineTypeMark`) are the same idea for its line types.
 */
export function FoldKindMark({
  kind,
  size = 'md',
}: {
  kind: FoldKind | 'inside-reverse';
  /** `lg` where a control is sized for a thumb. */
  size?: 'md' | 'lg';
}) {
  const { t } = useTranslation();
  return (
    <span className={styles.mark} data-kind={kind} data-size={size} aria-hidden="true">
      {foldKindLetter(t, kind)}
    </span>
  );
}
