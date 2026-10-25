import { describe, expect, it } from 'vitest';
import type { Point } from '../../lib/geometry';
import { LAYER_ORDER_LABEL_CAP } from '../layerOrderBudgets';
import { restackedScene } from './layerPaneFigure';
import {
  cappedFaces,
  foldedLabelSpots,
  labelSize,
  paneLetters,
  placeLabels,
  type LayerPaneLabel,
} from './layerPaneLabels';
import { NO_FACE_MARKS, type LayerFaceMarks } from './layerPaneMarks';
import { zScene } from './layerPanes.fixtures';

const marks = (over: Partial<LayerFaceMarks>): LayerFaceMarks => ({ ...NO_FACE_MARKS, ...over });

/** Faces along a line on the crease pattern: face k at x = k. */
const LINE: Point[] = Array.from({ length: 200 }, (_, k) => ({ x: k, y: 0 }));

describe('which faces carry letters', () => {
  it('the cap is phase gate 2’s', () => {
    expect(LAYER_ORDER_LABEL_CAP).toBe(50);
  });

  it('letters every face a pick can take up to the cap', () => {
    expect(cappedFaces([3, 1, 2], null, 0, LINE, 5)).toEqual([3, 1, 2]);
  });

  // The subject's open faces: every face but the subject, 10.
  const OPEN = Array.from({ length: 21 }, (_, k) => k).filter((face) => face !== 10);

  it('past the cap, the nearest to the subject keep theirs', () => {
    // The subject at x = 10: 9 and 11, then 8 and 12, …
    expect(cappedFaces(OPEN, null, 10, LINE, 4).sort((a, b) => a - b)).toEqual([8, 9, 11, 12]);
  });

  it('past the cap, the face pointed at and the nearest to it keep theirs', () => {
    expect(cappedFaces(OPEN, 20, 10, LINE, 3)).toEqual([20, 19, 18, 17]);
    // Pointing at a face no pick can take moves nothing.
    expect(cappedFaces(OPEN, 150, 10, LINE, 2).sort((a, b) => a - b)).toEqual([9, 11]);
  });

  it('nothing is lettered while a subject is chosen', () => {
    expect(paneLetters(marks({ picking: 'subject', pickable: [1, 2, 3], pointed: 2 }), LINE).labels).toEqual([]);
  });

  it('the subject, every object picked, a row’s faces and the clash always; the picks first', () => {
    const letters = paneLetters(
      marks({ picking: 'object', pickable: [4, 5], subject: 0, objects: [1, 2], row: [7, 8], clash: [2, 9] }),
      LINE
    );
    const tones = Object.fromEntries(letters.labels.map(({ face, tone }) => [face, tone]));
    expect(tones).toEqual({ 0: 'pick', 1: 'pick', 2: 'danger', 7: 'pick', 8: 'pick', 9: 'danger', 4: 'plain', 5: 'plain' });
    expect(letters.labels.slice(-2).map(({ tone }) => tone)).toEqual(['plain', 'plain']);
    expect(letters.pastCap).toEqual([]);
  });

  it('a picked object keeps its letter past the cap; the faces past it are tinted, unlettered', () => {
    const pickable = Array.from({ length: 120 }, (_, k) => k + 1);
    const letters = paneLetters(marks({ picking: 'object', pickable, subject: 0, objects: [110, 115] }), LINE);
    const lettered = new Set(letters.labels.map(({ face }) => face));
    expect(lettered.has(110)).toBe(true);
    expect(lettered.has(115)).toBe(true);
    // The subject, the two objects, and the 50 nearest the subject.
    expect(letters.labels.filter(({ tone }) => tone === 'plain')).toHaveLength(50);
    expect(lettered.size).toBe(53);
    expect(letters.pastCap).toHaveLength(120 - 52);
    expect(letters.pastCap.every((face) => !lettered.has(face))).toBe(true);
  });
});

