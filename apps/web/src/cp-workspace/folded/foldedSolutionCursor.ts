/**
 * Another solution within a constrained figure's layer constraints
 * (`implementation-plans/layer-order-dialog.md`, row H6, decision D9): the
 * one cursor Edit keeps through the solutions that fit a figure's record,
 * on the host engine (`layer-order/host/hostEngineGateway.ts`).
 *
 * Edit's binding of the hosts' shared table
 * (`layer-order/host/solutionCursorTable.ts`), which keeps the lifecycle: made
 * on the first press, one at a time, let go once out of step. A side table
 * beside the figures, as the search's frontier is
 * (`foldedSolutionFrontiers.ts`), and for the same reasons: what the engine
 * has counted is not undo state, and it is never in the file. Edit says:
 *
 * - **What a figure holds that the cursor shows:** its fold (the handle, of
 *   this generation of handles) and its record as saved. Whenever the figure
 *   holds anything else — an undo or a redo, an Apply, a refold, a Delete —
 *   or the creases it was folded from change, or the document closes, the
 *   cursor is closed with its worker ({@link settleFoldedSolutionCursor},
 *   which the store calls on every change to the figures or the document).
 * - **What it steps by** ({@link foldedFigureStepBy}): every layer order in
 *   X-ray, else the pictures of the side it shows (D5).
 *
 * Selecting a figure and drawing its toolbar or its Properties pane only read
 * the table ({@link foldedSolutionPlace}); a press of › or ‹ makes the cursor
 * ({@link beginFoldedSolutionStep}). What the verbs offer at rest comes from
 * saved data (`foldedFigureLayerOrderState.ts`).
 *
 * Store-free: the store hands it the figures and the document.
 */
import type { OristudioCpDocumentSnapshot, OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import type { LayerStepBy } from '../../layer-order/engine/layerOrderEngine';
import type {
  LayerOrderSolutionPlace,
  LayerOrderSolutionStep,
} from '../../layer-order/host/hostEngineGateway';
import { createSolutionCursorTable, type SolutionCursorOpening } from '../../layer-order/host/solutionCursorTable';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { foldedFigureHandleEpoch } from './foldedFigureHandles';
import { currentSourceFingerprint } from './foldedFigureStaleness';

export type { LayerOrderSolutionPlace };

/**
 * What a figure's stepper steps through (D5): every layer order when it is
 * drawn see-through (Transparent3, Edit's X-ray), or else the distinct
 * pictures of the side it shows.
 */
export function foldedFigureStepBy(figure: OristudioCpFoldedFigureEntry): LayerStepBy {
  if (figure.displayStyle === 'Transparent3') return 'layer_order';
  return { picture: figure.snapshot?.model.state === 'Back1' ? 'back' : 'front' };
}

/** What Edit keeps of a figure for its cursor. */
interface FigureMark {
  /** The generation of handles the figure's fold belongs to (`foldedFigureHandleEpoch`). */
  readonly epoch: number;
  /** The document when the cursor was made, and its creases where the figure was folded from them. */
  readonly document: OristudioCpDocumentSnapshot | null;
  readonly creases: string | null;
  /** What the figure holds that the cursor's session shows: its fold, and its record as saved. */
  readonly handle: number | null;
  readonly json: string;
}

/** The creases `figure` was folded from, as `document` has them now; null where it has no region to look in. */
function creasesOf(document: OristudioCpDocumentSnapshot | null, figure: OristudioCpFoldedFigureEntry): string | null {
  return document && figure.sourceBounds ? currentSourceFingerprint(document, figure.sourceBounds) : null;
}

const table = createSolutionCursorTable<
  OristudioCpFoldedFigureEntry,
  OristudioCpDocumentSnapshot | null,
  FigureMark,
  SolutionCursorOpening
>({
  idOf: (figure) => figure.id,
  markOf: (figure, document) => ({
    epoch: foldedFigureHandleEpoch(),
    document,
    creases: creasesOf(document, figure),
    handle: figure.handle,
    json: figure.layerOrder?.kind === 'record' ? figure.layerOrder.json : '',
  }),
  inStep: (mark, figure) =>
    foldedFigureHandleEpoch() === mark.epoch &&
    figure.handle === mark.handle &&
    figure.layerOrder?.kind === 'record' &&
    figure.layerOrder.json === mark.json,
  heldIn: (mark, figure, document) => {
    if (document === mark.document) return true;
    // With no region to look in, any edit may have been to its creases.
    if (mark.creases === null || !document) return false;
    return creasesOf(document, figure) === mark.creases;
  },
  stepBy: foldedFigureStepBy,
});

/** The figures as a table looks them up. */
const lookup = (figures: readonly OristudioCpFoldedFigureEntry[]) => (id: string) =>
  figures.find((candidate) => candidate.id === id);

/** Close the cursor, with its worker. Idempotent. */
export function dropFoldedSolutionCursor(): void {
  table.drop();
}

/**
 * Where the order `figure` shows lies among the solutions that fit its
 * record, by what its stepper steps through now: known only while a cursor
 * is in step with it and has answered for that. Null otherwise — before the
 * first press, after an undo, once the figure turned over until it is asked
 * again. Reads the table only, so any render may ask.
 */
export function foldedSolutionPlace(figure: OristudioCpFoldedFigureEntry): LayerOrderSolutionPlace | null {
  return table.place(figure);
}

/**
 * Keep the cursor in step with the figures and the document as they are now:
 * closed when its figure holds another fold or record, has gone, or its
 * creases changed; asked where it stands again when the figure turned over or
 * changed its X-ray. Nothing while a press runs: that press settles it when
 * it ends. The store calls this on every change to either.
 */
export function settleFoldedSolutionCursor(
  figures: readonly OristudioCpFoldedFigureEntry[],
  document: OristudioCpDocumentSnapshot | null
): void {
  table.settle(lookup(figures), document);
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
  const turn = table.begin(figure, document);
  return {
    step: ({ direction, source, record, signal }) =>
      turn.step({
        direction,
        open: async () => ({ source: await source(), record }),
        ...(signal ? { signal } : {}),
      }),
    landed: (handle, json) => turn.landed((mark) => ({ ...mark, handle, json })),
    end: (figures, now) => turn.end(lookup(figures), now),
  };
}

/** For `useSyncExternalStore`: called whenever what {@link foldedSolutionPlace} answers may have changed. */
export function subscribeFoldedSolutionCursor(listener: () => void): () => void {
  return table.subscribe(listener);
}

/** For `useSyncExternalStore`: moves whenever the table does. */
export function foldedSolutionCursorVersion(): number {
  return table.version();
}

/** Whether a cursor is kept, and for which figure: for tests and diagnostics. */
export function foldedSolutionCursorFigure(): string | null {
  return table.heldId();
}
