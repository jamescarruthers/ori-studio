/**
 * A compound fold's rows in the Step pane (`FoldStepPane`'s
 * `FoldCompoundPaneRows`), from what the engine reported of it: its blocks,
 * and whether its opening — a closed sink's pocket — and its layer order
 * were stored as choices among several (plan D6) or were the only ones it
 * had.
 *
 * Pure: no React, no store, no engine.
 */
import type { FoldCompoundPaneRows } from '../../components/fold/FoldStepPane';
import type { FoldCompoundReport } from '../engine/foldEngineCompoundWire';

export function foldCompoundPaneRows(report: FoldCompoundReport | undefined | null): FoldCompoundPaneRows | undefined {
  if (!report) return undefined;
  switch (report.family) {
    case 'reverse':
      return {
        blocks: report.blocks.length,
        opening: report.openings.length === 0 ? null : (report.stored.openings?.length ?? 0) > 0 ? 'chosen' : 'only',
        orderChosen: report.stored.order !== undefined,
      };
    // A sink: its blocks — an open sink's one per layer, a closed sink's
    // two — the pocket a closed sink went into, chosen among several or the
    // only one, and its order.
    case 'sink':
      return {
        blocks: report.blocks.length,
        opening: null,
        pocket: report.step !== 'closed' ? null : report.stored.pocket ? 'chosen' : 'only',
        orderChosen: report.stored.order !== undefined && report.stored.order.orders.length > 0,
      };
    // The other families' rows come with their tools: until then the pane
    // shows them as it shows a plain fold.
    case 'crimp':
    case 'tuck':
    case 'vertex':
      return undefined;
  }
}
