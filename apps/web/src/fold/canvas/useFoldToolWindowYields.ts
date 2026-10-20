import { useFoldRepeatUi } from '../repeat/foldRepeatUi';
import { useFoldReturnUi } from '../return/foldReturnUi';

/**
 * Whether a phone's tool window gives way to the bar over the column: Repeat's
 * or Unfold to step's. Each puts the tool in hand down as it opens
 * (`openFoldRepeat`, `openFoldReturn`), so the window has nothing to offer
 * while it is open, and a phone has no height to spare for it: risen from the
 * canvas's bar, it covered Repeat's own buttons and the words that say why a
 * repeat stopped, and the unfold the Unfold bar previews on the paper. It
 * comes back as the bar closes. Off a phone the window sits in the canvas's
 * corner, clear of both bars, and stays.
 */
export function useFoldToolWindowYields(phone: boolean): boolean {
  const repeating = useFoldRepeatUi((state) => state.opening !== null);
  const returning = useFoldReturnUi((state) => state.opening !== null);
  return phone && (repeating || returning);
}
