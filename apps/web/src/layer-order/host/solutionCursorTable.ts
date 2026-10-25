/**
 * A host's one cursor through the solutions that fit a saved record
 * (`implementation-plans/layer-order-dialog.md`, rows H6 and H9, decision
 * D9): the part of "Another solution within constraints" that is the same
 * for every host. Edit binds it to a constrained figure
 * (`cp-workspace/folded/foldedSolutionCursor.ts`), the Diagram to a
 * constrained step (`diagram/capture/stepSolutionCursor.ts`); each says what
 * its thing holds, when that stops being what the cursor shows, and what it
 * steps by. The host engine's cursor itself is `layerOrderSolutionCursor.ts`,
 * reached through the gateway.
 *
 * A side table beside the host's state, never in it: what the engine has
 * counted is not undo state, and it is never in a file.
 *
 * - **Made on the first press, never before.** Drawing a pager only reads
 *   this table ({@link SolutionCursorTable.place}); a press of › or ‹ makes
 *   the cursor ({@link SolutionCursorTable.begin}), which spawns its worker
 *   and restores the record. What a pager offers at rest comes from saved
 *   data.
 * - **One at a time.** Stepping another thing lets the first one's go, in
 *   this table and in every other host's, so at most one worker is kept
 *   between presses in the whole app.
 * - **In step with its thing, or gone.** The cursor's session shows one
 *   order: the one its last step landed, which the thing then holds. Whenever
 *   it holds anything else, or is gone, or what it was folded from changed,
 *   the cursor is closed with its worker ({@link SolutionCursorTable.settle},
 *   which the host calls on every change to its state). So a cursor never
 *   steps from, or draws, an order that is not the thing's record; the next
 *   press makes a fresh one from the record it holds then.
 * - **A stepper through a fixed order has ends** ({@link solutionPlaceEnds}):
 *   ‹ waits on the first, › on the last once the count is final, rather than
 *   wrapping round. A press past an end the count has not settled yet may
 *   still find one ({@link solutionEndFinal}).
 *
 * Store-free and host-free: the host hands it its things and its world.
 */
import type { LayerPosition, LayerStepBy } from '../engine/layerOrderEngine';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import {
  openLayerOrderSolutionCursor,
  type LayerOrderLossCause,
  type LayerOrderSolutionCursor,
  type LayerOrderSolutionPlace,
  type LayerOrderSolutionStep,
  type LayerOrderSolutionsUnrestored,
} from './hostEngineGateway';

/** What a cursor is made from: the fold the host shows, and its record, in the crease pattern's coordinates. */
export interface SolutionCursorOpening {
  readonly source: LayerOrderSource;
  readonly record: LayerOrderRecord;
}

/**
 * What a host tells the table about its things: `Target`, the thing a pager
 * steps (a figure, a step); `World`, what else its in-step rule reads (the
 * document); `Mark`, what the host keeps of a thing as the cursor is made and
 * as each step lands on it; `Opened`, what its press opens the cursor with.
 */
export interface SolutionCursorHost<Target, World, Mark, Opened extends SolutionCursorOpening> {
  /** Which thing it is: one cursor at a time, for one thing. */
  readonly idOf: (target: Target) => string;
  /** What the host keeps of `target` as its cursor is made, in `world`, from what the press opened it with. */
  readonly markOf: (target: Target, world: World, opened: Opened) => Mark;
  /** Whether `target` still holds what the cursor's session shows, as `mark` says it did. Read by any render. */
  readonly inStep: (mark: Mark, target: Target) => boolean;
  /** Whether what `target` was folded from is as it was in `world`: read as the host's state changes. */
  readonly heldIn: (mark: Mark, target: Target, world: World) => boolean;
  /** What its stepper steps through now (D5): every layer order, or the distinct pictures of one side. */
  readonly stepBy: (target: Target) => LayerStepBy;
}

/** What a press asks of the cursor. */
export interface SolutionStepAsk<Opened extends SolutionCursorOpening> {
  readonly direction: 'next' | 'previous';
  /** What to make the cursor from, read only when the press makes it. */
  readonly open: () => Promise<Opened>;
  /** A Stop: it terminates the cursor's worker. */
  readonly signal?: AbortSignal;
}

/** One press, from its start to its end, however it ends. */
export interface SolutionTurn<Target, World, Mark, Opened extends SolutionCursorOpening> {
  /** Step the cursor, making it first if there is none in step with the thing. Rejects only when `open` does. */
  step(ask: SolutionStepAsk<Opened>): Promise<LayerOrderSolutionStep>;
  /** What the host keeps of the thing for this press's cursor; null before one is made, or once it is gone. */
  mark(): Mark | null;
  /** The step's order is the thing's now: called just before (or as) the host shows it, with what it keeps now. */
  landed(change: (mark: Mark) => Mark): void;
  /**
   * The press is over, and the host's things and world are as it left them:
   * a step that moved and never landed takes the cursor with it, and anything
   * that changed meanwhile is settled now.
   */
  end(find: (id: string) => Target | undefined, world: World): void;
}

