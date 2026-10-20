import { describe, expect, it } from 'vitest';
import { bookScene, flatSquareScene } from '../canvas/foldCanvas.fixtures';
import { landedPreviewOf } from '../canvas/useFoldToolPreview';
import type { FoldIsometry, FoldStateSummary } from '../engine/foldEngineWire';
import { repeatDrawnOverlay, repeatPreviewCreases } from './repeatCanvas';

const summary = (step: number) => ({ step }) as unknown as FoldStateSummary;
/** x ↦ 1 − x: the paper there shown back up. */
const TURNED: FoldIsometry = [-1, 0, 1, 0, 1, 0];
const INKS = { accent: [0, 0, 1, 1] } as unknown as Parameters<typeof repeatDrawnOverlay>[3];

describe("Repeat's preview on the canvas", () => {
  it('adds the creases made after the step it is folded from, when the engine keeps no summary of it', () => {
    // The book's fold was made at step 1: after the sheet, and not after step 1.
    expect([...landedPreviewOf(summary(1), bookScene(), null, 0).added]).toEqual([6]);
    expect([...landedPreviewOf(summary(1), bookScene(), null, 1).added]).toEqual([]);
    // Without the step it is folded from, the ones made at its own number.
    expect([...landedPreviewOf(summary(1), bookScene(), null).added]).toEqual([6]);
  });

  it('draws each crease it adds where the result puts it, lettered as the step before shows the paper', () => {
    const added = new Set([6]);
    const front = repeatPreviewCreases(bookScene(), added, flatSquareScene());
    expect(front.folded).toEqual([{ line: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }], letter: 'valley' }]);
    // The crease pattern draws them as every preview's instruction already.
    expect(front.creasePattern).toEqual([]);
    // The paper there back up before the repeat: the other letter, as a pending fold's line is drawn on it.
    const turned = { ...flatSquareScene(), face_transforms: [TURNED] };
    expect(repeatPreviewCreases(bookScene(), added, turned).folded[0]?.letter).toBe('mountain');
    // The step before not in: as the result shows it.
    expect(repeatPreviewCreases(bookScene(), added, null).folded[0]?.letter).toBe('valley');
    // A crease it did not add is not drawn.
    expect(repeatPreviewCreases(bookScene(), new Set(), flatSquareScene()).folded).toEqual([]);
  });

  it('draws a refused line across the sheet it was drawn on, and none on a pane it was not', () => {
    const sheet: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const drawn = repeatDrawnOverlay(null, sheet, { line: { n: [1, 0], d: 0.25 }, frame: 'sheet' }, INKS);
    expect(drawn.folded.strokes).toEqual([]);
    expect(drawn.creasePattern.strokes).toHaveLength(1);
    const [stroke] = drawn.creasePattern.strokes;
    expect([stroke!.a.x, stroke!.b.x]).toEqual([0.25, 0.25]);
    expect([stroke!.a.y, stroke!.b.y].sort()).toEqual([0, 1]);
    // Drawn on the folded pane with nothing indexed there: nothing to draw it across.
    expect(repeatDrawnOverlay(null, sheet, { line: { n: [1, 0], d: 0.25 }, frame: 'model' }, INKS).folded.strokes).toEqual([]);
  });
});
