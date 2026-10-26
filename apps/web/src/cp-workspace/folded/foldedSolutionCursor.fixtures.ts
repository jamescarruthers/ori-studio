/**
 * Stand-ins for the host engine's solutions cursor (`layer-order/host/`), for
 * the tests of what Edit builds on it (`foldedSolutionCursor.ts`): the hosts'
 * scripted cursor (`solutionCursorTable.fixtures.ts`), and a way to leave
 * Edit's table holding one at a given place, as a press that found its end
 * would.
 *
 * A test mocks the gateway's `openLayerOrderSolutionCursor` and hands it
 * {@link scriptedSolutionCursor}s.
 */
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import { FAKE_LAYER_ORDER_SOURCE } from '../../layer-order/engine/layerOrderEngine.fixtures';
import { beginFoldedSolutionStep, dropFoldedSolutionCursor } from './foldedSolutionCursor';

export {
  scriptedSolutionCursor,
  solutionPosition,
  type ScriptedSolutionCursor,
  type ScriptedSolutionStep,
} from '../../layer-order/host/solutionCursorTable.fixtures';

/**
 * Leave Edit's table holding the next cursor the mocked gateway opens, for
 * `figure`, at whatever its first scripted step (an `end`) says: as a press
 * that found its end leaves it. Any cursor kept before goes first.
 */
export async function seatFoldedSolutionCursor(
  figure: OristudioCpFoldedFigureEntry,
  record: LayerOrderRecord
): Promise<void> {
  dropFoldedSolutionCursor();
  const turn = beginFoldedSolutionStep(figure, null);
  await turn.step({ direction: 'next', source: async () => FAKE_LAYER_ORDER_SOURCE, record });
  turn.end([figure], null);
}
