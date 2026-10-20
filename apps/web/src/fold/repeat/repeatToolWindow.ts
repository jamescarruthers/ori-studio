/**
 * Repeat's window, as the plain descriptor the one Fold window renderer draws
 * (`components/fold/FoldToolWindow`).
 *
 * Repeat folds a range of steps — from the one chosen through the step on
 * screen — again on the other side of a symmetry axis, and previews it as
 * every tool previews its step, from the moment the range and the axis are
 * set (`useFoldRepeatTool`). Its window:
 *
 * - **Start with**: the range's first step, among the ones it can start from;
 * - **Symmetry axis**: the verified symmetry axes of the range's starting
 *   state, by the way they run; or one drawn on the model as a free line,
 *   with Snap to points, taken only when it is one of them;
 * - **Show as individual steps**, how the repeat is added;
 * - the preparation's progress, a layer order to choose when a source
 *   operation has several, and why a repeat stopped, in Repeat's own words
 *   (`repeatWords`);
 * - and its footer: Cancel (Stop while it prepares) and Repeat — or,
 *   rebuilding a saved one, Update from source steps — which adds the
 *   repeat previewed, and prepares it again once a preparation was stopped.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { FoldModelLine } from '../document/foldSequenceDocument';
import { foldReturnEntryLabel } from '../return/foldReturnWords';
import type { FoldPathEntry } from '../sequence/foldSequencePath';
import { foldToolLabel } from '../tools/foldToolCatalog';
import {
  settingsMeta,
  type FoldToolHost,
  type FoldToolWindowModel,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
  type FoldWindowNotice,
} from '../tools/foldToolWindow';
import { repeatAxisName, repeatFailure, type RepeatStop } from './repeatWords';

/** Where a repeat stands, as the window says it. */
export type FoldRepeatPhase =
  /** No range to repeat: the flat sheet is on screen (`sheet`), or the steps are still folding. */
  | { kind: 'unavailable'; why: 'sheet' | 'waiting' }
  /** The starting state's symmetry axes are being found. */
  | { kind: 'loading' }
  /** The repeat is being prepared, or is about to be. */
  | { kind: 'preparing' }
  /** The last preparation was stopped, or an order choice backed out of: nothing is previewed, nothing was added. */
  | { kind: 'stopped' }
  /** No axis for the range, the source changed, the worker failed, or the engine refused the preview. */
  | { kind: 'failed'; stop: RepeatStop }
  /** Stopped at source operation `step` (0-based). */
  | { kind: 'blocked'; step: number; stop: RepeatStop }
  /**
   * Source operation `step` has `count` matching layer orders: `index` the
   * one previewed, null before one is; `waiting` while it lands.
   */
  | { kind: 'choosing'; step: number; count: number; index: number | null; waiting: boolean; failed: boolean }
  /** Prepared and previewed: what the commit adds. `busy` while the preview lands, or the repeat is added. */
  | { kind: 'ready'; busy: boolean };

/** What Repeat's window is drawn from, beside every tool's view. */
export interface FoldRepeatWindowView {
  /** The range and the steps it may start with; null while there is none. */
  range: { entries: readonly FoldPathEntry[]; starts: readonly FoldPathEntry[]; first: string; count: number } | null;
  /** The range's verified axes, by the way they run on screen; null while they are being found. */
  axes: readonly FoldModelLine[] | null;
  /** The one taken; -1 for none. */
  axis: number;
  individual: boolean;
  /** A saved repeat is being rebuilt in place: it is added as it was. */
  rebuilding: boolean;
  phase: FoldRepeatPhase;
  /** The canvas takes a drawn axis now: there are axes to draw, and nothing is being chosen or added. */
  drawing: boolean;
  /**
   * A drawn line that is no verified axis, with the axis nearest it, offered
   * in its place (-1 for none near); null while none was drawn.
   */
  drawn: { nearest: number } | null;
}

/** Repeat's own calls, beside every tool's. */
export interface FoldRepeatWindowVerbs {
  setFirst: (id: string) => void;
  /** Mirror across the axis listed at `index`. */
  setAxis: (index: number) => void;
  setIndividual: (individual: boolean) => void;
  /** A source operation's matching layer orders: step through them, take the one shown, or go back. */
  stepOrder: (delta: number) => void;
  acceptOrder: () => void;
  backFromOrder: () => void;
}

