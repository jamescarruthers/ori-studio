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
  foldFrameSpread,
  withFoldLine,
} from './foldPaneScenes';
import { restingSpread } from './useFoldCanvasPaint';

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

  it('spreads the folded form’s layers as the step says: the leaf under the book steps out, the top one stays', () => {
    const rings = (scene: ReturnType<typeof foldedPaneScene>) =>
      new Map(scene.items.flatMap((item) => (item.kind === 'face' ? [[item.face, item]] : [])));
    const flat = rings(foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT));
    const depth = rings(
      foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT, undefined, { kind: 'depth', amount: 0.1, toward: 'down' })
    );
    // Unspread, the leaf underneath is never seen; spread, it peeks out, so it is drawn.
    expect(flat.get(0)?.hidden).toBe(true);
    expect(depth.get(0)?.hidden).toBe(false);
    // The top leaf's free corner stays; the leaf under it steps down the screen
    // by a tenth of the model's longer side, in user space (the fold, shared,
    // goes half as far, so it stays joined).
    const corner = (faces: typeof flat, face: number, at: number) => faces.get(face)!.rings[0]![at]!;
    expect(corner(depth, 1, 1)[0]).toBeCloseTo(corner(flat, 1, 1)[0], 9);
    expect(corner(depth, 1, 1)[1]).toBeCloseTo(corner(flat, 1, 1)[1], 9);
    expect(corner(depth, 0, 0)[1] - corner(flat, 0, 0)[1]).toBeCloseTo(0.1 * FOLD_USER_PER_UNIT, 9);
    expect(corner(depth, 0, 0)[0]).toBeCloseTo(corner(flat, 0, 0)[0], 9);
    expect(corner(depth, 0, 1)[1] - corner(flat, 0, 1)[1]).toBeCloseTo(0.05 * FOLD_USER_PER_UNIT, 9);

    const affine = rings(
      foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT, undefined, {
        kind: 'affine',
        amount: 0.1,
        keep: 'top',
        skew: 0,
        axisDeg: 0,
      })
    );
    expect(affine.get(1)?.rings).toEqual(flat.get(1)?.rings);
    expect(affine.get(0)?.rings).not.toEqual(flat.get(0)?.rings);
    // Off is no spread at all: the pane's own picture.
    expect(foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT, undefined, null)).toEqual(
      foldedPaneScene(bookScene(), FOLD_PANE_DISPLAY_DEFAULT)
    );
  });

  it('spreads the pane at rest, and lays the paper flat once the tools locate a fold on it', () => {
    const spread = { kind: 'depth' as const, amount: 0.05, toward: 'down' as const };
    expect(restingSpread(spread, { action: null, analysis: null })).toBe(spread);
    const analysis = {} as NonNullable<Parameters<typeof restingSpread>[1]['analysis']>;
    const action = {} as NonNullable<Parameters<typeof restingSpread>[1]['action']>;
    expect(restingSpread(spread, { action: null, analysis })).toBeNull();
    expect(restingSpread(spread, { action, analysis: null })).toBeNull();
    expect(restingSpread(null, { action: null, analysis: null })).toBeNull();
  });

  it('names an affine spread’s axis in the engine’s y-up frame, the Diagram’s y-down axis mirrored', () => {
    expect(foldFrameSpread({ kind: 'affine', amount: 0.03, keep: 'top', skew: 1, axisDeg: 81 })).toMatchObject({ axisDeg: 99 });
    expect(foldFrameSpread({ kind: 'affine', amount: 0.03, keep: 'top', skew: 1, axisDeg: 0 })).toMatchObject({ axisDeg: 0 });
    const depth = { kind: 'depth' as const, amount: 0.03, toward: 'up-left' as const };
    expect(foldFrameSpread(depth)).toBe(depth);
    expect(foldFrameSpread(null)).toBeNull();
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
