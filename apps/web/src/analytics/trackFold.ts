import type { LayerSpreadOptions } from '../cp-workspace/folded/foldedLayerSpread';
import { ANALYTICS_EVENTS, bucketCount, COUNT_BUCKETS, FOLD_CHOICE_COUNT_BUCKETS } from './events';
import type {
  FoldChoiceKind,
  FoldSpreadAction,
  FoldSpreadVia,
  FoldStepAddedOpKind,
  FoldStepExtent,
  FoldStepLayerScope,
  FoldStepRotationAmount,
  FoldStepVertexForm,
  FoldStepVia,
} from './events';
import { track } from './runtime';
import { spreadProperties, spreadTracking } from './trackDiagram';

/** What a committed step says beyond its kind: how its line was located, how far it turned, or how it named its lines. */
type FoldStepAddedDetails =
  | { layerScope: FoldStepLayerScope; via: FoldStepVia; extent?: FoldStepExtent; targetCount?: number }
  | { amount: FoldStepRotationAmount }
  | { vertex: FoldStepVertexForm }
  | { repeat: { mode: 'grouped' | 'individual'; count: number } };

/**
 * A step committed from the Fold canvas (plan D18). Hand-placed: a commit is
 * the session's verb, reached from the tool window, Enter and the chooser,
 * none of which dispatches a `MENU_ACTION_ID`. A turn takes no layers and
 * locates no line, so it carries `op_kind` alone, and a rotation how far it
 * turned (`amount`: its preset, or `other` for an exact angle — never the
 * angle); a precrease says how much of its line it creased (`extent`). A
 * vertex fold locates no line either: a petal fold says how its hinge was
 * named (`hinge`), a swivel its form — by its edge at a free vertex, by its
 * edge on a folded edge, or by its rays — and, by its edge, its target
 * (`swivel_form`, `target`), and on a folded edge whether it is the open
 * swivel or the inside one (`swivel_kind`).
 */
export function trackFoldStepAdded(opKind: FoldStepAddedOpKind, details?: FoldStepAddedDetails): void {
  track(ANALYTICS_EVENTS.foldStepAdded, { op_kind: opKind, ...detailProperties(details) });
}

function detailProperties(details: FoldStepAddedDetails | undefined): Record<string, string> {
  if (!details) return {};
  if ('repeat' in details) return { repeat_mode: details.repeat.mode, count_bucket: bucketCount(details.repeat.count, COUNT_BUCKETS) };
  if ('amount' in details) return { amount: details.amount };
  if ('vertex' in details) return vertexFormProperties(details.vertex);
  return {
    layer_scope: details.layerScope,
    via: details.via,
    ...(details.extent ? { extent: details.extent } : {}),
    ...(details.targetCount !== undefined ? { target_count_bucket: bucketCount(details.targetCount, COUNT_BUCKETS) } : {}),
  };
}

/** A vertex fold's form as `fold step added`'s properties: enums only. */
function vertexFormProperties(form: FoldStepVertexForm): Record<string, string> {
  if ('hinge' in form) return { hinge: form.hinge };
  if (form.swivelForm === 'creases') return { swivel_form: 'creases', swivel_kind: form.swivelKind };
  if (form.swivelForm === 'rays') return { swivel_form: 'rays' };
  if (form.swivelForm === 'fold') return { swivel_form: 'fold', target: form.target, swivel_kind: form.swivelKind };
  return { swivel_form: form.swivelForm, target: form.target };
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

/** The engine offered more than one answer to choose between: which kind, and how many, bucketed. */
export function trackFoldChoiceOffered(kind: FoldChoiceKind, count: number): void {
  track(ANALYTICS_EVENTS.foldChoiceOffered, {
    kind,
    count_bucket: bucketCount(count, FOLD_CHOICE_COUNT_BUCKETS),
  });
}

/** Explicit order review, without model data or candidate indices. */
export function trackFoldOrderResolved(result: 'accepted' | 'canceled', source: 'tool' | 'cp', count: number): void {
  track(ANALYTICS_EVENTS.foldOrderResolved, { result, source, count_bucket: bucketCount(count, FOLD_CHOICE_COUNT_BUCKETS) });
}

/** Only the setting's state is reported, never the selected references. */
export function trackFoldFreeLineSnapChanged(enabled: boolean): void {
  track(ANALYTICS_EVENTS.foldFreeLineSnapChanged, { state: enabled ? 'on' : 'off' });
}
