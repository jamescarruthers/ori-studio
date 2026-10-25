/**
 * The Layer order dialog's two panes, bound: what each `PaperPane` is handed
 * for the session's status, the host's look, the view and the marks
 * (`implementation-plans/layer-order-dialog.md`, row U8). The panes'
 * component (`components/layer-order/LayerOrderPanes.tsx`) only composes
 * what these hooks answer.
 *
 * - **The crease pattern** draws at once, from the request's source, as
 *   Edit draws a crease pattern whatever the host (D18): Edit's line style
 *   and width, Edit's frame. Its faces, for tints, rings, letters and hits,
 *   come from the session's scene once it is open, or from the scene the
 *   host shows until then, so a refusal can name a face.
 * - **The folded figure** draws once the session is open: the side shown's
 *   scene, restacked for the order on screen (a preview's included),
 *   painted by the shared pipeline (`foldedFlatPaperScene`, then
 *   `paperSceneToFoldedGeometry` inside `PaperPane`) in the host's paper
 *   style and policy, turned as the host turns it, with no spread (D18).
 *   X-ray draws every layer, the buried ones too, see-through.
 *
 * The inks are the theme's, read off the dialog's element, and read again
 * when the theme changes.
 */
import { useMemo } from 'react';
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { Point } from '../../lib/geometry';
import { DEFAULT_ORISTUDIO_CP_LINE_STYLE, DEFAULT_ORISTUDIO_CP_LINE_WIDTH } from '../../lib/creasePatternViewport';
import type { LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import type { PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import { cpPatternStrokes, type CpPatternStrokes } from '../../cp-workspace/adapters/cpPatternStrokes';
import { foldedFlatPaperScene } from '../../cp-workspace/folded/foldedFlatScene';
import { StackHitIndex, type StackHit } from '../../cp-workspace/picking/stackHitIndex';
import type { UserBounds } from '../../cp-workspace/renderer/camera';
import { readCssVarColor } from '../../cp-workspace/renderer/cssColor';
import type { FillGeometry, Rgba } from '../../cp-workspace/renderer/types';
import type { PaperLook } from '../../cp-workspace/surface/PaperPane';
import type { LayerOrderSessionStatus } from '../dialog/useLayerOrderSession';
import type { FaceLetters, LayerFace } from '../engine/faceIndex';
import type { LayerSide } from '../engine/layerOrderEngine';
import {
  foldedOutlinesOf,
  foldedPaneToUser,
  foldedPivot,
  PANE_USER_PER_UNIT,
  paneFacesOf,
  paneTurnDeg,
  patternPaneBounds,
  patternPaneLines,
  patternPaneToUser,
  restackedScene,
  ringsBounds,
  stackDepth,
  xrayFaceAlpha,
} from './layerPaneFigure';
import type { LayerPaneHit, LayerPaneId } from './layerPaneInput';
import { foldedLabelSpots, paneLetters, type LayerLabelSpots, type LayerPaneLabel } from './layerPaneLabels';
import {
  foldedPanePaint,
  NO_FACE_MARKS,
  paneTintFills,
  patternPanePaint,
  type LayerFaceMarks,
  type LayerPaneInks,
  type LayerPaneInk,
  type LayerPanesStacks,
  type LayerPanesView,
} from './layerPaneMarks';

/** A ring a pane draws over everything, inside its face: its face's ring in the pane's frame. */
export interface LayerPaneRingMark {
  readonly face: LayerFace;
  readonly ring: readonly Point[];
  readonly ink: LayerPaneInk;
  readonly widthPx: number;
}

/** What one pane is handed. */
export interface LayerPaneChannels {
  readonly id: LayerPaneId;
  /** The paper, built through {@link modelToSvg}; null on the crease pattern, which draws creases. */
  readonly scene: PaperScene | null;
  readonly look: PaperLook;
  readonly modelToSvg: (point: Point) => Point;
  readonly creases: CpPatternStrokes | null;
  /** Tints under the creases: the crease pattern's. */
  readonly underFills: FillGeometry | null;
  /** Tints over the paper: the folded figure's. */
  readonly fills: FillGeometry | null;
  /** The cells a press is tested against, in the pane's frame. */
  readonly stacks: StackHitIndex | null;
  readonly hitTest: (at: Point, radii: unknown, stack: StackHit | null) => LayerPaneHit | null;
  /** The faces a pick can take now: the pointer's cursor says so over them. */
  readonly pickable: ReadonlySet<LayerFace>;
  readonly contentBounds: UserBounds | null;
  /** What the content is: the side shown, on the folded pane, so turning it over keeps the view while it shows. */
  readonly keepInViewKey: string | null;
  readonly rings: readonly LayerPaneRingMark[];
  /** The spots fading, in the pane's frame, and which flash they are. */
  readonly flash: { readonly n: number; readonly spots: readonly (readonly Point[])[] } | null;
  readonly labels: readonly LayerPaneLabel[];
  readonly labelSpots: (face: LayerFace) => LayerLabelSpots | null;
  readonly letterOf: (face: LayerFace) => string;
}

const NO_FACES: ReadonlySet<LayerFace> = new Set();

/** What `--face-pick` is when nothing has set it: the dark type's (`applyTheme`'s `FACE_PICK_COLORS`). */
const PICK_FALLBACK: Rgba = [0xa7 / 255, 0x8b / 255, 0xfa / 255, 1];
const DANGER_FALLBACK: Rgba = [0.86, 0.33, 0.36, 1];

/** The marks' colours, resolved against `element`; null until there is one. */
export function useLayerPaneInks(element: Element | null, themeKey: string): LayerPaneInks | null {
  return useMemo(() => {
    if (!element) return null;
    return {
      pick: readCssVarColor(element, '--face-pick', PICK_FALLBACK),
      danger: readCssVarColor(element, '--status-danger', DANGER_FALLBACK),
    };
    // The theme is read off the element: its key is what says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element, themeKey]);
}

/** The side the dialog opens on: the one the host's picture shows. */
export function layerOrderOpeningSide(request: LayerOrderRequest): LayerSide {
  return request.shown?.flipped ? 'back' : 'front';
}

/** The view the dialog opens with: the host's side, X-ray as the host says (D18), Undecided off. */
export function layerOrderOpeningView(request: LayerOrderRequest): LayerPanesView {
  return { side: layerOrderOpeningSide(request), xray: request.look.xray, undecided: false };
}

/** What the session has to draw from, or the request's own until it is open. */
function figureOf(status: LayerOrderSessionStatus, request: LayerOrderRequest) {
  if (status.kind === 'ready') {
    const { scenes } = status.open;
    return { faces: scenes.front ?? scenes.back, scenes };
  }
  return { faces: request.shown ?? null, scenes: null };
}

/** A refusal that names a face marks it on the crease pattern, as its notice names it (D4). */
export function refusalMarks(status: LayerOrderSessionStatus): LayerFaceMarks | null {
  if (status.kind !== 'refused' || status.refusal.code !== 'source_non_convex_face') return null;
  return { ...NO_FACE_MARKS, clash: [status.refusal.face] };
}

function lettersOf(letters: FaceLetters | null): (face: LayerFace) => string {
  return (face) => letters?.letterOf(face) ?? '';
}

function ringMarks(
  rings: readonly { face: LayerFace; ink: LayerPaneInk; widthPx: number }[],
  ringOf: (face: LayerFace) => readonly Point[] | undefined
): LayerPaneRingMark[] {
  return rings.flatMap(({ face, ink, widthPx }) => {
    const ring = ringOf(face);
    return ring && ring.length >= 3 ? [{ face, ring, ink, widthPx }] : [];
  });
}

export interface LayerPaneInputs {
  readonly status: LayerOrderSessionStatus;
  readonly request: LayerOrderRequest;
  /** The face index of the opening (`LayerOrderPanesProps.letters`). */
  readonly letters: FaceLetters | null;
  readonly view: LayerPanesView;
  readonly marks: LayerFaceMarks;
  /** The order on screen, per side: a preview's while one shows; null for the session's own. */
  readonly stacks: LayerPanesStacks | null;
  readonly inks: LayerPaneInks | null;
  /** The element the theme's line inks are read off, for the creases. */
  readonly element: Element | null;
  readonly themeKey: string;
}

/** The crease-pattern pane: Edit's drawing of the source, its faces marked. */
export function useLayerPatternPane({
  status,
  request,
  letters: faceLetters,
  marks,
  inks,
  element,
  themeKey,
}: LayerPaneInputs): LayerPaneChannels {
  const { source, look } = request;
  const figure = figureOf(status, request);
  const facesScene = figure.faces;
  const lines = useMemo(() => patternPaneLines(source), [source]);
  const contentBounds = useMemo(() => patternPaneBounds(source), [source]);
  const creases = useMemo(
    () =>
      element
        ? cpPatternStrokes(lines, element, {
            lineStyle: DEFAULT_ORISTUDIO_CP_LINE_STYLE,
            lineWidth: DEFAULT_ORISTUDIO_CP_LINE_WIDTH,
          })
        : null,
    // The theme is read off the element: its key is what says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, element, themeKey]
  );
  const faces = useMemo(() => (facesScene ? paneFacesOf(facesScene) : null), [facesScene]);
  const index = useMemo(() => {
    if (!faces) return null;
    const cells = faces.pattern.flatMap((ring, face) => (ring.length >= 3 ? [{ ring, face }] : []));
    return {
      faceOf: cells.map((cell) => cell.face),
      hits: new StackHitIndex(cells.map(({ ring, face }) => ({ polygon: ring, faces_top_to_bottom: [face] }))),
    };
  }, [faces]);
  const refused = status.kind === 'refused' ? status.refusal : null;
  const shown = useMemo(() => (refused ? refusalMarks(status) : null) ?? marks, [refused, status, marks]);
  const paint = useMemo(() => patternPanePaint(shown), [shown]);
  const ringOf = useMemo(() => (face: LayerFace) => faces?.pattern[face], [faces]);
  const underFills = useMemo(
    () => (inks && faces ? paneTintFills(paint.tints, inks, ringOf, null) : null),
    [paint, inks, faces, ringOf]
  );
  const letters = useMemo(
    () => (faces ? paneLetters(shown, faces.patternCentroids).labels : []),
    [shown, faces]
  );
  const labelSpots = useMemo(
    () => (face: LayerFace): LayerLabelSpots | null => {
      const at = faces?.patternLabels[face];
      return at ? { visible: true, at: [at] } : null;
    },
    [faces]
  );
  const pickable = useMemo(() => new Set(shown.pickable), [shown.pickable]);
  const letterOf = useMemo(() => lettersOf(faceLetters), [faceLetters]);
  const paperLook = useMemo<PaperLook>(() => ({ style: look.style, policy: look.policy }), [look.style, look.policy]);
  const hitTest = useMemo(
    () =>
      (_at: Point, _radii: unknown, stack: StackHit | null): LayerPaneHit | null => {
        const face = stack && index ? index.faceOf[stack.cell] : undefined;
        return face === undefined ? null : { pane: 'pattern', face, spot: null };
      },
    [index]
  );
  const rings = useMemo(() => ringMarks(paint.rings, ringOf), [paint, ringOf]);
  return {
    id: 'pattern',
    scene: null,
    look: paperLook,
    modelToSvg: patternPaneToUser,
    creases,
    underFills,
    fills: null,
    stacks: index?.hits ?? null,
    hitTest,
    pickable: pickable.size > 0 ? pickable : NO_FACES,
    contentBounds,
    keepInViewKey: null,
    rings,
    flash: null,
    labels: letters,
    labelSpots,
    letterOf,
  };
}

/** The scene the folded pane shows from `side`, stacked in the order on screen. */
function sideScene(
  scenes: { front: OristudioCpFoldedPaperScene | null; back: OristudioCpFoldedPaperScene | null } | null,
  stacks: LayerPanesStacks | null,
  side: LayerSide
): { kernel: OristudioCpFoldedPaperScene; shown: OristudioCpFoldedPaperScene } | null {
  const kernel = scenes?.[side] ?? null;
  if (!kernel) return null;
  return { kernel, shown: restackedScene(kernel, stacks?.[side] ?? null) };
}

/** The folded figure's pane, once the session is open; null before, or with no scene for the side shown. */
export function useLayerFoldedPane({
  status,
  request,
  letters: faceLetters,
  view,
  marks,
  stacks,
  inks,
}: LayerPaneInputs): LayerPaneChannels | null {
  const { look } = request;
  const figure = figureOf(status, request);
  const { side, xray } = view;
  const scenes = figure.scenes;
  const pair = useMemo(() => sideScene(scenes, stacks, side), [scenes, stacks, side]);
  const kernel = pair?.kernel ?? null;
  const shown = pair?.shown ?? null;
  // The turn, about the paper's middle, from the side shown.
  const modelToSvg = useMemo(() => {
    const turn = paneTurnDeg(look.turnDeg, layerOrderOpeningSide(request), side);
    return foldedPaneToUser(turn, kernel ? foldedPivot(kernel) : { x: 0, y: 0 });
  }, [look.turnDeg, request, side, kernel]);
  const scene = useMemo(
    () =>
      shown
        ? foldedFlatPaperScene(shown, {
            // A buried face is never seen, unless the paper is see-through.
            markHidden: !xray,
            toScenePx: (point): ScenePoint => {
              const { x, y } = modelToSvg(point);
              return [x, y];
            },
            scale: PANE_USER_PER_UNIT,
          })
        : null,
    [shown, xray, modelToSvg]
  );
  const paperLook = useMemo<PaperLook>(
    () => ({
      style: look.style,
      policy: look.policy,
      ...(xray && shown ? { faceAlpha: xrayFaceAlpha(stackDepth(shown)) } : {}),
    }),
    [look.style, look.policy, xray, shown]
  );
  // The cells never move with the order: one index per scene.
  const index = useMemo(() => (kernel ? new StackHitIndex(kernel.subfaces) : null), [kernel]);
  const outlines = useMemo(() => (kernel ? foldedOutlinesOf(kernel) : null), [kernel]);
  const contentBounds = useMemo(() => (outlines ? ringsBounds(outlines, modelToSvg) : null), [outlines, modelToSvg]);
  const paint = useMemo(() => (shown ? foldedPanePaint(marks, shown, view) : null), [marks, shown, view]);
  const ringOf = useMemo(() => (face: LayerFace) => outlines?.[face], [outlines]);
  const fills = useMemo(
    () => (paint && inks ? paneTintFills(paint.tints, inks, ringOf, index) : null),
    [paint, inks, ringOf, index]
  );
  const faces = useMemo(() => (figure.faces ? paneFacesOf(figure.faces) : null), [figure.faces]);
  const letters = useMemo(() => (faces ? paneLetters(marks, faces.patternCentroids).labels : []), [marks, faces]);
  const spots = useMemo(
    () => (shown ? foldedLabelSpots(shown, letters.map((label) => label.face)) : null),
    [shown, letters]
  );
  const labelSpots = useMemo(() => (face: LayerFace) => spots?.get(face) ?? null, [spots]);
  const flashSpots = marks.flash?.changed[side];
  const flash = useMemo(() => {
    if (!marks.flash || !kernel || !flashSpots || flashSpots.length === 0) return null;
    const polygons = Array.from(flashSpots, (spot) => kernel.subfaces[spot]?.polygon ?? []).filter((ring) => ring.length >= 3);
    return { n: marks.flash.n, spots: polygons };
  }, [marks.flash, kernel, flashSpots]);
  const pickable = useMemo(() => new Set(marks.pickable), [marks.pickable]);
  const letterOf = useMemo(() => lettersOf(faceLetters), [faceLetters]);
  const hitTest = useMemo(
    () =>
      (_at: Point, _radii: unknown, stack: StackHit | null): LayerPaneHit | null => {
        const face = stack ? shown?.subfaces[stack.cell]?.faces_top_to_bottom[0] : undefined;
        return stack && face !== undefined ? { pane: 'folded', face, spot: stack.cell } : null;
      },
    [shown]
  );
  const rings = useMemo(() => (paint ? ringMarks(paint.rings, ringOf) : []), [paint, ringOf]);
  if (!shown) return null;
  return {
    id: 'folded',
    scene,
    look: paperLook,
    modelToSvg,
    creases: null,
    underFills: null,
    fills,
    stacks: index,
    hitTest,
    pickable: pickable.size > 0 ? pickable : NO_FACES,
    contentBounds,
    keepInViewKey: side,
    rings,
    flash,
    labels: letters,
    labelSpots,
    letterOf,
  };
}
