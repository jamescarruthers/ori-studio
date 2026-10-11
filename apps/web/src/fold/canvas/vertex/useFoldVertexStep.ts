import { useEffect, useMemo, useRef } from 'react';
import { trackFoldChoiceOffered } from '../../../analytics';
import type { FoldChoices, FoldCompletionChoice, FoldVertexOp } from '../../document/foldSequenceDocument';
import type { FoldVertexAnalysed, FoldVertexRidge } from '../../engine/foldEngineSquashWire';
import type { FoldAxiomCandidate, FoldEngineRefused } from '../../engine/foldEngineWire';
import type { FoldSessionSurface } from '../../session/useFoldSession';
import { isVertexTool } from '../../tools/foldToolCatalog';
import type { FoldToolState } from '../../tools/foldToolState';
import {
  fanCenterScene,
  fanLayerCount,
  petalLine,
  vertexAskedOp,
  vertexChosenOp,
  vertexStepFrom,
  type FoldVertexIntent,
  type FoldVertexTaken,
} from '../../tools/vertex/vertexStep';
import type { FoldPickIndex, FoldSegmentPick } from '../foldPicking';
import { useFoldCompoundAsk } from '../useFoldCompoundAsk';

/** What the vertex tool knows of the fold it is previewing, beside the step. */
export interface FoldVertexPreview {
  /** The engine's first answer — the geometry, every fourth-ray candidate and which land; null until it is in. */
  base: FoldVertexAnalysed | null;
  /** Its answer for the op folded, with the choices made: what its orders and ridges are read from. */
  answer: FoldVertexAnalysed | null;
  /** A fan's fourth ray taken, by index into the candidates; null for no fan, or none yet. */
  emergent: number | null;
  /** A rabbit ear's two ridge options (empty until known), and the one taken. */
  ridges: readonly FoldVertexRidge[];
  ridge: number | null;
  /** The orders the step leaves, when more than one; the one taken. */
  orders: readonly FoldCompletionChoice[];
  order: FoldCompletionChoice | null;
  /** The layers at a fan's center; 0 for no fan. */
  layers: number;
  /** A petal fold's H runs along no precrease: the precrease beside it, when one is near. */
  nearPrecrease: FoldSegmentPick | null;
}

export interface FoldVertexStepAnswer {
  /** What a commit appends: the folded op, and the completion that picks its order; null until it is known. */
  step: { op: FoldVertexOp; choices?: FoldChoices } | null;
  vertex: FoldVertexPreview | null;
  /** Why it cannot be folded before it is previewed: a click off the paper, H along no precrease, the engine's question. */
  refused: FoldEngineRefused | null;
}

const NONE: FoldVertexStepAnswer = { step: null, vertex: null, refused: null };

/**
 * A vertex tool's step (plan Phase 11), the reverse tool's `useFoldReverseStep`
 * for the squash, petal fold, rabbit ear and swivel: the clicks asked about
 * (the compound question, `useFoldCompoundAsk`) as a flap, a line or a fan;
 * then, once the folder's choices make it another fold — a squash's spine
 * aimed off its hinge, a fan's fourth ray other than the one asked — asked
 * again as it will be folded, for the orders it leaves and a rabbit ear's
 * ridges. The step is built from those answers with the choices taken
 * (`tools/vertex/vertexStep`, `vertexChosenOp` and `vertexStepFrom`); while an
 * answer is on its way there is no step, so nothing is previewed against a
 * fold the engine has not described. The preview and the commit go through
 * the session as every step's do.
 */
