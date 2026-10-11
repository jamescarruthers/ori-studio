/**
 * A vertex fold's step (plan Phase 11, D6): from what the tools picked and
 * what the engine said of the flap, line or fan, to the op and choices a
 * document stores — the vertex folds' `reverseStep`.
 *
 * Two ops are built, each from the one before:
 *
 * - **The asked op** ({@link vertexAskedOp}) is what the engine is asked to
 *   describe first (the compound question): the clicks' sheet anchors, the
 *   direction, a fan's layers — the geometry the folder's choices are made
 *   against. A fan's fourth ray is not known before the engine lists its
 *   candidates, so it is asked with a placeholder ray, and the answer lists
 *   every candidate and which land; a squash is asked with its spine on the
 *   hinge, so its vertex is known wherever the folder aims it.
 * - **The folded op** is the asked one with the choices made: a squash's
 *   spine target ({@link withTarget}), a fan's fourth ray — the folder's,
 *   else the first that lands ({@link emergentToFold}, {@link withEmergent})
 *   — and, for a rabbit ear, its ridge, one of the two the engine lists
 *   ({@link ridgeToFold}, {@link withRidge}): the direction alone leaves the
 *   two orders it decides between (research §5.3).
 *
 * What a step stores is each one's result — a direction, a depth at a sheet
 * point, the completion's FOLD triples — never an index (plan D6).
 *
 * **Which layer a click names** is the one the viewer sees on the side the
 * direction names, at the point clicked: the top for a valley, the bottom for
 * a mountain (the engine's own reading of a squash's flap and a petal fold's
 * petal), and the other side's for the paper that stays. It is found here,
 * from the scene, so a click keeps meaning the same flap when the direction
 * changes.
 *
 * **A petal fold's line H** is located through the line modes, as a fold's
 * line is, and stored as the precrease it is: clicked, or the one lying along
 * the line run through H's two ends ({@link precreaseAlong}). A line no
 * precrease lies along is refused under the engine's own code, offering the
 * precrease nearest it as the landmark when one is near ({@link nearPrecrease}).
 *
 * Pure: no React, no store, no engine.
 */
import type { Point } from '../../../lib/geometry';
import type {
  FoldChoices,
  FoldCompletionChoice,
  FoldDirection,
  FoldModelDirection,
  FoldModelLine,
  FoldSeed,
  FoldVertexOp,
  SheetPoint,
} from '../../document/foldSequenceDocument';
import type { FoldVertexAnalysed, FoldVertexOrders, FoldVertexRidge } from '../../engine/foldEngineSquashWire';
import type { FoldAxiomCandidate, FoldEngineRefused, FoldModelPoint } from '../../engine/foldEngineWire';
import {
  applyIsometry,
  invertIsometry,
  lineThrough,
  sideOf,
  toPair,
  transformLine,
} from '../../canvas/foldCanvasGeometry';
import { foldStackAt, type FoldPick, type FoldPickIndex, type FoldSegmentPick } from '../../canvas/foldPicking';
import { lineModeAxiom, type FoldLineModeId, type FoldVertexToolId } from '../foldToolCatalog';
import { lineModeInput } from '../foldToolRegistry';

/** What the tools have picked for a vertex fold, and every choice made of what the engine lists. */
export interface FoldVertexIntent {
  tool: FoldVertexToolId;
  /** How a petal fold's line H is located. */
  lineMode: FoldLineModeId;
  /** In click order (`vertexInputs`). */
  picks: readonly FoldPick[];
  /** A petal fold's H located by an axiom: the root the engine gave; null until it has. */
  candidate: FoldAxiomCandidate | null;
  /** As the viewer sees it. */
  direction: FoldDirection;
  /** The layers a fan cuts from the direction's side; null for every one. */
  fanLayers: number | null;
}

/** A fan's fourth ray before one is taken: the analysis lists every candidate whatever it is. */
export const PLACEHOLDER_RAY: FoldModelDirection = [1, 0];

/** How far, in model units, a precrease may lie off H's line and still be H. */
const ON_LINE = 1e-6;

/**
 * How far a precrease may lie off H's line, at both ends, to be offered as
 * the landmark H was meant to run along: a hand-drawn line a click's width
 * beside it.
 */
const NEAR_LINE = 0.02;

