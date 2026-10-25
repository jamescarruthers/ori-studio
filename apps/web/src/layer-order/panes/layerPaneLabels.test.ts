import { describe, expect, it } from 'vitest';
import type { Point } from '../../lib/geometry';
import { LAYER_ORDER_LABEL_CAP } from '../layerOrderBudgets';
import { restackedScene } from './layerPaneFigure';
import {
  cappedFaces,
  chipFits,
  foldedLabelIndex,
  labelSize,
  LABEL_EDGE_ROOM_PX,
  paneLetters,
  patternLabelIndex,
  placeLabels,
  ringSpots,
  withPointerLetters,
  type LayerLabelSpots,
  type LayerPaneLabel,
} from './layerPaneLabels';
import { baseMarks, NO_FACE_MARKS, type LayerFaceMarks } from './layerPaneMarks';
import { zScene } from './layerPanes.fixtures';

const marks = (over: Partial<LayerFaceMarks>): LayerFaceMarks => ({ ...NO_FACE_MARKS, ...over });

/** Faces along a line on the crease pattern: face k at x = k. */
const LINE: Point[] = Array.from({ length: 200 }, (_, k) => ({ x: k, y: 0 }));

const square = (x: number, y: number, side: number): Point[] => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

const insideRect = ({ x, y }: Point, ring: readonly Point[]) => {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
};

/** A face given whole as its own one spot, the identity its projection. */
const roomy = (x: number, y: number, side = 60): LayerLabelSpots => {
  const ring = square(x - side / 2, y - side / 2, side);
  return { visible: true, spots: [{ at: { x, y }, region: ring }], outline: ring };
};

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

  it('marks which letters must show: picks, the clash, the face pointed at', () => {
    const pickable = Array.from({ length: 60 }, (_, k) => k + 1);
    const { labels } = paneLetters(marks({ picking: 'object', pickable, subject: 0, objects: [3], clash: [9], pointed: 30 }), LINE);
    const keep = labels.filter((label) => label.keep).map(({ face }) => face).sort((a, b) => a - b);
    expect(keep).toEqual([0, 3, 9, 30]);
  });

  const byFace = (letters: { labels: readonly LayerPaneLabel[] }) => [...letters.labels].sort((a, b) => a.face - b.face);
  const PAST_CAP = Array.from({ length: 120 }, (_, k) => k + 1);

  it('takes the pointer on last, the same letters as reading the marks whole', () => {
    const cases: Partial<LayerFaceMarks>[] = [
      { picking: 'object', pickable: [4, 5, 6], subject: 0, objects: [4], pointed: 5, row: [7, 8] },
      { picking: 'object', pickable: PAST_CAP, subject: 0, pointed: 100 },
      { picking: 'subject', pickable: [1, 2], pointed: 2, row: [1, 9], clash: [9] },
    ];
    for (const over of cases) {
      const full = marks(over);
      const taken = withPointerLetters(paneLetters(baseMarks(full), LINE), full, LINE);
      expect(byFace(taken)).toEqual(byFace(paneLetters(full, LINE)));
    }
  });

  it('past the cap, pointing at a lettered face moves no letter: only one the cap left out gathers them', () => {
    const resting = marks({ picking: 'object', pickable: PAST_CAP, subject: 0 });
    const base = paneLetters(resting, LINE);
    const lettered = (letters: { labels: readonly LayerPaneLabel[] }) => letters.labels.map(({ face }) => face).sort((a, b) => a - b);
    const onLettered = withPointerLetters(base, { ...resting, pointed: 3 }, LINE);
    expect(lettered(onLettered)).toEqual(lettered(base));
    expect(onLettered.labels.find(({ face }) => face === 3)?.keep).toBe(true);
    const onLeftOut = withPointerLetters(base, { ...resting, pointed: 100 }, LINE);
    expect(lettered(onLeftOut)).toContain(100);
    expect(lettered(onLeftOut)).not.toContain(1);
  });
});