export function useFoldVertexStep(
  session: FoldSessionSurface,
  index: FoldPickIndex | null,
  tools: FoldToolState,
  candidate: FoldAxiomCandidate | null,
  enabled: boolean
): FoldVertexStepAnswer {
  const state = session.cursor.state;
  const stateKey = state ? `${state.generation}:${state.id}` : null;
  const { tool, lineMode, picks, vertexDirection, compound } = tools;
  const { squashTarget, fanLayers, emergent: chosenEmergent, ridge: chosenRidge, order: chosenOrder } = compound;

  const intent = useMemo<FoldVertexIntent | null>(
    () =>
      enabled && isVertexTool(tool)
        ? { tool, lineMode, picks, candidate, direction: vertexDirection, fanLayers }
        : null,
    [enabled, tool, lineMode, picks, candidate, vertexDirection, fanLayers]
  );
  const taken = useMemo<FoldVertexTaken>(
    () => ({ squashTarget, emergent: chosenEmergent, ridge: chosenRidge, order: chosenOrder }),
    [squashTarget, chosenEmergent, chosenRidge, chosenOrder]
  );

  // --- The geometry, asked once per base op on a state.
  const asked = useMemo(() => (intent && index ? vertexAskedOp(intent, index) : null), [intent, index]);
  const base = asked && 'kind' in asked ? asked : null;
  const told = asked && 'status' in asked ? asked : null;
  const first = useFoldCompoundAsk(session, stateKey, base ? { op: base } : null, 'vertex', 'fold:vertex');
  const firstAnswer = first?.asked ?? null;

  // --- The op as it will be folded, asked again when a choice makes it another fold.
  const chosen = useMemo(
    () => (base && firstAnswer ? vertexChosenOp(base, firstAnswer, taken) : null),
    [base, firstAnswer, taken]
  );
  const again = chosen?.again ?? false;
  const second = useFoldCompoundAsk(
    session,
    stateKey,
    again && chosen ? { op: chosen.op } : null,
    'vertex',
    'fold:vertex'
  );
  const answer = again ? (second?.asked ?? null) : firstAnswer;
  const answerRefused = again ? (second?.refused ?? null) : null;

  // --- The step: the ridge and the order taken, of what that answer lists.
  const built = useMemo(
    () => (chosen && answer ? vertexStepFrom(chosen.op, answer, taken) : null),
    [chosen, answer, taken]
  );

  // --- What the window and the canvas read beside the step.
  const petal = useMemo(
    () => (intent?.tool === 'petal' && index ? petalLine(intent, index) : null),
    [intent, index]
  );
  const center = intent ? fanCenterScene(intent) : null;
  const layers = center && index ? fanLayerCount(index, center) : 0;

  // Each choice offered is counted once, by what it was offered for.
  const offered = useRef<{ emergent: string | null; ridge: string | null; order: string | null }>({
    emergent: null,
    ridge: null,
    order: null,
  });
  const candidates =
    firstAnswer && (firstAnswer.analysis.kind === 'rabbit-ear' || firstAnswer.analysis.kind === 'swivel')
      ? firstAnswer.analysis.candidates.length
      : 0;
  const firstKey = first?.key ?? null;
  const answerKey = again ? (second?.key ?? null) : firstKey;
  const ridgeCount = built?.ridges.length ?? 0;
  const orderCount = built?.orders.length ?? 0;
  const orderKey = answerKey === null ? null : `${answerKey}:${built?.ridge ?? ''}`;
  useEffect(() => {
    if (firstKey !== null && candidates > 1 && offered.current.emergent !== firstKey) {
      offered.current.emergent = firstKey;
      trackFoldChoiceOffered('emergent', candidates);
    }
    if (answerKey !== null && ridgeCount > 1 && offered.current.ridge !== answerKey) {
      offered.current.ridge = answerKey;
      trackFoldChoiceOffered('ridge', ridgeCount);
    }
    if (orderKey !== null && orderCount > 1 && offered.current.order !== orderKey) {
      offered.current.order = orderKey;
      trackFoldChoiceOffered('order', orderCount);
    }
  }, [firstKey, candidates, answerKey, ridgeCount, orderKey, orderCount]);

  if (!intent) return NONE;
  const refused = told ?? first?.refused ?? answerRefused;
  return {
    step: refused || !built ? null : built.step,
    vertex: {
      base: firstAnswer,
      answer,
      emergent: chosen?.emergent ?? null,
      ridges: built?.ridges ?? [],
      ridge: built?.ridge ?? null,
      orders: built?.orders ?? [],
      order: built?.order ?? null,
      layers,
      nearPrecrease: petal?.kind === 'missing' ? petal.near : null,
    },
    refused,
  };
}
