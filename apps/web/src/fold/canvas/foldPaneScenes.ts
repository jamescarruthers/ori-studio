/**
 * What the Fold canvas's two panes paint, as paper scenes (plan D11): the
 * folded form from the engine's scene, and the crease pattern from its
 * creases. Both go to the renderer through the one shared painter
 * (`paperSceneToFoldedGeometry` with the `fold` policy), so a pen in the
 * user's paper style means on these canvases what it means in every export.
 *
 * - **The folded pane** is the engine's scene through `foldedFlatPaperScene`,
 *   the route Edit's flat figure takes: whole faces in painter's order, folds
 *   in the edge pen, flat creases in the aux pen. A located fold adds its line
 *   in the diagram-crease pen of its direction, over the paper.
 * - **The crease-pattern pane** is the sheet, front up, with every crease in
 *   the pen of what it is: the border in the edge pen, a folded crease in its
 *   (front-relative) fold pen, a flat crease in the aux pen. The creases the
 *   step on show made — or, while a fold is previewed, the creases it would
 *   add — are drawn as its instruction, in the diagram-crease pens (dashed in
 *   the default style: "creases this fold adds").
 *
 * Coordinates: a scene's points are in user space, through
 * `foldUnitToScenePx`, so the folded channel draws them as they are.
 *
 * Pure: no React, no store, no renderer.
 */
