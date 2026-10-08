/**
 * A References card's fold as the shared playback reads it: how its legs go.
 */
import {
  FOLD_PACE,
  TURN_OVER_PACE,
  type FoldLegPace,
} from '../../../lib/foldMotion/foldPlayback';
import type { FoldSceneKind } from './foldScene';

/** How a card of this kind goes. */
export function legPace(kind: FoldSceneKind): FoldLegPace {
  return kind === 'turn-over' ? TURN_OVER_PACE : FOLD_PACE;
}
