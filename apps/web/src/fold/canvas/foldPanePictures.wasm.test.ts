import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PaperScene } from '../../lib/paper/paperScene';
import { foldStepFrameAt, foldStepMotion } from '../animation/foldStepMotion';
import type { FoldOp } from '../document/foldSequenceDocument';
import { createFoldEngineCalls } from '../engine/foldEngineCalls';
import type { FoldEngineOutcome } from '../engine/foldEngineWire';
import { FOLD_PANE_DISPLAY_DEFAULT, foldedDisplayOffset, foldedPanePictures, foldedPaneScene } from './foldPaneScenes';

/**
 * A step played on the folded pane starts from the pane's own picture of its
 * parent and ends on its picture of the step, whatever the step does to
 * where the pane puts the paper. A turn changes the view, and the pane shows
 * each view at its own display offset (`foldedDisplayOffset`), so the two
 * ends are placed apart: built from the real engine's states, in-process.
 * Skipped when the bridge has not been built.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');
const available = existsSync(WASM);

const SHEET: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const BOOK: FoldOp = {
  kind: 'valley',
  line: { via: 'free', through: [[0.5, 0], [0.5, 1]] },
  moving: [0.75, 0.5],
  seed: { scope: 'all' },
};

function landed<T>(outcome: FoldEngineOutcome<T>): T {
  if (outcome.status !== 'ok') throw new Error(`refused: ${JSON.stringify(outcome.refusal)}`);
  return outcome;
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Where a picture's faces lie. */
function faceBounds(scene: PaperScene): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const item of scene.items) {
    if (item.kind !== 'face' || item.hidden) continue;
    for (const [x, y] of item.rings.flat()) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** How far apart two boxes are: the largest move of any side. */
const apart = (a: Box, b: Box) =>
  Math.max(Math.abs(a.minX - b.minX), Math.abs(a.maxX - b.maxX), Math.abs(a.minY - b.minY), Math.abs(a.maxY - b.maxY));

describe.skipIf(!available)('a turn played on the folded pane', () => {
  it.each([
    ['turned over', { kind: 'turn', axis: 'vertical' } as FoldOp],
    ['turned a quarter round', { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } } as FoldOp],
  ])('starts on the pane’s picture of the parent when %s, and leaves it without a jump', async (_name, turn) => {
    const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
    const calls = createFoldEngineCalls(new wasm.FoldEngine());
    const sheet = landed(calls.sheet({ shape: { kind: 'square' }, startSide: 'front' })).state;
    const parent = landed(calls.step(sheet, BOOK)).state;
    const child = landed(calls.step(parent, turn)).state;
    const before = calls.scene(parent);
    const after = calls.scene(child);
    // The turn moves where the pane puts the paper.
    expect(foldedDisplayOffset(after, SHEET)).not.toEqual(foldedDisplayOffset(before, SHEET));

    // What the pane shows at rest on each step.
    const parentAtRest = faceBounds(foldedPaneScene(before, FOLD_PANE_DISPLAY_DEFAULT, foldedDisplayOffset(before, SHEET)));
    const childAtRest = faceBounds(foldedPaneScene(after, FOLD_PANE_DISPLAY_DEFAULT, foldedDisplayOffset(after, SHEET)));
    const motion = foldStepMotion({ op: turn, before, after, action: null, report: null }, foldedPanePictures(SHEET));
    expect(motion.motion.kind).toBe('turn');

    expect(faceBounds(foldStepFrameAt(motion, 0).scene)).toEqual(parentAtRest);
    expect(faceBounds(foldStepFrameAt(motion, 1).scene)).toEqual(childAtRest);
    // No jump on the way: from the parent's picture at rest, each frame a
    // fiftieth on lies close to the one before (the form is hundreds of px
    // across; the old placement put the first frame a whole sheet away).
    const width = parentAtRest.maxX - parentAtRest.minX;
    let previous = parentAtRest;
    for (let k = 0; k <= 50; k += 1) {
      const frame = faceBounds(foldStepFrameAt(motion, k / 50).scene);
      expect(apart(frame, previous), `at ${k / 50}`).toBeLessThan(0.25 * width);
      previous = frame;
    }
  });
});
