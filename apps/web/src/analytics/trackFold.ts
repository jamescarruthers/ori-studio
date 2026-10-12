import type { LayerSpreadOptions } from '../cp-workspace/folded/foldedLayerSpread';
import { ANALYTICS_EVENTS, bucketCount, FOLD_CHOICE_COUNT_BUCKETS } from './events';
import type {
  FoldChoiceKind,
  FoldSpreadAction,
  FoldSpreadVia,
  FoldStepAddedOpKind,
  FoldStepExtent,
  FoldStepLayerScope,
  FoldStepNoteAction,
  FoldStepVia,
} from './events';
import { track } from './runtime';
import { spreadProperties, spreadTracking } from './trackDiagram';

/**
 * A step committed from the Fold canvas (plan D18). Hand-placed: a commit is
 * the session's verb, reached from the tool window, Enter and the chooser,
 * none of which dispatches a `MENU_ACTION_ID`. A turn or a rotation takes no
 * layers and locates no line, so it carries `op_kind` alone; a precrease
 * says how much of its line it creased (`extent`).
 */
export function trackFoldStepAdded(
  opKind: FoldStepAddedOpKind,
  located?: { layerScope: FoldStepLayerScope; via: FoldStepVia; extent?: FoldStepExtent }
): void {
  track(
    ANALYTICS_EVENTS.foldStepAdded,
    located
      ? {
          op_kind: opKind,
          layer_scope: located.layerScope,
          via: located.via,
          ...(located.extent ? { extent: located.extent } : {}),
        }
      : { op_kind: opKind }
  );
}

/** A refusal shown to the folder, by the engine's stable code: never a face, a vertex or a line. */
export function trackFoldRefused(code: string): void {
  track(ANALYTICS_EVENTS.foldRefused, { code });
}

/**
 * A Fold step's layer spread changed, from where, and — when it leaves the
 * layers spread — how, as the Diagram counts a spread (`spreadProperties`):
 * enums and buckets, never a value.
 */
export function trackFoldSpreadChanged(
  action: FoldSpreadAction,
  via: FoldSpreadVia,
  spread: LayerSpreadOptions | null
): void {
  track(ANALYTICS_EVENTS.foldSpreadChanged, {
    action,
    via,
    ...(spread ? spreadProperties(spreadTracking(spread)) : {}),
  });
}

/**
 * A sitting at a Fold step's note changed it (the Step pane's Note field):
 * what its first change did, once per sitting. Never the text, nor which step.
 */
export function trackFoldStepNoteEdited(action: FoldStepNoteAction): void {
  track(ANALYTICS_EVENTS.foldStepNoteEdited, { action });
}

/** The engine offered more than one answer to choose between: which kind, and how many, bucketed. */
export function trackFoldChoiceOffered(kind: FoldChoiceKind, count: number): void {
  track(ANALYTICS_EVENTS.foldChoiceOffered, {
    kind,
    count_bucket: bucketCount(count, FOLD_CHOICE_COUNT_BUCKETS),
  });
}
