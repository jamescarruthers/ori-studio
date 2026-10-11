/**
 * The clicks each vertex fold takes from the canvas (plan Phase 11, D13), in
 * the registry's vocabulary (`foldToolRegistry`): one `createStepSequenceTool`
 * step per click, each snapped by its {@link FoldStepSnap}.
 *
 * - **Squash**: the flap, a point anywhere on it (`free`: a landmark would sit
 *   on a crease, where no one layer is the flap's). Where its spine lands is
 *   drawn afterwards, by a click on the folded pane (`useFoldCanvasVerbs`).
 * - **Petal fold**: its line H, located through the line modes as a fold's
 *   line is — clicked as the precrease it is, or run through its two ends —
 *   then the flap below it (`free`).
 * - **Rabbit ear**: the triangle's three corners (`point` landmarks, or with
 *   Alt any point), then the paper that stays put (`free`).
 * - **Swivel**: the point the creases meet at and a point each of its three
 *   given rays runs toward (`point`, Alt for any point: the swivel's vertex is
 *   free, so it is usually no landmark), then the paper that stays (`free`).
 *
 * Which layer a flap click names is not decided by the click: it depends on
 * the direction (`vertexStep`), which the folder may change afterwards, so the
 * pick keeps where it was clicked.
 *
 * React-free and store-free; literal `t()` keys so the extractor sees them.
 */
import type { TFunction } from 'i18next';
import { lineModeSteps, type FoldLineModeId, type FoldVertexToolId } from '../foldToolCatalog';
import type { FoldInputModel, FoldLocateStep } from '../foldToolRegistry';

const FREE: FoldLocateStep = { snap: 'free', slot: null, edges: false };
const POINT: FoldLocateStep = { snap: 'point', slot: null, edges: true };

/**
 * The line modes a petal fold's H is meant to be located by: the precrease
 * itself, the line through its two ends, or a line drawn through them. The
 * tool starts on the precrease when another is in hand (`selectTool`); any
 * other stays offered, since its line may be a precrease too.
 */
export const PETAL_LINE_MODES: ReadonlySet<FoldLineModeId> = new Set<FoldLineModeId>(['crease', 'axiom-1', 'free']);

/** One model per tool (per line model, for the petal fold), made once: a model's identity is what a click counter is kept for. */
const SQUASH: FoldInputModel = { steps: [FREE] };
const RABBIT_EAR: FoldInputModel = { steps: [POINT, POINT, POINT, FREE] };
const SWIVEL: FoldInputModel = { steps: [POINT, POINT, POINT, POINT, FREE] };
const PETAL = new WeakMap<FoldInputModel, FoldInputModel>();

function petalInput(line: FoldInputModel): FoldInputModel {
  let model = PETAL.get(line);
  if (!model) {
    model = { steps: [...line.steps, FREE] };
    PETAL.set(line, model);
  }
  return model;
}

/**
 * The clicks a vertex fold collects. A petal fold's begin with `line`, the
 * clicks its line mode locates H by (the registry's `lineModeInput`).
 */
export function vertexToolInput(tool: FoldVertexToolId, line: FoldInputModel): FoldInputModel {
  switch (tool) {
    case 'squash':
      return SQUASH;
    case 'petal':
      return petalInput(line);
    case 'rabbit-ear':
      return RABBIT_EAR;
    case 'swivel':
      return SWIVEL;
  }
}

/** The clicks that locate a petal fold's H, in its own words where the line mode is one H is meant for. */
function petalLineSteps(t: TFunction, mode: FoldLineModeId): string[] {
  switch (mode) {
    case 'crease':
      return [t('tools:fold.vertex.steps.petalCrease', 'Click the precreased line H the flap lifts along.')];
    case 'axiom-1':
    case 'free':
      return [
        t('tools:fold.vertex.steps.petalFirstEnd', 'Click one end of the line H the flap lifts along.'),
        t('tools:fold.vertex.steps.petalSecondEnd', 'Click its other end.'),
      ];
    default:
      return lineModeSteps(t, mode);
  }
}

/** The clicks a vertex fold takes, one instruction each in click order: the window's numbered steps. */
export function vertexToolSteps(t: TFunction, tool: FoldVertexToolId, mode: FoldLineModeId): string[] {
  switch (tool) {
    case 'squash':
      return [t('tools:fold.vertex.steps.squashFlap', 'Click the flap to squash.')];
    case 'petal':
      return [
        ...petalLineSteps(t, mode),
        t('tools:fold.vertex.steps.petalFlap', 'Click the flap below that line.'),
      ];
    case 'rabbit-ear':
      return [
        t('tools:fold.vertex.steps.earFirstCorner', 'Click the triangle’s first corner.'),
        t('tools:fold.vertex.steps.earSecondCorner', 'Click its second corner.'),
        t('tools:fold.vertex.steps.earThirdCorner', 'Click its third corner.'),
        t('tools:fold.vertex.steps.stayer', 'Click the paper that stays put.'),
      ];
    case 'swivel':
      return [
        t('tools:fold.vertex.steps.swivelVertex', 'Click the point the creases meet at.'),
        t('tools:fold.vertex.steps.swivelFirstRay', 'Click a point the first crease runs toward.'),
        t('tools:fold.vertex.steps.swivelSecondRay', 'Click a point the second crease runs toward.'),
        t('tools:fold.vertex.steps.swivelThirdRay', 'Click a point the third crease runs toward.'),
        t('tools:fold.vertex.steps.stayer', 'Click the paper that stays put.'),
      ];
  }
}
