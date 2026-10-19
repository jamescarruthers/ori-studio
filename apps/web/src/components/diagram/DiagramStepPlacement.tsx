import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DiagramStep } from '../../diagram/document/diagramDocument';
import { outsideMarginNote } from '../../diagram/pages/marginLabels';
import type { PagePart } from '../../diagram/pages/pagePlacement';
import { useStepPlacement } from '../../diagram/pages/useStepPlacement';
import { useZoomControls } from '../../diagram/zoom/useZoomControls';
import { useIsCoarsePointerSurface } from '../../platform/pointerSurface';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { FieldRow } from '../ui/fieldRows';
import { IconButton } from '../ui/IconButton';
import { Notice } from '../ui/Notice';
import { NumberField } from '../ui/NumberField';
import { ZoomSizeRows } from './DiagramZoomRows';
import styles from './DiagramStepPlacement.module.css';

const FRAME = { kind: 'frame' } as const;

/**
 * The selected step's placement, the last of the Pages view's Layers
 * inspector (`DiagramPageStepInspector`; redesign, 2026-10-18): where a part
 * lies past the margin, that it does (`markOutsideMargin`),
 * the one thing said of a placement; and its Placement — the part's Position,
 * X and Y in one row; the frame's Size, or an enlarged step's Size rows; the
 * text's Width — each with what Auto would give under it, and why a size is
 * kept. A reset sits before what it resets and only while there is something
 * to reset, so the fields never move as one comes and goes (`PlacementFields`).
 * X's and Y's letters scrub them; on a touch screen the fields' − and + come
 * back. In a narrow pane Y goes under X. The list's rows select the part.
 */
