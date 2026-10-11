import { useEffect, useState } from 'react';
import { reportError } from '../../monitoring';
import { canonicalJson } from '../document/foldDigest';
import type { FoldChoices } from '../document/foldSequenceDocument';
import type {
  FoldCompoundAnalysis,
  FoldCompoundAnalysisOf,
  FoldCompoundFamily,
  FoldEngineCompoundOp,
} from '../engine/foldEngineCompoundWire';
import type { FoldEngineRefused } from '../engine/foldEngineWire';
import type { FoldSessionSurface } from '../session/useFoldSession';

/** A compound op and its choices, as a tool asks about it. */
export interface FoldCompoundAskInput {
  op: FoldEngineCompoundOp;
  choices?: FoldChoices;
}

/** The engine's answer for one ask: its family's, or why it refused. */
export interface FoldCompoundAnswer<F extends FoldCompoundFamily> {
  /** The state and the ask, canonically: an equal ask is the same answer. */
  key: string;
  asked: FoldCompoundAnalysisOf<F> | null;
  refused: FoldEngineRefused | null;
}

/** Whether an answer is the family's a tool asked of: a compound op's answer is always its own family's. */
function ofFamily<F extends FoldCompoundFamily>(
  answer: FoldCompoundAnalysis,
  family: F
): answer is FoldCompoundAnalysisOf<F> {
  return answer.family === family;
}

/**
 * A compound tool's one question to the engine (the compound question,
 * `compoundAnalysis`, D14 tier 2), asked of the state on screen once per ask
 * — the op and its choices, keyed canonically, so an equal ask built anew
 * asks nothing — and its answer while it is still for that ask. A newer ask's
 * answer replaces it; an older one arriving late is dropped. `family` is the
 * family the op's answer is tagged with: any other is dropped, as a stale one
 * is. Null asks nothing.
 */
export function useFoldCompoundAsk<F extends FoldCompoundFamily>(
  session: FoldSessionSurface,
  stateKey: string | null,
  ask: FoldCompoundAskInput | null,
  family: F,
  surface: string
): FoldCompoundAnswer<F> | null {
  const { withCursor } = session;
  const key = ask && stateKey ? `${stateKey}|${canonicalJson(ask)}` : null;
  const [answer, setAnswer] = useState<FoldCompoundAnswer<F> | null>(null);
  useEffect(() => {
    if (!ask || key === null || answer?.key === key) return undefined;
    let current = true;
    const { op, choices } = ask;
    void withCursor((engine, at) => engine.compoundAnalysis(at, op, choices)).then(
      (reply) => {
        if (!current || reply.status !== 'answered') return;
        const value = reply.value;
        if (value.status !== 'ok') setAnswer({ key, asked: null, refused: value });
        else if (ofFamily(value, family)) setAnswer({ key, asked: value, refused: null });
      },
      (error: unknown) => reportError(error, { surface })
    );
    return () => {
      current = false;
    };
    // The ask is read through its key: an equal ask must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCursor, key, answer?.key]);
  return answer && answer.key === key ? answer : null;
}
