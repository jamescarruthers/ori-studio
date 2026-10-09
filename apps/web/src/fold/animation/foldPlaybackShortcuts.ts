import type { FoldShortcutId } from '../../keyboard/shortcuts';
import type { FoldStepPlaybackSurface } from './useFoldStepPlayback';

/**
 * The playback's share of the `fold` scope's executor: Space plays the step
 * on screen. Whether it claimed the chord — never one that is not playback's,
 * and not Space while the step has nothing to play, so the key falls through
 * to the scopes beneath rather than doing nothing.
 *
 * Pure over the playback it is handed, for the executor the Fold panel
 * registers (`registerConditionalScopeExecutor('fold', …)`) to call first.
 */
export function runFoldPlaybackShortcut(
  id: FoldShortcutId,
  playback: Pick<FoldStepPlaybackSurface, 'available' | 'toggle'>
): boolean {
  switch (id) {
    case 'fold.playStep':
      if (!playback.available) return false;
      playback.toggle();
      return true;
    default:
      return false;
  }
}
