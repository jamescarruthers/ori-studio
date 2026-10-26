/**
 * Another solution within a constrained figure's layer constraints
 * (`implementation-plans/layer-order-dialog.md`, row H6, decision D9): the
 * one cursor Edit keeps through the solutions that fit a figure's record,
 * on the host engine (`layer-order/host/hostEngineGateway.ts`).
 *
 * A side table beside the figures, as the search's frontier is
 * (`foldedSolutionFrontiers.ts`), and for the same reasons: what the engine
 * has counted is not undo state, and it is never in the file.
 *
 * - **Made on the first press, never before.** Selecting a figure and
 *   drawing its toolbar or its Properties pane only read this table
 *   ({@link foldedSolutionPlace}); a press of › or ‹ makes the cursor
 *   ({@link beginFoldedSolutionStep}), which spawns its worker and restores
 *   the record. What the verbs offer at rest comes from saved data
 *   (`foldedFigureLayerOrderState.ts`).
 * - **One at a time, and only while it is being used.** Its worker holds the
 *   figure's whole session (about 18 MB on kabuto, 110 MB on iguana-c0), so
 *   it is kept only between presses on the figure in hand: stepping another
 *   figure, selecting anything else, leaving Edit for another workspace,
 *   opening the Layer order dialog, or a minute with no press
 *   ({@link FOLDED_SOLUTION_CURSOR_IDLE_MS}) closes it, and the next press
 *   restores the record again. A minute with no press lets go of the worker
 *   only: where the figure's order lies is kept for the readout, on the same
 *   terms as the cursor was ({@link Rest}).
 * - **In step with the figure, or gone.** The cursor's session shows one
 *   order: the one its last step landed, which the figure then holds as its
 *   fold and its record. Whenever the figure holds anything else — an undo
 *   or a redo, an Apply, a refold, a Delete — or the creases it was folded
 *   from change, or the document closes, the cursor is closed with its
 *   worker ({@link settleFoldedSolutionCursor}, which the store calls on
 *   every change to the figures, the selection or the document). So a cursor
 *   never steps from, or draws, an order that is not the figure's record.
 *
 * Store-free: the store hands it the figures, the selection and the
 * document ({@link watchFoldedSolutionCursor}).
 */
