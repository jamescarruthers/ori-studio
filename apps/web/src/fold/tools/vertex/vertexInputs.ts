/**
 * The clicks each vertex fold takes from the canvas (plan Phase 11, D13), in
 * the registry's vocabulary (`foldToolRegistry`): one `createStepSequenceTool`
 * step per click, each snapped by its {@link FoldStepSnap}.
 *
 * - **Squash**: the flap, a point anywhere on it (`free`: a landmark would sit
 *   on a crease, where no one layer is the flap's). Where its spine lands is
 *   drawn afterwards, by a click on the folded pane (`useFoldCanvasVerbs`).
 * - **Petal fold**: its hinge, as {@link FoldVertexLines.petalHinge} names it
 *   — the precrease across the flap, or its two ends (`point` landmarks, or
 *   with Alt any point), which the fold creases itself — then the flap below
 *   it (`free`): a region the canvas lights as the pointer crosses it, the
 *   part that lifts (`useFoldPetalMarks`).
 * - **Rabbit ear**: the triangle's three corners (`point` landmarks, or with
 *   Alt any point), then the paper that stays put (`free`).
 * - **Swivel**, by its edge (`FoldSwivelEdgeOp`): the pivot (`point`, Alt for
 *   any point) — or a point on a folded edge, near one and away from any
 *   landmark, for the classic swivel whose creases meet on that edge
 *   (`resolveFoldEdgePoint`, `FoldSwivelOnFoldOp`) — the edge that moves — a
 *   raw or folded edge, never a flat crease, which the engine refuses — and
 *   the line it lands on, as {@link FoldVertexLines.swivelTarget} names it: a
 *   crease or an edge, or two points. A swivel stored by its rays still
 *   replays; the tool no longer makes one.
 *
 * Which layer a flap click names is not decided by the click: it depends on
 * the direction (`vertexStep`), which the folder may change afterwards, so the
 * pick keeps where it was clicked.
 *
 * React-free and store-free; literal `t()` keys so the extractor sees them.
 */
import type { TFunction } from 'i18next';
import type { FoldLineBy, FoldVertexToolId } from '../foldToolCatalog';
import type { FoldInputModel, FoldLocateStep } from '../foldToolRegistry';

const FREE: FoldLocateStep = { snap: 'free', slot: null, edges: false };
const POINT: FoldLocateStep = { snap: 'point', slot: null, edges: true };
/** A petal fold's hinge as a crease already there: a precrease, the only kind the fold refolds as its hinge. */
const HINGE: FoldLocateStep = { snap: 'crease-required', slot: null, edges: false, kinds: ['crease'] };
/** A swivel's edge: the paper's raw edge or a folded edge. A flat crease is no edge. */
const EDGE: FoldLocateStep = { snap: 'crease-required', slot: null, edges: true, kinds: ['raw_edge', 'bend'] };
/** The line a swivel lays its edge on: any crease or edge. */
const LINE: FoldLocateStep = { snap: 'crease-required', slot: null, edges: true };

/** How a petal fold's hinge and a swivel's target are named: what the window's control switches. */
export interface FoldVertexLines {
  petalHinge: FoldLineBy;
  swivelTarget: FoldLineBy;
}

export const FOLD_VERTEX_LINES_DEFAULT: FoldVertexLines = { petalHinge: 'crease', swivelTarget: 'crease' };

/** One model per tool and way of naming its line, made once: a model's identity is what a click counter is kept for. */
const SQUASH: FoldInputModel = { steps: [FREE] };
const PETAL: Readonly<Record<FoldLineBy, FoldInputModel>> = {
  crease: { steps: [HINGE, FREE] },
  points: { steps: [POINT, POINT, FREE] },
};
const RABBIT_EAR: FoldInputModel = { steps: [POINT, POINT, POINT, FREE] };
const SWIVEL: Readonly<Record<FoldLineBy, FoldInputModel>> = {
  crease: { steps: [POINT, EDGE, LINE] },
  points: { steps: [POINT, EDGE, POINT, POINT] },
};

/** The clicks a vertex fold collects. */
export function vertexToolInput(tool: FoldVertexToolId, lines: FoldVertexLines = FOLD_VERTEX_LINES_DEFAULT): FoldInputModel {
  switch (tool) {
    case 'squash':
      return SQUASH;
    case 'petal':
      return PETAL[lines.petalHinge];
    case 'rabbit-ear':
      return RABBIT_EAR;
    case 'swivel':
      return SWIVEL[lines.swivelTarget];
  }
}

/** How many clicks name a line by `lineBy`: one crease, or two points. */
export function lineByClicks(lineBy: FoldLineBy): number {
  return lineBy === 'crease' ? 1 : 2;
}

/** The clicks before a swivel's target: its pivot and its edge. */
export const SWIVEL_TARGET_FROM = 2;

