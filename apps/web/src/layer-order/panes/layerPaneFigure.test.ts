import { describe, expect, it } from 'vitest';
import { cpModelToSvg } from '../../lib/creasePatternViewport';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { DEFAULT_FOLDED_MODEL } from '../../lib/orieditaNativeMetadata';
import type { OristudioCpLineSegment } from '../../engine/oristudioCpTypes';
import {
  foldedPaneToUser,
  foldedPivot,
  PANE_USER_PER_UNIT,
  paneFacesOf,
  paneTurnDeg,
  patternPaneBounds,
  patternPaneLines,
  restackedScene,
  ringArea,
  ringCentroid,
  ringInterior,
  stackDepth,
  topFaces,
  XRAY_COVER,
  xrayFaceAlpha,
} from './layerPaneFigure';
import { zScene } from './layerPanes.fixtures';

describe('X-ray', () => {
  it('shares the cover out over the deepest stack: its layers compose to 60%', () => {
    for (const depth of [1, 2, 3, 7, 40]) {
      const alpha = xrayFaceAlpha(depth);
      expect(1 - (1 - alpha) ** depth).toBeCloseTo(XRAY_COVER, 12);
    }
    expect(xrayFaceAlpha(1)).toBeCloseTo(0.6);
    expect(xrayFaceAlpha(2)).toBeCloseTo(1 - Math.sqrt(0.4));
    // A figure of no spots draws as one layer would.
    expect(xrayFaceAlpha(0)).toBeCloseTo(0.6);
  });

  it('reads the depth off the deepest spot', () => {
    expect(stackDepth(zScene())).toBe(3);
  });
});

describe('the figure’s faces on the crease pattern', () => {
  it('rings each face by its outline’s points on the sheet, the same from either side', () => {
    const front = paneFacesOf(zScene('front'));
    const back = paneFacesOf(zScene('back'));
    expect(front.pattern[1]).toEqual([
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(back.pattern).toEqual(front.pattern);
    expect(front.patternCentroids).toEqual([
      { x: 10, y: 5 },
      { x: 25, y: 5 },
      { x: 35, y: 5 },
    ]);
    expect(front.patternLabels).toEqual(front.patternCentroids);
  });

  it('puts a letter inside a ring whose centroid is not: a frame, or an L', () => {
    const frame = [
      // Round the outside, then back round the window, joined by a slit at the bottom.
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 3, y: 3 },
      { x: 3, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
    ];
    const at = ringInterior(frame)!;
    expect(at.y).toBe(5);
    expect(at.x).toBeCloseTo(1.5);
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(ringInterior(square)).toEqual({ x: 2, y: 2 });
    expect(ringInterior([])).toBeNull();
  });

  it('measures rings either way round', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(ringArea(square)).toBe(4);
    expect(ringArea([...square].reverse())).toBe(4);
    expect(ringCentroid([...square].reverse())).toEqual({ x: 1, y: 1 });
    expect(ringCentroid([])).toBeNull();
  });
});

describe('the order on screen', () => {
  it('restacks a scene’s spots, and leaves it be with no stacks or stacks for other spots', () => {
    const scene = zScene();
    const stacks = { offsets: new Uint32Array([0, 1, 4]), faces: new Uint32Array([0, 1, 0, 2]) };
    const restacked = restackedScene(scene, stacks);
    expect(topFaces(restacked)).toEqual([0, 1]);
    expect(restacked.subfaces[1]!.faces_top_to_bottom).toEqual([1, 0, 2]);
    expect(restacked.subfaces[1]!.polygon).toBe(scene.subfaces[1]!.polygon);
    // The same stacks, the same scene.
    expect(restackedScene(scene, stacks)).toBe(restacked);
    expect(restackedScene(scene, null)).toBe(scene);
    expect(restackedScene(scene, { offsets: new Uint32Array([0, 1]), faces: new Uint32Array([0]) })).toBe(scene);
  });
});

describe('the frames', () => {
  it('draws the crease pattern where Edit does, and the folded paper at Edit’s scale', () => {
    expect(PANE_USER_PER_UNIT).toBeCloseTo(588 / 400);
    const unturned = foldedPaneToUser(0, { x: 7, y: 3 });
    expect(unturned({ x: 12, y: -40 })).toEqual(cpModelToSvg({ x: 12, y: -40 }));
  });

  it('turns the folded paper clockwise about its middle, by the host’s turn', () => {
    const pivot = foldedPivot(zScene());
    expect(pivot).toEqual({ x: 10, y: 5 });
    const quarter = foldedPaneToUser(90, pivot);
    const middle = cpModelToSvg(pivot);
    // On a y-down page, a quarter turn clockwise takes +x to +y.
    const right = quarter({ x: 20, y: 5 });
    expect(right.x).toBeCloseTo(middle.x);
    expect(right.y).toBeCloseTo(middle.y + 10 * PANE_USER_PER_UNIT);
    expect(quarter(pivot)).toEqual(middle);
  });

  it('turns the other way seen from the other side, as a turned-over step does', () => {
    expect(paneTurnDeg(30, 'front', 'front')).toBe(30);
    expect(paneTurnDeg(30, 'front', 'back')).toBe(330);
    expect(paneTurnDeg(30, 'back', 'back')).toBe(30);
    expect(paneTurnDeg(-90, 'front', 'front')).toBe(270);
    expect(paneTurnDeg(0, 'front', 'back')).toBe(0);
  });
});

describe('the crease pattern’s lines', () => {
  const line = (color: string, x: number): OristudioCpLineSegment => ({
    a: { x, y: 0 },
    b: { x, y: 10 },
    active: 'INACTIVE_0',
    color,
    selected: 0,
    customized: 0,
    customized_color: { red: 0, green: 0, blue: 0 },
  });
  const source: LayerOrderSource = {
    segments: [line('Black0', 0), line('Red1', 1), line('Blue2', 2), line('Black0', 3)],
    startingFaceId: 1,
    auxSegments: [line('Cyan3', 4)],
    model: DEFAULT_FOLDED_MODEL,
    digest: '0',
  };

  it('in painter’s order: auxiliary lines, creases, then the edge', () => {
    expect(patternPaneLines(source).map(({ color, a }) => `${color}@${a.x}`)).toEqual([
      'Cyan3@4',
      'Red1@1',
      'Blue2@2',
      'Black0@0',
      'Black0@3',
    ]);
  });

  it('frames every line, through Edit’s map', () => {
    const bounds = patternPaneBounds(source)!;
    const from = cpModelToSvg({ x: 0, y: 0 });
    const to = cpModelToSvg({ x: 4, y: 10 });
    expect(bounds).toEqual({ minX: from.x, minY: from.y, maxX: to.x, maxY: to.y });
  });
});
