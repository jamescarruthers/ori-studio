import { useFoldRepeatUi } from '../repeat/foldRepeatUi';
import { useFoldReturnUi } from '../return/foldReturnUi';

/**
 * Whether the tool window gives way to the bar over the column: Repeat's or
 * Unfold to step's. Each clears the tool's picks as it opens
 * (`openFoldRepeat`, `openFoldReturn`), and while it is open the canvas takes
 * no picks (`useFoldStateView`) and the tools are read-only
 * (`useFoldReadOnly`). So the window has nothing to offer: its steps say to
 * click points the canvas no longer takes, its line mode is disabled, and the
 * Escape it names closes the bar instead. On a phone it also cost the height
 * the bar needs: risen from the canvas's bar, it covered Repeat's own buttons
 * and the words that say why a repeat stopped, and the unfold the Unfold bar
 * previews on the paper. It comes back as the bar closes.
 */
export function useFoldToolWindowYields(): boolean {
  const repeating = useFoldRepeatUi((state) => state.opening !== null);
  const returning = useFoldReturnUi((state) => state.opening !== null);
  return repeating || returning;
}