/** What a vertex fold's clicks are asked on: a finger has no key to hold for a free point. */
export interface FoldVertexStepsHost {
  coarse: boolean;
  /** The platform's name for Alt. */
  alt: string;
}

/** A petal fold's hinge clicks, then the flap below it: the part that lifts, lit as the pointer crosses it. */
function petalSteps(t: TFunction, hinge: FoldLineBy, coarse: boolean): string[] {
  const ends =
    hinge === 'crease'
      ? [t('tools:fold.vertex.steps.petalHingeCrease', 'Select the hinge crease.')]
      : coarse
        ? [
            t('tools:fold.vertex.steps.petalHingeFirstEndTouch', 'Tap one end of the hinge, where a kite crease meets the flap’s edge.'),
            t('tools:fold.vertex.steps.petalHingeSecondEndTouch', 'Tap its other end, where the other kite crease meets the edge.'),
          ]
        : [
            t('tools:fold.vertex.steps.petalHingeFirstEnd', 'Click one end of the hinge, where a kite crease meets the flap’s edge.'),
            t('tools:fold.vertex.steps.petalHingeSecondEnd', 'Click its other end, where the other kite crease meets the edge.'),
          ];
  return [
    ...ends,
    coarse
      ? t('tools:fold.vertex.steps.petalRegionTouch', 'Tap the flap below the hinge, the part that lifts.')
      : t('tools:fold.vertex.steps.petalRegion', 'Click the flap below the hinge: the part that lifts lights up under the pointer.'),
  ];
}

/** A swivel's pivot, its edge and the line it lands on. */
function swivelSteps(t: TFunction, target: FoldLineBy, coarse: boolean): string[] {
  const onto =
    target === 'crease'
      ? [
          coarse
            ? t('tools:fold.vertex.steps.swivelOntoTouch', 'Tap the line it should land on: a crease or an edge.')
            : t('tools:fold.vertex.steps.swivelOnto', 'Click the line it should land on: a crease or an edge.'),
        ]
      : coarse
        ? [
            t('tools:fold.vertex.steps.swivelOntoFirstTouch', 'Tap a point on the line it should land on.'),
            t('tools:fold.vertex.steps.swivelOntoSecondTouch', 'Tap a second point on that line.'),
          ]
        : [
            t('tools:fold.vertex.steps.swivelOntoFirst', 'Click a point on the line it should land on.'),
            t('tools:fold.vertex.steps.swivelOntoSecond', 'Click a second point on that line.'),
          ];
  return [
    coarse
      ? t('tools:fold.vertex.steps.swivelPivotOrFoldTouch', 'Tap the pivot, or a folded edge for the creases to meet on.')
      : t('tools:fold.vertex.steps.swivelPivotOrFold', 'Click the pivot, or a folded edge for the creases to meet on.'),
    coarse
      ? t('tools:fold.vertex.steps.swivelEdgeTouch', 'Tap the edge that moves: a raw edge or a folded edge.')
      : t('tools:fold.vertex.steps.swivelEdge', 'Click the edge that moves: a raw edge or a folded edge.'),
    ...onto,
  ];
}

/**
 * The clicks a vertex fold takes, one instruction each in click order: the
 * window's numbered steps, and the canvas chip's prompt.
 */
export function vertexToolSteps(
  t: TFunction,
  tool: FoldVertexToolId,
  lines: FoldVertexLines = FOLD_VERTEX_LINES_DEFAULT,
  host: FoldVertexStepsHost = { coarse: false, alt: 'Alt' }
): string[] {
  switch (tool) {
    case 'squash':
      return [
        host.coarse
          ? t('tools:fold.vertex.steps.squashFlapTouch', 'Tap the flap to squash.')
          : t('tools:fold.vertex.steps.squashFlap', 'Click the flap to squash.'),
      ];
    case 'petal':
      return petalSteps(t, lines.petalHinge, host.coarse);
    case 'rabbit-ear':
      // A finger taps: the same steps in its words, as the choose step's are.
      return host.coarse
        ? [
            t('tools:fold.vertex.steps.earFirstCornerTouch', 'Tap the triangle’s first corner.'),
            t('tools:fold.vertex.steps.earSecondCornerTouch', 'Tap its second corner.'),
            t('tools:fold.vertex.steps.earThirdCornerTouch', 'Tap its third corner.'),
            t('tools:fold.vertex.steps.stayerTouch', 'Tap the paper that stays put.'),
          ]
        : [
            t('tools:fold.vertex.steps.earFirstCorner', 'Click the triangle’s first corner.'),
            t('tools:fold.vertex.steps.earSecondCorner', 'Click its second corner.'),
            t('tools:fold.vertex.steps.earThirdCorner', 'Click its third corner.'),
            t('tools:fold.vertex.steps.stayer', 'Click the paper that stays put.'),
          ];
    case 'swivel':
      return swivelSteps(t, lines.swivelTarget, host.coarse);
  }
}
