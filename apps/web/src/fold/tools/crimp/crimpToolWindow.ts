/**
 * The crimp tool's window (plan Phase 11, D14), as the plain descriptor the
 * one Fold window renderer draws (`components/fold/FoldToolWindow`), in the
 * reverse tool's shape (`tools/reverse/reverseToolWindow`).
 *
 * It locates two lines, the second after the first:
 *
 * - **the first line**, ℓ1 nearer the body, in any line mode — its steps,
 *   then the second line's, numbered as one list, the one in hand marked,
 *   with what snaps for the line being located;
 * - **the second line**, ℓ2 nearer the tip: a free line or an existing
 *   crease, chosen beside the first line's mode.
 *
 * Then, previewing: **the kind**, Inside or Outside on both lines, as the
 * reverse fold's segmented control — the one that lands taken, the other
 * offered only when it lands too; **the tip side**, Swap, and **the flaps**
 * to crimp, through the layer picker and the chips; **the opening** and
 * **the layer order** when the engine lists several, a stepper each; a
 * refusal in the folder's words with the engine's fixes; Cancel and the
 * crimp.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import { FOLD_CRIMP_KINDS } from '../../document/foldSequenceDocument';
import {
  FOLD_SECOND_LINE_MODES,
  crimpFirstLineSteps,
  foldCrimpKindLabel,
  foldToolLabel,
  lineModeLabel,
  secondLineModeLabel,
  secondLineSteps,
  type FoldSecondLineModeId,
} from '../foldToolCatalog';
import { lineModeInput } from '../foldToolRegistry';
import {
  layersSection,
  lineModeNotes,
  lineModeSelect,
  queuedNote,
  settingsMeta,
  type FoldSecondLineSelect,
  type FoldToolHost,
  type FoldToolInstructions,
  type FoldToolWindowModel,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
} from '../foldToolWindow';
import { foldRefusalNotice, sectionFlapNames } from '../refusalNotice';
import { choiceStepper, type FoldReverseControls, type FoldReverseWindowView } from '../reverse/reverseToolWindow';

const isSecondLineMode = (id: string): id is FoldSecondLineModeId =>
  (FOLD_SECOND_LINE_MODES as readonly string[]).includes(id);

/** What the kinds that land say, in a line: only one fits, or both. */
function kindNote(t: TFunction, crimp: FoldReverseWindowView): string | null {
  if (!crimp.known || (crimp.ways > 1 && crimp.kinds.length === 0)) return null;
  if (crimp.kinds.length === 2) {
    return t('tools:fold.crimp.bothFit', 'Both kinds of crimp fit here: choose which way the tip goes.');
  }
  const [only] = crimp.kinds;
  if (only === 'inside') return t('tools:fold.crimp.onlyInside', 'Only the inside crimp fits here.');
  if (only === 'outside') return t('tools:fold.crimp.onlyOutside', 'Only the outside crimp fits here.');
  return null;
}

/** The crimp's kind and its listed choices, in the reverse fold's controls. */
function crimpControls(
  t: TFunction,
  crimp: FoldReverseWindowView,
  verbs: FoldToolWindowVerbs,
  readOnly: boolean
): FoldReverseControls {
  const lands = (kind: 'inside' | 'outside') => !crimp.known || crimp.kinds.length === 0 || crimp.kinds.includes(kind);
  return {
    kind: {
      label: t('tools:fold.reverse.kind', 'Kind'),
      value: crimp.kind,
      options: FOLD_CRIMP_KINDS.map((value) => ({
        value,
        short: value === 'inside' ? t('tools:fold.reverse.inside', 'Inside') : t('tools:fold.reverse.outside', 'Outside'),
        label: foldCrimpKindLabel(t, value),
        disabled: !lands(value),
        reason: lands(value) ? null : t('tools:fold.reverse.doesNotFit', 'Does not fit here'),
      })),
      disabled: readOnly,
      note: kindNote(t, crimp),
      set: (kind) => verbs.setReverseKind?.(kind),
    },
    opening: choiceStepper(t, t('tools:fold.reverse.opening', 'Opening'), crimp.way, crimp.ways, verbs.stepOpening, readOnly),
    order: choiceStepper(t, t('tools:fold.reverse.order', 'Layer order'), crimp.order, crimp.orders, verbs.stepOrder, readOnly),
  };
}

/**
 * How to locate both lines, step by step, then pick and commit; what snaps,
 * for the line in hand. `action` is the commit button's name.
 *
 * What a crimp is comes first, above the steps (owner feedback, 2026-10-11):
 * which line is which, and which end is the tip, is what a first-time folder
 * cannot guess. A first line located by an axiom — the mode a fold before
 * left in hand, its steps an axiom's — says so, and how to draw it instead.
 */