/** A refusal the tools can tell without the engine, under the engine's own code. */
function refusedAs(refusal: FoldEngineRefused['refusal']): FoldEngineRefused {
  return { status: 'refused', refusal, fixes: [], faces: [], vertices: [] };
}

/** Why a vertex op cannot be built from the clicks: one of them names no paper. */
export function offPaper(point: SheetPoint | null): FoldEngineRefused {
  return refusedAs({ code: 'point_off_paper', ...(point ? { point } : {}) });
}

/** A petal fold's H runs along no precrease: the engine's word for it, before the engine is asked. */
export function lineNotPrecreased(): FoldEngineRefused {
  return refusedAs({ code: 'petal_not_precreased', faces: [], missing: 'line' });
}

/** Which side of the paper a layer is read from: the direction's own, or the far one. */
type Seen = 'near' | 'far';

/**
 * The sheet point, at a point of the folded pane, of the layer the viewer
 * sees there on the direction's side (`near`: the top for a valley) or the
 * other (`far`). Null off the paper.
 */
export function layerSheetPointAt(
  index: FoldPickIndex,
  scene: Point,
  direction: FoldDirection,
  seen: Seen = 'near'
): SheetPoint | null {
  const stack = foldStackAt(index, scene);
  const top = (direction === 'valley') === (seen === 'near');
  const face = top ? stack[0] : stack[stack.length - 1];
  const transform = face === undefined ? undefined : index.scene.face_transforms[face];
  return transform ? toPair(applyIsometry(invertIsometry(transform), scene)) : null;
}

/** Where a pick is on the folded pane's scene frame; null for a segment's. */
function sceneOf(pick: FoldPick | undefined): Point | null {
  if (!pick || pick.kind === 'segment') return null;
  return pick.scene;
}

/** The sheet point a point pick names: a landmark's, or the paper's under a free click. */
function sheetOf(pick: FoldPick | undefined): SheetPoint | null {
  if (!pick || pick.kind === 'segment') return null;
  return pick.sheet;
}

// ---------------------------------------------------------------------------
// A petal fold's line H

/** A precrease, as the pick index lists it, with its ends where the folded form puts them. */
function precreases(index: FoldPickIndex): FoldSegmentPick[] {
  return index.creasePattern.segments.filter((segment) => segment.segment === 'crease');
}

const middleOf = ({ sheet: [a, b] }: FoldSegmentPick): SheetPoint => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

const lengthOf = ({ scene: [a, b] }: FoldSegmentPick) => Math.hypot(b.x - a.x, b.y - a.y);

/** How far a segment's ends lie off a scene line, the farther of the two. */
const offLine = (line: FoldModelLine, { scene: [a, b] }: FoldSegmentPick) =>
  Math.max(Math.abs(sideOf(line, a)), Math.abs(sideOf(line, b)));

/**
 * A sheet point inside a precrease lying along the scene line `line` — the
 * longest, for the steadiest replay: how a petal fold stores its H. Null when
 * no precrease lies along it.
 */
export function precreaseAlong(index: FoldPickIndex, line: FoldModelLine): SheetPoint | null {
  let best: FoldSegmentPick | null = null;
  for (const crease of precreases(index)) {
    if (offLine(line, crease) > ON_LINE) continue;
    if (!best || lengthOf(crease) > lengthOf(best)) best = crease;
  }
  return best ? middleOf(best) : null;
}

/**
 * The precrease nearest the scene line `line`, when one lies within a hand's
 * width of it at both ends: the landmark a petal fold's H was meant to run
 * along (a refusal's fix). Null when none is that near.
 */
export function nearPrecrease(index: FoldPickIndex, line: FoldModelLine): FoldSegmentPick | null {
  let best: { crease: FoldSegmentPick; off: number } | null = null;
  for (const crease of precreases(index)) {
    const off = offLine(line, crease);
    if (off > NEAR_LINE || lengthOf(crease) < NEAR_LINE) continue;
    if (!best || off < best.off) best = { crease, off };
  }
  return best?.crease ?? null;
}

/** H as a petal fold's clicks locate it: a precrease's sheet point, or the scene line no precrease lies along. */
export type FoldPetalLine =
  | { kind: 'crease'; crease: SheetPoint }
  | { kind: 'missing'; sceneLine: FoldModelLine; near: FoldSegmentPick | null };

