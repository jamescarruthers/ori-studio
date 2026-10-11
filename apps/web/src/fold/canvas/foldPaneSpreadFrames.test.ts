import { describe, expect, it, vi } from 'vitest';
import type { LayerSpreadOptions } from '../../cp-workspace/folded/foldedLayerSpread';
import type { FoldPlaybackPosition, FoldPosedSceneSource } from '../animation/foldStepPlayback';
import type { FoldPosedFrame } from '../animation/foldStepPoses';
import type { PaperScene } from '../../lib/paper/paperScene';
import { bookScene } from './foldCanvas.fixtures';
import { FOLD_PANE_DISPLAY_DEFAULT, foldedDisplayOffset, foldedPaneScene } from './foldPaneScenes';
import {
  foldSpreadEnd,
  NO_SPREAD_ENDS,
  spreadPaneFrame,
  spreadPaneFrames,
  type FoldStepSpreadEnds,
} from './foldPaneSpreadFrames';

const SQUARE: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const DEPTH: LayerSpreadOptions = { kind: 'depth', amount: 0.1, toward: 'down' };

const scene = (name: string): PaperScene => ({
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  sheet: name.length,
  items: [],
});
const POSED = scene('posed');
const PARENT = scene('parent');
const STEP = scene('step');

/** Both states spread, each end telling what it was asked. */
function ends() {
  const both = { before: vi.fn((_weight: number) => PARENT), after: vi.fn((_weight: number) => STEP) };
  return both satisfies FoldStepSpreadEnds;
}

describe('the folded pane’s spread over a playing step', () => {
  it('pictures a state at rest with its spread part of the way on, as the pane places it', () => {
    const book = bookScene();
    const end = foldSpreadEnd(book, SQUARE, FOLD_PANE_DISPLAY_DEFAULT, DEPTH);
    if (!end) throw new Error('no end');
    const offset = foldedDisplayOffset(book, SQUARE);
    // All of it on is the pane's own spread picture; none, its unspread one.
    expect(end(1)).toEqual(foldedPaneScene(book, FOLD_PANE_DISPLAY_DEFAULT, offset, DEPTH));
    expect(end(0)).toEqual(foldedPaneScene(book, FOLD_PANE_DISPLAY_DEFAULT, offset, null));
    expect(end(0.5)).toEqual(foldedPaneScene(book, FOLD_PANE_DISPLAY_DEFAULT, offset, { ...DEPTH, amount: 0.05 }));
    // A state shown unspread has no end to ease: its frames stay as they are.
    expect(foldSpreadEnd(book, SQUARE, FOLD_PANE_DISPLAY_DEFAULT, null)).toBeNull();
  });

  it('draws a frame with weight as the state it is at — the parent’s before halfway, the step’s after', () => {
    const both = ends();
    const frame: FoldPosedFrame = { scene: POSED, spreadWeight: 0.25 };
    expect(spreadPaneFrame(frame, 0.02, both)).toEqual({ scene: PARENT, spreadWeight: 0.25 });
    expect(both.before).toHaveBeenCalledWith(0.25);
    expect(spreadPaneFrame(frame, 0.97, both)).toEqual({ scene: STEP, spreadWeight: 0.25 });
    expect(both.after).toHaveBeenCalledWith(0.25);
  });

  it('leaves the paper as it is posed while it moves, and over a state shown unspread', () => {
    const both = ends();
    const moving: FoldPosedFrame = { scene: POSED, spreadWeight: 0 };
    expect(spreadPaneFrame(moving, 0.5, both)).toBe(moving);
    const unweighted: FoldPosedFrame = { scene: POSED };
    expect(spreadPaneFrame(unweighted, 0.01, both)).toBe(unweighted);
    expect(both.before).not.toHaveBeenCalled();
    const landing: FoldPosedFrame = { scene: POSED, spreadWeight: 0.8 };
    expect(spreadPaneFrame(landing, 0.99, { ...both, after: null })).toBe(landing);
  });

  it('spreads each pushed frame once, however often the pane reads it, and is the same source with nothing spread', () => {
    let pushed: FoldPosedFrame | null = null;
    const frames: FoldPosedSceneSource = { current: () => pushed, subscribe: () => () => {} };
    const position: FoldPlaybackPosition = { current: () => 0.01, subscribe: () => () => {} };
    expect(spreadPaneFrames(frames, position, NO_SPREAD_ENDS)).toBe(frames);

    const both = ends();
    const spread = spreadPaneFrames(frames, position, both);
    expect(spread.subscribe).toBe(frames.subscribe);
    // At rest the pane paints its own scene.
    expect(spread.current()).toBeNull();
    pushed = { scene: POSED, spreadWeight: 1 };
    const first = spread.current();
    expect(first?.scene).toBe(PARENT);
    expect(spread.current()).toBe(first);
    expect(both.before).toHaveBeenCalledTimes(1);
    pushed = { scene: POSED, spreadWeight: 0.5 };
    expect(spread.current()?.scene).toBe(PARENT);
    expect(both.before).toHaveBeenCalledTimes(2);
    pushed = null;
    expect(spread.current()).toBeNull();
  });
});
