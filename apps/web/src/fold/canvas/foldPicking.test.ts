import { describe, expect, it } from 'vitest';
import { bookScene, flatSquareLandmarks, flatSquareScene } from './foldCanvas.fixtures';
import {
  foldPickIndex,
  foldStackAt,
  pickRef,
  resolveFoldPick,
  sameFoldHit,
  sheetToScene,
  topSheetPointAt,
} from './foldPicking';

const RADII = { point: 0.03, line: 0.03 };
const point = { snap: 'point', edges: true, free: false } as const;
const line = { snap: 'crease-required', edges: true, free: false } as const;

describe('Fold picking', () => {
  it('snaps a point step to the landmark nearest, named by its sheet point', () => {
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const corner = resolveFoldPick(index, 'folded', { x: 0.99, y: 0.01 }, RADII, point);
    expect(corner).toMatchObject({ kind: 'point', provenance: 'vertex', sheet: [1, 0] });
    if (corner?.kind !== 'point') throw new Error('no point');
    expect(pickRef(corner)).toEqual({ kind: 'point', at: [1, 0] });
    // An edge's middle is a landmark too.
    expect(resolveFoldPick(index, 'folded', { x: 0.5, y: 0.01 }, RADII, point)).toMatchObject({
      provenance: 'midpoint',
      sheet: [0.5, 0],
    });
    // Nothing near: nothing taken.
    expect(resolveFoldPick(index, 'folded', { x: 0.4, y: 0.4 }, RADII, point)).toBeNull();
  });

  it('puts a free point (Alt) down where it is, on the top face, and nowhere off the paper', () => {
    const index = foldPickIndex(bookScene(), null, []);
    const free = { ...point, free: true };
    // On the book the right half lies on top, mirrored: x = 0.2 is its sheet x = 0.8.
    const pick = resolveFoldPick(index, 'folded', { x: 0.2, y: 0.4 }, RADII, free);
    expect(pick).toMatchObject({ kind: 'point', provenance: 'free' });
    if (pick?.kind !== 'point') throw new Error('no point');
    expect(pick.sheet[0]).toBeCloseTo(0.8, 12);
    expect(pick.sheet[1]).toBeCloseTo(0.4, 12);
    expect(resolveFoldPick(index, 'folded', { x: 0.8, y: 0.4 }, RADII, free)).toBeNull();
  });

  it('takes the topmost face and the stack from the subfaces', () => {
    const index = foldPickIndex(bookScene(), null, []);
    expect(foldStackAt(index, { x: 0.25, y: 0.5 })).toEqual([1, 0]);
    expect(foldStackAt(index, { x: 0.75, y: 0.5 })).toEqual([]);
    expect(topSheetPointAt(index, { x: 0.25, y: 0.5 })?.[0]).toBeCloseTo(0.75, 12);
  });

  it('picks a crease on the crease pattern by Fold’s edge id, and a fold only where the step wants one', () => {
    const index = foldPickIndex(bookScene(), null, []);
    const bend = resolveFoldPick(index, 'crease-pattern', { x: 0.51, y: 0.5 }, RADII, line);
    expect(bend).toMatchObject({ kind: 'segment', edge: 6, segment: 'bend', sheet: [[0.5, 0], [0.5, 1]] });
    if (bend?.kind !== 'segment') throw new Error('no segment');
    // Where the crease is on the folded pane: the bend is the form's right edge.
    expect(bend.scene[0].x).toBeCloseTo(0.5, 12);
    expect(pickRef(bend)).toEqual({ kind: 'edge', a: [0.5, 0], b: [0.5, 1] });
    // The paper's raw edge counts for an axiom, not for an existing crease.
    const edge = { x: 0.99, y: 0.5 };
    expect(resolveFoldPick(index, 'crease-pattern', edge, RADII, line)).toMatchObject({ segment: 'raw_edge' });
    expect(resolveFoldPick(index, 'crease-pattern', edge, RADII, { ...line, edges: false })).toBeNull();
  });

  it('maps a sheet point to the scene through a face that holds it', () => {
    const scene = bookScene();
    const folded = sheetToScene(scene, [0.8, 0.3]);
    expect(folded?.x).toBeCloseTo(0.2, 12);
    expect(folded?.y).toBeCloseTo(0.3, 12);
    expect(sheetToScene(scene, [0.2, 0.3])).toEqual({ x: 0.2, y: 0.3 });
    expect(sheetToScene(scene, [1.5, 0.3])).toBeNull();
  });

  it('takes a Divide-line mark as a point of the crease pattern, its id riding along', () => {
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), [{ at: [1 / 3, 0], mark: 'fmark-1' }]);
    const mark = resolveFoldPick(index, 'crease-pattern', { x: 0.34, y: 0.005 }, RADII, point);
    expect(mark).toMatchObject({ kind: 'point', provenance: 'mark', mark: 'fmark-1' });
    if (mark?.kind !== 'point') throw new Error('no point');
    expect(pickRef(mark)).toEqual({ kind: 'mark', at: [1 / 3, 0], mark: 'fmark-1' });
  });

  it('tells a hit from the one a frame ago by what it takes, a free one by where it is', () => {
    const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
    const at = (x: number, y: number) => ({
      pane: 'folded' as const,
      at: { x, y },
      pick: resolveFoldPick(index, 'folded', { x, y }, RADII, point),
    });
    expect(sameFoldHit(at(0.99, 0.01), at(0.995, 0.005))).toBe(true);
    expect(sameFoldHit(at(0.99, 0.01), at(0.01, 0.01))).toBe(false);
    expect(sameFoldHit(at(0.4, 0.4), at(0.41, 0.4))).toBe(false);
  });
});
