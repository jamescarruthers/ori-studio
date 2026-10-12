import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldChoiceOffered } from '../../../analytics';
import { reportError } from '../../../monitoring';
import { canonicalJson } from '../../document/foldDigest';
import type { FoldChoices, FoldCompletionChoice, FoldVertexOp } from '../../document/foldSequenceDocument';
import type { FoldVertexAnalysed } from '../../engine/foldEngineSquashWire';
import type { FoldAxiomCandidate, FoldEngineRefused } from '../../engine/foldEngineWire';
import type { FoldSessionSurface } from '../../session/useFoldSession';
import { isVertexTool } from '../../tools/foldToolCatalog';
import type { FoldToolState } from '../../tools/foldToolState';
import {
  fanCenterScene,
  fanHasNoFourth,
  fanLayerCount,
  fanOpsElsewhere,
  landingFourths,
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
  /** Its answer for the op folded, with the choices made: what its orders are read from. */
  answer: FoldVertexAnalysed | null;
  /** A fan's fourth ray taken, by index into the candidates; null for no fan, none yet, or none that lands. */
  emergent: number | null;
  /**
   * A fan's fourth creases that land, by index into the candidates: the only
   * ones offered (`landingFourths`). Empty for no fan, before the engine has
   * described it, and when none lands.
   */
  fourths: readonly number[];
  /**
   * When none lands with the paper picked to stay: whether one would with
   * other paper staying — what the window offers in its place. Null while
   * that is asked, and whenever one lands.
   */
  elsewhere: boolean | null;
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
 * Whether any of `asks` — a fan with each other region as the paper that
 * stays (`fanOpsElsewhere`) — has a fourth crease that lands: asked of the
 * engine once per set on a state, one after another, stopping at the first
 * that does. Null while asking, and with nothing to ask.
 */
function useFourthElsewhere(
  session: FoldSessionSurface,
  stateKey: string | null,
  asks: readonly FoldVertexOp[]
): boolean | null {
  const { withCursor } = session;
  const key = asks.length > 0 && stateKey ? `${stateKey}|${canonicalJson(asks)}` : null;
  const [answer, setAnswer] = useState<{ key: string; lands: boolean } | null>(null);
  useEffect(() => {
    if (key === null || answer?.key === key) return undefined;
    let current = true;
    void withCursor(async (engine, at) => {
      for (const op of asks) {
        const reply = await engine.compoundAnalysis(at, op);
        if (reply.status === 'ok' && reply.family === 'vertex' && !fanHasNoFourth(reply)) return true;
      }
      return false;
    }).then(
      (reply) => {
        if (current && reply.status === 'answered') setAnswer({ key, lands: reply.value });
      },
      (error: unknown) => reportError(error, { surface: 'fold:vertex' })
    );
    return () => {
      current = false;
    };
    // The asks are read through their key: equal asks must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCursor, key, answer?.key]);
  return answer && answer.key === key ? answer.lands : null;
}

/**
 * A vertex tool's step (plan Phase 11), the reverse tool's `useFoldReverseStep`
 * for the squash, petal fold, rabbit ear and swivel: the clicks asked about
 * (the compound question, `useFoldCompoundAsk`) as a flap, a line or a fan;
 * then, once the folder's choices make it another fold — a squash's spine
 * aimed off its hinge, a fan's fourth ray other than the one asked — asked
 * again as it will be folded, for the orders it leaves. The step is built
 * from those answers with the choices taken
 * (`tools/vertex/vertexStep`, `vertexChosenOp` and `vertexStepFrom`); while an
 * answer is on its way there is no step, so nothing is previewed against a
 * fold the engine has not described. The preview and the commit go through
 * the session as every step's do.
 *
 * A fan none of whose fourth creases lands builds no step at all — nothing
 * is refused for a choice the folder did not make — and the other regions
 * are asked about as the paper that stays, so the window can say whether
 * other paper helps (`elsewhere`).
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
  const { squashTarget, fanLayers, emergent: chosenEmergent, order: chosenOrder } = compound;

  const intent = useMemo<FoldVertexIntent | null>(
    () =>
      enabled && isVertexTool(tool)
        ? { tool, lineMode, picks, candidate, direction: vertexDirection, fanLayers }
        : null,
    [enabled, tool, lineMode, picks, candidate, vertexDirection, fanLayers]
  );
  const taken = useMemo<FoldVertexTaken>(
    () => ({ squashTarget, emergent: chosenEmergent, order: chosenOrder }),
    [squashTarget, chosenEmergent, chosenOrder]
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

  // --- The step: the order taken, of what that answer lists.
  const built = useMemo(
    () => (chosen && answer ? vertexStepFrom(chosen.op, answer, taken) : null),
    [chosen, answer, taken]
  );

  // --- A fan none of whose fourth creases lands with this paper staying:
  // whether one would with other paper, so the window offers what helps.
  const stuck = fanHasNoFourth(firstAnswer);
  const asksElsewhere = useMemo(
    () => (stuck && intent && index && base ? fanOpsElsewhere(intent, index, base) : []),
    [stuck, intent, index, base]
  );
  const elsewhere = useFourthElsewhere(session, stateKey, asksElsewhere);

  // --- What the window and the canvas read beside the step.
  const petal = useMemo(
    () => (intent?.tool === 'petal' && index ? petalLine(intent, index) : null),
    [intent, index]
  );
  const center = intent ? fanCenterScene(intent) : null;
  const layers = center && index ? fanLayerCount(index, center) : 0;

  // Each choice offered is counted once, by what it was offered for: a fan's
  // fourth creases by the ones that land, the only ones offered.
  const offered = useRef<{ emergent: string | null; order: string | null }>({ emergent: null, order: null });
  const fourths = useMemo(() => landingFourths(firstAnswer), [firstAnswer]);
  const candidates = fourths.length;
  const firstKey = first?.key ?? null;
  const orderKey = again ? (second?.key ?? null) : firstKey;
  const orderCount = built?.orders.length ?? 0;
  useEffect(() => {
    if (firstKey !== null && candidates > 1 && offered.current.emergent !== firstKey) {
      offered.current.emergent = firstKey;
      trackFoldChoiceOffered('emergent', candidates);
    }
    if (orderKey !== null && orderCount > 1 && offered.current.order !== orderKey) {
      offered.current.order = orderKey;
      trackFoldChoiceOffered('order', orderCount);
    }
  }, [firstKey, candidates, orderKey, orderCount]);

  if (!intent) return NONE;
  const refused = told ?? first?.refused ?? answerRefused;
  return {
    step: refused || !built ? null : built.step,
    vertex: {
      base: firstAnswer,
      answer,
      emergent: chosen?.emergent ?? null,
      fourths,
      elsewhere: stuck ? elsewhere : null,
      orders: built?.orders ?? [],
      order: built?.order ?? null,
      layers,
      nearPrecrease: petal?.kind === 'missing' ? petal.near : null,
    },
    refused,
  };
}