/** The scene line the H clicks locate under the intent's line mode; null before every one is in. */
function petalSceneLine(intent: FoldVertexIntent, picks: readonly FoldPick[], index: FoldPickIndex): FoldModelLine | null {
  if (lineModeAxiom(intent.lineMode) !== null) {
    return intent.candidate ? transformLine(index.scene.view_transform, intent.candidate.line) : null;
  }
  const [p, q] = picks;
  if (intent.lineMode === 'free') {
    return p?.kind === 'free' && q?.kind === 'free' ? lineThrough(p.scene, q.scene) : null;
  }
  return p?.kind === 'segment' ? lineThrough(p.scene[0], p.scene[1]) : null;
}

/** A petal fold's H, from its line clicks (see the module docs); null before they are all in. */
export function petalLine(intent: FoldVertexIntent, index: FoldPickIndex): FoldPetalLine | null {
  const clicks = lineModeInput(intent.lineMode).steps.length;
  if (intent.picks.length < clicks) return null;
  const picks = intent.picks.slice(0, clicks);
  // A crease clicked is H as it is, whatever kind: the engine says when it is no precrease.
  const [first] = picks;
  if (intent.lineMode === 'crease' && first?.kind === 'segment') return { kind: 'crease', crease: middleOf(first) };
  const sceneLine = petalSceneLine(intent, picks, index);
  if (!sceneLine) return null;
  const crease = precreaseAlong(index, sceneLine);
  return crease ? { kind: 'crease', crease } : { kind: 'missing', sceneLine, near: nearPrecrease(index, sceneLine) };
}

// ---------------------------------------------------------------------------
// A fan's center and layers

/** The incenter of a triangle: its corners weighted by the opposite sides (the engine's `incenter`). */
export function incenter([a, b, c]: readonly [Point, Point, Point]): Point | null {
  const side = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);
  const [la, lb, lc] = [side(b, c), side(a, c), side(a, b)];
  const sum = la + lb + lc;
  if (!(sum > 0)) return null;
  return { x: (la * a.x + lb * b.x + lc * c.x) / sum, y: (la * a.y + lb * b.y + lc * c.y) / sum };
}

/**
 * Where a fan's creases meet, on the folded pane: a rabbit ear's incenter
 * (an isometry keeps it, so the scene's is the model's, carried), a swivel's
 * vertex. Null before the clicks that place it are in.
 */
export function fanCenterScene(intent: Pick<FoldVertexIntent, 'tool' | 'picks'>): Point | null {
  if (intent.tool === 'swivel') return sceneOf(intent.picks[0]);
  if (intent.tool !== 'rabbit-ear') return null;
  const [a, b, c] = intent.picks.slice(0, 3).map(sceneOf);
  return a && b && c ? incenter([a, b, c]) : null;
}

/** How many layers lie at a fan's center: what its layers stepper counts up to. */
export function fanLayerCount(index: FoldPickIndex, center: Point): number {
  return foldStackAt(index, center).length;
}

/**
 * The layers a fan cuts, as the step stores them: every one, or the first
 * `layers` from the direction's side, counted from a sheet point at the
 * center on the first of them. Null when the center is on no paper.
 */
export function fanSeed(
  index: FoldPickIndex,
  center: Point,
  direction: FoldDirection,
  layers: number | null
): FoldSeed | null {
  const count = fanLayerCount(index, center);
  if (count === 0) return null;
  if (layers === null || layers >= count) return { scope: 'all' };
  const at = layerSheetPointAt(index, center, direction, 'near');
  return at ? { scope: 'depth', at, layers: Math.max(1, layers) } : null;
}

// ---------------------------------------------------------------------------
// The ops

/**
 * The op the engine is asked to describe once every click is in (see the
 * module docs); null before then, or a refusal the tools can tell without
 * the engine: a click that names no paper, a petal fold's H along no
 * precrease.
 */
