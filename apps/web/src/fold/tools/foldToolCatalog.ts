/**
 * The Fold workspace's tools (plan D14): what each one is, which group it is
 * in, the key the Fold scope will give it, and its words — for every surface
 * that offers them, the rail, the phone's tool sheet and the tool window.
 *
 * Three kinds of item stand on the rail, and they combine:
 *
 * - **a tool** is taken in hand: a fold (valley, mountain, precrease) or the
 *   Divide line;
 * - **a line mode** says how a fold's line is located — an axiom, a free line,
 *   or an existing crease — and stays chosen across fold tools;
 * - **a model verb** (turn over, rotate) is a step of its own, done at once.
 *
 * React-free and store-free; literal `t()` keys so the extractor sees them.
 */
import type { TFunction } from 'i18next';
import type { FoldShortcutId as RegistryFoldShortcutId } from '../../keyboard/shortcuts';
import { axiomPhrase, type FoldAxiom } from '../../lib/foldSentences';
import type { TurnKind } from '../../lib/steps/turn';
import { turnCardWords } from '../../lib/steps/turnWords';

/** A plain fold's kind, as the tool window's V / M / P control offers it. */
export type FoldKind = 'valley' | 'mountain' | 'precrease';

export const FOLD_KINDS: readonly FoldKind[] = ['valley', 'mountain', 'precrease'];

/**
 * A tool taken in hand. Inside reverse is the design's fourth fold; it folds
 * outside too, as its kind control's other value (plan Phase 9, research
 * §5.2: the kind is usually forced by the geometry). The sinks are a family
 * of their own.
 */
export type FoldToolId = FoldKind | 'inside-reverse' | 'divide-line' | FoldSinkToolId;

export function isFoldKind(id: FoldToolId): id is FoldKind {
  return id === 'valley' || id === 'mountain' || id === 'precrease';
}

/** A tool that folds along a located line: the plain folds, and the compound folds along one. */
export type FoldLineToolId = FoldKind | 'inside-reverse' | FoldSinkToolId;

export function isLineTool(id: FoldToolId): id is FoldLineToolId {
  return isFoldKind(id) || id === 'inside-reverse' || isSinkTool(id);
}

/**
 * The sinks (plan Phase 11, research §5.4), each a tool along a located line:
 * a closed point's tip pushed in, open or closed, or a sunk one pulled back
 * out. The open and the closed sink are one sink's two kinds, the window's
 * control switching between them as the reverse fold's kind does.
 */
export type FoldSinkToolId = 'open-sink' | 'closed-sink' | 'unsink';

export const FOLD_SINK_TOOLS: readonly FoldSinkToolId[] = ['open-sink', 'closed-sink', 'unsink'];

export function isSinkTool(id: FoldToolId): id is FoldSinkToolId {
  return id === 'open-sink' || id === 'closed-sink' || id === 'unsink';
}

/** A sink's kind, as the sink tool's kind control names it in full: its tool's name. */
export function foldSinkKindLabel(t: TFunction, kind: 'open' | 'closed'): string {
  return foldToolLabel(t, kind === 'open' ? 'open-sink' : 'closed-sink');
}

/** A reverse fold's kind, as the reverse tool's kind control names it. */
export function foldReverseKindLabel(t: TFunction, kind: 'inside' | 'outside'): string {
  return kind === 'inside'
    ? t('tools:fold.tool.insideReverse', 'Inside reverse fold')
    : t('tools:fold.op.outsideReverse', 'Outside reverse fold');
}

/** How a fold's line is located: an axiom, a line drawn freely, or a crease already there (D3 "existing crease"). */
export type FoldLineModeId =
  | 'axiom-1'
  | 'axiom-2'
  | 'axiom-3'
  | 'axiom-4'
  | 'axiom-5'
  | 'axiom-6'
  | 'axiom-7'
  | 'free'
  | 'crease';

/** The line modes in the order every surface lists them (plan D14). */
export const FOLD_LINE_MODES: readonly FoldLineModeId[] = [
  'axiom-1',
  'axiom-2',
  'axiom-3',
  'axiom-4',
  'axiom-5',
  'axiom-6',
  'axiom-7',
  'free',
  'crease',
];

export function isFoldLineMode(value: string): value is FoldLineModeId {
  return (FOLD_LINE_MODES as readonly string[]).includes(value);
}

