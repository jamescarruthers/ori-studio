/**
 * The Fold tool window (plan D14), as a plain descriptor its one renderer
 * draws (`components/fold/FoldToolWindow`) — Simulate's `tools/actions.ts` →
 * `SimulatorToolWindow` shape.
 *
 * A fold tool's window has two phases:
 *
 * - **locate**: the line is being located. Numbered steps for the line mode,
 *   the one in hand marked, what snaps, and the line-mode select.
 * - **preview**: the line is located and the engine has said what it would
 *   move. The V / M / P control, Swap for the moving side, the layers at the
 *   line (the cross-section picker and the flap chips), a refusal with its
 *   fixes, and Cancel / commit.
 *
 * The Divide line's window says how to use it.
 *
 * React-free and store-free: it takes a view and bound verbs and returns data.
 */
import type { TFunction } from 'i18next';
import {
  evaluateOrieditaRatioExpression,
  formatOrieditaRatioHalf,
  formatOrieditaRatioNumber,
  parseOrieditaRatioHalfInput,
  ratioExpressionFromHalves,
  ratioHalvesFromExpression,
} from '../../lib/oristudioCpToolSettings';
import { FOLD_MARK_MAX_PARTS } from '../document/foldSequenceDocument';
import type { FoldCrossSection } from '../engine/foldEngineWire';
import {
  flapNumbers,
  foldFlapChips,
  foldLayersSummary,
  foldSectionPicker,
  isWoven,
  type FoldFlapChip,
  type FoldSectionPickerModel,
} from './crossSection';
import {
  FOLD_KINDS,
  FOLD_LINE_MODES,
  foldToolLabel,
  isFoldKind,
  isFoldLineMode,
  lineModeLabel,
  lineModeSteps,
  type FoldKind,
  type FoldLineModeId,
  type FoldShortcutId,
} from './foldToolCatalog';
import type { FoldRailVerbs, FoldToolsView } from './foldRailGroups';
import type { FoldDivideSettings } from './foldToolState';
import {
  foldRefusalNotice,
  neededFlaps,
  type FoldFixVerbs,
  type FoldRefused,
  type FoldRefusalNoticeModel,
} from './refusalNotice';

/** A located line under preview: what the engine said about it, tier by tier (D14 Interaction cost). */
export interface FoldPreview {
  /** Tier 2: the section at the line, with its flaps; null while the worker computes it. */
  section: FoldCrossSection | null;
  /** For a woven section, the interval under the pointer; null for the first. */
  interval: number | null;
  /** What the seed asks for: every flap on the moving side, or these (indices into the section's flaps). */
  seed: 'all' | readonly number[];
  /** Tier 3: the flaps the fold moved beyond the seed (`FoldAnalysis.added`), once it has landed. */
  added: readonly number[];
  /** Why it does not land; null while it does, or has not been asked. */
  refused: FoldRefused | null;
  /** Tier 3 is in flight: nothing to commit yet. */
  landing: boolean;
  /** A free line drawn on the crease pattern across layers the folded form puts apart (`FoldBuiltStep.acrossLayers`). */
  acrossLayers?: boolean;
}

export interface FoldToolWindowView extends FoldToolsView {
  /** How many of the line mode's references are picked. */
  picks: number;
  /** The located line, or null while it is being located. */
  preview: FoldPreview | null;
  /**
   * The Divide line's settings, and how many marks the step on screen holds
   * (what Clear marks clears); absent where the surface offers none.
   */
  divide?: { settings: FoldDivideSettings; marks: number };
}

/** What the window can promise on this device. */
export interface FoldToolHost {
  /** A finger: no keys to hold or press, so none are offered. */
  coarse: boolean;
  /** The platform's name for Alt: Option or Alt (`altModifierLabel`). */
  alt: string;
}

/** The window's calls; the store binds them. */
export interface FoldToolWindowVerbs extends Pick<FoldRailVerbs, 'selectTool' | 'selectLineMode'>, FoldFixVerbs {
  swapSide: () => void;
  /** Pick or unpick a flap (an index into the section's flaps). */
  toggleFlap: (flap: number) => void;
  /** The flap under the pointer in the picker or the chips, for the canvas to light; null when none. */
  hoverFlap?: (flap: number | null) => void;
  cancel: () => void;
  commit: () => void;
  /** Change how the next Divide-line mark divides its segment. */
  setDivide?: (divide: Partial<FoldDivideSettings>) => void;
  /** Clear the marks made on the step on screen: one undo entry. */
  clearMarks?: () => void;
}