describe('where a letter may sit', () => {
  it('on the crease pattern: inside the face, its centroid first, then spread along it whichever way it lies', () => {
    const long = square(0, 0, 10).map(({ x, y }) => ({ x: x * 10, y }));
    const tall = long.map(({ x, y }) => ({ x: y, y: x }));
    for (const [ring, along] of [
      [long, 'x'],
      [tall, 'y'],
    ] as const) {
      const spots = ringSpots(ring, 4);
      expect(spots).toHaveLength(4);
      expect(spots[0]).toEqual(along === 'x' ? { x: 50, y: 5 } : { x: 5, y: 50 });
      expect(spots.every((p) => insideRect(p, ring))).toBe(true);
      const reach = spots.map((p) => p[along]);
      expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(50);
    }
    // A face whose centroid is outside it: only points inside.
    const l = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 40 },
      { x: 0, y: 40 },
    ];
    const spots = ringSpots(l, 6);
    expect(spots.length).toBeGreaterThan(1);
    expect(spots.every(({ x, y }) => (x < 10 && y < 40) || (y < 10 && x < 40))).toBe(true);
  });

  it('on the crease pattern, the face’s ring is each spot’s region, worked out once', () => {
    const index = patternLabelIndex([square(0, 0, 30), []]);
    const spots = index(0)!;
    expect(spots.visible).toBe(true);
    expect(spots.spots.length).toBeGreaterThan(1);
    expect(spots.spots.every(({ region }) => region === spots.outline)).toBe(true);
    expect(index(0)).toBe(spots);
    expect(index(1)).toBeNull();
    expect(index(5)).toBeNull();
  });

  it('on the folded paper: points in its spots on top; a hidden face’s in its outline, then in its spots', () => {
    const scene = zScene();
    const index = foldedLabelIndex(scene);
    const [left, right] = scene.subfaces.map(({ polygon }) => polygon);
    // Face 0 is on top of spot 0 only; face 2 of spot 1; face 1 of none.
    const zero = index(0)!;
    expect(zero.visible).toBe(true);
    expect(zero.spots[0]!.at).toEqual({ x: 5, y: 5 });
    expect(zero.spots.length).toBeGreaterThan(1);
    expect(zero.spots.every(({ at, region }) => region === left && insideRect(at, left!))).toBe(true);
    const two = index(2)!;
    expect(two.spots[0]!.at).toEqual({ x: 15, y: 5 });
    expect(two.spots.every(({ region }) => region === right)).toBe(true);
    const one = index(1)!;
    expect(one.visible).toBe(false);
    expect(one.outline).toBe(scene.faces[1]!.outline);
    expect(one.spots[0]).toEqual({ at: { x: 15, y: 5 }, region: one.outline });
    expect(one.spots.at(-1)!.region).toBe(right);
    expect(index(1)).toBe(one);
  });

  it('follows the order on screen', () => {
    const turned = restackedScene(zScene(), {
      offsets: new Uint32Array([0, 1, 4]),
      faces: new Uint32Array([0, 1, 2, 0]),
    });
    expect(foldedLabelIndex(turned)(1)?.visible).toBe(true);
    expect(foldedLabelIndex(turned)(2)?.visible).toBe(false);
  });

  it('sizes a chip by its letters, smaller when hidden, wider with a clash’s dot', () => {
    const plain = labelSize('C', false, false);
    expect(plain.height).toBeCloseTo(16.275);
    expect(labelSize('AB', false, false).width).toBeGreaterThan(plain.width);
    expect(labelSize('C', true, false).height).toBeLessThan(plain.height);
    expect(labelSize('C', false, true).width).toBe(plain.width + 8);
  });

  it('fits a chip inside its region with room for the ring, and not across a notch', () => {
    const size = labelSize('C', false, false);
    expect(chipFits({ x: 30, y: 30 }, size, square(0, 0, 60), LABEL_EDGE_ROOM_PX)).toBe(true);
    // A face narrower than the chip, or as wide with no room for its ring.
    expect(chipFits({ x: 5, y: 5 }, size, square(0, 0, 10), LABEL_EDGE_ROOM_PX)).toBe(false);
    expect(chipFits({ x: 9, y: 9 }, size, square(0, 0, 18), LABEL_EDGE_ROOM_PX)).toBe(false);
    // An L whose reflex corner bites into the chip's box though every corner of the box is inside.
    const l = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 30 },
      { x: 31, y: 30 },
      { x: 31, y: 32 },
      { x: 60, y: 32 },
      { x: 60, y: 60 },
      { x: 0, y: 60 },
    ];
    expect(chipFits({ x: 40, y: 31 }, { width: 10, height: 30 }, l, 0)).toBe(false);
  });
});

