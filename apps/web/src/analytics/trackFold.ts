import { ANALYTICS_EVENTS, bucketCount, FOLD_CHOICE_COUNT_BUCKETS } from './events';
import type { FoldChoiceKind, FoldStepAddedOpKind, FoldStepLayerScope, FoldStepVia } from './events';
import { track } from './runtime';

/**
 * A step committed from the Fold canvas (plan D18). Hand-placed: a commit is
 * the session's verb, reached from the tool window, Enter and the chooser,
 * none of which dispatches a `MENU_ACTION_ID`. A turn or a rotation takes no
 * layers and locates no line, so it carries `op_kind` alone.
 */
export function trackFoldStepAdded(
  opKind: FoldStepAddedOpKind,
  located?: { layerScope: FoldStepLayerScope; via: FoldStepVia }
): void {
  track(
    ANALYTICS_EVENTS.foldStepAdded,
    located ? { op_kind: opKind, layer_scope: located.layerScope, via: located.via } : { op_kind: opKind }
  );
}

/** A refusal shown to the folder, by the engine's stable code: never a face, a vertex or a line. */
export function trackFoldRefused(code: string): void {
  track(ANALYTICS_EVENTS.foldRefused, { code });
}

/** The engine offered more than one answer to choose between: which kind, and how many, bucketed. */
export function trackFoldChoiceOffered(kind: FoldChoiceKind, count: number): void {
  track(ANALYTICS_EVENTS.foldChoiceOffered, {
    kind,
    count_bucket: bucketCount(count, FOLD_CHOICE_COUNT_BUCKETS),
  });
}
