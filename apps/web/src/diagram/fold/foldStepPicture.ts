/**
 * A Fold step's picture as a Diagram step keeps it (fold-workspace plan D11,
 * D17): made from what the Fold engine says of the step's states, through
 * the same paper-scene route every captured picture takes, so it is drawn in
 * the diagram's pens, measured, anchored and posed as a linked pattern's is.
 *
 * - **Units.** A Fold sheet's longer side is drawn as long as Edit draws its
 *   paper ({@link PATTERN_PER_SHEET_UNIT} pattern units), y down as Edit's
 *   model is — what every canvas shows of Fold's y-up frames — so a page
 *   sizes a Fold step and an Edit capture alike (D10).
 * - **Crease pattern.** The step's own state's creases (`creasePatternPaperScene`,
 *   Fold's own builder): the folds earlier steps made in the fold pens, the
 *   precreases in the aux pen, and — for the state before the step — the
 *   creases the step makes in the diagram pens, its instruction. About the
 *   sheet's middle, turned, on either side's colour; with Flip creases on
 *   the back, turned over side to side as a linked pattern's is.
 * - **Folded.** The state shown — the one the step folds from (`before`), or
 *   the one it lands (`after`) — is the kernel scene's shape already
 *   (`FoldScene`), taken into pattern units and, for the back, turned over:
 *   mirrored, every stack read from the other end, every face's other side
 *   up. Then `flatScenePicture`, with its faces on the paper.
 * - **Marks.** Before a fold, its line and its arrow, from the engine's
 *   picture of the step (`FoldActionGeometry`), as the Diagram's own
 *   annotations, tagged as the source's (`imported: 'untouched'`) so a
 *   refresh brings the step's own again and the author's stay. Drawn on the
 *   folded picture, which is in the frame they are given in.
 *
 * Pure: no React, no store, no engine.
 */