/** Repeat's own controls in the window. */
export interface FoldRepeatControls {
  axis: {
    label: string;
    value: string | null;
    placeholder: string;
    options: readonly { id: string; label: string }[];
    disabled: boolean;
    set: (id: string) => void;
  };
  /** How the repeat is added; null while a saved one is rebuilt, which is added as it was. */
  individual: { label: string; checked: boolean; disabled: boolean; set: (individual: boolean) => void } | null;
  /** How many operations it repeats, and how they are added. */
  summary: string | null;
  /** A source operation's matching layer orders, while one is being chosen (the shared order chooser). */
  order: {
    index: number;
    count: number;
    ready: boolean;
    waiting: boolean;
    failed: boolean;
    step: (delta: number) => void;
    back: () => void;
    accept: () => void;
  } | null;
}

/** How many operations the range repeats, and how they will be added. */
function summaryOf(t: TFunction, count: number, individual: boolean): string {
  return individual
    ? t('panels:fold.repeat.individualCount', {
        count,
        defaultValue_one: 'Repeat {{count}} operation as an individual entry.',
        defaultValue_other: 'Repeat {{count}} operations through the current step as individual entries.',
      })
    : t('panels:fold.repeat.groupCount', {
        count,
        defaultValue_one: 'Repeat {{count}} operation as one numbered step.',
        defaultValue_other: 'Repeat {{count}} operations through the current step as one numbered step.',
      });
}

/** Where the repeat stands, in a note under the steps; null when a refusal says it instead. */
function statusNote(t: TFunction, repeat: FoldRepeatWindowView): string | null {
  const { phase } = repeat;
  switch (phase.kind) {
    case 'unavailable':
      return phase.why === 'sheet'
        ? t('panels:fold.return.empty', 'Fold a step first.')
        : t('panels:fold.repeat.waiting', 'Waiting for the steps to finish folding…');
    case 'loading':
      return t('panels:fold.repeat.findingAxes', 'Finding the symmetry axes of the model before the range…');
    case 'preparing':
      return t('panels:fold.repeat.preparing', 'Preparing repeated folds…');
    case 'stopped':
      return t('panels:fold.repeat.stopped', 'Stopped before the repeat was ready. No steps were added.');
    case 'choosing':
      return t(
        'panels:fold.repeat.choiceAt',
        'Source operation {{number}} has {{count}} matching layer orders. Choose one to continue.',
        { number: phase.step + 1, count: phase.count }
      );
    case 'ready':
      return t('panels:fold.repeat.previewShown', 'The canvas shows the repeated folds and the creases they add.');
    case 'failed':
    case 'blocked':
      return null;
  }
}

/** Why the repeat cannot go on, in the window's dock, with Repeat's advice. */
function repeatNotice(
  t: TFunction,
  repeat: FoldRepeatWindowView,
  axisNames: readonly string[],
  setAxis: (index: number) => void,
  readOnly: boolean
): FoldWindowNotice | null {
  const title = t('panels:fold.repeat.failureTitle', 'Cannot repeat');
  // What a refusal's advice may offer: another axis, and a range starting after the operation that stopped.
  const otherAxis = (repeat.axes?.length ?? 0) > 1;
  const { phase } = repeat;
  // A line just drawn is what the folder last did: its refusal is said over a stopped repeat's.
  if (repeat.drawn && repeat.drawing) return drawnNotice(t, repeat.drawn.nearest, axisNames, setAxis, readOnly);
  if (phase.kind === 'failed') {
    return { code: phase.stop.code, title, text: repeatFailure(t, phase.stop, { otherAxis, laterStart: false }), actions: [] };
  }
  if (phase.kind === 'blocked') {
    const laterStart = repeat.range !== null && phase.step < repeat.range.count - 1;
    return {
      code: phase.stop.code,
      title,
      text: t('panels:fold.repeat.blockedAt', 'Stopped at source operation {{number}}: {{reason}}', {
        number: phase.step + 1,
        reason: repeatFailure(t, phase.stop, { otherAxis, laterStart }),
      }),
      actions: [],
    };
  }
  return null;
}

/** A drawn line that is no verified axis: refused, the nearest axis offered in its place. */
function drawnNotice(
  t: TFunction,
  nearest: number,
  axisNames: readonly string[],
  setAxis: (index: number) => void,
  readOnly: boolean
): FoldWindowNotice {
  return {
    code: 'repeat_axis_drawn',
    title: t('panels:fold.repeat.notAnAxis', 'Not a symmetry axis'),
    text: t(
      'panels:fold.repeat.invalidAxis',
      'This line does not pair matching material and layers in the starting model.'
    ),
    actions:
      nearest >= 0 && axisNames[nearest]
        ? [
            {
              id: 'nearest-axis',
              label: t('panels:fold.repeat.useNearest', 'Use {{axis}}', { axis: axisNames[nearest] }),
              disabled: readOnly,
              run: () => setAxis(nearest),
            },
          ]
        : [],
  };
}

