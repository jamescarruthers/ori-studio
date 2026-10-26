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
 *   restores the record again.
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

interface Held {
  readonly figureId: string;
  /** The generation of handles the figure's fold belongs to (`foldedFigureHandleEpoch`). */
  readonly epoch: number;
  readonly cursor: LayerOrderSolutionCursor;
  /** The document when the cursor was made, and its creases where the figure was folded from them. */
  readonly document: OristudioCpDocumentSnapshot | null;
  readonly creases: string | null;
  /** What the figure holds that the cursor's session shows: its fold, and its record as saved. */
  handle: number | null;
  json: string;
  /** Where the order shown lies, by the key of what it was read by. */
  place: { by: string; value: LayerOrderSolutionPlace } | null;
  /** The key a `place` was last asked for, after the figure turned over or changed its X-ray. */
  asking: string | null;
  /** A press is running: the figure is waiting on it, and holds the new fold only once it lands. */
  stepping: boolean;
  /** Stops watching the workspace and the dialog for it. */
  readonly unwatch: () => void;
}

let held: Held | null = null;
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
    if (held && !held.stepping) dropFoldedSolutionCursor();
  }, FOLDED_SOLUTION_CURSOR_IDLE_MS);
}

/** The creases `figure` was folded from, as `document` has them now; null where it has no region to look in. */
function creasesOf(document: OristudioCpDocumentSnapshot | null, figure: OristudioCpFoldedFigureEntry): string | null {
  return document && figure.sourceBounds ? currentSourceFingerprint(document, figure.sourceBounds) : null;
}

/** Whether the cursor's session shows what `figure` holds. */
function inStep(cursor: Held, figure: OristudioCpFoldedFigureEntry | undefined): boolean {
  return (
    figure !== undefined &&
    figure.id === cursor.figureId &&
    foldedFigureHandleEpoch() === cursor.epoch &&
    figure.handle === cursor.handle &&
    figure.layerOrder?.kind === 'record' &&
    figure.layerOrder.json === cursor.json &&
    cursor.cursor.alive()
  );
}

/** Whether the creases the cursor's figure was folded from are as they were when it was made. */
function creasesHeld(cursor: Held, document: OristudioCpDocumentSnapshot | null, figure: OristudioCpFoldedFigureEntry): boolean {
  if (document === cursor.document) return true;
  // With no region to look in, any edit may have been to its creases.
  if (cursor.creases === null || !document) return false;
  return creasesOf(document, figure) === cursor.creases;
}

/** Close the cursor, with its worker. Idempotent. */
export function dropFoldedSolutionCursor(): void {
  stopIdleClock();
  if (!held) return;
  const gone = held;
  held = null;
  gone.unwatch();
  gone.cursor.close();
  notify();
}

/**
 * Where the order `figure` shows lies among the solutions that fit its
 * record, by what its stepper steps through now: known only while a cursor
 * is in step with it and has answered for that. Null otherwise — before the
 * first press, after an undo, once the figure turned over until it is asked
 * again. Reads the table only, so any render may ask.
 */
export function foldedSolutionPlace(figure: OristudioCpFoldedFigureEntry): LayerOrderSolutionPlace | null {
  if (!held || !inStep(held, figure) || !held.place) return null;
  return held.place.by === stepByKey(foldedFigureStepBy(figure)) ? held.place.value : null;
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
  const cursor = held;
  if (!cursor || cursor.stepping) return;
  const figure = figures.find((candidate) => candidate.id === cursor.figureId);
  if (
    !figure ||
    !inStep(cursor, figure) ||
    !creasesHeld(cursor, document, figure) ||
    (selected !== undefined && selected !== cursor.figureId)
  ) {
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
   * The press is over, and `figures` and `document` are as it left them: a
   * step that moved and never landed takes the cursor with it, and anything
   * that changed meanwhile is settled now ({@link settleFoldedSolutionCursor}).
   */
  end(figures: readonly OristudioCpFoldedFigureEntry[], document: OristudioCpDocumentSnapshot | null): void;
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
        mine = {
          figureId: figure.id,
          epoch: foldedFigureHandleEpoch(),
          cursor: made,
          document,
          creases: creasesOf(document, figure),
          handle: figure.handle,
          json,
          place: null,
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
          // Nothing moved: where it stands is known now, for the readout and the ends.
          cursor.place = { by: stepByKey(by), value: { position: answer.position, counted: answer.counted } };
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
    end(figures, now) {
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
      settleFoldedSolutionCursor(figures, now);
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