import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import { creasePatternPaperScene } from '../../fold/canvas/foldPaneScenes';
import type { FoldActionGeometry, FoldScene } from '../../fold/engine/foldEngineWire';
import { foldStateFrame } from '../../fold/sequence/foldStateFrame';
import { ORIEDITA_PAPER_SIZE } from '../../lib/creasePatternViewport';
import { turnClockwise, type Point } from '../../lib/geometry';
import type { PaperLineRole, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import { storedSheetThumbnail, type SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import { withCarriedAnnotations } from '../annotate/annotationCarry';
import { createAnnotation, MAX_BEHIND_LAYERS, type PictureFrame, type PicturePoint } from '../annotate/annotationModel';
import { flatScenePicture, storeScene, type CapturedPicture } from '../capture/captureFolded';
import { CAPTURE_PX_PER_UNIT } from '../capture/captureGeometry';
import {
  creasePatternSide,
  creasesFlipped,
  isKnownAnnotation,
  randomDiagramId,
  type DiagramAnnotationKind,
  type DiagramCpRender,
  type DiagramFoldMoment,
  type DiagramIdFactory,
  type DiagramPleatKinks,
  type DiagramScenePicture,
  type DiagramStep,
  type KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { storedAnnotations } from '../document/diagramFile';
import { storedScene } from '../pictures/pictureFrame';
import { repeatCalloutMark, type FoldRepeatCallout } from './foldRepeatCallout';

/** Pattern units per Fold sheet unit: a Fold sheet the size Edit draws its paper. */
export const PATTERN_PER_SHEET_UNIT = ORIEDITA_PAPER_SIZE;

/** A Fold frame's point in pattern units, y down. */
export function sheetToPattern({ x, y }: Point): Point {
  return { x: x * PATTERN_PER_SHEET_UNIT, y: -y * PATTERN_PER_SHEET_UNIT };
}

/** A point of a scene seen from `side`: the back is the front mirrored left to right. */
function seenFrom(side: 'front' | 'back'): (point: Point) => Point {
  return side === 'back' ? ({ x, y }) => ({ x: -x, y }) : (point) => point;
}

/**
 * A Fold state's scene as the kernel's paper scene, in pattern units, seen
 * from `side`: the front as Fold shows it (its view applied), or the model
 * turned over — every point mirrored, every stack read from the other end and
 * every face showing its other side — as the kernel's back pass is. Where
 * each point lies on the sheet is the paper's, whichever side shows.
 */
export function foldScenePattern(scene: FoldScene, side: 'front' | 'back'): OristudioCpFoldedPaperScene {
  const look = seenFrom(side);
  const place = (point: Point): Point => look(sheetToPattern(point));
  const back = side === 'back';
  return {
    schema_version: scene.schema_version,
    flipped: back ? !scene.flipped : scene.flipped,
    sheet: scene.sheet * PATTERN_PER_SHEET_UNIT,
    faces: scene.faces.map((face) => ({
      outline: face.outline.map(place),
      points: [...face.points],
      front_up: back ? !face.front_up : face.front_up,
      edges: face.edges.map((edge) => ({ from: place(edge.from), to: place(edge.to), kind: edge.kind })),
    })),
    subfaces: scene.subfaces.map((subface) => ({
      polygon: subface.polygon.map(place),
      faces_top_to_bottom: back ? [...subface.faces_top_to_bottom].reverse() : [...subface.faces_top_to_bottom],
    })),
    aux_lines: scene.aux_lines.map((line) => ({ from: place(line.from), to: place(line.to), face: line.face })),
    sheet_points: scene.sheet_points.map(sheetToPattern),
  };
}

/** The step's own state, whose creases its crease pattern and thumbnail draw. */
export interface FoldStepOwnState {
  scene: FoldScene;
  /** How many steps led to it (`FoldStateSummary.step`): what its creases' `made_at` counts. */
  step: number;
  /** The sheet's outline, counter-clockwise, in sheet coordinates. */
  sheet: readonly (readonly [number, number])[];
}

export interface FoldStepPictureInput {
  /** The state the picture shows: the step's parent's for `before`, its own for `after`. */
  shown: FoldScene;
  own: FoldStepOwnState;
  moment: DiagramFoldMoment;
  /** What the step does, on the state it folds from; null for a turn, a rotation or an import. */
  action: FoldActionGeometry | null;
  /** Repeat's affected material in the starting pose, with localized callout words. */
  repeat?: FoldRepeatCallout;
}

export interface FoldStepPicture {
  captured: CapturedPicture;
  /** The step's own marks, in the picture's units, tagged as its source's; empty when it brings none. */
  marks: KnownDiagramAnnotation[];
  /** The step's crease pattern, small, as a step keeps it. */
  thumbnail: SheetThumbnail;
}

/** The step's crease pattern as a thumbnail, as the Fold strip draws it. */
export function foldStepThumbnail(own: FoldStepOwnState): SheetThumbnail {
  return foldStateFrame(own.scene).pattern ?? storedSheetThumbnail(null);
}

/** The middle of the sheet's box, in pattern units: what a crease pattern is turned about. */
function sheetMiddle(sheet: FoldStepOwnState['sheet']): Point {
  const placed = sheet.map(([x, y]) => sheetToPattern({ x, y }));
  const xs = placed.map((point) => point.x);
  const ys = placed.map((point) => point.y);
  return xs.length > 0
    ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    : { x: 0, y: 0 };
}

/**
 * The step's crease pattern, as `render` poses it: about the sheet's middle,
 * turned, on its side's colour. With Flip creases on the back the paper is
 * turned over side to side, as a linked pattern's is (`creasePatternScene`):
 * mirrored about the sheet's vertical middle before it is turned, and every
 * mountain drawn as a valley and every valley as a mountain.
 */
function creasePatternPicture(input: FoldStepPictureInput, render: Extract<DiagramCpRender, { mode: 'crease-pattern' }>): CapturedPicture {
  const { own, moment } = input;
  const middle = sheetMiddle(own.sheet);
  const turn = turnClockwise(render.rotationDeg);
  const flipped = creasesFlipped(render);
  const across = flipped ? -1 : 1;
  const toScenePx = (point: Point): ScenePoint => {
    const placed = sheetToPattern(point);
    const turned = turn({ x: across * (placed.x - middle.x), y: placed.y - middle.y });
    return [turned.x * CAPTURE_PX_PER_UNIT, turned.y * CAPTURE_PX_PER_UNIT];
  };
  const scene = creasePatternPaperScene(own.scene, {
    // Before the step its creases are its instruction; after it, folds like any.
    display: { stepCreases: moment === 'before', precreases: true },
    sheet: own.sheet,
    step: own.step,
    place: { toScenePx, sheetPx: PATTERN_PER_SHEET_UNIT * CAPTURE_PX_PER_UNIT },
    side: creasePatternSide(render),
  });
  return storeScene(flipped ? withFoldsTurnedOver(scene) : scene, CAPTURE_PX_PER_UNIT, null);
}

/** A fold's pen seen from the paper's other side: a mountain is a valley there, and a valley a mountain. */
const TURNED_OVER_ROLE: Partial<Record<PaperLineRole, PaperLineRole>> = {
  mountain: 'valley',
  valley: 'mountain',
  'diagram-mountain': 'diagram-valley',
  'diagram-valley': 'diagram-mountain',
};

/** `scene` with every mountain and valley swapped, the instruction's with them; every item where it was. */
function withFoldsTurnedOver(scene: PaperScene): PaperScene {
  return {
    ...scene,
    items: scene.items.map((item) =>
      item.kind === 'line' ? { ...item, role: TURNED_OVER_ROLE[item.role] ?? item.role } : item
    ),
  };
}

/** The stored scene a captured picture draws, for the frame its marks are in. */
function capturedScene(captured: CapturedPicture): PaperScene | null {
  if (captured.kind === 'over-budget') return captured.scene;
  return captured.picture.kind === 'scene' ? storedScene(captured.picture) : null;
}

/**
 * The step's marks on the flat picture `captured` is: its fold's line — the
 * stretches of it the moving paper is creased along, a stretch under a layer
 * that stays drawn hidden — and its arrow from the paper it moves to where it
 * lands, dotted from an end under layers (15e); a precrease's arrow comes back.
 * A compound fold's push or pleat arrow too. Seen from the back, every fold is
 * named from there (RM7) and its layers are not the front's, so no end is
 * marked behind.
 */
export function foldStepMarks(
  action: FoldActionGeometry | null,
  captured: CapturedPicture,
  render: Extract<DiagramCpRender, { mode: 'folded-flat' }>,
  newId: DiagramIdFactory = randomDiagramId,
  repeat?: FoldRepeatCallout,
): KnownDiagramAnnotation[] {
  const scene = capturedScene(captured);
  if (!scene) return [];
  const { minX, minY, maxX, maxY } = scene.bounds;
  const longer = Math.max(maxX - minX, maxY - minY);
  if (!(longer > 0)) return [];
  const frame: PictureFrame = { width: (maxX - minX) / longer, height: (maxY - minY) / longer };
  const look = seenFrom(render.side);
  const turn = turnClockwise(render.rotationDeg);
  const toPicture = (point: Point): PicturePoint => {
    const turned = turn(look(sheetToPattern(point)));
    return [(turned.x * CAPTURE_PX_PER_UNIT - minX) / longer, (turned.y * CAPTURE_PX_PER_UNIT - minY) / longer];
  };
  if (repeat) {
    const callout = repeatCalloutMark(repeat, frame, toPicture, render.side, newId);
    return callout ? storedAnnotations([callout]) : [];
  }
  if (!action) return [];
  const back = render.side === 'back';
  // As the viewer sees it, from the side the picture shows.
  const valley = (action.direction === 'valley') !== back;
  const mark = (kind: DiagramAnnotationKind, from: Point, to: Point): KnownDiagramAnnotation =>
    createAnnotation(kind, toPicture(from), toPicture(to), frame, newId);
  const marks: KnownDiagramAnnotation[] = [];
  const spans = action.spans.length > 0 ? action.spans : action.line ? [{ from: action.line[0], to: action.line[1], hidden: false }] : [];
  for (const span of spans) {
    const spanValley = ((span.direction ?? action.direction) === 'valley') !== back;
    marks.push(mark(span.hidden ? 'hidden-line' : spanValley ? 'valley-line' : 'mountain-line', span.from, span.to));
  }
  if (action.grip) {
    const { at, image, hidden_at: over, hidden_image: overImage } = action.grip;
    const kind: DiagramAnnotationKind =
      action.kind === 'precrease' ? 'fold-unfold-arrow' : valley ? 'valley-arrow' : 'mountain-arrow';
    const arrow = mark(kind, at, image);
    const from = back ? 0 : Math.min(over, MAX_BEHIND_LAYERS);
    const to = back || overImage === null ? 0 : Math.min(overImage, MAX_BEHIND_LAYERS);
    marks.push(from > 0 || to > 0 ? { ...arrow, behind: { ...(from > 0 ? { from } : {}), ...(to > 0 ? { to } : {}) } } : arrow);
  }
  if (action.push) marks.push(mark('push-arrow', action.push.at, action.push.toward));
  if (action.pleat) {
    const kinks = Math.min(5, Math.max(1, Math.round(action.pleat.kinks))) as DiagramPleatKinks;
    marks.push({ ...mark('pleat-arrow', action.pleat.from, action.pleat.to), ...(kinks > 1 ? { kinks } : {}) });
  }
  // As the file holds them, every one Fold's own.
  return storedAnnotations(marks.map((annotation) => ({ ...annotation, imported: 'untouched' as const })));
}

/**
 * A Fold step's picture in `render`'s pose, its marks, and its thumbnail.
 * `render` is a crease pattern or a flat fold; the marks are a flat fold's,
 * before the step, when it folds.
 *
 * A spread picture's marks are placed on the picture as it lies flat — the
 * engine says where the fold's line and arrow are on the paper unspread — and
 * carried onto the spread one as a pose that spreads a step carries every
 * mark (`withCarriedAnnotations`): each point with the face it lies on. So a
 * step pulled with its spread, and one spread in the Diagram after it was
 * pulled, show their marks in one place.
 */
export function foldStepPicture(
  input: FoldStepPictureInput,
  render: DiagramCpRender,
  newId: DiagramIdFactory = randomDiagramId
): FoldStepPicture {
  const thumbnail = foldStepThumbnail(input.own);
  if (render.mode === 'crease-pattern') {
    return { captured: creasePatternPicture(input, render), marks: [], thumbnail };
  }
  if (render.mode !== 'folded-flat') throw new Error(`A Fold step is not shown ${render.mode}`);
  const pattern = foldScenePattern(input.shown, render.side);
  const captured = flatScenePicture(pattern, render.rotationDeg, render.spread);
  if (input.moment !== 'before' || (!input.action && !input.repeat)) return { captured, marks: [], thumbnail };
  if (!render.spread) return { captured, marks: foldStepMarks(input.action, captured, render, newId, input.repeat), thumbnail };
  const { spread: _spread, ...flatRender } = render;
  const flat = flatScenePicture(pattern, render.rotationDeg);
  const marks = foldStepMarks(input.action, flat, flatRender, newId, input.repeat);
  return { captured, marks: marksCarriedOntoSpread(marks, { flat, flatRender }, { captured, render }, thumbnail), thumbnail };
}

/**
 * `marks`, placed on the unspread picture, carried onto the spread one with
 * the faces they lie on: the carry a diagram step's own spread verb makes,
 * run on the two pictures as one step would hold them. Left where they were
 * when either picture is not a stored scene (one too detailed to keep as a
 * drawing), which no carry can read.
 */
function marksCarriedOntoSpread(
  marks: KnownDiagramAnnotation[],
  from: { flat: CapturedPicture; flatRender: Extract<DiagramCpRender, { mode: 'folded-flat' }> },
  to: { captured: CapturedPicture; render: Extract<DiagramCpRender, { mode: 'folded-flat' }> },
  thumbnail: SheetThumbnail
): KnownDiagramAnnotation[] {
  if (marks.length === 0) return marks;
  const scene = (captured: CapturedPicture) =>
    captured.kind === 'picture' && captured.picture.kind === 'scene' ? captured.picture : null;
  const [flat, spread] = [scene(from.flat), scene(to.captured)];
  if (!flat || !spread) return marks;
  // One step, before and after its spread: the carry asks only that the
  // pictures are of one link, so the link's own ids do not matter here.
  const step = (render: DiagramCpRender, picture: DiagramScenePicture): DiagramStep => ({
    id: 'step-carry',
    revision: 0,
    source: { kind: 'fold-step', sequence: '', step: '', moment: 'before', path: '', state: '', engine: 0, thumbnail, render },
    picture,
    annotations: marks,
    annotatedPictureKey: picture.key,
    text: '',
    breakBefore: false,
  });
  const carried = withCarriedAnnotations(step(from.flatRender, flat), step(to.render, spread), {});
  return carried.annotations.filter(isKnownAnnotation);
}
