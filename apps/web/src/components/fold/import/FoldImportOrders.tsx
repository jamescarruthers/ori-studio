import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FoldImportOpened } from '../../../fold/engine/foldEngineIoWire';
import {
  FOLD_ORDER_PREVIEW_LIMIT,
  foldOrderChoiceKey,
  withFoldOrder,
  type FoldOrderPreview,
} from '../../../fold/io/foldImportFlow';
import { foldStatePictureUrl } from '../../../fold/canvas/foldStatePicture';
import type { PaperStyle } from '../../../lib/paper/paperStyle';
import { useSettingsStore } from '../../../store/settingsStore';
import { OptionCards } from '../../ui/OptionCard';
import styles from './FoldImportOrders.module.css';

/** One order's card picture: the state it lands, in the style the app shows paper in. */
function OrderPicture({ preview, style }: { preview: FoldOrderPreview | undefined; style: PaperStyle }) {
  const url = useMemo(
    () => (preview?.status === 'ready' ? foldStatePictureUrl(preview.scene, style) : null),
    [preview, style]
  );
  return (
    <span className={styles.picture} data-status={preview?.status ?? 'working'}>
      {url && <img src={url} alt="" className={styles.image} />}
    </span>
  );
}

/**
 * The layer orders an import leaves open (plan D16): the true ‹ n of m ›,
 * and for each independent part of the pattern with more than one order, a
 * card per order, each pictured by the state it lands with the other parts
 * as chosen. A radio group per part: the arrows move the choice.
 */
export function FoldImportOrders({
  opened,
  choice,
  previews,
  disabled,
  onChoose,
}: {
  opened: FoldImportOpened;
  choice: readonly number[];
  previews: ReadonlyMap<string, FoldOrderPreview>;
  /** The choice is being committed. */
  disabled: boolean;
  onChoose: (component: number, order: number) => void;
}) {
  const { t } = useTranslation();
  const style = useSettingsStore((state) => state.paperStyle.display);
  const parts = opened.components
    .map((component, index) => ({ ...component, index }))
    .filter((component) => component.orders > 1);
  const { orders, exact } = opened.count;

  return (
    <div className={styles.orders}>
      <p className={styles.count}>
        {exact
          ? t('dialogs:foldImport.orders.count', {
              count: orders,
              defaultValue_one: '{{count}} layer order fits these creases.',
              defaultValue_other: '{{count}} layer orders fit these creases. Choose one.',
            })
          : t('dialogs:foldImport.orders.atLeast', {
              count: orders,
              defaultValue_one: 'At least {{count}} layer order fits these creases. Choose one.',
              defaultValue_other: 'At least {{count}} layer orders fit these creases. Choose one.',
            })}
      </p>
      {parts.map((part, position) => {
        const shown = Math.min(part.orders, FOLD_ORDER_PREVIEW_LIMIT);
        const label =
          parts.length > 1
            ? t('dialogs:foldImport.orders.part', 'Part {{number}}', { number: position + 1 })
            : t('dialogs:foldImport.orders.label', 'Layer order');
        return (
          <section key={part.index} className={styles.part} aria-label={label}>
            {parts.length > 1 && <h3 className={styles.heading}>{label}</h3>}
            <OptionCards<string>
              label={label}
              value={String(choice[part.index] ?? 0)}
              columns={3}
              disabled={disabled}
              onChange={(value) => onChoose(part.index, Number(value))}
              options={Array.from({ length: shown }, (_, order) => ({
                value: String(order),
                label: t('dialogs:foldImport.orders.order', 'Order {{number}}', { number: order + 1 }),
                icon: (
                  <OrderPicture
                    preview={previews.get(foldOrderChoiceKey(withFoldOrder(choice, part.index, order)))}
                    style={style}
                  />
                ),
              }))}
            />
            {(part.truncated || part.orders > shown) && (
              <p className={styles.note}>
                {t(
                  'dialogs:foldImport.orders.more',
                  'More orders fit this part than are listed here; these are the first the search found.'
                )}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
