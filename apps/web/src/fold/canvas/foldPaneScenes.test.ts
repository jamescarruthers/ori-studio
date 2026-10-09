import { describe, expect, it } from 'vitest';
import type { PaperLineItem } from '../../lib/paper/paperScene';
import { bookScene, flatSquareScene } from './foldCanvas.fixtures';
import { FOLD_USER_PER_UNIT } from './foldCanvasGeometry';
import {
  creasePatternPaneScene,
  creaseRole,
  FOLD_PANE_DISPLAY_DEFAULT,
  foldedDisplayOffset,
  foldedPaneScene,
  withFoldLine,
} from './foldPaneScenes';

const SQUARE: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const lines = (items: readonly { kind: string }[]) => items.filter((item): item is PaperLineItem => item.kind === 'line');

describe('the Fold panes’ paper scenes', () => {
  it('draws each crease in the pen of what it is, the step’s own as its instruction', () => {
    const [, , , , , , fold] = bookScene().creases;
    if (!fold) throw new Error('no fold');
    const display = FOLD_PANE_DISPLAY_DEFAULT;
    expect(creaseRole(fold, { display, step: 1, instruction: null })).toBe('diagram-valley');
    expect(creaseRole(fold, { display, step: 2, instruction: null })).toBe('valley');
    expect(creaseRole(fold, { display: { ...display, stepCreases: false }, step: 1, instruction: null })).toBe('valley');
    // A previewed fold's added creases are the instruction, in place of the step's own.
    expect(creaseRole(fold, { display, step: 1, instruction: new Set([9]) })).toBe('valley');
    const flat = { ...fold, kind: 'flat' as const, made_at: 0 };
    expect(creaseRole(flat, { display, step: 1, instruction: null })).toBe('aux');
    expect(creaseRole(flat, { display: { ...display, precreases: false }, step: 1, instruction: null })).toBeNull();
  });

  it('lays the crease pattern front up, the folds under the border, in user space', () => {
    const scene = creasePatternPaneScene(bookScene(), {
      display: FOLD_PANE_DISPLAY_DEFAULT,
      sheet: SQUARE,
      step: 1,
    });
    expect(scene.items[0]).toMatchObject({ kind: 'face', side: 'front' });
    const roles = lines(scene.items).map((item) => item.role);
    expect(roles.indexOf('diagram-valley')).toBeLessThan(roles.indexOf('edge'));
    expect(roles.filter((role) => role === 'edge')).toHaveLength(6);
    // y down in user space: the sheet's top edge is at −1 unit.
    const { minX, minY, maxX, maxY } = scene.bounds;
    expect([minX, minY, maxX, maxY].map((v) => v + 0)).toEqual([0, -FOLD_USER_PER_UNIT, FOLD_USER_PER_UNIT, 0]);
  });

  it('paints the folded form whole faces in painter’s order, a fold line over it in its pen', () => {
    const base = foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT);
    const faces = base.items.filter((item) => item.kind === 'face');
    // Bottom first: the left half, then the right half over it.
    expect(faces.map((face) => face.kind === 'face' && face.face)).toEqual([0, 1]);
    const lined = withFoldLine(base, [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }], 'mountain', { x: 0.25, y: 0 });
    const [added] = lines(lined.items).slice(-1);
    expect(added?.role).toBe('diagram-mountain');
    // Run past the paper at both ends, and shown at the pane's offset.
    expect(added?.a[0]).toBeLessThan(0.25 * FOLD_USER_PER_UNIT);
    expect(added?.b[0]).toBeGreaterThan(0.75 * FOLD_USER_PER_UNIT);
  });

  it('turns a turned-over model about the sheet’s middle, never off the camera', () => {
    const turned = { ...flatSquareScene(), view: { flipped: true, rotation: 0 }, view_transform: [-1, 0, 0, 0, 1, 0] as const };
    // The engine's view takes x to −x; shown at an offset of 1, the sheet stays where it was.
    expect(foldedDisplayOffset(turned, SQUARE)).toEqual({ x: 1, y: 0 });
    expect(foldedDisplayOffset(flatSquareScene(), SQUARE)).toEqual({ x: 0, y: 0 });
    const quarter = { ...flatSquareScene(), view_transform: [0, -1, 0, 1, 0, 0] as const };
    const offset = foldedDisplayOffset(quarter, SQUARE);
    // (0.5, 0.5) turns to (−0.5, 0.5): shifted back by one along x.
    expect(offset.x).toBeCloseTo(1, 12);
    expect(offset.y).toBeCloseTo(0, 12);
  });
});