describe('placing the letters', () => {
  const at = (placed: ReturnType<typeof placeLabels>) =>
    placed.map(({ face, x, y, under, off }) => [face, Math.round(x), Math.round(y), under, off]);

  it('places each at the first spot it fits clear of the ones before; the first on top', () => {
    const labels: LayerPaneLabel[] = [
      { face: 0, tone: 'pick', keep: true },
      { face: 1, tone: 'plain', keep: false },
    ];
    const spots = new Map<number, LayerLabelSpots>([
      [0, roomy(30, 30)],
      [
        1,
        {
          visible: true,
          spots: [
            { at: { x: 32, y: 30 }, region: square(0, 0, 60) },
            { at: { x: 130, y: 30 }, region: square(100, 0, 60) },
          ],
          outline: square(0, 0, 160),
        },
      ],
    ]);
    const placed = placeLabels(labels, (face) => spots.get(face) ?? null, (face) => 'AB'[face]!, (p) => p);
    expect(at(placed)).toEqual([
      [1, 130, 30, false, false],
      [0, 30, 30, false, false],
    ]);
  });

  it('leaves out a plain letter with no clear spot it fits in: only legible letters', () => {
    const labels: LayerPaneLabel[] = Array.from({ length: 50 }, (_, face) => ({ face, tone: 'plain', keep: face === 7 }));
    // Fifty faces a pixel apart, as iguana-c0's are at fit, each roomy enough on its own.
    const placed = placeLabels(labels, (face) => roomy(face, 0), () => 'HN', (p) => p);
    const faces = placed.map(({ face }) => face).sort((a, b) => a - b);
    expect(faces).toContain(7);
    expect(faces.length).toBeLessThan(10);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b || a.face === 7 || b.face === 7) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThan((a.width + b.width) / 2);
      }
    }
  });

  it('letters the faces that show before the hidden ones, so a buried face never takes the spot of the face on top', () => {
    const one = roomy(30, 30);
    const labels: LayerPaneLabel[] = [
      { face: 1, tone: 'pick', keep: true },
      { face: 2, tone: 'pick', keep: true },
    ];
    const spotsOf = (face: number): LayerLabelSpots => (face === 1 ? { ...one, visible: false } : one);
    const placed = placeLabels(labels, spotsOf, (face) => 'AB'[face - 1]!, (p) => p);
    const two = placed.find(({ face }) => face === 2)!;
    expect([two.x, two.y, two.off]).toEqual([30, 30, false]);
    expect(placed.find(({ face }) => face === 1)?.off).toBe(true);
  });

  it('never letters a plain face narrower than its chip', () => {
    const thin = square(0, 0, 8);
    const placed = placeLabels(
      [{ face: 0, tone: 'plain', keep: false }],
      () => ({ visible: true, spots: [{ at: { x: 4, y: 4 }, region: thin }], outline: thin }),
      () => 'A',
      (p) => p
    );
    expect(placed).toEqual([]);
  });

  it('sets a letter that must show beside its face when the face has no room, so it never hides the face’s tint or ring', () => {
    const thin = square(100, 100, 8);
    const placed = placeLabels(
      [{ face: 0, tone: 'pick', keep: true }],
      () => ({ visible: true, spots: [{ at: { x: 104, y: 104 }, region: thin }], outline: thin }),
      () => 'A',
      (p) => p
    );
    expect(placed).toHaveLength(1);
    const chip = placed[0]!;
    expect(chip.off).toBe(true);
    // Above the face, clear of it.
    expect(chip.y + chip.height / 2).toBeLessThan(100);
    expect(chip.x).toBe(104);
  });

  it('keeps a letter set beside its face on screen: a face along the pane’s top takes its letter below', () => {
    const thin = square(100, 0, 8);
    const spotsOf = () => ({ visible: true, spots: [{ at: { x: 104, y: 4 }, region: thin }], outline: thin });
    const label: LayerPaneLabel[] = [{ face: 0, tone: 'pick', keep: true }];
    // With no frame, above it, off the top.
    const anywhere = placeLabels(label, spotsOf, () => 'A', (p) => p)[0]!;
    expect(anywhere.y - anywhere.height / 2).toBeLessThan(0);
    const onScreen = placeLabels(label, spotsOf, () => 'A', (p) => p, { width: 400, height: 400 })[0]!;
    expect(onScreen.off).toBe(true);
    expect(onScreen.y - onScreen.height / 2).toBeGreaterThan(8);
    expect(onScreen.x).toBe(104);
  });

  it('places in the pane’s pixels, through the projection', () => {
    const placed = placeLabels(
      [{ face: 0, tone: 'pick', keep: true }],
      () => roomy(3, 3, 6),
      () => 'A',
      ({ x, y }) => ({ x: x * 10, y: y * 10 })
    );
    expect(at(placed)).toEqual([[0, 30, 30, false, false]]);
  });

  it('leaves out a face with no letter or nowhere to sit', () => {
    const placed = placeLabels(
      [
        { face: 0, tone: 'plain', keep: true },
        { face: 1, tone: 'plain', keep: true },
      ],
      (face) => (face === 0 ? { visible: true, spots: [], outline: [] } : roomy(0, 0)),
      (face) => (face === 1 ? '' : 'A'),
      (p) => p
    );
    expect(placed).toEqual([]);
  });
});