import type { OristudioCpDocumentSnapshot, OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import type { LayerStepBy } from '../../layer-order/engine/layerOrderEngine';
import { onLayerOrderDialogOpen } from '../../layer-order/dialog/layerOrderDialogGateway';
import {
  openLayerOrderSolutionCursor,
  type LayerOrderSolutionCursor,
  type LayerOrderSolutionPlace,
  type LayerOrderSolutionStep,
} from '../../layer-order/host/hostEngineGateway';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { useLayoutStore } from '../../store/layoutStore';
import { foldedFigureHandleEpoch } from './foldedFigureHandles';
import { currentSourceFingerprint } from './foldedFigureStaleness';

export type { LayerOrderSolutionPlace };

/**
 * Where the order a figure shows lies, and the way a step from it last found
 * nothing: an end E9 proved, so that verb waits there even before the count
 * is final. Any step that moves, or a turn over, reads a new place without it.
 */
export interface FoldedSolutionPlace extends LayerOrderSolutionPlace {
  readonly ended?: 'next' | 'previous';
}

/**
 * How long a cursor is kept with no press. A press while it is kept costs one
 * step; once it is gone, the next press restores the record first, which
 * takes up to 2–3 s on the largest figures measured (iguana-c0's restore,
 * census 2). A minute covers stepping back and forth through a figure's
 * solutions, with pauses to look at each, and lets go of the worker's memory
 * soon after the user has moved on to something else on the same figure.
 */
export const FOLDED_SOLUTION_CURSOR_IDLE_MS = 60_000;

/**
 * What a figure's stepper steps through (D5): every layer order when it is
 * drawn see-through (Transparent3, Edit's X-ray), or else the distinct
 * pictures of the side it shows.
 */
export function foldedFigureStepBy(figure: OristudioCpFoldedFigureEntry): LayerStepBy {
  if (figure.displayStyle === 'Transparent3') return 'layer_order';
  return { picture: figure.snapshot?.model.state === 'Back1' ? 'back' : 'front' };
}

function stepByKey(by: LayerStepBy): string {
  return by === 'layer_order' ? by : by.picture;
}

/** What a cursor is kept against, and what is kept of it once it rests: the figure as the cursor last saw it. */
interface KeptFor {
  readonly figureId: string;
  /** The generation of handles the figure's fold belongs to (`foldedFigureHandleEpoch`). */
  readonly epoch: number;
  /** The document when the cursor was made, and its creases where the figure was folded from them. */
  readonly document: OristudioCpDocumentSnapshot | null;
  readonly creases: string | null;
  /** What the figure holds that the cursor's session shows: its fold, and its record as saved. */
  readonly handle: number | null;
  readonly json: string;
}

/** A place, by the key of what it was read by. */
interface KeyedPlace {
  readonly by: string;
  readonly value: FoldedSolutionPlace;
}

interface Held extends KeptFor {
  readonly cursor: LayerOrderSolutionCursor;
  handle: number | null;
  json: string;
  /** Where the order shown lies. */
  place: KeyedPlace | null;
  /** The key a `place` was last asked for, after the figure turned over or changed its X-ray. */
  asking: string | null;
  /** A press is running: the figure is waiting on it, and holds the new fold only once it lands. */
  stepping: boolean;
  /** Stops watching the workspace and the dialog for it. */
  readonly unwatch: () => void;
}

/**
 * Where the figure's order lay when its cursor went a minute with no press,
 * and the worker went: the readout stays as it was. Let go whenever the
 * cursor would have been ({@link settleFoldedSolutionCursor}, the workspace,
 * the dialog), the minute aside; the next press seeds its new cursor with it.
 */
interface Rest extends KeptFor {
  readonly place: KeyedPlace;
  /** Stops watching the workspace and the dialog for it: the cursor's watch, carried over. */
  readonly unwatch: () => void;
}

let held: Held | null = null;
let rest: Rest | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

function stopIdleClock(): void {
  if (idle !== null) clearTimeout(idle);
  idle = null;
}

/** Start the minute again: a press, or an answer, just used the cursor. */
function startIdleClock(): void {
  stopIdleClock();
  idle = setTimeout(() => {
    idle = null;
    if (held && !held.stepping) letCursorRest(held);
  }, FOLDED_SOLUTION_CURSOR_IDLE_MS);
}

/** Close an idle cursor's worker, keeping where its figure's order lies, if it knew. */
function letCursorRest(cursor: Held): void {
  const { place } = cursor;
  if (!place) {
    dropFoldedSolutionCursor();
    return;
  }
  held = null;
  const { figureId, epoch, document, creases, handle, json, unwatch } = cursor;
  rest = { figureId, epoch, document, creases, handle, json, place, unwatch };
  cursor.cursor.close();
  notify();
}

/** Forget a rested place, and stop its watch. */
function forgetRest(): void {
  const gone = rest;
  rest = null;
  gone?.unwatch();
}

/** The creases `figure` was folded from, as `document` has them now; null where it has no region to look in. */
function creasesOf(document: OristudioCpDocumentSnapshot | null, figure: OristudioCpFoldedFigureEntry): string | null {
  return document && figure.sourceBounds ? currentSourceFingerprint(document, figure.sourceBounds) : null;
}

/** Whether `figure` holds what `kept` saw it hold: the same fold, of the same generation, with the same record. */
function holdsAsKept(kept: KeptFor, figure: OristudioCpFoldedFigureEntry | undefined): boolean {
  return (
    figure !== undefined &&
    figure.id === kept.figureId &&
    foldedFigureHandleEpoch() === kept.epoch &&
    figure.handle === kept.handle &&
    figure.layerOrder?.kind === 'record' &&
    figure.layerOrder.json === kept.json
  );
}

/** Whether the cursor's session shows what `figure` holds. */
function inStep(cursor: Held, figure: OristudioCpFoldedFigureEntry | undefined): boolean {
  return holdsAsKept(cursor, figure) && cursor.cursor.alive();
}

/** Whether the creases the cursor's figure was folded from are as they were when it was made. */
function creasesHeld(cursor: KeptFor, document: OristudioCpDocumentSnapshot | null, figure: OristudioCpFoldedFigureEntry): boolean {
  if (document === cursor.document) return true;
  // With no region to look in, any edit may have been to its creases.
  if (cursor.creases === null || !document) return false;
  return creasesOf(document, figure) === cursor.creases;
}

/**
 * The figure `kept` is for, while `figures`, `document` and the selected
 * figure (when given) still keep it: the figure there, holding what `holds`
 * asks, its creases as they were, and the one selected. Null once any isn't.
 */
function keptFigure<K extends KeptFor>(
  kept: K,
  holds: (kept: K, figure: OristudioCpFoldedFigureEntry) => boolean,
  figures: readonly OristudioCpFoldedFigureEntry[],
  document: OristudioCpDocumentSnapshot | null,
  selected: string | null | undefined
): OristudioCpFoldedFigureEntry | null {
  const figure = figures.find((candidate) => candidate.id === kept.figureId);
  if (!figure || !holds(kept, figure) || !creasesHeld(kept, document, figure)) return null;
  return selected === undefined || selected === kept.figureId ? figure : null;
}

/** Close the cursor, with its worker, and forget where its figure's order lay. Idempotent. */
export function dropFoldedSolutionCursor(): void {
  stopIdleClock();
  if (!held && !rest) return;
  forgetRest();
  const gone = held;
  held = null;
  gone?.unwatch();
  gone?.cursor.close();
  notify();
}

/**
 * Where the order `figure` shows lies among the solutions that fit its
 * record, by what its stepper steps through now: known once a cursor in step
 * with it has answered for that, and still after the cursor rested, while
 * the figure holds what it did. Null otherwise — before the first press,
 * after an undo, once the figure turned over until it is asked again. Reads
 * the table only, so any render may ask.
 */
export function foldedSolutionPlace(figure: OristudioCpFoldedFigureEntry): FoldedSolutionPlace | null {
  const known = held ? (inStep(held, figure) ? held.place : null) : rest && holdsAsKept(rest, figure) ? rest.place : null;
  return known && known.by === stepByKey(foldedFigureStepBy(figure)) ? known.value : null;
}

/**
 * Keep the cursor in step with the figures, the selection and the document
 * as they are now: closed when its figure holds another fold or record, has
 * gone, is no longer the one selected (`selected`, when given), or its
 * creases changed; asked where it stands again when the figure turned over
 * or changed its X-ray. Nothing while a press runs: that press settles it
 * when it ends.
 */
export function settleFoldedSolutionCursor(
  figures: readonly OristudioCpFoldedFigureEntry[],
  document: OristudioCpDocumentSnapshot | null,
  selected?: string | null
): void {
  if (!held) {
    // A rested place goes on the same terms, but has no one to ask again.
    if (rest && !keptFigure(rest, holdsAsKept, figures, document, selected)) dropFoldedSolutionCursor();
    return;
  }
  const cursor = held;
  if (cursor.stepping) return;
  const figure = keptFigure(cursor, inStep, figures, document, selected);
  if (!figure) {
    dropFoldedSolutionCursor();
    return;
  }
  const by = foldedFigureStepBy(figure);
  const key = stepByKey(by);
  if (!cursor.place || cursor.place.by === key) {
    // Turned over and straight back: an answer still on its way is for a side no longer shown.
    cursor.asking = null;
    return;
  }
  if (cursor.asking === key) return;
  cursor.asking = key;
  void cursor.cursor.place(by).then((place) => {
    if (held !== cursor || cursor.asking !== key) return;
    cursor.asking = null;
    if (place) cursor.place = { by: key, value: place };
    startIdleClock();
    notify();
  });
}

/** What the store is, as far as the cursor needs: its figures, its selection and its document. */
export interface FoldedSolutionCursorStore {
  subscribe(
    listener: (state: FoldedSolutionCursorScene, previous: FoldedSolutionCursorScene) => void
  ): () => void;
}

export interface FoldedSolutionCursorScene {
  readonly oristudioCpFoldedFigures: readonly OristudioCpFoldedFigureEntry[];
  readonly oristudioCpActiveFoldedFigureId: string | null;
  readonly oristudioCpDocument: { readonly document: OristudioCpDocumentSnapshot } | null;
}

/**
 * Keep the cursor to the figure in hand, for as long as `store` lives:
 * settled on every change to the figures, the selection or the document.
 * Returns the unsubscribe. The store calls it once, as it is made; a cursor
 * watches the workspace and the Layer order dialog itself, while it is kept
 * ({@link watchWhileKept}).
 */
export function watchFoldedSolutionCursor(store: FoldedSolutionCursorStore): () => void {
  return store.subscribe((state, previous) => {
    if (
      state.oristudioCpFoldedFigures === previous.oristudioCpFoldedFigures &&
      state.oristudioCpDocument === previous.oristudioCpDocument &&
      state.oristudioCpActiveFoldedFigureId === previous.oristudioCpActiveFoldedFigureId
    ) {
      return;
    }
    settleFoldedSolutionCursor(
      state.oristudioCpFoldedFigures,
      state.oristudioCpDocument?.document ?? null,
      state.oristudioCpActiveFoldedFigureId
    );
  });
}

/** While a cursor is kept: let it go when the workspace switches or a Layer order dialog opens. */
function watchWhileKept(): () => void {
  const stops = [
    useLayoutStore.subscribe((state, previous) => {
      if (state.activeWorkspace !== previous.activeWorkspace) dropFoldedSolutionCursor();
    }),
    onLayerOrderDialogOpen(dropFoldedSolutionCursor),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/** What a press asks of the cursor, from the figure as the press found it. */
export interface FoldedSolutionStepAsk {
  readonly direction: 'next' | 'previous';
  /** The fold the figure shows, read only when the press makes the cursor: the live fold's source, or its creases'. */
  readonly source: () => Promise<LayerOrderSource>;
  /** The figure's record, its points in the crease pattern's coordinates. */
  readonly record: LayerOrderRecord;
  /** A Stop: it terminates the cursor's worker. */
  readonly signal?: AbortSignal;
  /** How many times the user has asked to keep trying after running out of time (the cursor's `tries`). */
  readonly tries?: number;
}

/** One press, from its start to its end, however it ends. */
export interface FoldedSolutionTurn {
  /** Step the cursor, making it first if there is none in step with the figure. Rejects only when the source can't be read. */
  step(ask: FoldedSolutionStepAsk): Promise<LayerOrderSolutionStep>;
  /** The step's fold and record are the figure's now: called just before the store shows them. */
  landed(handle: number, json: string): void;
  /**
   * The press is over, and `figures`, `document` and the selected figure are
   * as it left them: a step that moved and never landed takes the cursor with
   * it, and anything that changed meanwhile — a deselect included — is
   * settled now ({@link settleFoldedSolutionCursor}).
   */
  end(
    figures: readonly OristudioCpFoldedFigureEntry[],
    document: OristudioCpDocumentSnapshot | null,
    selected: string | null
  ): void;
}

/**
 * A press of › or ‹ on `figure`, a constrained flat figure, with `document`
 * as it stands. A cursor out of step with the figure goes first; one in step
 * is kept, and steps on from where it is.
 */
export function beginFoldedSolutionStep(
  figure: OristudioCpFoldedFigureEntry,
  document: OristudioCpDocumentSnapshot | null
): FoldedSolutionTurn {
  if (held && (held.figureId !== figure.id || !inStep(held, figure) || !creasesHeld(held, document, figure))) {
    dropFoldedSolutionCursor();
  }
  // A rested place for another figure, or for what this one no longer holds, is let go too.
  if (rest && (!holdsAsKept(rest, figure) || !creasesHeld(rest, document, figure))) dropFoldedSolutionCursor();
  let mine: Held | null = held;
  if (mine) mine.stepping = true;
  stopIdleClock();
  /** Where a step that moved lands, once the figure shows it. */
  let landing: { by: string; value: LayerOrderSolutionPlace } | null = null;
  let moved = false;
  let over = false;

  return {
    async step({ direction, source, record, signal, tries = 0 }) {
      if (!mine) {
        const made = openLayerOrderSolutionCursor(await source(), record);
        if (over || held) {
          made.close();
          return { outcome: 'cancelled' };
        }
        const json = figure.layerOrder?.kind === 'record' ? figure.layerOrder.json : '';
        // Where the figure's order lay, if a rested cursor knew: read until this one answers.
        const known = rest && holdsAsKept(rest, figure) ? rest.place : null;
        forgetRest();
        mine = {
          figureId: figure.id,
          epoch: foldedFigureHandleEpoch(),
          cursor: made,
          document,
          creases: creasesOf(document, figure),
          handle: figure.handle,
          json,
          place: known,
          asking: null,
          stepping: true,
          unwatch: watchWhileKept(),
        };
        held = mine;
      }
      const cursor = mine;
      const by = foldedFigureStepBy(figure);
      const answer = await cursor.cursor.step(direction, by, { ...(signal ? { signal } : {}), tries });
      switch (answer.outcome) {
        case 'moved':
          moved = true;
          landing = { by: stepByKey(by), value: { position: answer.position, counted: answer.counted } };
          break;
        case 'end':
          // Nothing moved: where it stands is known now, for the readout, and that way is proved
          // to end (E9), so its verb waits there.
          cursor.place = {
            by: stepByKey(by),
            value: { position: answer.position, counted: answer.counted, ended: direction },
          };
          break;
        case 'timed_out':
          // Kept, for Keep trying on the same session.
          break;
        default:
          // Spent, stopped or lost: its session is gone.
          if (held === cursor) dropFoldedSolutionCursor();
      }
      return answer;
    },
    landed(handle, json) {
      if (!mine || held !== mine) return;
      mine.handle = handle;
      mine.json = json;
      mine.place = landing;
      moved = false;
    },
    end(figures, now, selected) {
      if (over) return;
      over = true;
      if (!mine || held !== mine) return;
      mine.stepping = false;
      // Its session shows an order the figure never took: an undo meanwhile, a fold refused.
      if (moved) {
        dropFoldedSolutionCursor();
        return;
      }
      startIdleClock();
      notify();
      settleFoldedSolutionCursor(figures, now, selected);
    },
  };
}

/** For `useSyncExternalStore`: called whenever what {@link foldedSolutionPlace} answers may have changed. */
export function subscribeFoldedSolutionCursor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For `useSyncExternalStore`: moves whenever the table does. */
export function foldedSolutionCursorVersion(): number {
  return version;
}

/** Whether a cursor is kept, and for which figure: for tests and diagnostics. */
export function foldedSolutionCursorFigure(): string | null {
  return held?.figureId ?? null;
}
