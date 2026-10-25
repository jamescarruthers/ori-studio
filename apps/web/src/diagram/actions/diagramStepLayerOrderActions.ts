import type { TFunction } from 'i18next';
import type { LayerOrderAttention } from '../../lib/layerOrder/layerOrderRecord';
import type { DiagramCpRender } from '../document/diagramDocument';

/**
 * Where a Diagram step opens the Layer order dialog
 * (`implementation-plans/layer-order-dialog.md`, row H7, the approved Entry
 * points and States boards): the Step pane's Layer order row — Edit…, and
 * what its note line says (D11) — and the flag in its Picture section, whose
 * action is Review… (D14).
 *
 * Read from the step's saved source alone: the record's constraints and its
 * summary, never the engine (approach 5), so nothing here loads or spawns
 * anything. React-free and store-free; `useDiagramStepLayerOrder` binds it.
 */
export interface DiagramStepLayerOrderState {
  render: DiagramCpRender;
  /** The step's record, as its source keeps it: how many constraints, and its summary; null with none. */
  record: { constraints: number; attention: LayerOrderAttention | null } | null;
  readOnly: boolean;
  /** A capture of the step is running: Edit… waits for it. */
  busy: boolean;
  /** The step's flat fold is its see-through development: no layer order was found for it (D3). */
  seeThrough: boolean;
}

/** One way into the dialog, as a button draws it. */
export interface DiagramStepLayerOrderEntry {
  /** What the button says. */
  label: string;
  /** Its name, said in full where the row's label is not read with it. */
  name: string;
  disabled: boolean;
  /** A capture is running: it does nothing until that lands, but keeps the focus a press gave it. */
  waiting: boolean;
  hint?: string;
  run: () => void;
}

export interface DiagramStepLayerOrderRow {
  edit: DiagramStepLayerOrderEntry;
  /**
   * The row's note line: the constraints the step keeps (D11), or why Edit…
   * can do nothing on a step folded in 3D (D13), which is to be read; null
   * when there is nothing to say.
   */
  note: { text: string; reason: boolean } | null;
}

/** The Picture section's flag: why the step's constraints need a look, and Review…, when it can open. */
export interface DiagramStepLayerOrderFlag {
  sentence: string;
  review: DiagramStepLayerOrderEntry | null;
}

export interface DiagramStepLayerOrderDeps {
  t: TFunction;
  /** Open the dialog on the step: from the row's Edit…, or the flag's Review…. */
  open: (via: 'edit' | 'review') => void;
}

/** Why the dialog cannot open on the step, or nothing when it can. */
function blocker(state: DiagramStepLayerOrderState, t: TFunction): string | undefined {
  if (state.readOnly) {
    return t('panels:diagram.actions.readOnlyHint', 'This diagram was made with a newer Ori Studio and opens read-only');
  }
  if (state.render.mode === 'folded-3d') return t('panels:diagram.layerOrder.needsFlat', 'Layer order works on flat folds');
  if (state.seeThrough) {
    return t('panels:diagram.layerOrder.noOrder', 'Layer order couldn’t be determined for this step');
  }
  return undefined;
}

function entry(
  state: DiagramStepLayerOrderState,
  deps: DiagramStepLayerOrderDeps,
  via: 'edit' | 'review',
  label: string,
  name: string
): DiagramStepLayerOrderEntry {
  const held = blocker(state, deps.t);
  const disabled = held !== undefined;
  const waiting = !disabled && state.busy;
  return {
    label,
    name,
    disabled,
    waiting,
    hint: held ?? (waiting ? deps.t('panels:diagram.actions.capturingHint', 'Its picture is being captured') : undefined),
    run: () => {
      if (!disabled && !waiting) deps.open(via);
    },
  };
}

/**
 * The Step pane's Layer order row's entry and note, for a step shown folded:
 * flat, Edit… after its pager, always there so nothing moves (Entry points);
 * in 3D, Edit… held with its reason on the note line (D13). Null for a step
 * shown any other way, which has no Layer order row.
 */
export function buildDiagramStepLayerOrderRow(
  state: DiagramStepLayerOrderState,
  deps: DiagramStepLayerOrderDeps
): DiagramStepLayerOrderRow | null {
  const { t } = deps;
  const { render, record } = state;
  if (render.mode !== 'folded-flat' && render.mode !== 'folded-3d') return null;
  const edit = entry(
    state,
    deps,
    'edit',
    t('panels:diagram.layerOrder.edit', 'Edit…'),
    t('panels:diagram.layerOrder.editName', 'Edit Layer Order…')
  );
  if (render.mode === 'folded-3d') {
    return {
      edit,
      note: {
        text: t('panels:diagram.layerOrder.needsFlatNote', 'Layer order works on flat folds. This step folds in 3D.'),
        reason: true,
      },
    };
  }
  // The total, flagged or not: the flag says which need a look (States board).
  const note = record
    ? {
        text: t('panels:diagram.layerOrder.constraints', {
          count: record.constraints,
          defaultValue_one: '{{count}} constraint',
          defaultValue_other: '{{count}} constraints',
        }),
        reason: false,
      }
    : null;
  return { edit, note };
}

/**
 * The Picture section's flag for a step whose constraints need a look, from
 * the record's summary (D10, D11): a warning notice with Review…, which opens
 * the dialog on them (D14) while the step is shown folded flat. A step whose
 * creases fold in 3D says its constraints wait, with nothing to review (D13).
 * Null for a step whose record needs nothing, or that has none.
 */
export function buildDiagramStepLayerOrderFlag(
  state: DiagramStepLayerOrderState,
  deps: DiagramStepLayerOrderDeps
): DiagramStepLayerOrderFlag | null {
  const { t } = deps;
  const attention = state.record?.attention;
  if (!attention) return null;
  const { count } = attention;
  if (attention.reason === 'route-3d') {
    return {
      sentence: t('panels:diagram.layerOrder.waiting3d', {
        count,
        defaultValue_one: 'This step folds in 3D now. Its layer constraint is kept for when it folds flat again.',
        defaultValue_other:
          'This step folds in 3D now. Its {{count}} layer constraints are kept for when it folds flat again.',
      }),
      review: null,
    };
  }
  const sentence =
    attention.reason === 'timeout'
      ? t('panels:diagram.layerOrder.timedOut', {
          count,
          defaultValue_one: '{{count}} layer constraint couldn’t be checked in time.',
          defaultValue_other: '{{count}} layer constraints couldn’t be checked in time.',
        })
      : t('panels:diagram.layerOrder.needAttention', {
          count,
          defaultValue_one: '{{count}} layer constraint needs attention since the pattern changed.',
          defaultValue_other: '{{count}} layer constraints need attention since the pattern changed.',
        });
  const review =
    state.render.mode === 'folded-flat'
      ? entry(
          state,
          deps,
          'review',
          t('panels:diagram.layerOrder.review', 'Review…'),
          t('panels:diagram.layerOrder.reviewName', 'Review Layer Constraints…')
        )
      : null;
  return { sentence, review };
}
