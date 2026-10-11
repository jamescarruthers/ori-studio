/**
 * Which tools the Fold rail offers, in which groups (plan D14).
 *
 * One list, read by both surfaces that draw it — the rail's icon grid and the
 * phone's labelled tool sheet — as Edit's `cpRailGroups()` serves both of
 * Edit's. The sheet exists to name what the rail shows, so a sheet that worked
 * out its own list could quietly stop naming some of it. Gating, words and the
 * calls are decided here; each surface only draws.
 *
 * React-free and store-free: it takes a view and bound verbs and returns data.
 */
import type { TFunction } from 'i18next';
import type { TurnKind } from '../../lib/steps/turn';
import {
  FOLD_LINE_MODES,
  FOLD_LINE_MODE_SHORTCUTS,
  FOLD_MODEL_TURNS,
  FOLD_MODEL_VERB_SHORTCUTS,
  FOLD_PLANNED_OPS,
  FOLD_TOOL_SHORTCUTS,
  FOLD_VERTEX_TOOLS,
  foldModelVerbDescription,
  foldModelVerbLabel,
  foldPlannedOpLabel,
  foldPlannedReason,
  foldReadOnlyReason,
  foldToolDescription,
  foldToolLabel,
  locatesLine,
  lineModeDescription,
  lineModeLabel,
  type FoldLineModeId,
  type FoldModelVerbId,
  type FoldReadOnlyReason,
  type FoldRailItemId,
  type FoldShortcutId,
  type FoldToolId,
} from './foldToolCatalog';

/** What the rail shows from: the tool in hand and the line mode chosen. */
export interface FoldToolsView {
  tool: FoldToolId;
  lineMode: FoldLineModeId;
  /** Set while nothing on the sequence can change, and why. */
  readOnly: FoldReadOnlyReason | null;
}

/** The calls the rail and the tool sheet make; the store binds them. */
export interface FoldRailVerbs {
  selectTool: (id: FoldToolId) => void;
  selectLineMode: (id: FoldLineModeId) => void;
  /** A model verb: add this turn as a step of its own (D6). */
  turn: (turn: TurnKind) => void;
}

export type FoldRailGroupId = 'fold' | 'reference' | 'locate' | 'model' | 'planned';

/** Taken in hand; a way of locating the line; done at once; or not built yet. */
export type FoldRailItemKind = 'tool' | 'line-mode' | 'verb' | 'planned';

export interface FoldRailItem {
  id: FoldRailItemId;
  kind: FoldRailItemKind;
  label: string;
  /** What it does, in a line. */
  description: string;
  /** Why it cannot be used now; null while it can. Said in place of the description. */
  reason: string | null;
  /** The key the Fold scope gives it; null for what has none. */
  shortcut: FoldShortcutId | null;
  active: boolean;
  available: boolean;
  select: () => void;
}

export interface FoldRailGroup {
  id: FoldRailGroupId;
  label: string;
  collapsedByDefault: boolean;
  items: readonly FoldRailItem[];
}

const FOLD_GROUP_TOOLS: readonly FoldToolId[] = [
  'valley',
  'mountain',
  'precrease',
  'inside-reverse',
  // The vertex folds.
  ...FOLD_VERTEX_TOOLS,
];

/** Tools not built yet: shown so the rail says what is coming, never taken. Every fold tool is built now. */
const PLANNED_TOOLS: ReadonlySet<FoldToolId> = new Set();

function groupLabel(t: TFunction, id: FoldRailGroupId): string {
  switch (id) {
    case 'fold':
      return t('tools:fold.group.fold', 'Fold');
    case 'reference':
      return t('tools:fold.group.reference', 'Reference points');
    case 'locate':
      return t('tools:fold.group.locate', 'Locate line');
    case 'model':
      return t('tools:fold.group.model', 'Model');
    case 'planned':
      return t('tools:fold.group.planned', 'Planned');
  }
}

/**
 * The rail's groups, in order: the folds; Reference points; Locate line; the
 * model verbs; and the planned folds, collapsed. Every surface that shows the
 * Fold tools reads this list.
 */
export function foldRailGroups(t: TFunction, view: FoldToolsView, verbs: FoldRailVerbs): FoldRailGroup[] {
  const locked = view.readOnly === null ? null : foldReadOnlyReason(t, view.readOnly);
  const planned = foldPlannedReason(t);

  const tool = (id: FoldToolId): FoldRailItem => {
    const isPlanned = PLANNED_TOOLS.has(id);
    const reason = isPlanned ? planned : locked;
    return {
      id,
      kind: isPlanned ? 'planned' : 'tool',
      label: foldToolLabel(t, id),
      description: foldToolDescription(t, id),
      reason,
      shortcut: FOLD_TOOL_SHORTCUTS[id],
      active: view.tool === id,
      available: reason === null,
      // A planned tool binds nothing, whichever surface would press it.
      select: isPlanned ? () => {} : () => verbs.selectTool(id),
    };
  };

  const lineMode = (id: FoldLineModeId): FoldRailItem => ({
    id,
    kind: 'line-mode',
    label: lineModeLabel(t, id),
    description: lineModeDescription(t, id),
    reason: locked,
    shortcut: FOLD_LINE_MODE_SHORTCUTS[id],
    // A line mode stays chosen under the Divide line, but is not what the
    // canvas is doing then; a petal fold locates its line H through it.
    active: view.lineMode === id && locatesLine(view.tool),
    available: locked === null,
    select: () => verbs.selectLineMode(id),
  });

  const verb = (id: FoldModelVerbId): FoldRailItem => ({
    id,
    kind: 'verb',
    label: foldModelVerbLabel(t, id),
    description: foldModelVerbDescription(t, id),
    reason: locked,
    shortcut: FOLD_MODEL_VERB_SHORTCUTS[id],
    // Done at once and gone: never the thing in hand.
    active: false,
    available: locked === null,
    select: () => verbs.turn(FOLD_MODEL_TURNS[id]),
  });

  const groups: [FoldRailGroupId, readonly FoldRailItem[]][] = [
    ['fold', FOLD_GROUP_TOOLS.map(tool)],
    ['reference', [tool('divide-line')]],
    ['locate', FOLD_LINE_MODES.map(lineMode)],
    ['model', [verb('turn-over'), verb('rotate')]],
    [
      'planned',
      FOLD_PLANNED_OPS.map((id) => ({
        id,
        kind: 'planned' as const,
        label: foldPlannedOpLabel(t, id),
        description: planned,
        reason: planned,
        shortcut: null,
        active: false,
        available: false,
        select: () => {},
      })),
    ],
  ];
  return groups.map(([id, items]) => ({
    id,
    label: groupLabel(t, id),
    // A roadmap, not tools: out of the way until asked for.
    collapsedByDefault: id === 'planned',
    items,
  }));
}

/**
 * A rail item's tooltip: its name, its key when it has one, and what it does
 * or why it cannot — Edit's and Annotate's form.
 */
export function foldRailTooltip(item: FoldRailItem, key: string | undefined): string {
  const name = key ? `${item.label} (${key})` : item.label;
  return `${name} - ${item.reason ?? item.description}`;
}
