import { describe, expect, it } from 'vitest';
import type { FoldPick } from '../canvas/foldPicking';
import { clampDivideParts, createFoldTools, hasToolInput, isLocated } from './foldToolState';

const point = (x: number, y: number): FoldPick => ({
  kind: 'point',
  provenance: 'vertex',
  sheet: [x, y],
  mark: null,
  scene: { x, y },
});

const flapA = { faces: [1], witness: [0.2, 0.2] as [number, number] };
const flapB = { faces: [2], witness: [0.8, 0.2] as [number, number] };

describe('the Fold tools’ state', () => {
  it('locates once every click is in, and takes no click past the last', () => {
    const tools = createFoldTools();
    expect(tools.pick(point(1, 0))).toBe(true);
    expect(isLocated(tools.store.getState())).toBe(false);
    expect(tools.pick(point(0, 1))).toBe(true);
    expect(isLocated(tools.store.getState())).toBe(true);
    expect(tools.pick(point(0, 0))).toBe(false);
    expect(tools.store.getState().picks).toHaveLength(2);
  });

  it('keeps the line through V, M and P, and locates anew for another line mode or the Divide line', () => {
    const tools = createFoldTools();
    tools.pick(point(1, 0));
    tools.pick(point(0, 1));
    tools.selectTool('mountain');
    expect(tools.store.getState()).toMatchObject({ tool: 'mountain', picks: [point(1, 0), point(0, 1)] });
    tools.selectLineMode('free');
    expect(tools.store.getState()).toMatchObject({ lineMode: 'free', picks: [] });
    tools.selectTool('divide-line');
    tools.selectLineMode('axiom-3');
    // A line mode belongs to the folds: it takes one in hand.
    expect(tools.store.getState().tool).toBe('valley');
  });

  it('lets go of the clicks and every choice on a clear, and says whether there was any', () => {
    const tools = createFoldTools();
    expect(hasToolInput(tools.store.getState())).toBe(false);
    tools.pick(point(1, 0));
    tools.swapSide();
    tools.stepRoot(1, 2);
    expect(hasToolInput(tools.store.getState())).toBe(true);
    tools.clear();
    expect(tools.store.getState()).toMatchObject({ picks: [], swapped: false, root: 0, seed: { scope: 'all' } });
  });

  it('picks flaps one by one, every flap picked being every layer again', () => {
    const tools = createFoldTools();
    tools.toggleFlap(flapA, [flapA, flapB]);
    expect(tools.store.getState().seed).toEqual({ scope: 'flaps', flaps: [flapB] });
    tools.toggleFlap(flapA, [flapA, flapB]);
    expect(tools.store.getState().seed).toEqual({ scope: 'all' });
  });

  it('steps through the roots round, and keeps the Divide line’s parts within the Diagram’s', () => {
    const tools = createFoldTools();
    tools.stepRoot(-1, 3);
    expect(tools.store.getState().root).toBe(2);
    tools.stepRoot(1, 3);
    expect(tools.store.getState().root).toBe(0);
    tools.setDivide({ parts: 99 });
    expect(tools.store.getState().divide.parts).toBe(32);
    expect(clampDivideParts(1)).toBe(2);
    expect(clampDivideParts(Number.NaN)).toBe(2);
  });
});
