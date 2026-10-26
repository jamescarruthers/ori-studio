/**
 * Stand-ins for the host engine's solutions cursor (`layer-order/host/`), for
 * the tests of what Edit builds on it (`foldedSolutionCursor.ts`): a cursor
 * that answers the steps a test scripts, and a way to leave Edit's table
 * holding one at a given place, as a press that landed there or found its
 * end would.
 *
 * A test mocks the gateway's `openLayerOrderSolutionCursor` and hands it
 * {@link scriptedSolutionCursor}s.
 */
import type {
  LayerOrderSolutionCursor,
  LayerOrderSolutionPlace,
  LayerOrderSolutionStep,
  LayerOrderSolutionStepOptions,
} from '../../layer-order/host/hostEngineGateway';
import type { LayerPosition, LayerStepBy } from '../../layer-order/engine/layerOrderEngine';
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import { FAKE_LAYER_ORDER_SOURCE } from '../../layer-order/engine/layerOrderEngine.fixtures';
import { beginFoldedSolutionStep, dropFoldedSolutionCursor } from './foldedSolutionCursor';

/** A cursor that answers `steps` in turn, and `place` from `places` (or null), with a log of what it was asked. */
export interface ScriptedSolutionCursor extends LayerOrderSolutionCursor {
  readonly asked: { direction: 'next' | 'previous'; by: LayerStepBy }[];
  /** Each step's `tries`: how many times the user had asked to keep trying. */
  readonly triesAsked: number[];
  readonly placesAsked: LayerStepBy[];
  closed: boolean;
}

/** One scripted answer: as it is, or made when the step is asked, from its Stop signal. */
export type ScriptedSolutionStep =
  | LayerOrderSolutionStep
  | ((options: LayerOrderSolutionStepOptions) => Promise<LayerOrderSolutionStep>);

export function scriptedSolutionCursor(
  steps: readonly ScriptedSolutionStep[],
  places: readonly (LayerOrderSolutionPlace | null)[] = []
): ScriptedSolutionCursor {
  const queue = [...steps];
  const placeQueue = [...places];
  const cursor: ScriptedSolutionCursor = {
    asked: [],
    triesAsked: [],
    placesAsked: [],
    closed: false,
    async step(direction, by, options = {}) {
      cursor.asked.push({ direction, by });
      cursor.triesAsked.push(options.tries ?? 0);
      const answer = queue.shift();
      if (!answer) throw new Error('the script has no more steps');
      return typeof answer === 'function' ? answer(options) : answer;
    },
    async place(by) {
      cursor.placesAsked.push(by);
      return placeQueue.shift() ?? null;
    },
    alive: () => !cursor.closed,
    close() {
      cursor.closed = true;
    },
  };
  return cursor;
}

/** A position in the stepper's fixed order: `index` of `n`, final when `exact`. */
export function solutionPosition(index: number, n: number, exact = true): LayerPosition {
  return { index, total: { n, exact } };
}

/**
 * A › that moved to `index` of `n`, as a scripted first answer for
 * {@link seatFoldedSolutionCursor}: the figure is then read as landed there,
 * with neither way proved to end.
 */
export function landedAt(
  record: LayerOrderRecord,
  index: number,
  n: number,
  { exact = true, counted = true }: { exact?: boolean; counted?: boolean } = {}
): LayerOrderSolutionStep {
  return {
    outcome: 'moved',
    applied: { record, relations: new Uint32Array(), source: FAKE_LAYER_ORDER_SOURCE },
    position: solutionPosition(index, n, exact),
    counted,
  };
}

/**
 * Leave Edit's table holding the next cursor the mocked gateway opens, for
 * `figure`, at whatever its first scripted step, a ›, says: one that moved
 * ({@link landedAt}) as a press that landed there leaves it, on the figure's
 * own fold and record; an `end` as a press that found › proved to end (E9)
 * leaves it. Any cursor kept before goes first.
 */
export async function seatFoldedSolutionCursor(
  figure: OristudioCpFoldedFigureEntry,
  record: LayerOrderRecord
): Promise<void> {
  dropFoldedSolutionCursor();
  const turn = beginFoldedSolutionStep(figure, null);
  const answer = await turn.step({ direction: 'next', source: async () => FAKE_LAYER_ORDER_SOURCE, record });
  if (answer.outcome === 'moved') {
    if (figure.handle === null || figure.layerOrder?.kind !== 'record') throw new Error('a landing needs a live constrained figure');
    turn.landed(figure.handle, figure.layerOrder.json);
  }
  turn.end([figure], null, figure.id);
}