export function DiagramStepPlacement({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const place = useStepPlacement(step);
  const coarse = useIsCoarsePointerSurface();
  const part: PagePart = place.selected ?? 'frame';
  const labels: Record<PagePart, string> = {
    frame: t('panels:diagram.placement.frame', 'Frame'),
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  const offset = place.offset(part);
  const placed = step.place?.[part] !== undefined || (part === 'text' && step.place?.textWidth !== undefined);
  const auto = (mm: number) => t('panels:diagram.placement.autoSize', 'Auto: {{mm}} mm', { mm: mm.toFixed(1) });
  const mmField = { suffix: 'mm', steppers: coarse, disabled: place.disabled } as const;
  // Said under the Size row, and under the Width row: why a size is kept, and what Auto would give.
  const sizeNotes = [
    ...(place.cell?.placed?.pin === 'kind'
      ? ['mmPerUnit' in (step.place?.scale ?? {})
          ? t('panels:diagram.placement.keptPattern', 'Size kept for a crease pattern')
          : t('panels:diagram.placement.keptFitted', 'Size kept for a fitted picture')]
      : []),
    ...(place.autoSize !== null ? [auto(place.autoSize)] : []),
  ];
  const widthNotes = place.autoTextWidth !== null ? [auto(place.autoTextWidth)] : [];
  const sizeLabel = t('panels:diagram.placement.sizeLabel', 'Size');
  const widthLabel = t('panels:diagram.placement.widthLabel', 'Width');
  const resetNamed = (label: string) => t('common:colorField.resetNamed', 'Reset {{label}} to default', { label });
  return (
    <>
      {place.cell?.outsideMargin && (
        <div className={styles.inset}>
          <Notice tone="warning">
            <p className={styles.margin} data-placement-notice="margin">
              {outsideMarginNote(t)}
            </p>
          </Notice>
        </div>
      )}
      {place.blocked === 'newer' ? (
        <div className={styles.inset}>
          <Notice>{t('panels:diagram.placement.newer', 'Placed in a newer version')}</Notice>
        </div>
      ) : (
        <CollapsibleSection title={t('panels:diagram.placement.section', 'Placement')}>
          <FieldRow label={t('panels:diagram.placement.position', 'Position')} kind="input" disabled={place.disabled}>
            <PlacementFields
              reset={
                placed && !place.disabled
                  ? {
                      label: t('panels:diagram.placement.resetPart', 'Reset {{part}}', { part: labels[part] }),
                      run: () => place.reset(part),
                    }
                  : null
              }
              first={
                <NumberField
                  {...mmField}
                  className={styles.axis}
                  prefix="X"
                  label={t('panels:diagram.placement.offsetX', 'X (mm)')}
                  value={offset[0]}
                  step={0.5}
                  onCommit={(value) => place.setOffset(part, 0, value)}
                />
              }
              rest={
                <NumberField
                  {...mmField}
                  className={styles.axis}
                  prefix="Y"
                  label={t('panels:diagram.placement.offsetY', 'Y (mm)')}
                  value={offset[1]}
                  step={0.5}
                  onCommit={(value) => place.setOffset(part, 1, value)}
                />
              }
            />
          </FieldRow>
          {part === 'frame' &&
            (step.zoom ? (
              <EnlargedSize step={step} />
            ) : (
              <>
                <FieldRow
                  label={sizeLabel}
                  kind="input"
                  disabled={place.disabled || place.size === null}
                  divider={sizeNotes.length === 0}
                >
                  <PlacementFields
                    reset={
                      step.place?.scale && !place.disabled
                        ? { label: resetNamed(sizeLabel), run: () => place.reset('scale') }
                        : null
                    }
                    first={
                      <NumberField
                        {...mmField}
                        disabled={place.disabled || place.size === null}
                        className={styles.axis}
                        label={t('panels:diagram.placement.size', 'Size (mm)')}
                        value={place.size === null ? null : Math.round(place.size * 10) / 10}
                        min={4}
                        step={0.1}
                        onCommit={place.setSize}
                      />
                    }
                  />
                </FieldRow>
                <RowNotes notes={sizeNotes} />
              </>
            ))}
          {part === 'text' && place.textWidth !== null && (
            <>
              <FieldRow label={widthLabel} kind="input" disabled={place.disabled} divider={widthNotes.length === 0}>
                <PlacementFields
                  reset={
                    step.place?.textWidth !== undefined && !place.disabled
                      ? { label: resetNamed(widthLabel), run: () => place.reset('textWidth') }
                      : null
                  }
                  first={
                    <NumberField
                      {...mmField}
                      className={styles.axis}
                      label={t('panels:diagram.placement.textWidth', 'Text width (mm)')}
                      value={Math.round(place.textWidth * 10) / 10}
                      min={place.textWidthRange ? Math.ceil(place.textWidthRange.least * 10) / 10 : undefined}
                      max={place.textWidthRange?.most}
                      step={0.5}
                      onCommit={place.setTextWidth}
                    />
                  }
                />
              </FieldRow>
              <RowNotes notes={widthNotes} />
            </>
          )}
        </CollapsibleSection>
      )}
    </>
  );
}

/** A placement row's reset: what it puts back, and how. */
interface PlacementReset {
  label: string;
  run: () => void;
}

/**
 * A placement row's fields, with the reset for what they set (Zach,
 * 2026-10-19): the reset kept beside the first field, as one, in room held
 * for it while there is nothing to reset — so the fields never move as it
 * comes and goes — and the next field under the first only when the pane is
 * too narrow for both. A small icon button, as the inspector's header's are.
 */
function PlacementFields({ reset, first, rest = null }: { reset: PlacementReset | null; first: ReactNode; rest?: ReactNode }) {
  return (
    <span className={styles.fields}>
      <span className={styles.lead}>
        {reset ? (
          <IconButton size="sm" title={reset.label} aria-label={reset.label} onClick={reset.run}>
            <RotateCcw size={14} aria-hidden="true" />
          </IconButton>
        ) : (
          <span className={styles.slot} aria-hidden="true" data-reset-slot="" />
        )}
        {first}
      </span>
      {rest}
    </span>
  );
}

/** What a row says of its value, under it, finishing the row with its rule: Auto's size, why a size is kept. */
function RowNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className={styles.notes}>
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
    </div>
  );
}

function EnlargedSize({ step }: { step: DiagramStep }) {
  const controls = useZoomControls(step, FRAME);
  return <ZoomSizeRows controls={controls} />;
}