export function crimpLocateInstructions(
  t: TFunction,
  view: FoldToolWindowView,
  action: string,
  host: FoldToolHost
): FoldToolInstructions {
  const second = view.secondLineMode ?? 'free';
  const finish = host.coarse
    ? t('tools:fold.steps.crimpFinishTouch', 'Choose Inside or Outside, then tap {{action}}.', { action })
    : t('tools:fold.steps.crimpFinish', 'Choose Inside or Outside, then press Enter.');
  const items = [...crimpFirstLineSteps(t, view.lineMode), ...secondLineSteps(t, second), finish];
  const onSecond = view.picks >= lineModeInput(view.lineMode).steps.length;
  const byAxiom = view.lineMode !== 'free' && view.lineMode !== 'crease';
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    intro: t(
      'tools:fold.crimp.intro',
      'Folds a flap in along a first line and back out along a second, so its end turns. Draw the first line nearer the body and the second nearer the tip; each runs across the flap.'
    ),
    items,
    current: Math.min(Math.max(0, view.picks), items.length - 1),
    notes: [
      ...(byAxiom && !onSecond
        ? [
            t(
              'tools:fold.crimp.firstLineAxiom',
              'The first line is located by {{mode}}, the line mode in hand. To draw it, choose Free line under First line.',
              { mode: lineModeLabel(t, view.lineMode) }
            ),
          ]
        : []),
      ...lineModeNotes(t, onSecond ? second : view.lineMode, host),
    ],
  };
}

/** The second line's mode, beside the first's. */
export function secondLineSelect(t: TFunction, view: FoldToolWindowView, verbs: FoldToolWindowVerbs): FoldSecondLineSelect {
  return {
    label: t('tools:fold.crimp.secondLine', 'Second line'),
    value: view.secondLineMode ?? 'free',
    options: FOLD_SECOND_LINE_MODES.map((id) => ({ id, label: secondLineModeLabel(t, id) })),
    disabled: view.readOnly !== null,
    set: (id) => {
      if (isSecondLineMode(id)) verbs.setSecondLineMode?.(id);
    },
  };
}

/**
 * What to check and choose once both lines are in, in the order the window
 * shows them: the tip, the kind, the flaps, then the commit — named as a
 * button too, since a stepper pressed last keeps the focus and Enter would
 * press it again.
 */
function previewInstructions(t: TFunction, action: string, host: FoldToolHost, view: FoldToolWindowView): FoldToolInstructions {
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items: [
      t(
        'tools:fold.steps.crimpTip',
        'The end beyond the second line is the tip, which turns: if it is the wrong end, Swap the tip side.'
      ),
      t(
        'tools:fold.steps.crimpKind',
        'Choose Inside to tuck the paper between the lines inside the flap, or Outside to wrap it round the flap; a kind that does not fit is greyed out.'
      ),
      t('tools:fold.steps.crimpLayers', 'Under Layers, leave out any flap that should not crimp.'),
      host.coarse
        ? t('tools:fold.steps.commitTouch', 'Tap {{action}} to fold.', { action })
        : t('tools:fold.steps.commitOrClick', 'Press Enter, or click {{action}}, to fold.', { action }),
    ],
    current: 0,
    notes: view.preview ? queuedNote(t, view.preview) : [],
  };
}

/** The crimp tool's window: locating its two lines, then previewing the crimp (see the module docs). */
export function crimpToolWindow(
  t: TFunction,
  view: FoldToolWindowView,
  verbs: FoldToolWindowVerbs,
  host: FoldToolHost
): FoldToolWindowModel {
  const readOnly = view.readOnly !== null;
  const { preview, crimp } = view;
  if (!preview || !crimp) {
    const title = foldToolLabel(t, 'crimp');
    return {
      phase: 'locate',
      title,
      meta: settingsMeta(t, 2),
      instructions: crimpLocateInstructions(t, view, title, host),
      lineMode: { ...lineModeSelect(t, view, verbs), label: t('tools:fold.crimp.firstLine', 'First line') },
      secondLine: secondLineSelect(t, view, verbs),
      kind: null,
      movingSide: null,
      layers: null,
      refusal: null,
      divide: null,
      footer: null,
    };
  }
  const title = foldCrimpKindLabel(t, crimp.kind);
  const compound = crimpControls(t, crimp, verbs, readOnly);
  const settings = 3 + (compound.opening ? 1 : 0) + (compound.order ? 1 : 0);
  return {
    phase: 'preview',
    title,
    meta: settingsMeta(t, settings),
    instructions: previewInstructions(t, title, host, view),
    lineMode: null,
    kind: null,
    movingSide: {
      label: t('tools:fold.reverse.tipSide', 'Tip side'),
      swapLabel: t('tools:fold.window.swap', 'Swap'),
      shortcut: 'fold.swapSide',
      disabled: readOnly,
      swap: verbs.swapSide,
    },
    layers: preview.section || !preview.refused ? layersSection(t, preview, verbs, readOnly) : null,
    refusal: preview.refused
      ? foldRefusalNotice(
          t,
          preview.refused,
          { kind: 'crimp', readOnly, ...sectionFlapNames(preview.section) },
          verbs
        )
      : null,
    divide: null,
    compound,
    footer: {
      cancel: {
        label: t('tools:fold.window.cancel', 'Cancel'),
        shortcut: 'viewport.cancel',
        disabled: false,
        run: verbs.cancel,
      },
      commit: {
        label: title,
        shortcut: 'fold.commit',
        disabled: readOnly || preview.landing || preview.refused !== null,
        run: verbs.commit,
      },
    },
  };
}