export interface SolutionCursorTable<Target, World, Mark, Opened extends SolutionCursorOpening> {
  /**
   * Where the order `target` shows lies among the solutions that fit its
   * record, by what its stepper steps through now: known only while a cursor
   * is in step with it and has answered for that. Null otherwise — before the
   * first press, after an undo, once it turned over until asked again. Reads
   * the table only, so any render may ask.
   */
  place(target: Target): LayerOrderSolutionPlace | null;
  /**
   * Keep the cursor in step with the host as it is now: closed when its thing
   * holds another order, has gone, or what it was folded from changed; asked
   * where it stands again when the thing changed what it steps by. Nothing
   * while a press runs: that press settles it when it ends.
   */
  settle(find: (id: string) => Target | undefined, world: World): void;
  /**
   * A press of › or ‹ on `target`, with `world` as it stands. A cursor out
   * of step with it goes first; one in step is kept, and steps on.
   */
  begin(target: Target, world: World): SolutionTurn<Target, World, Mark, Opened>;
  /** Close the cursor, with its worker, if one is kept — for `id` only, when given. Idempotent. */
  drop(id?: string): void;
  /** For `useSyncExternalStore`: called whenever what {@link place} answers may have changed. */
  subscribe(listener: () => void): () => void;
  /** For `useSyncExternalStore`: moves whenever the table does. */
  version(): number;
  /** Which thing a cursor is kept for: for tests and diagnostics. */
  heldId(): string | null;
}

/** Every host's table: making a cursor in one lets every other one's go. */
const tables = new Set<{ drop(): void }>();

function stepByKey(by: LayerStepBy): string {
  return by === 'layer_order' ? by : by.picture;
}

export function createSolutionCursorTable<Target, World, Mark, Opened extends SolutionCursorOpening>(
  host: SolutionCursorHost<Target, World, Mark, Opened>
): SolutionCursorTable<Target, World, Mark, Opened> {
  interface Held {
    readonly id: string;
    readonly cursor: LayerOrderSolutionCursor;
    mark: Mark;
    /** Where the order shown lies, by the key of what it was read by. */
    place: { by: string; value: LayerOrderSolutionPlace } | null;
    /** The key a `place` was last asked for, after the thing changed what it steps by. */
    asking: string | null;
    /** A press is running: the thing is waiting on it, and holds the new order only once it lands. */
    stepping: boolean;
  }

  let held: Held | null = null;
  let version = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    version += 1;
    for (const listener of [...listeners]) listener();
  };

  /** Whether the cursor's session shows what `target` holds. */
  const inStep = (cursor: Held, target: Target | undefined): target is Target =>
    target !== undefined && host.idOf(target) === cursor.id && host.inStep(cursor.mark, target) && cursor.cursor.alive();

  const drop = (id?: string) => {
    if (!held || (id !== undefined && held.id !== id)) return;
    const gone = held;
    held = null;
    gone.cursor.close();
    notify();
  };

  const settle = (find: (id: string) => Target | undefined, world: World) => {
    const cursor = held;
    if (!cursor || cursor.stepping) return;
    const target = find(cursor.id);
    if (!inStep(cursor, target) || !host.heldIn(cursor.mark, target, world)) {
      drop();
      return;
    }
    const by = host.stepBy(target);
    const key = stepByKey(by);
    if (!cursor.place || cursor.place.by === key || cursor.asking === key) return;
    cursor.asking = key;
    void cursor.cursor.place(by).then((place) => {
      if (held !== cursor || cursor.asking !== key) return;
      cursor.asking = null;
      if (place) cursor.place = { by: key, value: place };
      notify();
    });
  };

  const table: SolutionCursorTable<Target, World, Mark, Opened> = {
    place(target) {
      if (!held || !inStep(held, target) || !held.place) return null;
      return held.place.by === stepByKey(host.stepBy(target)) ? held.place.value : null;
    },

    settle,

    begin(target, world) {
      const id = host.idOf(target);
      if (held && (held.id !== id || !inStep(held, target) || !host.heldIn(held.mark, target, world))) drop();
      let mine: Held | null = held;
      if (mine) mine.stepping = true;
      /** Where a step that moved lands, once the thing shows it. */
      let landing: { by: string; value: LayerOrderSolutionPlace } | null = null;
      let moved = false;
      let over = false;

      return {
        async step({ direction, open, signal }) {
          if (!mine) {
            const opened = await open();
            const made = openLayerOrderSolutionCursor(opened.source, opened.record);
            if (over || held) {
              made.close();
              return { outcome: 'cancelled' };
            }
            // One at a time, in the whole app: another host's cursor goes with its worker.
            for (const other of tables) if (other !== table) other.drop();
            mine = {
              id,
              cursor: made,
              mark: host.markOf(target, world, opened),
              place: null,
              asking: null,
              stepping: true,
            };
            held = mine;
          }
          const cursor = mine;
          const by = host.stepBy(target);
          const answer = await cursor.cursor.step(direction, by, signal ? { signal } : {});
          switch (answer.outcome) {
            case 'moved':
              moved = true;
              landing = { by: stepByKey(by), value: { position: answer.position, counted: answer.counted } };
              break;
            case 'end':
              // Nothing moved: where it stands is known now, for the readout and the ends.
              cursor.place = { by: stepByKey(by), value: { position: answer.position, counted: answer.counted } };
              break;
            case 'timed_out':
              break;
            default:
              // Spent, stopped or lost: its session is gone.
              if (held === cursor) drop();
          }
          return answer;
        },
        mark: () => (mine && held === mine ? mine.mark : null),
        landed(change) {
          if (!mine || held !== mine) return;
          mine.mark = change(mine.mark);
          mine.place = landing;
          moved = false;
        },
        end(find, now) {
          if (over) return;
          over = true;
          if (!mine || held !== mine) return;
          mine.stepping = false;
          // Its session shows an order the thing never took: an undo meanwhile, a fold refused.
          if (moved) {
            drop();
            return;
          }
          notify();
          settle(find, now);
        },
      };
    },

    drop,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    version: () => version,

    heldId: () => held?.id ?? null,
  };
  tables.add(table);
  return table;
}

