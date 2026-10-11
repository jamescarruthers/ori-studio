/**
 * What the Fold canvas shows of the fold being located, from the tools and
 * the session's pipeline: the window's preview (the layers at the line and
 * what the seed asks of them), the faces lit on the folded pane, and the
 * status chips. React-free and store-free, so each reading is tested on its
 * own.
 */
import type { TFunction } from 'i18next';
import type { FoldedFaceInk } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { Rgba } from '../../cp-workspace/renderer/types';
import type { CpToolOptionBounds } from '../../cp-workspace/toolOptions/toolOptionWindow';
import type { FoldFlap, FoldScene } from '../engine/foldEngineWire';
import type { FoldPreview } from '../tools/foldToolWindow';
import type { FoldReverseWindowView } from '../tools/reverse/reverseToolWindow';
import { pocketNames } from '../tools/sink/sinkStep';
import type { FoldSinkWindowView } from '../tools/sink/sinkToolWindow';
import { isSinkRefusalCode } from '../engine/foldEngineSinkWire';
import { isLocated, type FoldToolState } from '../tools/foldToolState';
import { isSinkTool, lineModeLabel, lineModeSteps } from '../tools/foldToolCatalog';
import { boundsOf } from './foldCanvasGeometry';
import type { FoldToolPreview } from './useFoldToolPreview';

const sameFaces = (a: FoldFlap, b: FoldFlap) =>
  a.faces.length === b.faces.length && a.faces.every((face, k) => face === b.faces[k]);

/** Where a flap the engine named elsewhere is among the section's flaps; -1 when it is not there. */
function sectionIndex(section: readonly FoldFlap[], flap: FoldFlap): number {
  return section.findIndex((each) => sameFaces(each, flap));
}

/**
 * The window's preview of a located fold (`foldToolWindow`'s `FoldPreview`):
 * the section, what the seed asks for and what the closure adds, as indices
 * into the section's flaps, and why it does not land; for a woven section,
 * the interval whose stack is shown (`useFoldWovenInterval`). Null while the
 * line is still being located.
 */
export function foldWindowPreview(
  tools: FoldToolState,
  preview: FoldToolPreview,
  interval: number | null = null,
  queued = false
): FoldPreview | null {
  if (!isLocated(tools)) return null;
  const section = preview.section;
  const flaps = section?.flaps ?? [];
  // What the step asks for, which is the tools' seed — or, along a fold
  // being unfolded, the top flap the step builder took for it.
  const op = preview.step?.op;
  const scope = op && 'seed' in op ? op.seed.scope : tools.seed.scope;
  const seed: FoldPreview['seed'] =
    scope === 'flaps' && tools.seed.scope === 'flaps'
      ? tools.seed.flaps.map((flap) => sectionIndex(flaps, flap)).filter((index) => index >= 0)
      : scope === 'all'
        ? 'all'
        : (preview.analysis?.picked ?? []).flatMap((picked) => {
            const flap = preview.analysis?.flaps[picked];
            const index = flap ? sectionIndex(flaps, flap) : -1;
            return index >= 0 ? [index] : [];
          });
  const added = (preview.analysis?.added ?? []).flatMap((index) => {
    const flap = preview.analysis?.flaps[index];
    const at = flap ? sectionIndex(flaps, flap) : -1;
    return at >= 0 ? [at] : [];
  });
  return {
    section,
    interval,
    seed,
    added,
    refused: preview.refused,
    landing: preview.landing,
    acrossLayers: preview.build.status === 'built' && preview.build.acrossLayers === true && !tools.override,
    ...(queued ? { queued } : {}),
  };
}

/**
 * The reverse tool's window view (`reverseToolWindow`): the kind folded and
 * the kinds that land, the ways the tip opens and the orders it leaves, each
 * with the one taken. Absent for every other tool, and while nothing is
 * located.
 */
export function foldReverseWindowView(tools: FoldToolState, preview: FoldToolPreview): FoldReverseWindowView | undefined {
  const reverse = preview.reverse;
  if (tools.tool !== 'inside-reverse' || !reverse || !isLocated(tools)) return undefined;
  const ways = reverse.ways.length;
  const orders = reverse.orders.length;
  return {
    kind: reverse.kind,
    kinds: reverse.kinds,
    known: reverse.asked !== null,
    ways,
    way: ways > 0 ? Math.min(tools.compound.opening, ways - 1) : 0,
    orders,
    order: orders > 0 ? Math.min(tools.compound.order, orders - 1) : 0,
  };
}

/**
 * A sink tool's window view (`sinkToolWindow`): what fits of the point, its
 * pockets and the orders it leaves, each with the one taken, its depth, and
 * an unsink's sunk points. `flipped` is the view's: whether the viewer sees
 * the model's underside, which names the pockets front and back. Absent for
 * every other tool, and while nothing is located.
 */
