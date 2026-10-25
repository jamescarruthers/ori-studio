import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OristudioCpDocumentSnapshot, OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import { FAKE_LAYER_ORDER_SOURCE } from '../../layer-order/engine/layerOrderEngine.fixtures';
import { foldedFigureLayerOrder } from '../../lib/layerOrder/foldedFigureLayerOrder';
import { twoConstraintRecord } from '../../lib/layerOrder/layerOrderRecord.fixtures';
import { createStarterOristudioCpDocument } from '../../lib/oristudioCpStarterDocument';
import { FIGURE } from '../canvasObjects/canvasObjectKinds.fixtures';
import { resetFoldedFigureHandles } from './foldedFigureHandles';
import {
  beginFoldedSolutionStep,
  dropFoldedSolutionCursor,
  foldedFigureStepBy,
  foldedSolutionCursorFigure,
  foldedSolutionCursorVersion,
  foldedSolutionPlace,
  settleFoldedSolutionCursor,
  subscribeFoldedSolutionCursor,
} from './foldedSolutionCursor';
import { scriptedSolutionCursor, solutionPosition } from './foldedSolutionCursor.fixtures';

/**
 * Edit's one solutions cursor (row H6) on its own: the rules a press and the
 * store's subscription keep it by, with the host engine's cursor scripted.
 * The store's tests run the same through the verbs
 * (`store/workspaceStore/foldedFigureSolutionSteps.test.ts`).
 */
const gateway = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../../layer-order/host/hostEngineGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../layer-order/host/hostEngineGateway')>()),
  openLayerOrderSolutionCursor: (...args: unknown[]) => gateway.open(...args),
}));

afterEach(() => {
  dropFoldedSolutionCursor();
  gateway.open.mockReset();
});

const RECORD = twoConstraintRecord();
const held = (() => {
  const made = foldedFigureLayerOrder(RECORD);
  if (!made.ok || made.layerOrder.kind !== 'record') throw new Error('the fixture record encodes');
  return made.layerOrder;
})();

const FIGURE_HELD = {
  ...FIGURE,
  status: 'ready',
  handle: 3,
  displayStyle: 'Paper5',
  snapshot: { model: { state: 'Front0' }, shown_order: 'given' },
  sourceBounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  layerOrder: held,
} as unknown as OristudioCpFoldedFigureEntry;

const MOVED = {
  outcome: 'moved',
  applied: { record: RECORD, relations: new Uint32Array(), source: FAKE_LAYER_ORDER_SOURCE },
  position: solutionPosition(2, 3),
  counted: true,
} as const;

const ask = { direction: 'next', source: async () => FAKE_LAYER_ORDER_SOURCE, record: RECORD } as const;

describe('a press', () => {
  it('makes the cursor only when it steps, and reads where the step landed once the figure shows it', async () => {
    const cursor = scriptedSolutionCursor([MOVED]);
    gateway.open.mockReturnValue(cursor);
    const turn = beginFoldedSolutionStep(FIGURE_HELD, null);
    expect(gateway.open).not.toHaveBeenCalled();

    await turn.step(ask);
    expect(gateway.open).toHaveBeenCalledWith(FAKE_LAYER_ORDER_SOURCE, RECORD);
    expect(foldedSolutionCursorFigure()).toBe(FIGURE_HELD.id);
    // Not yet the figure's: nothing to read.
    expect(foldedSolutionPlace(FIGURE_HELD)).toBeNull();

    const landed = { ...FIGURE_HELD, handle: 9, layerOrder: { ...held, json: '{"landed":1}' } } as OristudioCpFoldedFigureEntry;
    turn.landed(9, '{"landed":1}');
    turn.end([landed], null);
    expect(foldedSolutionPlace(landed)).toEqual({ position: solutionPosition(2, 3), counted: true });
    expect(cursor.closed).toBe(false);
  });

  it('that moved and never landed (an undo meanwhile, a fold refused) takes the cursor with it', async () => {
    const cursor = scriptedSolutionCursor([MOVED]);
    gateway.open.mockReturnValue(cursor);
    const turn = beginFoldedSolutionStep(FIGURE_HELD, null);
    await turn.step(ask);
    turn.end([FIGURE_HELD], null);
    expect(cursor.closed).toBe(true);
    expect(foldedSolutionCursorFigure()).toBeNull();
  });

  it('settles nothing while it runs: the figure waits on it', async () => {
    const cursor = scriptedSolutionCursor([MOVED]);
    gateway.open.mockReturnValue(cursor);
    const turn = beginFoldedSolutionStep(FIGURE_HELD, null);
    await turn.step(ask);
    // The figure is `loading` on its old fold, and the cursor already moved: not out of step, just mid-press.
    settleFoldedSolutionCursor([{ ...FIGURE_HELD, status: 'loading' }], null);
    expect(cursor.closed).toBe(false);
    turn.landed(9, held.json);
    turn.end([{ ...FIGURE_HELD, handle: 9 }], null);
    expect(cursor.closed).toBe(false);
  });

  it('on another figure lets the first one’s cursor go', async () => {
    const first = scriptedSolutionCursor([{ outcome: 'end', position: solutionPosition(1, 3), counted: true }]);
    gateway.open.mockReturnValueOnce(first);
    const one = beginFoldedSolutionStep(FIGURE_HELD, null);
    await one.step(ask);
    one.end([FIGURE_HELD], null);
    expect(foldedSolutionPlace(FIGURE_HELD)).not.toBeNull();

    beginFoldedSolutionStep({ ...FIGURE_HELD, id: 'other' }, null);
    expect(first.closed).toBe(true);
  });
});

