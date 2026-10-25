import { describe, expect, it } from 'vitest';
import { StackHitIndex } from '../../cp-workspace/picking/stackHitIndex';
import { TINT } from '../../cp-workspace/renderer/fillTint';
import { paneFacesOf } from './layerPaneFigure';
import {
  FACE_RING_PX,
  foldedPanePaint,
  NO_FACE_MARKS,
  paneTintFills,
  patternPanePaint,
  SUBJECT_RING_PX,
  type LayerFaceMarks,
  type LayerPaneTint,
  type LayerPanesView,
} from './layerPaneMarks';
import { zScene } from './layerPanes.fixtures';

const FRONT: LayerPanesView = { side: 'front', xray: false, undecided: false };

const marks = (over: Partial<LayerFaceMarks>): LayerFaceMarks => ({ ...NO_FACE_MARKS, ...over });

/** Each tint as `ink alpha: faces or spots`, in drawing order. */
const read = (tints: readonly LayerPaneTint[]) =>
  tints.map((tint) => `${tint.ink} ${tint.alpha}: ${'faces' in tint ? `faces ${tint.faces.join(',')}` : `spots ${tint.spots.join(',')}`}`);

describe('the crease pattern’s marks, by role', () => {
  it('marks nothing with no marks', () => {
    expect(patternPanePaint(NO_FACE_MARKS)).toEqual({ tints: [], rings: [] });
  });

  it('tints every face with choices faintly while a subject is chosen', () => {
    const paint = patternPanePaint(marks({ picking: 'subject', pickable: [0, 1, 2], pointed: 1 }));
    expect(read(paint.tints)).toEqual([`pick ${TINT.faint}: faces 0,2`, `pick ${TINT.hover}: faces 1`]);
    expect(paint.rings).toEqual([{ face: 1, ink: 'pick', widthPx: FACE_RING_PX }]);
  });

  it('draws the subject strongest, with the only 2 px ring, and several objects alike (D21)', () => {
    const paint = patternPanePaint(marks({ picking: 'object', pickable: [1, 2, 3, 4], subject: 0, objects: [2, 3] }));
    expect(read(paint.tints)).toEqual([
      `pick ${TINT.faint}: faces 1,4`,
      `pick ${TINT.emphasis}: faces 0`,
      `pick ${TINT.hover}: faces 2,3`,
    ]);
    expect(paint.rings).toEqual([
      { face: 0, ink: 'pick', widthPx: SUBJECT_RING_PX },
      { face: 2, ink: 'pick', widthPx: FACE_RING_PX },
      { face: 3, ink: 'pick', widthPx: FACE_RING_PX },
    ]);
  });

  it('lights a pressed row’s subject and all its objects', () => {
    const paint = patternPanePaint(marks({ row: [5, 6, 7] }));
    expect(read(paint.tints)).toEqual([`pick ${TINT.picked}: faces 5,6,7`]);
    expect(paint.rings.map((ring) => ring.face)).toEqual([5, 6, 7]);
  });

  it('draws a clash in danger, stronger while its reason is pointed at, and an object in it as the clash', () => {
    const clash = marks({ picking: 'object', pickable: [1, 2, 3], subject: 0, objects: [1, 2], clash: [2, 9] });
    const paint = patternPanePaint(clash);
    expect(read(paint.tints)).toEqual([
      `pick ${TINT.faint}: faces 3`,
      `pick ${TINT.emphasis}: faces 0`,
      `pick ${TINT.hover}: faces 1`,
      `danger ${TINT.moving}: faces 2,9`,
    ]);
    expect(paint.rings).toEqual([
      { face: 2, ink: 'danger', widthPx: FACE_RING_PX },
      { face: 9, ink: 'danger', widthPx: FACE_RING_PX },
      { face: 0, ink: 'pick', widthPx: SUBJECT_RING_PX },
      { face: 1, ink: 'pick', widthPx: FACE_RING_PX },
    ]);
    expect(read(patternPanePaint({ ...clash, clashStrong: true }).tints).at(-1)).toBe(`danger ${TINT.picked}: faces 2,9`);
  });

  it('does not light the pointer again over a face already marked', () => {
    const paint = patternPanePaint(marks({ picking: 'object', subject: 0, objects: [2], pointed: 2 }));
    expect(read(paint.tints)).toEqual([`pick ${TINT.emphasis}: faces 0`, `pick ${TINT.hover}: faces 2`]);
  });
});