/** The axiom a line mode is, or null for a free line and an existing crease. */
export function lineModeAxiom(mode: FoldLineModeId): FoldAxiom | null {
  switch (mode) {
    case 'axiom-1':
      return 1;
    case 'axiom-2':
      return 2;
    case 'axiom-3':
      return 3;
    case 'axiom-4':
      return 4;
    case 'axiom-5':
      return 5;
    case 'axiom-6':
      return 6;
    case 'axiom-7':
      return 7;
    case 'free':
    case 'crease':
      return null;
  }
}

/** A step of its own that turns the whole model (lib/steps' turn type), done at once from the rail. */
export type FoldModelVerbId = 'turn-over' | 'rotate';

/** What each model verb adds: Fold's turn over mirrors side to side (`View::turned_over`). */
export const FOLD_MODEL_TURNS: Readonly<Record<FoldModelVerbId, TurnKind>> = {
  'turn-over': { kind: 'turn-over', axis: 'vertical' },
  rotate: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } },
};

/**
 * The compound folds later phases add (plan Phase 11), listed so the rail can
 * say they are coming. The outside reverse fold is the reverse tool's other
 * kind, not a tool of its own.
 */
export type FoldPlannedOpId = 'crimp' | 'tuck' | 'squash' | 'petal' | 'rabbit-ear' | 'swivel';

export const FOLD_PLANNED_OPS: readonly FoldPlannedOpId[] = ['crimp', 'tuck', 'squash', 'petal', 'rabbit-ear', 'swivel'];

/** Anything the rail shows: what its glyph is chosen by. */
export type FoldRailItemId = FoldToolId | FoldLineModeId | FoldModelVerbId | FoldPlannedOpId;

/**
 * The registry ids the Fold scope binds (plan D14 Keyboard, `keyboard/shortcuts.ts`'s
 * `FOLD_SHORTCUTS`), and Escape's, which runs through the viewport's cancel
 * ladder. One list with the registry's, so a tooltip and the scope cannot
 * disagree; the surface resolves each to the user's key.
 */
export type FoldShortcutId = RegistryFoldShortcutId | 'viewport.cancel';

/** Resolves a key's id to the label the user's layout gives it, or undefined while it has none. */
export type FoldKeyLabel = (id: FoldShortcutId) => string | undefined;

export const FOLD_TOOL_SHORTCUTS: Readonly<Record<FoldToolId, FoldShortcutId>> = {
  valley: 'fold.toolValley',
  mountain: 'fold.toolMountain',
  precrease: 'fold.toolPrecrease',
  'inside-reverse': 'fold.toolInsideReverse',
  'divide-line': 'fold.toolDivideLine',
  // The sinks.
  'open-sink': 'fold.toolOpenSink',
  'closed-sink': 'fold.toolClosedSink',
  unsink: 'fold.toolUnsink',
};

export const FOLD_LINE_MODE_SHORTCUTS: Readonly<Record<FoldLineModeId, FoldShortcutId>> = {
  'axiom-1': 'fold.lineAxiom1',
  'axiom-2': 'fold.lineAxiom2',
  'axiom-3': 'fold.lineAxiom3',
  'axiom-4': 'fold.lineAxiom4',
  'axiom-5': 'fold.lineAxiom5',
  'axiom-6': 'fold.lineAxiom6',
  'axiom-7': 'fold.lineAxiom7',
  free: 'fold.lineFree',
  crease: 'fold.lineCrease',
};

export const FOLD_MODEL_VERB_SHORTCUTS: Readonly<Record<FoldModelVerbId, FoldShortcutId>> = {
  'turn-over': 'fold.turnOver',
  rotate: 'fold.rotate',
};

/** Why nothing on the sequence can change: a newer build wrote it (D7), or the step is locked (D6). */
export type FoldReadOnlyReason = 'newer' | 'locked';

export function foldReadOnlyReason(t: TFunction, reason: FoldReadOnlyReason): string {
  switch (reason) {
    case 'newer':
      return t('tools:fold.readOnly.newer', 'This sequence is from a newer Ori Studio, so it opens read-only.');
    case 'locked':
      return t('tools:fold.readOnly.locked', 'This step is from a newer Ori Studio, so nothing can be folded from it.');
  }
}