export function foldSinkWindowView(
  tools: FoldToolState,
  preview: FoldToolPreview,
  flipped: boolean
): FoldSinkWindowView | undefined {
  const sink = preview.sink;
  if (!isSinkTool(tools.tool) || !sink || !isLocated(tools)) return undefined;
  const point = sink.point?.analysis ?? null;
  const open = sink.point?.open?.refusal.code ?? null;
  const names = pocketNames(sink.pockets, flipped);
  return {
    tool: sink.tool,
    known: sink.tool === 'unsink' ? sink.sunk !== null : point !== null,
    openRefusal: open !== null && isSinkRefusalCode(open) ? open : null,
    pocketsFound: point?.pockets.length ?? 0,
    pockets: sink.pockets.length,
    pocket: sink.pocket,
    pocketName: names[sink.pocket] ?? null,
    orders: sink.orders,
    order: sink.order,
    depth: point?.apex
      ? Math.abs(point.line.n[0] * point.apex[0] + point.line.n[1] * point.apex[1] - point.line.d)
      : null,
    sunk: sink.sunk?.points.length ?? 0,
  };
}

/** How strongly the faces a refusal names are tinted over their paper. */
const REFUSED_TINT = 0.32;

/**
 * Where each face is in a scene, by its id: the engine names faces by id in
 * an analysis, a refusal and a section, and the scene lists them in id order
 * (`lineage`), which after a split is no longer the ids themselves.
 */
export function sceneFaceIndex(scene: FoldScene): ReadonlyMap<number, number> {
  return new Map(scene.lineage.map((face, index) => [face.id, index]));
}

/**
 * The folded pane's per-face overrides (plan D11, D12), by the scene's face
 * index: when a fold is refused, the faces the refusal names — a collision's
 * layers, a sliver's face — tinted whole in the danger accent over their
 * paper, never in place of it. The moving set of a fold that lands is lit by
 * `foldMovingTint` instead, cut to the moving side, since the line cuts the
 * faces it moves.
 */
export function refusedFaceInks(
  scene: FoldScene,
  preview: FoldToolPreview,
  danger: Rgba
): ReadonlyMap<number, FoldedFaceInk> | undefined {
  if (!preview.refused) return undefined;
  const index = sceneFaceIndex(scene);
  const [r, g, b] = danger;
  const faces = new Map<number, FoldedFaceInk>();
  for (const id of preview.refused.faces) {
    const at = index.get(id);
    if (at !== undefined) faces.set(at, { tint: [r, g, b, REFUSED_TINT] });
  }
  return faces.size > 0 ? faces : undefined;
}

/** The most layers any point of a state stacks: what the status chip calls its layers. */
export function sceneLayers(scene: FoldScene | null): number {
  if (!scene) return 1;
  return scene.subfaces.reduce((most, cell) => Math.max(most, cell.faces_top_to_bottom.length), 1);
}

/** The words after the folded pane's chip: the line mode and the click in hand, while one is. */
export function foldPromptWords(t: TFunction, tools: FoldToolState): string | null {
  if (tools.tool === 'divide-line') {
    return tools.picks.length === 0 ? t('tools:fold.steps.divide', 'Click an edge or crease to divide it.') : null;
  }
  if (isLocated(tools)) return null;
  const step = lineModeSteps(t, tools.lineMode)[tools.picks.length];
  return step ? `${lineModeLabel(t, tools.lineMode)} · ${step}` : null;
}

/** What the canvas's chooser says of the choice it steps through. */
export function foldChoiceNote(t: TFunction, kind: 'order' | 'opening' | 'root' | 'pocket'): string {
  switch (kind) {
    case 'pocket':
      return t(
        'tools:fold.chooser.pocketNote',
        'The point can sink into more than one pocket between its layers. Step through them, or press Shift+← / Shift+→.'
      );
    case 'root':
      return t('tools:fold.chooser.note', 'This axiom has more than one fold here. Step through them, or press Shift+← / Shift+→.');
    case 'opening':
      return t(
        'tools:fold.chooser.openingNote',
        'The flap opens more than one way: the lit layers stay together. Step through them, or press Shift+← / Shift+→.'
      );
    case 'order':
      return t(
        'tools:fold.chooser.orderNote',
        'The layers can land stacked more than one way. Step through them, or press Shift+← / Shift+→.'
      );
  }
}

/** Where the root chooser frames: round the fold line on the folded pane, or the paper when there is none yet. */
export function chooserBounds(preview: FoldToolPreview, scene: FoldScene | null): CpToolOptionBounds | null {
  const line = preview.action?.line;
  if (line) return boundsOf(line);
  return scene ? boundsOf(scene.subfaces.flatMap((cell) => cell.polygon)) : null;
}
