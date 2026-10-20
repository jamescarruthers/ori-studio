import { useMemo } from 'react';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldStateSummary } from '../engine/foldEngineWire';
import { useFoldPath } from '../sequence/useFoldPath';
import { useFoldTools } from '../tools/foldToolState';
import { repeatRange } from './repeatRange';

/** The state before Repeat's range: the flat sheet's (`id` null) or a step's. */
export interface FoldRepeatBaseline {
  id: string | null;
  state: FoldEngineStateHandle;
  summary: FoldStateSummary | null;
}

/**
 * The state the canvas shows while Repeat's axis is chosen or drawn — the
 * state before its range, which the axes are found on and mean something on
 * (`repeatRange`) — while `shown`; null otherwise, and while it has not landed.
 */
export function useFoldRepeatBaseline(shown: boolean): FoldRepeatBaseline | null {
  const first = useFoldTools((state) => state.repeatFirst);
  const { entries, cursor } = useFoldPath(shown);
  return useMemo(() => {
    if (!shown) return null;
    const baseline = repeatRange(entries, cursor, first)?.baseline;
    const state = baseline?.session.state;
    return baseline && state ? { id: baseline.id, state, summary: baseline.session.summary } : null;
  }, [shown, entries, cursor, first]);
}
