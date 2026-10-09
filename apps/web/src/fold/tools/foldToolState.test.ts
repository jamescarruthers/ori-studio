import { describe, expect, it } from 'vitest';
import { flatSquareLandmarks, flatSquareScene } from '../canvas/foldCanvas.fixtures';
import { foldPickIndex, type FoldPick } from '../canvas/foldPicking';
import { foldStepInputKey } from '../session/foldSessionEngine';
import { buildFoldStep } from './foldStepBuilder';
import {
  clampDivideParts,
  createFoldTools,
  FOLD_TOOL_INITIAL,
  hasToolInput,
  isLocated,
  type FoldToolState,
} from './foldToolState';

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

  it('swaps the side only once the line is located, and folds the new side whole', () => {
    const tools = createFoldTools();
    tools.pick(point(1, 0));
    // No line yet, no side: nothing is latched for the line to come.
    expect(tools.swapSide()).toBe(false);
    expect(tools.store.getState().swapped).toBe(false);
    tools.pick(point(0, 1));
    tools.toggleFlap(flapA, [flapA, flapB]);
    expect(tools.swapSide()).toBe(true);
    // The flap picked was the other side's.
    expect(tools.store.getState()).toMatchObject({ swapped: true, seed: { scope: 'all' } });
  });

  it('folds the other side on a swap under a flap seed', () => {
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const free = (x: number, y: number): FoldPick => ({ kind: 'free', scene: { x, y } });
    const tools = createFoldTools({ ...FOLD_TOOL_INITIAL, lineMode: 'free' });
    tools.pick(free(0, 0.5));
    tools.pick(free(1, 0.5));
    tools.setSeed({ scope: 'flaps', flaps: [{ faces: [0], witness: [0.5, 0.25] }] });
    const stepOf = (state: FoldToolState) => {
      const built = buildFoldStep(
        {
          kind: 'valley',
          lineMode: state.lineMode,
          picks: state.picks,
          candidate: null,
          swapped: state.swapped,
          seed: state.seed,
          precreaseDirection: state.precreaseDirection,
        },
        index
      );
      if (built.status !== 'built') throw new Error(built.status);
      return built;
    };
    const before = stepOf(tools.store.getState());
    tools.swapSide();
    const after = stepOf(tools.store.getState());
    expect(foldStepInputKey({ op: after.op })).not.toBe(foldStepInputKey({ op: before.op }));
    expect(after.movingSign).toBe(-before.movingSign);
    // The new side folds whole, by a point of it.
    expect(after.op).toMatchObject({ seed: { scope: 'all' } });
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
