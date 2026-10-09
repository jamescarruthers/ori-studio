import type { FoldCpOrigin } from '../fold/document/foldSequenceDocument';
import { ANALYTICS_EVENTS } from './events';
import { track } from './runtime';

/** Which Send to Edit a Fold sequence used: the `SendToEditVariant` ids, an enum. */
export type FoldSendToEditAnalyticsVariant = 'plain' | 'precreases-as-aux';

/**
 * A crease pattern became a Fold step (plan D16, D18). `origin` is the step's
 * own closed enum — a format, `sample` or `edit_folded_figure` — never a file
 * name.
 */
export function trackFoldCpImported(origin: FoldCpOrigin): void {
  track(ANALYTICS_EVENTS.foldCpImported, { origin });
}

/** A Fold sequence was sent to Edit, by which variant (plan D10, D18). */
export function trackFoldSequenceSentToEdit(variant: FoldSendToEditAnalyticsVariant): void {
  track(ANALYTICS_EVENTS.foldSequenceSentToEdit, { variant });
}

/** Where Fold steps were sent to the Diagram from: Fold's Send to Diagram, or the Diagram's Fold browser. */
export type FoldSentToDiagramVia = 'fold' | 'diagram_browser';

/** Fold steps became Diagram steps (plan D17), from where, one or many: enums only. */
export function trackFoldStepSentToDiagram(via: FoldSentToDiagramVia, scope: 'one' | 'many'): void {
  track(ANALYTICS_EVENTS.foldStepSentToDiagram, { via, scope });
}