describe('the folded figure’s marks, by role', () => {
  const scene = zScene();

  it('tints nothing faint while a subject is chosen: that is the crease pattern’s', () => {
    const paint = foldedPanePaint(marks({ picking: 'subject', pickable: [0, 1, 2] }), scene, FRONT);
    expect(paint.tints).toEqual([]);
  });

  it('tints the undecided spots only while the view’s Undecided is on', () => {
    const undecided = marks({ undecided: [1] });
    expect(foldedPanePaint(undecided, scene, FRONT).tints).toEqual([]);
    expect(read(foldedPanePaint(undecided, scene, { ...FRONT, undecided: true }).tints)).toEqual([`pick ${TINT.faint}: spots 1`]);
  });

  it('choosing objects: their spots on top faintly, the subject’s other spots a rung up, its ring and the objects’ rings', () => {
    // Face 2 is on top of spot 1; the subject, face 0, lies under it there and alone on spot 0.
    const paint = foldedPanePaint(marks({ picking: 'object', pickable: [1, 2], subject: 0, objects: [1, 2] }), scene, FRONT);
    expect(read(paint.tints)).toEqual([`pick ${TINT.faint}: spots 1`, `pick ${TINT.hover}: spots 0`]);
    expect(paint.rings.map(({ face, widthPx }) => [face, widthPx])).toEqual([
      [0, SUBJECT_RING_PX],
      [1, FACE_RING_PX],
      [2, FACE_RING_PX],
    ]);
  });

  it('the subject’s whole face when none of its spots is taken', () => {
    const paint = foldedPanePaint(marks({ picking: 'object', subject: 1 }), scene, FRONT);
    expect(read(paint.tints)).toEqual([`pick ${TINT.hover}: faces 1`]);
  });

  it('lights the spots a preview changes, from the side shown, over the faint ones', () => {
    const changed = { front: new Uint32Array([1]), back: new Uint32Array([0]) };
    const paint = foldedPanePaint(marks({ picking: 'object', pickable: [2], subject: 0, changed }), scene, FRONT);
    expect(read(paint.tints)).toEqual([`pick ${TINT.picked}: spots 1`, `pick ${TINT.hover}: spots 0`]);
    const back = foldedPanePaint(marks({ changed }), zScene('back'), { ...FRONT, side: 'back' });
    expect(read(back.tints)).toEqual([`pick ${TINT.picked}: spots 0`]);
  });

  it('a row, the clash and the pointer as whole faces', () => {
    const paint = foldedPanePaint(marks({ row: [1, 2], clash: [0], pointed: 1 }), scene, FRONT);
    expect(read(paint.tints)).toEqual([
      `pick ${TINT.hover}: faces 1,2`,
      `danger ${TINT.moving}: faces 0`,
      `pick ${TINT.hover}: faces 1`,
    ]);
  });
});

describe('a pane’s tints as one fill', () => {
  const scene = zScene();
  const inks = { pick: [0.5, 0.4, 1, 1] as const, danger: [1, 0, 0, 1] as const };

  it('fills faces by their rings and spots by the index’s cells, in order, at each rung', () => {
    const faces = paneFacesOf(scene);
    const index = new StackHitIndex(scene.subfaces);
    const tints: LayerPaneTint[] = [
      { faces: [0, 1], ink: 'pick', alpha: TINT.faint },
      { spots: [1], ink: 'danger', alpha: TINT.moving },
    ];
    const fill = paneTintFills(tints, { pick: [...inks.pick], danger: [...inks.danger] }, (face) => faces.pattern[face], index)!;
    // Two squares and one spot, two triangles each.
    expect(fill.count).toBe(18);
    const near = (values: number[]) => values.map((value) => expect.closeTo(value, 5));
    expect(Array.from(fill.color.slice(0, 4))).toEqual(near([0.5, 0.4, 1, TINT.faint]));
    expect(Array.from(fill.color.slice(12 * 4, 12 * 4 + 4))).toEqual(near([1, 0, 0, TINT.moving]));
  });

  it('is null when nothing is tinted, and skips a face with no ring', () => {
    expect(paneTintFills([], { pick: [1, 1, 1, 1], danger: [1, 1, 1, 1] }, () => undefined, null)).toBeNull();
    expect(
      paneTintFills([{ faces: [7], ink: 'pick', alpha: 0.5 }], { pick: [1, 1, 1, 1], danger: [1, 1, 1, 1] }, () => [], null)
    ).toBeNull();
  });
});