export function foldToolLabel(t: TFunction, id: FoldToolId): string {
  switch (id) {
    case 'valley':
      return t('tools:fold.tool.valley', 'Valley fold');
    case 'mountain':
      return t('tools:fold.tool.mountain', 'Mountain fold');
    case 'precrease':
      return t('tools:fold.tool.precrease', 'Precrease');
    case 'inside-reverse':
      return t('tools:fold.tool.insideReverse', 'Inside reverse fold');
    case 'divide-line':
      return t('tools:fold.tool.divideLine', 'Divide line');
    // The sinks, by the names the rail gave them while they were planned.
    case 'open-sink':
      return t('tools:fold.op.openSink', 'Open sink');
    case 'closed-sink':
      return t('tools:fold.op.closedSink', 'Closed sink');
    case 'unsink':
      return t('tools:fold.op.unsink', 'Unsink');
  }
}

/** What a tool does, in a line: the rail's tooltip after its name, and the phone sheet's row. */
export function foldToolDescription(t: TFunction, id: FoldToolId): string {
  switch (id) {
    case 'valley':
      return t('tools:fold.tool.valleyHelp', 'Fold the moving side toward you, so it lands on top.');
    case 'mountain':
      return t('tools:fold.tool.mountainHelp', 'Fold the moving side away from you, so it lands underneath.');
    case 'precrease':
      return t('tools:fold.tool.precreaseHelp', 'Fold and unfold, leaving a crease to use later.');
    case 'inside-reverse':
      return t('tools:fold.tool.insideReverseHelp', 'Push a flap inside itself, reversing its spine.');
    case 'divide-line':
      return t('tools:fold.tool.divideLineHelp', 'Mark points that divide an edge or a crease into equal parts.');
    case 'open-sink':
      return t('tools:fold.tool.openSinkHelp', 'Push a closed point’s tip in, turning every layer of it inside out.');
    case 'closed-sink':
      return t('tools:fold.tool.closedSinkHelp', 'Push a closed point’s tip into a pocket, its layers kept together.');
    case 'unsink':
      return t('tools:fold.tool.unsinkHelp', 'Pull a sunk point’s tip back out.');
  }
}

/**
 * A fold kind's letter, in the ink of the crease it leaves: the glyph on the
 * rail and in the window's V / M / P control. Localized, as Edit's line-type
 * letters are, for a locale that writes them otherwise.
 */
export function foldKindLetter(t: TFunction, id: FoldKind | 'inside-reverse'): string {
  switch (id) {
    case 'valley':
      return t('tools:fold.mark.valley', 'V');
    case 'mountain':
      return t('tools:fold.mark.mountain', 'M');
    case 'precrease':
      return t('tools:fold.mark.precrease', 'P');
    case 'inside-reverse':
      return t('tools:fold.mark.insideReverse', 'IR');
  }
}

export function lineModeLabel(t: TFunction, mode: FoldLineModeId): string {
  const axiom = lineModeAxiom(mode);
  if (axiom !== null) {
    return t('tools:fold.line.axiom', 'Axiom {{number}}: {{phrase}}', { number: axiom, phrase: axiomPhrase(t, axiom) });
  }
  return mode === 'free' ? t('tools:fold.line.free', 'Free line') : t('tools:fold.line.crease', 'Existing crease');
}

/** What a line mode locates, in a line: the rail's tooltip and the phone sheet's row. */
export function lineModeDescription(t: TFunction, mode: FoldLineModeId): string {
  switch (mode) {
    case 'axiom-1':
      return t('tools:fold.line.axiom1Help', 'The line through two points.');
    case 'axiom-2':
      return t('tools:fold.line.axiom2Help', 'The line that folds one point onto another.');
    case 'axiom-3':
      return t('tools:fold.line.axiom3Help', 'The line that folds one edge or crease onto another.');
    case 'axiom-4':
      return t('tools:fold.line.axiom4Help', 'The line through a point, perpendicular to an edge or crease.');
    case 'axiom-5':
      return t('tools:fold.line.axiom5Help', 'The line through a pivot that folds a point onto an edge or crease.');
    case 'axiom-6':
      return t('tools:fold.line.axiom6Help', 'The line that folds two points onto two edges or creases at once.');
    case 'axiom-7':
      return t(
        'tools:fold.line.axiom7Help',
        'The line that folds a point onto an edge or crease, perpendicular to another.'
      );
    case 'free':
      return t('tools:fold.line.freeHelp', 'A line drawn anywhere, with no reference.');
    case 'crease':
      return t('tools:fold.line.creaseHelp', 'A crease or folded edge already there: refold a precrease, or unfold a flap.');
  }
}

