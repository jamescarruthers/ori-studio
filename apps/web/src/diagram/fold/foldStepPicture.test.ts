import { describe, expect, it } from 'vitest';

import { FOLD_USER_PER_UNIT } from '../../fold/canvas/foldCanvasGeometry';
import { FOLD_PANE_DISPLAY_DEFAULT, foldedPaneScene } from '../../fold/canvas/foldPaneScenes';
import type { FoldActionGeometry } from '../../fold/engine/foldEngineWire';
import { diagonalHalfScene, squareScene } from '../../fold/sequence/foldScene.fixtures';
import type { PaperLineItem, PaperScene } from '../../lib/paper/paperScene';
import { withCarriedAnnotations } from '../annotate/annotationCarry';
import type {
  DiagramCpRender,
  DiagramIdFactory,
  DiagramScenePicture,
  DiagramStep,
  KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { readPaperFaces } from '../document/paperFacesFile';
import { storedScene } from '../pictures/pictureFrame';
import { flatScenePicture, type CapturedPicture } from '../capture/captureFolded';
import { CAPTURE_PX_PER_UNIT } from '../capture/captureGeometry';
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

  it('spreads the state’s layers, and carries the fold’s marks onto them as a spread pose would', () => {
    const layered: FoldStepPictureInput = { ...input('before'), shown: diagonalHalfScene() };
    const spread = { kind: 'depth' as const, amount: 0.2, toward: 'down' as const };
    const flat = foldStepPicture(layered, FLAT, sequentialIds());
    const spreadOut = foldStepPicture(layered, { ...FLAT, spread }, sequentialIds());
    expect(sceneOf(spreadOut.captured).scene).not.toEqual(sceneOf(flat.captured).scene);
    // The same marks, Fold's, each carried with the paper it lies on — as a
    // step pulled unspread and spread in the Diagram afterwards has them.
    expect(spreadOut.marks.map((mark) => [mark.kind, mark.imported])).toEqual(flat.marks.map((mark) => [mark.kind, mark.imported]));
    const step = (render: DiagramCpRender, picture: DiagramScenePicture, annotations: KnownDiagramAnnotation[]): DiagramStep => ({
      id: 'step-a',
      revision: 0,
      source: { kind: 'fold-step', sequence: 'fold-a', step: 'fstep-a', moment: 'before', path: 'fh1:a', state: 'fs1:a', engine: 1, thumbnail: flat.thumbnail, render },
      picture,
      annotations,
      annotatedPictureKey: picture.key,
      text: '',
      breakBefore: false,
    });
    const posed = withCarriedAnnotations(
      step(FLAT, sceneOf(flat.captured).picture, flat.marks),
      step({ ...FLAT, spread }, sceneOf(spreadOut.captured).picture, flat.marks),
      {}
    );
    expect(spreadOut.marks).toEqual(posed.annotations);
    expect(spreadOut.marks).not.toEqual(flat.marks);
  });

  it('draws a state as Fold’s folded pane does with the same spread: one picture, at another scale', () => {
    const spread = { kind: 'affine' as const, amount: 0.2, keep: 'top' as const, skew: 1, axisDeg: 30 };
    const diagram = sceneOf(flatScenePicture(foldScenePattern(diagonalHalfScene(), 'front'), 0, spread)).scene;
    const fold = foldedPaneScene(diagonalHalfScene(), FOLD_PANE_DISPLAY_DEFAULT, undefined, spread);
    const facesOf = (scene: PaperScene, unit: number) =>
      scene.items.flatMap((item) =>
        item.kind === 'face' ? [item.rings[0]!.map(([x, y]) => [x / unit, y / unit] as const)] : []
      );
    const [ours, theirs] = [facesOf(diagram, PATTERN_PER_SHEET_UNIT * CAPTURE_PX_PER_UNIT), facesOf(fold, FOLD_USER_PER_UNIT)];
    expect(ours).toHaveLength(theirs.length);
    ours.forEach((ring, face) =>
      ring.forEach(([x, y], corner) => {
        expect(x).toBeCloseTo(theirs[face]![corner]![0], 3);
        expect(y).toBeCloseTo(theirs[face]![corner]![1], 3);
      })
    );
    // And it is spread: the layer under the top one has moved off where it lies flat.
    const unspread = facesOf(foldedPaneScene(diagonalHalfScene(), FOLD_PANE_DISPLAY_DEFAULT), FOLD_USER_PER_UNIT);
    expect(theirs).not.toEqual(unspread);
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