/**
 * A place's ends, for a pager's ‹ and ›: `first` on the first solution;
 * `last` on the last once the count is final, `only` when that last is the
 * one solution there is. A stepper through a fixed order waits at either end
 * rather than wrapping round.
 */
export function solutionPlaceEnds(place: LayerOrderSolutionPlace): { first: boolean; last: boolean; only: boolean } {
  const { index, total } = place.position;
  const last = total.exact && index >= total.n;
  return { first: index <= 1, last, only: last && total.n <= 1 };
}

/**
 * Whether a press that found no solution its way is at that end for good:
 * nothing lies before the first, counted or not, and nothing after the last
 * once the count is final. An end that is not final may find one on the next
 * press, as the count goes on.
 */
export function solutionEndFinal(direction: 'next' | 'previous', position: LayerPosition): boolean {
  return position.total.exact || (direction === 'previous' && position.index <= 1);
}

/**
 * How a press of › or ‹ on a constrained thing ended, as a host reports it:
 * only `moved` changed the thing, as one undo entry.
 *
 * - `end`: no solution lies that way among those counted, `final` once the
 *   count is ({@link solutionEndFinal}); the pager shows it is at its end;
 * - `timed_out`: the check within the next solution ran out of time;
 * - `unrestored`: the record restores to no order to step from (D10): its
 *   constraints clash, it ran out of time, or the engine refused it;
 * - `lost`: the Layer order engine went away or never came (`load` for the
 *   browser failing to fetch it, offline);
 * - `not-drawn`: the host could not draw the order, and said so;
 * - `stopped`: a Stop, or the thing moved on (an undo, a Delete) while it ran;
 * - `blocked`: the thing can't step now.
 */
export type LayerOrderSolutionPress =
  | { status: 'moved' }
  | { status: 'end'; final: boolean }
  | { status: 'timed_out' }
  | { status: 'unrestored'; why: LayerOrderSolutionsUnrestored }
  | { status: 'lost'; cause: LayerOrderLossCause }
  | { status: 'not-drawn' }
  | { status: 'stopped' }
  | { status: 'blocked' };

/** What a press whose step moved nothing comes to. Nothing changed, however it ended. */
export function solutionPressOf(
  answer: Exclude<LayerOrderSolutionStep, { outcome: 'moved' }>,
  direction: 'next' | 'previous'
): LayerOrderSolutionPress {
  switch (answer.outcome) {
    case 'end':
      return { status: 'end', final: solutionEndFinal(direction, answer.position) };
    case 'timed_out':
      return { status: 'timed_out' };
    case 'unrestored':
      return { status: 'unrestored', why: answer.why };
    case 'lost':
      return { status: 'lost', cause: answer.cause };
    case 'cancelled':
      return { status: 'stopped' };
  }
}
