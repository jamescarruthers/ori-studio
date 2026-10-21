/**
 * A rotation's value (`DiagramRotation`): one of the three presets, or an
 * angle of the author's own, and the one way each change to it is made, so a
 * preset is always written as every build has written one and the two shapes
 * never mix.
 *
 * Pure: no DOM, no store.
 */
import type { DiagramRotation, DiagramRotationAmount } from './diagramDocument';

/**
 * The angles a rotation of the author's own can be, in degrees: more than
 * none and less than a whole turn, to a tenth. The Angle field's stepper
 * moves a whole degree.
 */
export const ROTATION_DEGREES = { min: 0.1, max: 359.9, step: 1 } as const;

/** Each preset as an angle: where Custom starts from the preset it was. */
export const ROTATION_AMOUNT_DEGREES: Readonly<Record<DiagramRotationAmount, number>> = {
  eighth: 45,
  quarter: 90,
  half: 180,
};

/** An angle a rotation can hold: `value` to a tenth of a degree, within (0°, 360°). */
export function rotationDegrees(value: number): number {
  const tenth = Math.round(value * 10) / 10;
  if (!Number.isFinite(tenth)) return ROTATION_AMOUNT_DEGREES.quarter;
  return Math.min(ROTATION_DEGREES.max, Math.max(ROTATION_DEGREES.min, tenth));
}

/** Whether a rotation is an angle of the author's own rather than a preset. */
export function isCustomRotation(rotation: DiagramRotation): rotation is Extract<DiagramRotation, { degrees: number }> {
  return rotation.degrees !== undefined;
}

/** How far a rotation turns, in degrees: its own angle, or its preset's. */
export function rotationAngle(rotation: DiagramRotation): number {
  return rotation.degrees ?? ROTATION_AMOUNT_DEGREES[rotation.amount];
}

/** The rotation as a preset, its direction kept: `{ amount, direction }`, any angle it had dropped. */
export function withRotationAmount(rotation: DiagramRotation, amount: DiagramRotationAmount): DiagramRotation {
  return { amount, direction: rotation.direction };
}

/** The rotation as an angle of its own, kept within what one may be; any preset it was dropped. */
export function withRotationDegrees(rotation: DiagramRotation, degrees: number): DiagramRotation {
  return { degrees: rotationDegrees(degrees), direction: rotation.direction };
}

/** The rotation turned the way given, how far it turns kept in its own shape: a preset's, or an angle's. */
export function withRotationDirection(rotation: DiagramRotation, direction: 'cw' | 'ccw'): DiagramRotation {
  return rotation.degrees === undefined ? { amount: rotation.amount, direction } : { degrees: rotation.degrees, direction };
}