export function vertexAskedOp(intent: FoldVertexIntent, index: FoldPickIndex): FoldVertexOp | FoldEngineRefused | null {
  const { picks, direction } = intent;
  const layer = (pick: FoldPick | undefined, seen: Seen = 'near') => {
    const scene = sceneOf(pick);
    return scene ? layerSheetPointAt(index, scene, direction, seen) : null;
  };
  switch (intent.tool) {
    case 'squash': {
      if (picks.length < 1) return null;
      const flap = layer(picks[0]);
      if (!flap) return offPaper(null);
      return { kind: 'squash', flap, direction };
    }
    case 'petal': {
      const clicks = lineModeInput(intent.lineMode).steps.length;
      if (picks.length < clicks + 1) return null;
      const line = petalLine(intent, index);
      if (!line) return null;
      if (line.kind === 'missing') return lineNotPrecreased();
      const petal = layer(picks[clicks]);
      if (!petal) return offPaper(null);
      return { kind: 'petal', crease: line.crease, petal, direction };
    }
    case 'rabbit-ear':
    case 'swivel': {
      const given = intent.tool === 'rabbit-ear' ? 3 : 4;
      if (picks.length < given + 1) return null;
      const points = picks.slice(0, given).map(sheetOf);
      const stayer = layer(picks[given], 'far');
      const center = fanCenterScene(intent);
      const seed = center ? fanSeed(index, center, direction, intent.fanLayers) : null;
      if (points.some((point) => point === null) || !stayer || !seed) return offPaper(null);
      const [a, b, c, d] = points as SheetPoint[];
      return intent.tool === 'rabbit-ear'
        ? { kind: 'rabbit-ear', corners: [a!, b!, c!], emergent: PLACEHOLDER_RAY, seed, stayer, direction }
        : { kind: 'swivel', vertex: a!, toward: [b!, c!, d!], emergent: PLACEHOLDER_RAY, seed, stayer, direction };
    }
  }
}

/** The fan's fourth ray taken: the folder's while it is listed, else the first that lands, else the one the engine named. */
export function emergentToFold(chosen: number | null, answer: FoldVertexAnalysed): number | null {
  const { analysis, emergents } = answer;
  if (analysis.kind !== 'rabbit-ear' && analysis.kind !== 'swivel') return null;
  const count = analysis.candidates.length;
  if (count === 0) return null;
  if (chosen !== null && chosen >= 0 && chosen < count) return chosen;
  const landing = emergents.findIndex(Boolean);
  return landing >= 0 ? landing : (analysis.emergent ?? 0);
}

/** A rabbit ear's ridge taken, of the two listed: the folder's while it is listed, else the first that lands. */
export function ridgeToFold(chosen: number | null, ridges: readonly FoldVertexRidge[]): number | null {
  if (ridges.length === 0) return null;
  if (chosen !== null && chosen >= 0 && chosen < ridges.length) return chosen;
  const landing = ridges.findIndex((ridge) => ridge.lands);
  return landing >= 0 ? landing : 0;
}

/**
 * The ridges a rabbit ear lands with, by index into those listed: what the
 * canvas's chooser steps through and counts — a ridge that does not land is
 * a choice the window shows disabled, never one a key steps onto.
 */
export function landingRidges(ridges: readonly FoldVertexRidge[]): number[] {
  return ridges.flatMap((ridge, k) => (ridge.lands ? [k] : []));
}

/** The ridge `delta` places from `ridge` along those that land, wrapping round; null while fewer than two land. */
export function steppedRidge(ridges: readonly FoldVertexRidge[], ridge: number | null, delta: number): number | null {
  const landing = landingRidges(ridges);
  if (landing.length < 2) return null;
  const at = Math.max(0, landing.indexOf(ridge ?? -1));
  return landing[(((at + delta) % landing.length) + landing.length) % landing.length]!;
}

/**
 * The asked op with the fan's fourth ray `emergent` taken (an index into the
 * analysis' candidates); the op unchanged for a squash or a petal fold, or
 * when the candidate is not listed.
 */
export function withEmergent(op: FoldVertexOp, answer: FoldVertexAnalysed, emergent: number | null): FoldVertexOp {
  if (op.kind !== 'rabbit-ear' && op.kind !== 'swivel') return op;
  const { analysis } = answer;
  if (analysis.kind !== op.kind || emergent === null) return op;
  const ray = analysis.candidates[emergent];
  return ray ? { ...op, emergent: ray } : op;
}

/** A squash with its spine landing toward `target` (a model-frame direction); the op unchanged for any other fold, or none. */
export function withTarget(op: FoldVertexOp, target: FoldModelDirection | null): FoldVertexOp {
  return op.kind === 'squash' && target ? { ...op, target } : op;
}

/** A rabbit ear with its ridge (research §5.3); the op unchanged for any other fold. */
export function withRidge(op: FoldVertexOp, ridge: FoldVertexRidge | null): FoldVertexOp {
  return op.kind === 'rabbit-ear' && ridge ? { ...op, ridge: ridge.direction } : op;
}

