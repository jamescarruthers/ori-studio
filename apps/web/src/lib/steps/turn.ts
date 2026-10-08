/**
 * Turning the whole model between two steps: the one turn type every surface
 * that shows a sequence of steps shares — a Diagram's turn entry (D22) and a
 * Fold sequence's turn step — so a turn passes from one to the other with
 * nothing to translate. A turn is no step: it takes no number, and the steps
 * either side of it read 3 and 4.
 *
 * Pure: no DOM, no store.
 */

/** The axis a turn-over turns the model about: vertical turns it side to side, horizontal top to bottom. */
export type TurnOverAxis = 'vertical' | 'horizontal';

/** How far, and which way, a rotation turns the model. */
export interface TurnRotation {
  amount: 'eighth' | 'quarter' | 'half';
  direction: 'cw' | 'ccw';
}

/** What a turn is, without its id: over, about an axis, or round by a part of a turn. */
export type TurnKind =
  | { kind: 'turn-over'; axis: TurnOverAxis }
  | { kind: 'rotate'; rotate: TurnRotation };

/** The numbers of the steps either side of a turn; null at an end. */
export interface TurnBetween {
  before: number | null;
  after: number | null;
}

/** Whether two turns turn the model the same way, field by field. */
export function sameTurnKind(a: TurnKind, b: TurnKind): boolean {
  if (a.kind === 'turn-over') return b.kind === 'turn-over' && a.axis === b.axis;
  return b.kind === 'rotate' && a.rotate.amount === b.rotate.amount && a.rotate.direction === b.rotate.direction;
}