import type { Point } from '../../lib/geometry';
import type { PaperItem, PaperLineItem, PaperLineRole, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import { foldedFlatPaperScene, type FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import type { FoldStepPane } from '../animation/foldStepMotion';
import type { FoldDirection } from '../document/foldSequenceDocument';
import type { FoldLetter, FoldScene, FoldSceneCrease } from '../engine/foldEngineWire';
import { applyIsometry, FOLD_USER_PER_UNIT, foldUnitToScenePx, toPoint } from './foldCanvasGeometry';

/** The pane toggles on the viewport toolbar (the design's "Step creases | Precreases"). */
export interface FoldPaneDisplay {
  /** Draw the creases the step on show made as its instruction, in the diagram-crease pens. */
  stepCreases: boolean;
  /** Draw flat creases: precreases, and creases a flap was unfolded along. */
  precreases: boolean;
}

export const FOLD_PANE_DISPLAY_DEFAULT: FoldPaneDisplay = { stepCreases: true, precreases: true };

const ORIGIN: Point = { x: 0, y: 0 };

/** A scene with no flat crease in it: what "Precreases" off hides, on both panes. */
function withoutFlatCreases(scene: PaperScene): PaperScene {
  const items: PaperItem[] = [];
  for (const item of scene.items) {
    if (item.kind === 'line' && item.role === 'aux') continue;
    if (item.kind === 'face' && item.outline === 'aux') {
      const { outline: _aux, ...face } = item;
      items.push(face);
      continue;
    }
    items.push(item);
  }
  return { ...scene, items };
}

/**
 * Where the folded pane shows the scene frame: shifted so the view turns and
 * mirrors the model about the sheet's middle rather than the frame's origin.
 *
 * The engine's view is linear (`View::transform`: "the display places the
 * camera"), so a turn-over takes a square sheet from x ∈ [0, 1] to [−1, 0]
 * and a quarter turn swings it round the corner. Shown as it is, either would
 * leave the camera on empty ground; shifted by `c − V(c)` for the sheet's
 * middle `c`, the model turns over in place, as paper does on a table.
 */
export function foldedDisplayOffset(scene: FoldScene, sheet: readonly (readonly [number, number])[]): Point {
  const xs = sheet.map(([x]) => x);
  const ys = sheet.map(([, y]) => y);
  const middle = xs.length
    ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    : { x: 0.5, y: 0.5 };
  const seen = applyIsometry(scene.view_transform, middle);
  return { x: middle.x - seen.x, y: middle.y - seen.y };
}

const shifted = (offset: Point) => (point: Point): ScenePoint =>
  foldUnitToScenePx({ x: point.x + offset.x, y: point.y + offset.y });

/**
 * Where the folded pane places a state's folded form: `foldedFlatPaperScene`'s
 * options at the pane's display offset. A step's motion is built with the same
 * placement, so its first and last frames are the pane's own pictures.
 */
export function foldedPanePlacement(offset: Point = ORIGIN): FoldedFlatPaperSceneOptions {
  return {
    // The canvas shows what the window shows; a buried face is never seen.
    markHidden: true,
    toScenePx: shifted(offset),
    scale: FOLD_USER_PER_UNIT,
  };
}

/** The folded form of a state, as the folded pane paints it, shifted by the pane's display offset. */
export function foldedPaneScene(scene: FoldScene, display: FoldPaneDisplay, offset: Point = ORIGIN): PaperScene {
  const painted = foldedFlatPaperScene(scene, foldedPanePlacement(offset));
  return display.precreases ? painted : withoutFlatCreases(painted);
}

/**
 * How the folded pane pictures each state of a sheet (`FoldStepPane`): at the
 * state's own display offset, which a turn changes, painted as the pane
 * paints it under its display switches. A step's motion pictures its parent
 * and itself with this, so its first frame is the pane's picture of the
 * parent and its last the pane's of the step — a turn starts where the
 * parent lies, and with Precreases off no frame between draws one.
 */
export function foldedPanePictures(
  sheet: readonly (readonly [number, number])[],
  display: FoldPaneDisplay = FOLD_PANE_DISPLAY_DEFAULT
): FoldStepPane {
  return (scene) => {
    const offset = foldedDisplayOffset(scene, sheet);
    return { place: foldedPanePlacement(offset), scene: foldedPaneScene(scene, display, offset) };
  };
}

/** How far a fold line runs past the paper, as a share of its length: enough to read past the edge. */
const FOLD_LINE_OVERHANG = 0.06;

/** The diagram-crease role a direction is drawn in. */
export function diagramRole(direction: FoldDirection | FoldLetter): PaperLineRole {
  return direction === 'mountain' ? 'diagram-mountain' : 'diagram-valley';
}

function lineItem(
  role: PaperLineRole,
  a: Point,
  b: Point,
  face?: number,
  offset: Point = ORIGIN,
  place: (point: Point) => ScenePoint = shifted(offset)
): PaperLineItem {
  return {
    kind: 'line',
    role,
    a: place(a),
    b: place(b),
    onBoundary: [false, false],
    ...(face !== undefined ? { face } : {}),
    hidden: false,
  };
}

/**
 * A scene with a located fold's line over it, in the diagram-crease pen of
 * its direction as the viewer sees it, run a little past the paper at both
 * ends. `line` is in the scene frame, shown at `offset`; null leaves the
 * scene as it is.
 */
export function withFoldLine(
  scene: PaperScene,
  line: readonly [Point, Point] | null,
  direction: FoldDirection,
  offset: Point = ORIGIN
): PaperScene {
  if (!line) return scene;
  const [a, b] = line;
  const dx = (b.x - a.x) * FOLD_LINE_OVERHANG;
  const dy = (b.y - a.y) * FOLD_LINE_OVERHANG;
  const item = lineItem(diagramRole(direction), { x: a.x - dx, y: a.y - dy }, { x: b.x + dx, y: b.y + dy }, undefined, offset);
  return { ...scene, items: [...scene.items, item] };
}

/** What a crease is drawn as on the crease-pattern pane, or null when the pane leaves it out. */
export function creaseRole(
  crease: FoldSceneCrease,
  { display, step, instruction }: { display: FoldPaneDisplay; step: number; instruction: ReadonlySet<number> | null }
): PaperLineRole | null {
  if (crease.kind === 'border') return 'edge';
  const flat = crease.kind === 'flat';
  // The step's own creases are its instruction: the fold pen of what they
  // are now would say the same line twice in one ink.
  const instructs = instruction ? instruction.has(crease.id) : display.stepCreases && crease.made_at === step && step > 0;
  if (instructs && crease.letter) return diagramRole(crease.letter);
  if (flat) return display.precreases ? 'aux' : null;
  if (crease.letter === 'mountain') return 'mountain';
  if (crease.letter === 'valley') return 'valley';
  // A folded crease always has a letter; one without is drawn as context.
  return display.precreases ? 'aux' : null;
}

export interface CreasePatternPaneOptions {
  display: FoldPaneDisplay;
  /** The sheet's outline, counter-clockwise, in sheet coordinates (`FoldStateSummary.sheet`). */
  sheet: readonly (readonly [number, number])[];
  /** Which step the state is: the creases it made are its own (`made_at`). */
  step: number;
  /**
   * The creases a previewed fold would add (its step summary's `diff.added`,
   * by the landed state's edge ids): drawn as the instruction in place of the
   * step's own. Null when nothing is previewed.
   */
  instruction?: ReadonlySet<number> | null;
  /**
   * Where the sheet goes: a map from sheet coordinates to scene px, and how
   * many scene px the sheet's longer side is. The pane's own by default
   * (`foldUnitToScenePx`); a Diagram step places it at the capture scale.
   */
  place?: { toScenePx: (point: Point) => ScenePoint; sheetPx: number };
  /** The paper's colour: the front's, or the back's (a Diagram step's Front | Back). The front by default. */
  side?: 'front' | 'back';
}

/**
 * The crease pattern of a state, as the crease-pattern pane paints it: the
 * sheet front up, filled with the front's paper — or, asked, the back's,
 * nothing else changed — and its creases in their pens, the border over them
 * so a crease that ends on the edge never breaks the outline
 * (`diagramToPaperScene`'s order).
 */
export function creasePatternPaneScene(scene: FoldScene, options: CreasePatternPaneOptions): PaperScene {
  const { display, step } = options;
  const instruction = options.instruction ?? null;
  const toScenePx = options.place?.toScenePx ?? foldUnitToScenePx;
  const ring: ScenePoint[] = options.sheet.map(([x, y]) => toScenePx({ x, y }));
  const side = options.side ?? 'front';
  const items: PaperItem[] = [{ kind: 'face', face: 0, side, rings: [ring], shade: 1, hidden: false }];
  const border: PaperLineItem[] = [];
  const aux: PaperLineItem[] = [];
  const folds: PaperLineItem[] = [];
  for (const crease of scene.creases) {
    const role = creaseRole(crease, { display, step, instruction });
    if (!role) continue;
    const item = lineItem(role, crease.from, crease.to, 0, ORIGIN, toScenePx);
    if (role === 'edge') border.push(item);
    else if (role === 'aux') aux.push({ ...item, onBoundary: onSheetEnds(crease, options.sheet) });
    else folds.push(item);
  }
  // Context under the folds, the instruction's dashes over both.
  items.push(...aux, ...folds.filter((item) => !isDiagram(item)), ...folds.filter(isDiagram), ...border);
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return {
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
    sheet: options.place?.sheetPx ?? FOLD_USER_PER_UNIT,
    items,
  };
}

function isDiagram(item: PaperLineItem): boolean {
  return item.role === 'diagram-mountain' || item.role === 'diagram-valley';
}

/** Which ends of an aux crease lie on the sheet's edge, where erode pulls them back. */
function onSheetEnds(crease: FoldSceneCrease, sheet: readonly (readonly [number, number])[]): [boolean, boolean] {
  const on = (point: Point) =>
    sheet.some((corner, k) => {
      const next = sheet[(k + 1) % sheet.length]!;
      const a = toPoint(corner);
      const b = toPoint(next);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) return false;
      const cross = ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length;
      return Math.abs(cross) < 1e-9;
    });
  return [on(crease.from), on(crease.to)];
}
