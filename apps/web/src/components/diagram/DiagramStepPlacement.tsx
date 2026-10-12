import { useTranslation } from 'react-i18next';
import type { DiagramStep } from '../../diagram/document/diagramDocument';
import { outsideMarginNote } from '../../diagram/pages/marginLabels';
import type { PagePart } from '../../diagram/pages/pagePlacement';
import { useStepPlacement } from '../../diagram/pages/useStepPlacement';
import { useZoomControls } from '../../diagram/zoom/useZoomControls';
import { Button } from '../ui/Button';
import { NumberRow } from '../ui/fieldRows';
import { Notice } from '../ui/Notice';
import { ZoomSizeRows } from './DiagramZoomRows';
import styles from './DiagramStepPlacement.module.css';

const FRAME = { kind: 'frame' } as const;

/**
 * The selected step's placement on the page, under the Pages view's Layers
 * list (`DiagramPageLayers`): its Size — an enlarged step's Size rows — with
 * what Auto would give and why a size is kept; X and Y of the part selected,
 * or of the frame when the step is selected alone — with the text, its
 * width, the keyboard's way to what its grips set, and what Auto would give —
 * and the way back for that part; Reset Layout; and, where a part lies past
 * the margin, that it does — the one thing said of a placement
 * (`markOutsideMargin`). The list's rows select the part.
 */
export function DiagramStepPlacement({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const place = useStepPlacement(step);
  const part: PagePart = place.selected ?? 'frame';
  const labels: Record<PagePart, string> = {
    frame: t('panels:diagram.placement.frame', 'Frame'),
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  return (
    <div className={styles.controls}>
      {place.blocked === 'newer' ? (
        <div className={styles.inset}>
          <Notice>{t('panels:diagram.placement.newer', 'Placed in a newer version')}</Notice>
        </div>
      ) : (
        <>
          {step.zoom ? (
            <EnlargedSize step={step} />
          ) : (
            <>
              <NumberRow
                label={t('panels:diagram.placement.size', 'Size (mm)')}
                value={place.size === null ? null : Math.round(place.size * 10) / 10}
                min={4}
                step={0.1}
                disabled={place.disabled || place.size === null}
                onCommit={place.setSize}
                onReset={step.place?.scale ? () => place.reset('scale') : undefined}
              />
              {place.autoSize !== null && (
                <p className={`${styles.note} ${styles.inset}`}>
                  {t('panels:diagram.placement.autoSize', 'Auto: {{mm}} mm', { mm: place.autoSize.toFixed(1) })}
                </p>
              )}
              {place.cell?.placed?.pin === 'kind' && (
                <div className={styles.inset}>
                  <Notice>
                    {'mmPerUnit' in (step.place?.scale ?? {})
                      ? t('panels:diagram.placement.keptPattern', 'Size kept for a crease pattern')
                      : t('panels:diagram.placement.keptFitted', 'Size kept for a fitted picture')}
                  </Notice>
                </div>
              )}
            </>
          )}
          <div>
            <NumberRow
              label={t('panels:diagram.placement.offsetX', 'X (mm)')}
              value={place.offset(part)[0]}
              step={0.5}
              disabled={place.disabled}
              onCommit={(value) => place.setOffset(part, 0, value)}
            />
            <NumberRow
              label={t('panels:diagram.placement.offsetY', 'Y (mm)')}
              value={place.offset(part)[1]}
              step={0.5}
              disabled={place.disabled}
              onCommit={(value) => place.setOffset(part, 1, value)}
            />
            {part === 'text' && place.textWidth !== null && (
              <NumberRow
                label={t('panels:diagram.placement.textWidth', 'Text width (mm)')}
                value={Math.round(place.textWidth * 10) / 10}
                min={place.textWidthRange ? Math.ceil(place.textWidthRange.least * 10) / 10 : undefined}
                max={place.textWidthRange?.most}
                step={0.5}
                disabled={place.disabled}
                onCommit={place.setTextWidth}
                onReset={step.place?.textWidth !== undefined ? () => place.reset('textWidth') : undefined}
              />
            )}
          </div>
          {part === 'text' && place.autoTextWidth !== null && (
            <p className={`${styles.note} ${styles.inset}`}>
              {t('panels:diagram.placement.autoSize', 'Auto: {{mm}} mm', { mm: place.autoTextWidth.toFixed(1) })}
            </p>
          )}
        </>
      )}
      <div className={`${styles.actions} ${styles.inset}`}>
        {place.blocked !== 'newer' && (
          <Button
            size="sm"
            // The text's reset takes its pinned width with its offset.
            disabled={place.disabled || !(step.place?.[part] || (part === 'text' && step.place?.textWidth !== undefined))}
            onClick={() => place.reset(part)}
          >
            {t('panels:diagram.placement.resetPart', 'Reset {{part}}', { part: labels[part] })}
          </Button>
        )}
        <Button size="sm" disabled={place.readOnly || (!step.place && !step.placeNewer)} onClick={() => place.reset('all')}>
          {t('panels:diagram.placement.resetLayout', 'Reset Layout')}
        </Button>
      </div>
      {place.cell?.outsideMargin && (
        <div className={styles.inset}>
          <Notice tone="warning">
            <p className={styles.margin} data-placement-notice="margin">
              {outsideMarginNote(t)}
            </p>
          </Notice>
        </div>
      )}
    </div>
  );
}

function EnlargedSize({ step }: { step: DiagramStep }) {
  const controls = useZoomControls(step, FRAME);
  return <ZoomSizeRows controls={controls} />;
}
