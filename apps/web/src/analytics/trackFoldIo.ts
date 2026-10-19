import type { FoldCpOrigin } from '../fold/document/foldSequenceDocument';
import { ANALYTICS_EVENTS } from './events';
import { track } from './runtime';

/**
 * A crease pattern became a Fold step (plan D16, D18). `origin` is the step's
 * own closed enum — a format, `sample`, `edit_folded_figure` or `project_cp`
 * (a Collapse from the project's Edit pattern) — never a file name. `action`
 * is `insert` for a new step and `update` for a Collapse updated in place
 * from its source pattern.
 */
export function trackFoldCpImported(origin: FoldCpOrigin, action: 'insert' | 'update' = 'insert'): void {
  track(ANALYTICS_EVENTS.foldCpImported, { origin, action });
}

/** A Fold sequence was sent to Edit (plan D10, D18): there is one Send to Edit, so no property. */
export function trackFoldSequenceSentToEdit(): void {
  track(ANALYTICS_EVENTS.foldSequenceSentToEdit);
}

/** Where Fold steps were sent to the Diagram from: Fold's Send to Diagram, or the Diagram's Fold browser. */
export type FoldSentToDiagramVia = 'fold' | 'diagram_browser';

/** Fold steps became Diagram steps (plan D17), from where, one or many: enums only. */
export function trackFoldStepSentToDiagram(via: FoldSentToDiagramVia, scope: 'one' | 'many'): void {
  track(ANALYTICS_EVENTS.foldStepSentToDiagram, { via, scope });
}
