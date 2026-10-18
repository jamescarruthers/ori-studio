import { Maximize2, MoveHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { stepNumber, type DiagramStep } from '../../diagram/document/diagramDocument';
import { outsideMarginNote } from '../../diagram/pages/marginLabels';
import type { PagePart } from '../../diagram/pages/pagePlacement';
import { useStepPlacement } from '../../diagram/pages/useStepPlacement';
import { useZoomControls } from '../../diagram/zoom/useZoomControls';
import { useIsCoarsePointerSurface } from '../../platform/pointerSurface';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { FieldRow } from '../ui/fieldRows';
import { Notice } from '../ui/Notice';
import { NumberField } from '../ui/NumberField';
import { DiagramInspectorCrumb, DiagramInspectorHeader } from './DiagramInspectorHeader';
import { ZoomSizeRows } from './DiagramZoomRows';
import styles from './DiagramStepPlacement.module.css';

const FRAME = { kind: 'frame' } as const;

/**
 * The selected step's placement, the Pages view's Layers inspector
 * (`DiagramPageLayers`; redesign, 2026-10-18): a header naming the step and
 * the part selected — "Step 3 › Text" over its instruction — with Reset
 * Layout; where a part lies past the margin, that it does (`markOutsideMargin`),
 * the one thing said of a placement; and its Placement — the part's Position,
 * X and Y in one row; the frame's Size, or an enlarged step's Size rows; the
 * text's Width — each with what Auto would give under it, and why a size is
 * kept. A reset sits before what it resets and only while there is something
 * to reset, so the fields never move as one comes and goes. A field's letter
 * or glyph scrubs it; on a touch screen its − and + come back. The list's
 * rows select the part.
 */
export function DiagramStepPlacement({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const place = useStepPlacement(step);
  const number = useWorkspaceStore((state) => (state.diagram ? stepNumber(state.diagram, step.id) : null));
  const coarse = useIsCoarsePointerSurface();
  const part: PagePart = place.selected ?? 'frame';
  const labels: Record<PagePart, string> = {
    frame: t('panels:diagram.placement.frame', 'Frame'),
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  const stepName = t('panels:diagram.pages.step', 'Step {{number}}', { number: number ?? '' });
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
  return (
    <>
      <DiagramInspectorHeader
        title={part === 'frame' ? stepName : <DiagramInspectorCrumb parent={stepName} child={labels[part]} />}
        detail={step.text.trim() || null}
        action={
          <Button
            size="sm"
            disabled={place.readOnly || (!step.place && !step.placeNewer)}
            onClick={() => place.reset('all')}
          >
            {t('panels:diagram.placement.resetLayout', 'Reset Layout')}
          </Button>
        }
      />
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
          <FieldRow
            label={t('panels:diagram.placement.position', 'Position')}
            kind="input"
            disabled={place.disabled}
            resetSide="start"
            resetLabel={t('panels:diagram.placement.resetPart', 'Reset {{part}}', { part: labels[part] })}
            onReset={placed && !place.disabled ? () => place.reset(part) : undefined}
          >
            <span className={styles.pair}>
              <NumberField
                {...mmField}
                className={styles.axis}
                prefix="X"
                label={t('panels:diagram.placement.offsetX', 'X (mm)')}
                value={offset[0]}
                step={0.5}
                onCommit={(value) => place.setOffset(part, 0, value)}
              />
              <NumberField
                {...mmField}
                className={styles.axis}
                prefix="Y"
                label={t('panels:diagram.placement.offsetY', 'Y (mm)')}
                value={offset[1]}
                step={0.5}
                onCommit={(value) => place.setOffset(part, 1, value)}
              />
            </span>
          </FieldRow>
          {part === 'frame' &&
            (step.zoom ? (
              <EnlargedSize step={step} />
            ) : (
              <>
                <FieldRow
                  label={t('panels:diagram.placement.sizeLabel', 'Size')}
                  kind="input"
                  disabled={place.disabled || place.size === null}
                  divider={sizeNotes.length === 0}
                  resetSide="start"
                  onReset={step.place?.scale && !place.disabled ? () => place.reset('scale') : undefined}
                >
                  <NumberField
                    {...mmField}
                    disabled={place.disabled || place.size === null}
                    className={styles.axis}
                    prefix={<Maximize2 size={11} aria-hidden="true" />}
                    label={t('panels:diagram.placement.size', 'Size (mm)')}
                    value={place.size === null ? null : Math.round(place.size * 10) / 10}
                    min={4}
                    step={0.1}
                    onCommit={place.setSize}
                  />
                </FieldRow>
                <RowNotes notes={sizeNotes} />
              </>
            ))}
          {part === 'text' && place.textWidth !== null && (
            <>
              <FieldRow
                label={t('panels:diagram.placement.widthLabel', 'Width')}
                kind="input"
                disabled={place.disabled}
                divider={widthNotes.length === 0}
                resetSide="start"
                onReset={
                  step.place?.textWidth !== undefined && !place.disabled ? () => place.reset('textWidth') : undefined
                }
              >
                <NumberField
                  {...mmField}
                  className={styles.axis}
                  prefix={<MoveHorizontal size={11} aria-hidden="true" />}
                  label={t('panels:diagram.placement.textWidth', 'Text width (mm)')}
                  value={Math.round(place.textWidth * 10) / 10}
                  min={place.textWidthRange ? Math.ceil(place.textWidthRange.least * 10) / 10 : undefined}
                  max={place.textWidthRange?.most}
                  step={0.5}
                  onCommit={place.setTextWidth}
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
