import type { FoldShortcutId } from '../../keyboard/shortcuts';
import { focusInFoldLayerPick } from '../sequence/foldLayerPickFocus';
import type { FoldStepPlaybackSurface } from './useFoldStepPlayback';

/**
 * The playback's share of the `fold` scope's executor: Space plays the step
 * on screen. Whether it claimed the chord — never one that is not playback's,
 * and not Space while the step has nothing to play, so the key falls through
 * to the scopes beneath rather than doing nothing.
 *
 * Nor while focus is in the tool window's layer controls: there Space picks a
 * layer (a row's own key, a chip's press), and one press doing both would play
 * the step over the pick. Anywhere else a focused control does not keep it —
 * after a click on a rail button, Space plays rather than pressing it again.
 *
 * Pure over the playback and the focus it is handed, for the executor the
 * Fold panel registers (`registerConditionalScopeExecutor('fold', …)`) to call
 * first.
 */
export function runFoldPlaybackShortcut(
  id: FoldShortcutId,
  playback: Pick<FoldStepPlaybackSurface, 'available' | 'toggle'>,
  focus: Element | null = null
): boolean {
  switch (id) {
    case 'fold.playStep':
      if (!playback.available || focusInFoldLayerPick(focus)) return false;
      playback.toggle();
      return true;
    default:
      return false;
  }
}