describe('the store’s subscription', () => {
  async function seated(document: OristudioCpDocumentSnapshot | null = null, figure = FIGURE_HELD) {
    const cursor = scriptedSolutionCursor([{ outcome: 'end', position: solutionPosition(1, 3), counted: true }]);
    gateway.open.mockReturnValueOnce(cursor);
    const turn = beginFoldedSolutionStep(figure, document);
    await turn.step(ask);
    turn.end([figure], document);
    return cursor;
  }

  it('lets the cursor go when its figure holds another fold or record, or has gone', async () => {
    for (const figures of [
      [{ ...FIGURE_HELD, handle: 4 }],
      [{ ...FIGURE_HELD, layerOrder: { ...held, json: '{}' } }],
      [{ ...FIGURE_HELD, layerOrder: undefined }],
      [],
    ] as OristudioCpFoldedFigureEntry[][]) {
      const cursor = await seated();
      settleFoldedSolutionCursor(figures, null);
      expect(cursor.closed).toBe(true);
    }
  });

  it('lets it go when the handles are torn down with a document', async () => {
    const cursor = await seated();
    await resetFoldedFigureHandles();
    settleFoldedSolutionCursor([FIGURE_HELD], null);
    expect(cursor.closed).toBe(true);
  });

  it('lets a figure with no source region go on any edit, since any may be to its creases', async () => {
    const before = createStarterOristudioCpDocument();
    const cursor = await seated(before, { ...FIGURE_HELD, sourceBounds: null });
    settleFoldedSolutionCursor([{ ...FIGURE_HELD, sourceBounds: null }], before);
    expect(cursor.closed).toBe(false);
    settleFoldedSolutionCursor([{ ...FIGURE_HELD, sourceBounds: null }], { ...before });
    expect(cursor.closed).toBe(true);
  });

  it('tells its subscribers whenever what it reads may have changed', async () => {
    const heard = vi.fn();
    const stop = subscribeFoldedSolutionCursor(heard);
    const before = foldedSolutionCursorVersion();
    await seated();
    expect(heard).toHaveBeenCalled();
    heard.mockClear();
    dropFoldedSolutionCursor();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(foldedSolutionCursorVersion()).toBeGreaterThan(before);
    stop();
  });
});

describe('what a figure steps by', () => {
  it('is every layer order in X-ray (D5), else the pictures of the side it shows', () => {
    expect(foldedFigureStepBy({ ...FIGURE_HELD, displayStyle: 'Transparent3' })).toBe('layer_order');
    expect(foldedFigureStepBy(FIGURE_HELD)).toEqual({ picture: 'front' });
    const back = { ...FIGURE_HELD, snapshot: { ...FIGURE_HELD.snapshot!, model: { state: 'Back1' } } };
    expect(foldedFigureStepBy(back as OristudioCpFoldedFigureEntry)).toEqual({ picture: 'back' });
  });
});
