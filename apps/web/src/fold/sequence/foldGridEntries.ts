/**
 * The Steps grid's entries (plan D14, shot-steps): the sheet and every step of
 * the active path, in order, as the shared grid takes them — a step's card, or
 * a turn's, which takes no number and reads the numbers either side of it.
 *
 * The grid's own numbering (`stepSlots`) counts from 1; Fold's counts the
 * sheet as 0 (`foldPathEntries`), so each entry carries its own, and a turn
 * the numbers of the steps either side as Fold numbers them.
 *
 * Pure.
 */
import type { TurnBetween, TurnKind } from '../../lib/steps/turn';
import { isLockedStep, turnKindOf } from '../document/foldSequenceDocument';
import type { FoldPathEntry } from './foldSequencePath';

/** A card that is a step, or the sheet. */
export interface FoldGridStep {
  /** The grid's key: the step's id, or the sheet's key. */
  id: string;
  /** The entry's place in the path. */
  index: number;
  turn?: undefined;
}

/** A card that is a turn. */
export interface FoldGridTurn {
  id: string;
  index: number;
  turn: TurnKind;
  between: TurnBetween;
}

export type FoldGridEntry = FoldGridStep | FoldGridTurn;

export function isFoldGridTurn(entry: FoldGridEntry): entry is FoldGridTurn {
  return entry.turn !== undefined;
}

export function foldGridEntries(entries: readonly FoldPathEntry[]): FoldGridEntry[] {
  const numberAt = (from: number, step: 1 | -1): number | null => {
    for (let at = from; at >= 0 && at < entries.length; at += step) {
      const number = entries[at]?.number;
      if (number !== null && number !== undefined) return number;
    }
    return null;
  };
  return entries.map((entry, index): FoldGridEntry => {
    const node = entry.node;
    if (entry.kind !== 'turn' || !node || isLockedStep(node) || (node.op.kind !== 'turn' && node.op.kind !== 'rotate')) {
      return { id: entry.key, index };
    }
    return {
      id: entry.key,
      index,
      turn: turnKindOf(node.op),
      between: { before: numberAt(index - 1, -1), after: numberAt(index + 1, 1) },
    };
  });
}