/** The Divide line's controls: count or exact ratio (Edit's ratio expression), and clearing what is made. */
export interface FoldDivideControls {
  mode: {
    label: string;
    value: FoldDivideSettings['mode'];
    options: readonly { id: FoldDivideSettings['mode']; label: string }[];
    set: (mode: FoldDivideSettings['mode']) => void;
  };
  /** The equal parts, in count mode; null in ratio mode. */
  parts: { label: string; value: number; min: number; max: number; set: (parts: number) => void } | null;
  /** The two halves of the ratio, as Edit's ratio fields spell them, in ratio mode; null in count mode. */
  ratio: {
    left: { label: string; value: string; set: (value: string) => boolean };
    right: { label: string; value: string; set: (value: string) => boolean };
    /** "Computed ratio 1 : 1.414". */
    readout: string;
  } | null;
  clear: { label: string; disabled: boolean; run: () => void };
  disabled: boolean;
}

export interface FoldToolInstructions {
  heading: string;
  items: readonly string[];
  /** The step in hand; past the last, every step is done. */
  current: number;
  /** What snaps, and the keys that change it: a line each, under the steps. */
  notes: readonly string[];
}

export interface FoldLineModeSelect {
  label: string;
  value: FoldLineModeId;
  options: readonly { id: FoldLineModeId; label: string }[];
  disabled: boolean;
  set: (id: string) => void;
}

export interface FoldKindControl {
  label: string;
  /** Null while the tool in hand is no plain fold. */
  value: FoldKind | null;
  options: readonly { value: FoldKind; label: string }[];
  disabled: boolean;
  set: (kind: FoldKind) => void;
}

export interface FoldMovingSideControl {
  label: string;
  swapLabel: string;
  shortcut: FoldShortcutId;
  disabled: boolean;
  swap: () => void;
}

export interface FoldLayersSection {
  title: string;
  /** "2 of 4 layers moving"; null until the section is known. */
  summary: string | null;
  /** Null while the worker computes the section: `finding` says so. */
  picker: FoldSectionPickerModel | null;
  finding: string | null;
  /** How the picker works, under it. */
  help: string;
  chips: readonly FoldFlapChip[];
  disabled: boolean;
  toggle: (flap: number) => void;
  hover: (flap: number | null) => void;
}

export interface FoldWindowButton {
  label: string;
  shortcut: FoldShortcutId;
  disabled: boolean;
  run: () => void;
}

export interface FoldToolWindowModel {
  phase: 'locate' | 'preview' | 'divide';
  title: string;
  meta: string;
  instructions: FoldToolInstructions;
  lineMode: FoldLineModeSelect | null;
  kind: FoldKindControl | null;
  movingSide: FoldMovingSideControl | null;
  layers: FoldLayersSection | null;
  refusal: FoldRefusalNoticeModel | null;
  /** The Divide line's settings; null for every other tool, or where the surface offers none. */
  divide: FoldDivideControls | null;
  footer: { cancel: FoldWindowButton; commit: FoldWindowButton } | null;
}

function divideControls(
  t: TFunction,
  divide: NonNullable<FoldToolWindowView['divide']>,
  verbs: FoldToolWindowVerbs,
  readOnly: boolean
): FoldDivideControls | null {
  const { setDivide, clearMarks } = verbs;
  if (!setDivide || !clearMarks) return null;
  const { settings } = divide;
  const halves = ratioHalvesFromExpression(settings.ratio);
  const computed = evaluateOrieditaRatioExpression(settings.ratio);
  const half = (side: 'left' | 'right') => (value: string) => {
    const parsed = parseOrieditaRatioHalfInput(value);
    if (!parsed) return false;
    setDivide({
      ratio: ratioExpressionFromHalves(side === 'left' ? parsed : halves.left, side === 'right' ? parsed : halves.right),
    });
    return true;
  };
  return {
    mode: {
      label: t('tools:fold.divide.mode', 'Divide'),
      value: settings.mode,
      options: [
        { id: 'count', label: t('tools:fold.divide.count', 'Equal parts') },
        { id: 'ratio', label: t('tools:fold.divide.ratio', 'Ratio') },
      ],
      set: (mode) => setDivide({ mode }),
    },
    parts:
      settings.mode === 'count'
        ? {
            label: t('tools:fold.divide.parts', 'Parts'),
            value: settings.parts,
            min: 2,
            max: FOLD_MARK_MAX_PARTS,
            set: (parts) => setDivide({ parts }),
          }
        : null,
    ratio:
      settings.mode === 'ratio'
        ? {
            left: { label: t('tools:fold.divide.left', 'From the start'), value: formatOrieditaRatioHalf(halves.left), set: half('left') },
            right: { label: t('tools:fold.divide.right', 'To the end'), value: formatOrieditaRatioHalf(halves.right), set: half('right') },
            readout: t('tools:fold.divide.computed', 'Computed ratio {{s}} : {{t}}', {
              s: formatOrieditaRatioNumber(computed.ratioS),
              t: formatOrieditaRatioNumber(computed.ratioT),
            }),
          }
        : null,
    clear: {
      label: t('tools:fold.divide.clear', {
        count: divide.marks,
        defaultValue_one: 'Clear the mark made here',
        defaultValue_other: 'Clear the {{count}} marks made here',
      }),
      disabled: readOnly || divide.marks === 0,
      run: clearMarks,
    },
    disabled: readOnly,
  };
}

