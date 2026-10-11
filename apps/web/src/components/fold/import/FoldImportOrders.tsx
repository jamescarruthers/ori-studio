import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInheritedPaperStyle } from '../../../cp-workspace/paper/objectPaperStyle';
import type { LayerSpreadOptions } from '../../../cp-workspace/folded/foldedLayerSpread';
import type { FoldImportOpened } from '../../../fold/engine/foldEngineIoWire';
import {
  FOLD_ORDER_PREVIEW_LIMIT,
  foldOrderChoiceKey,
  withFoldOrder,
  type FoldOrderPreview,
} from '../../../fold/io/foldImportFlow';
import { useFoldPaneDisplay } from '../../../fold/canvas/foldPaneDisplay';
import type { FoldPaneDisplay } from '../../../fold/canvas/foldPaneScenes';
import { foldStatePictureUrl } from '../../../fold/canvas/foldStatePicture';
import { useFoldSessionState } from '../../../fold/session/useFoldSession';
import { useFoldStepSpreadShown } from '../../../fold/sequence/useFoldStepSpread';
import type { PaperStyle } from '../../../lib/paper/paperStyle';
import { OptionCards } from '../../ui/OptionCard';
import styles from './FoldImportOrders.module.css';

/** How every order's card is drawn: the look the step strip's cards have, and the spread the step will take. */
interface OrderLook {
  style: PaperStyle;
  display: FoldPaneDisplay;
  spread: LayerSpreadOptions | null;
}

/**
 * One order's card picture: the state it lands, as the step strip will show
 * it once it is imported — the strip's style and the pane's switches, its
 * layers spread as the step will spread them, so two orders that differ
 * only in what lies under what are told apart.
 */
function OrderPicture({ preview, look }: { preview: FoldOrderPreview | undefined; look: OrderLook }) {
  const url = useMemo(
    () => (preview?.status === 'ready' ? foldStatePictureUrl(preview.scene, look.style, look.display, look.spread) : null),
    [preview, look]
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
  const style = useInheritedPaperStyle();
  const display = useFoldPaneDisplay();
  // The import lands after the step on screen, and takes the spread it shows.
  const cursor = useFoldSessionState((snapshot) => snapshot.cursor);
  const spread = useFoldStepSpreadShown(cursor);
  const look = useMemo<OrderLook>(() => ({ style, display, spread }), [style, display, spread]);
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
                    look={look}
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