/** The orders a vertex fold leaves for the ridge taken: a ridge's own, or the op's. */
export function ordersOf(answer: FoldVertexAnalysed | null, ridge: FoldVertexRidge | null): FoldVertexOrders | null {
  if (!answer) return null;
  return ridge ? ridge.orders : answer.orders;
}

/** The folder's choices of what the engine lists, by index, and where a squash's spine was aimed. */
export interface FoldVertexTaken {
  squashTarget: FoldModelDirection | null;
  /** A fan's fourth ray; null for the first that lands. */
  emergent: number | null;
  /** A rabbit ear's ridge; null for the first that lands. */
  ridge: number | null;
  /** The layer order, of those listed. */
  order: number;
}

/** The op as it will be folded, before its ridge: the base op with the folder's spine target and fourth ray. */
export interface FoldVertexChosen {
  op: FoldVertexOp;
  /** The fourth ray taken, by index; null for no fan. */
  emergent: number | null;
  /**
   * Whether it is another fold than the one first asked — a spine aimed off
   * the hinge, another fourth ray — whose orders and ridges must be asked of
   * it; otherwise the first answer stands for it.
   */
  again: boolean;
}

/** The base op with the folder's choices made (see {@link FoldVertexChosen}). */
export function vertexChosenOp(base: FoldVertexOp, first: FoldVertexAnalysed, taken: FoldVertexTaken): FoldVertexChosen {
  const emergent = emergentToFold(taken.emergent, first);
  const named =
    first.analysis.kind === 'rabbit-ear' || first.analysis.kind === 'swivel' ? first.analysis.emergent : null;
  return {
    op: withTarget(withEmergent(base, first, emergent), taken.squashTarget),
    emergent,
    again: (base.kind === 'squash' && taken.squashTarget !== null) || (emergent !== null && emergent !== named),
  };
}

/** The step a vertex tool previews and commits, and the choices it was built from. */
export interface FoldVertexBuilt {
  /** The op folded, a rabbit ear's with its ridge; and the completion that picks its order, when it leaves several. */
  step: { op: FoldVertexOp; choices?: FoldChoices };
  ridges: readonly FoldVertexRidge[];
  ridge: number | null;
  orders: readonly FoldCompletionChoice[];
  order: FoldCompletionChoice | null;
}

/**
 * The step from the op as it will be folded and the engine's answer for it:
 * a rabbit ear's ridge, of the two listed, and the order it leaves, of those
 * listed — stored as the completion that picks it (plan D6), whenever the
 * engine lists one (a fold that leaves a choice cannot land without it).
 */
export function vertexStepFrom(chosen: FoldVertexOp, answer: FoldVertexAnalysed, taken: FoldVertexTaken): FoldVertexBuilt {
  const ridges = answer.ridges;
  const ridge = ridgeToFold(taken.ridge, ridges);
  const ridgeTaken = ridge === null ? null : (ridges[ridge] ?? null);
  const orders = ordersOf(answer, ridgeTaken)?.orders ?? [];
  const order = orders[Math.min(Math.max(0, taken.order), orders.length - 1)] ?? null;
  const op = withRidge(chosen, ridgeTaken);
  return { step: { op, ...(order ? { choices: { completion: order } } : {}) }, ridges, ridge, orders, order };
}

/**
 * The candidate pointing most nearly along `direction` — the engine's own
 * reading of a stored ray, the nearest taken (`fan.rs` `nearest`); null with
 * none, or no direction.
 */
export function nearestDirection(candidates: readonly FoldModelPoint[], direction: FoldModelPoint): number | null {
  const length = Math.hypot(direction[0], direction[1]);
  if (!(length > 0)) return null;
  let best: number | null = null;
  let bestCos = -Infinity;
  candidates.forEach(([x, y], k) => {
    const cos = (x * direction[0] + y * direction[1]) / ((Math.hypot(x, y) || 1) * length);
    if (cos > bestCos) {
      bestCos = cos;
      best = k;
    }
  });
  return best;
}

/** The direction from a squash's vertex to a model point: where its spine lands; null on the vertex itself. */
export function squashTargetToward(vertex: FoldModelPoint, at: FoldModelPoint): FoldModelDirection | null {
  const dx = at[0] - vertex[0];
  const dy = at[1] - vertex[1];
  const length = Math.hypot(dx, dy);
  return length > 1e-9 ? [dx / length, dy / length] : null;
}
