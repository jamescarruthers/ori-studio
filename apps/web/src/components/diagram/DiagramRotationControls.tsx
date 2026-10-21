import { useTranslation } from 'react-i18next';
import type { DiagramRotationTarget } from '../../analytics/events';
import { trackDiagramRotationCustomized } from '../../analytics/trackDiagram';
import { ROTATE_FRACTION } from '../../cp-workspace/references/stepDiagramGeometry';
import { turnLabels } from '../../diagram/actions/diagramTurnActions';
import type { DiagramRotation, DiagramRotationAmount } from '../../diagram/document/diagramDocument';
import {
  isCustomRotation,
  ROTATION_AMOUNT_DEGREES,
  ROTATION_DEGREES,
  rotationDegrees,
  withRotationAmount,
  withRotationDegrees,
  withRotationDirection,
} from '../../diagram/document/diagramRotation';
import { NumberRow, SegmentedRow } from '../ui/fieldRows';

/** The presets, in the order the Amount row offers them, before Custom. */
const AMOUNTS: readonly DiagramRotationAmount[] = ['eighth', 'quarter', 'half'];
const CUSTOM = 'custom';

/** Room for the widest angle, "359.9", so the field keeps one width as it is typed. */
const ANGLE_CHARS = 5;

/**
 * How far and which way a rotation turns, as controls: its Amount — 1/8,
 * 1/4 or 1/2 of a turn, or Custom, an angle of the author's own — and, while
 * Custom, its Angle under it; then its Direction. Custom starts from the
 * preset it was (1/4 is 90°), and a preset chosen again drops the angle. The
 * one set of rows for a turn between steps (the Step pane) and a rotate mark
 * (the Layers pane), which name the Amount row each their own way.
 */
export function DiagramRotationControls({
  rotation,
  amountLabel,
  target,
  disabled,
  onChange,
}: {
  rotation: DiagramRotation;
  /** The Amount row's name where it is shown. */
  amountLabel: string;
  /** What the rotation is on, for the event Custom sends. */
  target: DiagramRotationTarget;
  disabled: boolean;
  onChange: (rotation: DiagramRotation) => void;
}) {
  const { t } = useTranslation();
  const labels = turnLabels(t);
  const choose = (value: string) => {
    if (value !== CUSTOM) {
      onChange(withRotationAmount(rotation, value as DiagramRotationAmount));
    } else if (!isCustomRotation(rotation)) {
      trackDiagramRotationCustomized(target);
      onChange(withRotationDegrees(rotation, ROTATION_AMOUNT_DEGREES[rotation.amount]));
    }
  };
  return (
    <>
      <SegmentedRow
        label={amountLabel}
        value={rotation.degrees === undefined ? rotation.amount : CUSTOM}
        disabled={disabled}
        options={[...AMOUNTS.map((amount) => ({ id: amount, label: ROTATE_FRACTION[amount] })), { id: CUSTOM, label: labels.custom }]}
        onChange={choose}
      />
      {rotation.degrees !== undefined && (
        <NumberRow
          label={labels.angle}
          value={rotation.degrees}
          min={ROTATION_DEGREES.min}
          max={ROTATION_DEGREES.max}
          step={ROTATION_DEGREES.step}
          suffix="°"
          minChars={ANGLE_CHARS}
          disabled={disabled}
          normalize={rotationDegrees}
          onCommit={(degrees) => onChange(withRotationDegrees(rotation, degrees))}
        />
      )}
      <SegmentedRow
        label={t('panels:diagram.annotations.direction', 'Direction')}
        value={rotation.direction}
        disabled={disabled}
        options={[
          { id: 'cw', label: labels.direction.cw },
          { id: 'ccw', label: labels.direction.ccw },
        ]}
        onChange={(direction) => onChange(withRotationDirection(rotation, direction as 'cw' | 'ccw'))}
      />
    </>
  );
}