function settingsMeta(t: TFunction, count: number): string {
  if (count === 0) return t('tools:fold.window.instructions', 'Instructions');
  return t('tools:fold.window.settings', {
    count,
    defaultValue_one: '{{count}} setting',
    defaultValue_other: '{{count}} settings',
  });
}

/** What snaps under each line mode, and on a pointer with keys, the keys that change it. */
function lineModeNotes(t: TFunction, mode: FoldLineModeId, host: FoldToolHost): string[] {
  const clear = t('tools:fold.note.clear', 'Esc clears the picks.');
  if (mode === 'free') {
    const free = t('tools:fold.note.free', 'No snapping: the line runs exactly through the points you click.');
    return host.coarse ? [free] : [free, clear];
  }
  if (mode === 'crease') {
    return [t('tools:fold.note.crease', 'Folding along a precrease refolds it; along a folded edge, it unfolds the flap.')];
  }
  const snap = t('tools:fold.note.snap', 'Points snap to corners, marks, crease crossings, midpoints and edges.');
  if (host.coarse) return [snap];
  return [
    snap,
    t('tools:fold.note.freePoint', 'Hold {{modifier}} to put a point down anywhere, without snapping.', {
      modifier: host.alt,
    }),
    clear,
  ];
}

function locateInstructions(
  t: TFunction,
  view: FoldToolWindowView,
  kind: FoldKind,
  host: FoldToolHost
): FoldToolInstructions {
  const finish = host.coarse
    ? t('tools:fold.steps.finishTouch', 'Pick the fold and the layers, then tap {{action}}.', {
        action: foldToolLabel(t, kind),
      })
    : t('tools:fold.steps.finish', 'Pick the fold and the layers, then press Enter.');
  const items = [...lineModeSteps(t, view.lineMode), finish];
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items,
    current: Math.min(Math.max(0, view.picks), items.length - 1),
    notes: lineModeNotes(t, view.lineMode, host),
  };
}

function previewInstructions(
  t: TFunction,
  kind: FoldKind,
  host: FoldToolHost,
  preview: FoldPreview
): FoldToolInstructions {
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items: [
      t('tools:fold.steps.pickLayers', 'Pick which layers move.'),
      host.coarse
        ? t('tools:fold.steps.commitTouch', 'Tap {{action}} to fold.', { action: foldToolLabel(t, kind) })
        : t('tools:fold.steps.commit', 'Press Enter to fold.'),
    ],
    // Picking layers is optional: every layer on the moving side folds unless
    // narrowed, so the window leads with the pick and never marks it done.
    current: 0,
    notes: preview.acrossLayers
      ? [
          t(
            'tools:fold.note.acrossLayers',
            'These points lie on layers that are folded apart, so the line runs through them where they lie in the folded form. The crease pattern shows the creases it makes.'
          ),
        ]
      : [],
  };
}

function lineModeSelect(t: TFunction, view: FoldToolWindowView, verbs: FoldToolWindowVerbs): FoldLineModeSelect {
  return {
    label: t('tools:fold.window.lineMode', 'Locate line'),
    value: view.lineMode,
    options: FOLD_LINE_MODES.map((id) => ({ id, label: lineModeLabel(t, id) })),
    disabled: view.readOnly !== null,
    set: (id) => {
      if (isFoldLineMode(id)) verbs.selectLineMode(id);
    },
  };
}