/** Repeat's window: its range, axis and how it is added, where the repeat stands, and its footer. */
export function repeatToolWindow(
  t: TFunction,
  view: FoldToolWindowView,
  repeat: FoldRepeatWindowView,
  verbs: FoldToolWindowVerbs,
  host: FoldToolHost
): FoldToolWindowModel {
  const readOnly = view.readOnly !== null;
  const own = verbs.repeat;
  const title = foldToolLabel(t, 'repeat');
  const { phase, range } = repeat;
  // The range and the axis may change while the repeat prepares, which prepares it anew; not while it is added.
  const adding = (phase.kind === 'choosing' && phase.waiting) || (phase.kind === 'ready' && phase.busy);
  const action = repeat.rebuilding ? t('panels:fold.repeat.update', 'Update from source steps') : t('panels:fold.repeat.label', 'Repeat');
  const axisNames = (repeat.axes ?? []).map((axis) => repeatAxisName(t, axis));
  const choosing = phase.kind === 'choosing' && phase.index !== null ? phase : null;
  const status = statusNote(t, repeat);
  return {
    phase: 'preview',
    title,
    meta: settingsMeta(t, repeat.rebuilding ? 2 : 3),
    instructions: {
      heading: t('tools:fold.window.instructions', 'Instructions'),
      items: [
        t('tools:fold.steps.repeatStart', 'Choose the first step to repeat. The range ends at the step on screen.'),
        host.coarse
          ? t(
              'tools:fold.steps.repeatAxisTouch',
              'Choose the symmetry axis, or draw it on the model: tap where it starts, then where it ends.'
            )
          : t(
              'tools:fold.steps.repeatAxis',
              'Choose the symmetry axis, or draw it on the model: click where it starts, then where it ends.'
            ),
        host.coarse
          ? t('tools:fold.steps.repeatCommitTouch', 'Tap {{action}} to add the repeated folds.', { action })
          : t('tools:fold.steps.repeatCommit', 'Press Enter to add the repeated folds.'),
      ],
      // The range and the axis are set from the start: both choices are optional.
      current: repeat.axis < 0 ? 1 : 2,
      notes: status ? [status] : [],
    },
    lineMode: null,
    kind: null,
    movingSide: null,
    layers: null,
    refusal: repeatNotice(t, repeat, axisNames, own?.setAxis ?? (() => {}), readOnly),
    divide: null,
    steps: range
      ? {
          label: t('panels:fold.repeat.from', 'Start with'),
          value: range.first,
          options: range.starts.map((entry) => ({ id: entry.id ?? entry.key, label: foldReturnEntryLabel(t, entry, range.entries) })),
          disabled: readOnly || adding || choosing !== null,
          set: (id) => own?.setFirst(id),
        }
      : null,
    repeat: {
      axis: {
        label: t('panels:fold.repeat.axis', 'Symmetry axis'),
        value: repeat.axis >= 0 ? String(repeat.axis) : null,
        placeholder: t('panels:fold.repeat.chooseAxis', 'Choose symmetry axis'),
        options: axisNames.map((label, index) => ({ id: String(index), label })),
        disabled: readOnly || adding || choosing !== null || axisNames.length === 0,
        set: (id) => {
          const index = Number(id);
          if (Number.isInteger(index) && index >= 0 && index < axisNames.length) own?.setAxis(index);
        },
      },
      individual: repeat.rebuilding
        ? null
        : {
            label: t('panels:fold.repeat.individual', 'Show as individual steps'),
            checked: repeat.individual,
            disabled: readOnly || adding,
            set: (individual) => own?.setIndividual(individual),
          },
      summary: range && !repeat.rebuilding ? summaryOf(t, range.count, repeat.individual) : null,
      order: choosing
        ? {
            index: choosing.index ?? 0,
            count: choosing.count,
            ready: !choosing.waiting && !choosing.failed && !readOnly,
            waiting: choosing.waiting,
            failed: choosing.failed,
            step: (delta) => own?.stepOrder(delta),
            back: () => own?.backFromOrder(),
            accept: () => own?.acceptOrder(),
          }
        : null,
    },
    // The order chooser has its own Back and Use this order.
    footer: choosing
      ? null
      : {
          cancel: {
            label: phase.kind === 'preparing' ? t('panels:fold.repeat.stop', 'Stop') : t('tools:fold.window.cancel', 'Cancel'),
            shortcut: 'viewport.cancel',
            disabled: false,
            run: verbs.cancel,
          },
          // Adds the repeat previewed; once a preparation was stopped, prepares it again.
          commit: {
            label: action,
            shortcut: 'fold.commit',
            disabled: readOnly || !((phase.kind === 'ready' && !phase.busy) || phase.kind === 'stopped'),
            run: verbs.commit,
          },
        },
  };
}