describe('where a letter sits', () => {
  it('on the folded paper: its spots on top, largest first; a hidden face’s at its middle, then its spots', () => {
    const spots = foldedLabelSpots(zScene(), [0, 1, 2]);
    // Face 0 is on top of spot 0 only; face 2 of spot 1; face 1 of none.
    expect(spots.get(0)).toEqual({ visible: true, at: [{ x: 5, y: 5 }] });
    expect(spots.get(2)).toEqual({ visible: true, at: [{ x: 15, y: 5 }] });
    expect(spots.get(1)).toEqual({ visible: false, at: [{ x: 15, y: 5 }, { x: 15, y: 5 }] });
  });

  it('follows the order on screen', () => {
    const turned = restackedScene(zScene(), {
      offsets: new Uint32Array([0, 1, 4]),
      faces: new Uint32Array([0, 1, 2, 0]),
    });
    expect(foldedLabelSpots(turned, [1]).get(1)?.visible).toBe(true);
    expect(foldedLabelSpots(turned, [2]).get(2)?.visible).toBe(false);
  });

  it('sizes a chip by its letters, smaller when hidden, wider with a clash’s dot', () => {
    const plain = labelSize('C', false, false);
    expect(plain.height).toBeCloseTo(16.275);
    expect(labelSize('AB', false, false).width).toBeGreaterThan(plain.width);
    expect(labelSize('C', true, false).height).toBeLessThan(plain.height);
    expect(labelSize('C', false, true).width).toBe(plain.width + 8);
  });

  it('places each clear of the ones before it; one that must show at its first spot when none is clear; the first on top', () => {
    const labels: LayerPaneLabel[] = [
      { face: 0, tone: 'pick', keep: true },
      { face: 1, tone: 'plain', keep: false },
      { face: 2, tone: 'plain', keep: true },
    ];
    const spots = new Map([
      [0, { visible: true, at: [{ x: 0, y: 0 }] }],
      [1, { visible: true, at: [{ x: 1, y: 0 }, { x: 100, y: 0 }] }],
      [2, { visible: false, at: [{ x: 0, y: 1 }] }],
    ]);
    const placed = placeLabels(labels, (face) => spots.get(face) ?? null, (face) => 'ABC'[face]!, (p) => p);
    expect(placed.map(({ face, x, y, under }) => [face, x, y, under])).toEqual([
      [2, 0, 1, true],
      [1, 100, 0, false],
      [0, 0, 0, false],
    ]);
  });

  it('leaves out a letter that need not show and has no clear spot: only legible letters', () => {
    const labels: LayerPaneLabel[] = Array.from({ length: 50 }, (_, face) => ({ face, tone: 'plain', keep: face === 7 }));
    // Fifty faces a pixel apart, as iguana-c0's are at fit.
    const placed = placeLabels(labels, (face) => ({ visible: true, at: [{ x: face, y: 0 }] }), () => 'HN', (p) => p);
    const faces = placed.map(({ face }) => face).sort((a, b) => a - b);
    expect(faces).toContain(7);
    expect(faces.length).toBeLessThan(10);
    // No two left overlapping but the one that must show.
    for (const a of placed) {
      for (const b of placed) {
        if (a === b || a.face === 7 || b.face === 7) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThan((a.width + b.width) / 2);
      }
    }
  });

  it('marks which letters must show: picks, the clash, the face pointed at', () => {
    const pickable = Array.from({ length: 60 }, (_, k) => k + 1);
    const { labels } = paneLetters(marks({ picking: 'object', pickable, subject: 0, objects: [3], clash: [9], pointed: 30 }), LINE);
    const keep = labels.filter((label) => label.keep).map(({ face }) => face).sort((a, b) => a - b);
    expect(keep).toEqual([0, 3, 9, 30]);
  });

  it('leaves out a face with no letter or nowhere to sit', () => {
    const placed = placeLabels(
      [
        { face: 0, tone: 'plain', keep: true },
        { face: 1, tone: 'plain', keep: true },
      ],
      (face) => (face === 0 ? { visible: true, at: [] } : { visible: true, at: [{ x: 0, y: 0 }] }),
      () => '',
      (p) => p
    );
    expect(placed).toEqual([]);
  });
});
