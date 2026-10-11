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
    const free = (x: number, y: number): FoldPick => ({ kind: 'free', pane: 'folded', scene: { x, y }, sheet: [x, y] });
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

  it('never leaves a seed of no flaps: unpicking the only one picked is every layer again', () => {
    const tools = createFoldTools();
    tools.toggleFlap(flapA, [flapA, flapB]);
    expect(tools.store.getState().seed).toEqual({ scope: 'flaps', flaps: [flapB] });
    // The last chip pressed, unpressed: the engine would refuse a seed of none
    // (`no_side`) and the window would have no chips left to pick one again.
    tools.toggleFlap(flapB, [flapA, flapB]);
    expect(tools.store.getState().seed).toEqual({ scope: 'all' });
    // A section of one flap: its chip cannot be unpressed into nothing either.
    tools.toggleFlap(flapA, [flapA]);
    expect(tools.store.getState().seed).toEqual({ scope: 'all' });
    tools.setSeed({ scope: 'flaps', flaps: [] });
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

  it('locates a crimp’s two lines one after the other, keeping the first through a change of the second’s mode', () => {
    const tools = createFoldTools();
    tools.selectLineMode('axiom-1');
    tools.selectTool('crimp');
    tools.pick(point(1, 0));
    tools.pick(point(0, 1));
    // The first line is in; the second, a free line by default, is not.
    expect(isLocated(tools.store.getState())).toBe(false);
    tools.pick(point(0.2, 0.2));
    tools.setSecondLineMode('crease');
    // The second line is located anew in its mode: one click, the first line's kept.
    expect(tools.store.getState()).toMatchObject({ secondLineMode: 'crease' });
    expect(tools.store.getState().picks).toHaveLength(2);
    tools.pick(point(0.5, 0.5));
    expect(isLocated(tools.store.getState())).toBe(true);
    expect(tools.pick(point(0.6, 0.6))).toBe(false);
    // Another tool along a line keeps the first line, never the second's clicks.
    tools.selectTool('valley');
    expect(tools.store.getState().picks).toHaveLength(2);
    expect(isLocated(tools.store.getState())).toBe(true);
    // The second line's mode stays chosen, as the line mode does.
    tools.clear();
    expect(tools.store.getState().secondLineMode).toBe('crease');
  });

  it('keeps a tuck’s direction from fold to fold, and takes its target anew for another direction', () => {
    const tools = createFoldTools();
    tools.selectTool('tuck');
    tools.setTuckDirection('mountain');
    tools.setTuckTarget(7);
    tools.stepOrder(1, 2);
    // Another target is another tuck: its orders are its own.
    tools.setTuckTarget(5);
    expect(tools.store.getState().compound).toMatchObject({ tuckTarget: 5, order: 0 });
    tools.stepOrder(1, 2);
    tools.setTuckDirection('valley');
    expect(tools.store.getState()).toMatchObject({ tuckDirection: 'valley', compound: { tuckTarget: null, order: 0 } });
    tools.setTuckDirection('mountain');
    tools.pick(point(0.1, 0.1));
    tools.setTuckTarget(3);
    tools.clear();
    // A clear lets the target go; the direction stays chosen, as a precrease's does.
    expect(tools.store.getState()).toMatchObject({ tuckDirection: 'mountain', compound: { tuckTarget: null } });
  });
});

describe('the vertex folds’ tool state', () => {
  const free = (x: number, y: number): FoldPick => ({ kind: 'free', pane: 'folded', scene: { x, y }, sheet: [x, y] });

  it('takes each tool’s own clicks, and swaps no moving side', () => {
    const tools = createFoldTools();
    tools.selectTool('squash');
    expect(tools.pick(free(0.2, 0.2))).toBe(true);
    expect(isLocated(tools.store.getState())).toBe(true);
    expect(tools.pick(free(0.3, 0.3))).toBe(false);
    expect(tools.swapSide()).toBe(false);
    tools.selectTool('swivel');
    expect(tools.store.getState().picks).toEqual([]);
    for (let k = 0; k < 4; k += 1) tools.pick(point(0.1 * k, 0.5));
    expect(isLocated(tools.store.getState())).toBe(false);
    tools.pick(free(0.5, 0.9));
    expect(isLocated(tools.store.getState())).toBe(true);
  });

  it('starts a petal fold on the existing crease, keeps a line mode H is meant for, and keeps the petal through a line mode', () => {
    const tools = createFoldTools();
    expect(tools.store.getState().lineMode).toBe('axiom-2');
    tools.selectTool('petal');
    expect(tools.store.getState().lineMode).toBe('crease');
    tools.selectLineMode('axiom-1');
    expect(tools.store.getState()).toMatchObject({ tool: 'petal', lineMode: 'axiom-1' });
    tools.selectTool('squash');
    tools.selectTool('petal');
    expect(tools.store.getState().lineMode).toBe('axiom-1');
    // H's two ends, then the flap.
    tools.pick(point(0.2, 0.5));
    tools.pick(point(0.8, 0.5));
    expect(isLocated(tools.store.getState())).toBe(false);
    tools.pick(free(0.5, 0.2));
    expect(isLocated(tools.store.getState())).toBe(true);
  });

  it('lists the choices after one made anew, and keeps the direction from fold to fold', () => {
    const tools = createFoldTools();
    tools.selectTool('rabbit-ear');
    tools.setEmergent(2);
    tools.setRidge(1);
    tools.stepOrder(1, 3);
    expect(tools.store.getState().compound).toMatchObject({ emergent: 2, ridge: 1, order: 1 });
    // Another fourth ray: its ridges and orders are listed anew.
    tools.stepEmergent(1, 3, 2);
    expect(tools.store.getState().compound).toMatchObject({ emergent: 0, ridge: null, order: 0 });
    tools.setRidge(1);
    tools.setFanLayers(2);
    expect(tools.store.getState().compound).toMatchObject({ fanLayers: 2, ridge: null, order: 0 });
    tools.setVertexDirection('mountain');
    tools.setSquashTarget([0, 1]);
    expect(tools.store.getState().compound.squashTarget).toEqual([0, 1]);
    // Let go of the clicks: the choices go, the direction stays.
    tools.pick(point(0, 0));
    tools.clear();
    expect(tools.store.getState()).toMatchObject({
      vertexDirection: 'mountain',
      compound: { squashTarget: null, emergent: null, ridge: null, fanLayers: null, order: 0 },
    });
    expect(FOLD_TOOL_INITIAL.vertexDirection).toBe('valley');
  });
});
