/**
 * A compound fold's rows in the Step pane (`FoldStepPane`'s
 * `FoldCompoundPaneRows`), from what the engine reported of it: its blocks,
 * and whether its opening and its layer order were stored as choices among
 * several (plan D6) or were the only ones it had.
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
    // A vertex fold's blocks are the paper that turns about the same
    // creases; it has no opening, and its order is stored when chosen.
    case 'vertex':
      return {
        blocks: report.blocks.length,
        opening: null,
        orderChosen: report.stored.completion !== undefined,
        blocksOf: 'vertex',
      };
    // The other families' rows come with their tools: until then the pane
    // shows them as it shows a plain fold.
    case 'crimp':
    case 'tuck':
    case 'sink':
      return undefined;
  }
}
