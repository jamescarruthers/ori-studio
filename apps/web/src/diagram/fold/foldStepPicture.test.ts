import { describe, expect, it } from 'vitest';

import type { FoldActionGeometry } from '../../fold/engine/foldEngineWire';
import { diagonalHalfScene, squareScene } from '../../fold/sequence/foldScene.fixtures';
import type { PaperLineItem, PaperScene } from '../../lib/paper/paperScene';
import type { DiagramCpRender, DiagramIdFactory, DiagramScenePicture } from '../document/diagramDocument';
import { readPaperFaces } from '../document/paperFacesFile';
import { storedScene } from '../pictures/pictureFrame';
import type { CapturedPicture } from '../capture/captureFolded';
import { foldScenePattern, foldStepPicture, PATTERN_PER_SHEET_UNIT, type FoldStepPictureInput } from './foldStepPicture';

const SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

function sequentialIds(): DiagramIdFactory {
  let next = 0;
  return (prefix) => `${prefix}-${(next += 1)}`;
}

/** The diagonal valley fold of the unit square: its line across the square, the top-left corner swung onto the bottom-right. */
const VALLEY: FoldActionGeometry = {
  kind: 'fold',
  direction: 'valley',
  line: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  spans: [{ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, hidden: false }],
  moving: [0],
  grip: { at: { x: 0.25, y: 0.75 }, image: { x: 0.75, y: 0.25 }, hidden_at: 0, hidden_image: 1 },
};

/** Step 1 of a square: the diagonal valley, seen before it folds (the flat sheet) or after. */
function input(moment: 'before' | 'after', action: FoldActionGeometry | null = VALLEY): FoldStepPictureInput {
  return {
    shown: moment === 'before' ? squareScene() : diagonalHalfScene(),
    own: { scene: diagonalHalfScene(), step: 1, sheet: SQUARE },
    moment,
    action: moment === 'before' ? action : null,
  };
}

const FLAT: DiagramCpRender = { mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 1 };

function sceneOf(captured: CapturedPicture): { picture: DiagramScenePicture; scene: PaperScene } {
  if (captured.kind !== 'picture' || captured.picture.kind !== 'scene') throw new Error('a scene picture');
  return { picture: captured.picture, scene: storedScene(captured.picture)! };
}

const lines = (scene: PaperScene) => scene.items.filter((item): item is PaperLineItem => item.kind === 'line');

describe('a Fold step’s picture (D11, D17)', () => {
  it('draws its crease pattern before the step with the step’s creases as its instruction, and after it as folds', () => {
    const before = sceneOf(foldStepPicture(input('before'), { mode: 'crease-pattern', rotationDeg: 0 }).captured).scene;
    expect(lines(before).map((line) => line.role).sort()).toEqual(['diagram-valley', 'edge', 'edge', 'edge', 'edge']);
    const after = sceneOf(foldStepPicture(input('after'), { mode: 'crease-pattern', rotationDeg: 0 }).captured).scene;
    expect(lines(after).map((line) => line.role)).toContain('valley');
    expect(lines(after).map((line) => line.role)).not.toContain('diagram-valley');
  });

  it('draws the sheet the size Edit draws its paper, about its middle, turned, on the side’s colour', () => {
    const { picture, scene } = sceneOf(
      foldStepPicture(input('after'), { mode: 'crease-pattern', rotationDeg: 90, side: 'back' }).captured
    );
    const span = scene.bounds.maxX - scene.bounds.minX;
    expect(span / picture.paperScale!).toBeCloseTo(PATTERN_PER_SHEET_UNIT, 6);
    expect(scene.bounds.minX).toBeCloseTo(-scene.bounds.maxX, 6);
    expect(scene.items.find((item) => item.kind === 'face')).toMatchObject({ side: 'back' });
  });

  it('draws the state it shows folded, with its faces on the paper for an enlarged step to anchor to', () => {
    const { picture, scene } = sceneOf(foldStepPicture(input('after'), FLAT).captured);
    expect(scene.items.some((item) => item.kind === 'face')).toBe(true);
    const faces = readPaperFaces(picture.paperFaces);
    expect(faces && typeof faces !== 'symbol' ? faces.faces.rings.length : 0).toBe(2);
  });

  it('brings the fold’s line and arrow, tagged as the source’s, before a fold — and none after it', () => {
    const before = foldStepPicture(input('before'), FLAT, sequentialIds());
    expect(before.marks.map((mark) => mark.kind)).toEqual(['valley-line', 'valley-arrow']);
    expect(before.marks.every((mark) => mark.imported === 'untouched')).toBe(true);
    // Its tip lands under the layer the fold leaves over it.
    expect(before.marks[1]).toMatchObject({ behind: { to: 1 } });
    expect(typeof before.marks[1]!.bend).toBe('number');
    // Every point inside the picture's frame.
    for (const mark of before.marks) {
      for (const [u, v] of [mark.from, mark.to]) {
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(1 + 1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(foldStepPicture(input('after'), FLAT).marks).toEqual([]);
    expect(foldStepPicture(input('before'), { mode: 'crease-pattern', rotationDeg: 0 }).marks).toEqual([]);
  });

  it('names the fold from the back on the back, and marks no end behind there', () => {
    const back = foldStepPicture(input('before'), { ...FLAT, side: 'back' }, sequentialIds()).marks;
    expect(back.map((mark) => mark.kind)).toEqual(['mountain-line', 'mountain-arrow']);
    expect(back[1]!.behind).toBeUndefined();
    const front = foldStepPicture(input('before'), FLAT, sequentialIds()).marks;
    // Mirrored left to right: the arrow's tail is on the other side of the picture.
    expect(back[1]!.from[0]).toBeCloseTo(1 - front[1]!.from[0], 6);
  });

  it('draws a precrease’s arrow coming back', () => {
    const precrease = foldStepPicture(input('before', { ...VALLEY, kind: 'precrease' }), FLAT).marks;
    expect(precrease.map((mark) => mark.kind)).toEqual(['valley-line', 'fold-unfold-arrow']);
  });

  it('keeps the step’s crease pattern as its thumbnail', () => {
    const { thumbnail } = foldStepPicture(input('before'), FLAT);
    expect(thumbnail.strokes.map((stroke) => stroke.role)).toContain('valley');
  });
});

describe('a Fold state as the kernel’s paper scene', () => {
  it('turns over as the kernel’s back pass: mirrored, every stack from the other end, every face’s other side up', () => {
    const front = foldScenePattern(diagonalHalfScene(), 'front');
    const back = foldScenePattern(diagonalHalfScene(), 'back');
    expect(back.subfaces[0]!.faces_top_to_bottom).toEqual([...front.subfaces[0]!.faces_top_to_bottom].reverse());
    expect(back.faces.map((face) => face.front_up)).toEqual(front.faces.map((face) => !face.front_up));
    expect(back.faces[0]!.outline.map((point) => point.x)).toEqual(front.faces[0]!.outline.map((point) => -point.x));
    // The paper is the paper, whichever side shows.
    expect(back.sheet_points).toEqual(front.sheet_points);
    expect(front.sheet).toBe(PATTERN_PER_SHEET_UNIT);
    // y down, as Edit's model is.
    expect(front.sheet_points[3]).toEqual({ x: 0, y: -PATTERN_PER_SHEET_UNIT });
  });
});