function layersSection(
  t: TFunction,
  preview: FoldPreview,
  verbs: FoldToolWindowVerbs,
  disabled: boolean
): FoldLayersSection {
  const { section } = preview;
  const seed = {
    picked: new Set(
      preview.seed === 'all' ? (section?.flaps.map((_, flap) => flap) ?? []) : preview.seed
    ),
    added: new Set(preview.added),
    needed: neededFlaps(preview.refused),
  };
  const picker = section ? foldSectionPicker(t, section, seed, { interval: preview.interval }) : null;
  const help =
    section && isWoven(section)
    ? t(
        'tools:fold.window.layersHelpWoven',
        'These layers weave through each other, so the stack shown is the one under the pointer. Click a layer to include or exclude its flap.'
      )
    : t(
        'tools:fold.window.layersHelp',
        'Click a layer to include or exclude its flap. Brackets show where a fold joins two layers.'
      );
  return {
    title: t('tools:fold.window.layers', 'Layers'),
    summary: picker ? foldLayersSummary(t, picker) : null,
    picker,
    finding: picker ? null : t('tools:fold.window.finding', 'Finding the layers at the line…'),
    help,
    chips: section ? foldFlapChips(t, section, seed) : [],
    disabled,
    toggle: (flap) => verbs.toggleFlap(flap),
    hover: (flap) => verbs.hoverFlap?.(flap),
  };
}

/**
 * The window for the tool in hand, or null when it has none: the planned
 * inside reverse fold, which the rail never hands over.
 */
export function foldToolWindow(
  t: TFunction,
  view: FoldToolWindowView,
  verbs: FoldToolWindowVerbs,
  host: FoldToolHost
): FoldToolWindowModel | null {
  const readOnly = view.readOnly !== null;
  if (view.tool === 'divide-line') {
    const divide = view.divide ? divideControls(t, view.divide, verbs, readOnly) : null;
    return {
      phase: 'divide',
      title: foldToolLabel(t, 'divide-line'),
      meta: settingsMeta(t, divide ? 1 : 0),
      instructions: {
        heading: t('tools:fold.window.instructions', 'Instructions'),
        items: [
          t('tools:fold.steps.divide', 'Click an edge or crease to divide it.'),
          t('tools:fold.steps.divideUse', 'Use the new points as references for any fold.'),
        ],
        current: 0,
        notes: [t('tools:fold.note.divide', 'Edges, folded edges and precreases all count.')],
      },
      lineMode: null,
      kind: null,
      movingSide: null,
      layers: null,
      refusal: null,
      divide,
      footer: null,
    };
  }
  if (!isFoldKind(view.tool)) return null;
  const kind = view.tool;
  const title = foldToolLabel(t, kind);
  const { preview } = view;

  if (!preview) {
    return {
      phase: 'locate',
      title,
      meta: settingsMeta(t, 1),
      instructions: locateInstructions(t, view, kind, host),
      lineMode: lineModeSelect(t, view, verbs),
      kind: null,
      movingSide: null,
      layers: null,
      refusal: null,
      divide: null,
      footer: null,
    };
  }

  const numbers = flapNumbers(preview.section, preview.section?.flaps.length ?? 0);
  return {
    phase: 'preview',
    title,
    meta: settingsMeta(t, 3),
    instructions: previewInstructions(t, kind, host, preview),
    lineMode: null,
    kind: {
      label: t('tools:fold.window.kind', 'Fold'),
      value: kind,
      options: FOLD_KINDS.map((value) => ({ value, label: foldToolLabel(t, value) })),
      disabled: readOnly,
      set: (next) => verbs.selectTool(next),
    },
    movingSide: {
      label: t('tools:fold.window.movingSide', 'Moving side'),
      swapLabel: t('tools:fold.window.swap', 'Swap'),
      shortcut: 'fold.swapSide',
      disabled: readOnly,
      swap: verbs.swapSide,
    },
    // A fold refused before its layers were found has none to show: the
    // refusal says why, and "finding the layers" would never end.
    layers: preview.section || !preview.refused ? layersSection(t, preview, verbs, readOnly) : null,
    refusal: preview.refused
      ? foldRefusalNotice(
          t,
          preview.refused,
          { kind, readOnly, flapNumber: (flap) => numbers[flap] ?? flap + 1 },
          verbs
        )
      : null,
    divide: null,
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
