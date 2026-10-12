import { useTranslation } from 'react-i18next';
import type { DiagramStep } from '../../diagram/document/diagramDocument';
import type { PagePart, PlacementClash } from '../../diagram/pages/pagePlacement';
import { useStepPlacement } from '../../diagram/pages/useStepPlacement';
import { formatStepNumbers } from '../../diagram/stepNumberList';
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
 * or of the frame when the step is selected alone, and the way back for that
 * part; Reset Layout; and what clashes, with the offer of a new page where
 * one helps. The list's rows select the part.
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
          </div>
        </>
      )}
      <div className={`${styles.actions} ${styles.inset}`}>
        {place.blocked !== 'newer' && (
          <Button size="sm" disabled={place.disabled || !step.place?.[part]} onClick={() => place.reset(part)}>
            {t('panels:diagram.placement.resetPart', 'Reset {{part}}', { part: labels[part] })}
          </Button>
        )}
        <Button size="sm" disabled={place.readOnly || (!step.place && !step.placeNewer)} onClick={() => place.reset('all')}>
          {t('panels:diagram.placement.resetLayout', 'Reset Layout')}
        </Button>
      </div>
      {!!place.cell?.clashes?.length && (
        <div className={styles.inset}>
          <Notice tone="warning">
            {place.cell.clashes.map((clash, index) => (
              <p key={index} className={styles.clash}>
                <ClashWords clash={clash} />
              </p>
            ))}
            {place.offerNewPage && (
              <div className={styles.offer}>
                <p className={styles.clash}>
                  {t(
                    'panels:diagram.placement.breakBeforeNote',
                    'A new page returns this step’s frame to automatic placement, and the frame of any step it moves.'
                  )}
                </p>
                <Button size="sm" disabled={place.readOnly} onClick={place.startOnNewPage}>
                  {t('panels:diagram.placement.breakBefore', 'Start step {{number}} on a new page', {
                    number: place.cell.number,
                  })}
                </Button>
              </div>
            )}
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

function ClashWords({ clash }: { clash: PlacementClash }) {
  const { t, i18n } = useTranslation();
  switch (clash.kind) {
    case 'parts':
      return t('panels:diagram.placement.partsClash', 'The picture, number, or text overlap within this step.');
    case 'paper':
      return t('panels:diagram.placement.paperClash', 'Part of this step is outside the paper.');
    case 'margin':
      return t('panels:diagram.placement.marginClash', 'Part of this step crosses the margin.');
    case 'glyph':
      return t('panels:diagram.placement.glyphClash', 'This step overlaps a symbol, heading, or page number.');
    case 'path':
      return t('panels:diagram.placement.pathClash', 'This placement makes the path double back or cross itself.');
    case 'step': {
      const numbers = clash.steps ?? [];
      const steps = formatStepNumbers(numbers, i18n.language, t);
      return numbers.length === 1
        ? t('panels:diagram.placement.stepClashOne', 'This step overlaps step {{steps}}.', { steps })
        : t('panels:diagram.placement.stepClash', 'This step overlaps steps {{steps}}.', { steps });
    }
  }
}