/**
 * The clicks that locate a line in this mode, one step each in click order —
 * the tool's slots, which the step stores in the axiom's own input order
 * (plan D6), so the order here is free to read naturally.
 */
export function lineModeSteps(t: TFunction, mode: FoldLineModeId): string[] {
  switch (mode) {
    case 'axiom-1':
      return [
        t('tools:fold.steps.axiom1First', 'Click the first point the fold passes through.'),
        t('tools:fold.steps.axiom1Second', 'Click the second point.'),
      ];
    case 'axiom-2':
      return [
        t('tools:fold.steps.pointToMove', 'Click the point to move.'),
        t('tools:fold.steps.axiom2Land', 'Click where it should land.'),
      ];
    case 'axiom-3':
      return [
        t('tools:fold.steps.axiom3Move', 'Click the edge or crease to move.'),
        t('tools:fold.steps.axiom3Onto', 'Click the edge or crease to lay it on.'),
      ];
    case 'axiom-4':
      return [
        t('tools:fold.steps.perpendicularTo', 'Click the edge or crease the fold is perpendicular to.'),
        t('tools:fold.steps.axiom4Through', 'Click the point the fold passes through.'),
      ];
    case 'axiom-5':
      return [
        t('tools:fold.steps.pointToMove', 'Click the point to move.'),
        t('tools:fold.steps.axiom5Pivot', 'Click the pivot the fold passes through.'),
        t('tools:fold.steps.landOnLine', 'Click the edge or crease it should land on.'),
      ];
    case 'axiom-6':
      return [
        t('tools:fold.steps.axiom6FirstPoint', 'Click the first point to move.'),
        t('tools:fold.steps.landOnLine', 'Click the edge or crease it should land on.'),
        t('tools:fold.steps.axiom6SecondPoint', 'Click the second point to move.'),
        t('tools:fold.steps.axiom6SecondLine', 'Click the edge or crease that one should land on.'),
      ];
    case 'axiom-7':
      return [
        t('tools:fold.steps.pointToMove', 'Click the point to move.'),
        t('tools:fold.steps.landOnLine', 'Click the edge or crease it should land on.'),
        t('tools:fold.steps.perpendicularTo', 'Click the edge or crease the fold is perpendicular to.'),
      ];
    case 'free':
      return [
        t('tools:fold.steps.freeStart', 'Click where the fold line starts.'),
        t('tools:fold.steps.freeEnd', 'Click where it ends.'),
      ];
    case 'crease':
      return [t('tools:fold.steps.crease', 'Click the crease or folded edge to fold along.')];
  }
}

export function foldModelVerbLabel(t: TFunction, id: FoldModelVerbId): string {
  // The turn's own words, so a Fold step and the Diagram it is linked to name it alike.
  return turnCardWords(FOLD_MODEL_TURNS[id], t).title;
}

export function foldModelVerbDescription(t: TFunction, id: FoldModelVerbId): string {
  switch (id) {
    case 'turn-over':
      return t('tools:fold.verb.turnOverHelp', 'Turn the model over, side to side, as a step of its own.');
    case 'rotate':
      return t('tools:fold.verb.rotateHelp', 'Rotate the model a quarter turn clockwise, as a step of its own.');
  }
}

export function foldPlannedOpLabel(t: TFunction, id: FoldPlannedOpId): string {
  switch (id) {
    case 'crimp':
      return t('tools:fold.op.crimp', 'Crimp');
    case 'tuck':
      return t('tools:fold.op.tuck', 'Tuck');
    case 'squash':
      return t('tools:fold.op.squash', 'Squash fold');
    case 'petal':
      return t('tools:fold.op.petal', 'Petal fold');
    case 'rabbit-ear':
      return t('tools:fold.op.rabbitEar', 'Rabbit ear');
    case 'swivel':
      return t('tools:fold.op.swivel', 'Swivel fold');
  }
}

/** Why a planned fold is on the rail and cannot be taken. */
export function foldPlannedReason(t: TFunction): string {
  return t('tools:fold.plannedReason', 'Planned: not in Ori Studio yet.');
}
