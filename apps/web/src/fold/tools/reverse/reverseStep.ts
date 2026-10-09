/**
 * The reverse fold's step (plan Phase 9, D6): from what the tools picked and
 * what the engine said of the tip, to the op and choices a document stores.
 *
 * - **The line, the tip side and the anchor** are a fold along a line's
 *   (`locateAlongLine`): the axiom's root, a free line, or an existing crease
 *   — never unfolded along, which a reverse fold does not do — the moving
 *   side the tip's, and the seed what the tip grows from.
 * - **The kind** is the folder's when it lands, else the only one that does
 *   (research §5.2: on a two-layer flap and a generic line exactly one
 *   does), else inside — what is folded when neither lands, so the refusal
 *   says why and offers what does.
 * - **The opening**, when a flap opens more than one way, is one of the ways
 *   the engine lists: each flap that has several takes one of its openings,
 *   the ways stepped through in the order the engine lists them.
 * - **The order**, when the completion leaves more than one, is one of the
 *   orders the engine lists for the kind, stored as the completion that
 *   picks it.
 *
 * What a step stores is each one's result — the upper block's witnesses, the
 * completion's FOLD triples — never an index (plan D6).
 *
 * Pure: no React, no store, no engine.
 */
import type {
  FoldChoices,
  FoldCompletionChoice,
  FoldOpeningChoice,
  FoldReverseKind,
  FoldReverseOp,
} from '../../document/foldSequenceDocument';
import type { FoldPickIndex } from '../../canvas/foldPicking';
import type { FoldOpening, FoldReverseAnalysis, FoldReverseAsked } from '../../engine/foldEngineReverseWire';
import { locateAlongLine, type FoldLocateIntent, type FoldStepBuild } from '../foldStepBuilder';

/** The most ways to open a tip the chooser steps through: one flap's openings, or several flaps' together. */
export const MAX_REVERSE_OPENINGS = 16;

/** What the tools have picked for a reverse fold, and the choices made of what the engine lists. */
export interface FoldReverseIntent extends FoldLocateIntent {
  kind: FoldReverseKind;
  /** One per flap that opens more than one way, as the engine stores it. */
  openings: readonly FoldOpeningChoice[];
  completion: FoldCompletionChoice | null;
}

/** The reverse step the intent describes, from the state `index` was made for; or why there is none yet. */
export function buildReverseStep(intent: FoldReverseIntent, index: FoldPickIndex): FoldStepBuild {
  const located = locateAlongLine(intent, index, false);
  if ('status' in located) return located;
  const { line, choices: rooted, along, sceneLine, movingSign, acrossLayers } = located;
  const op: FoldReverseOp = { kind: intent.kind === 'inside' ? 'inside-reverse' : 'outside-reverse', line, ...along };
  const choices: FoldChoices = {
    ...rooted,
    ...(intent.completion ? { completion: intent.completion } : {}),
    ...(intent.openings.length > 0 ? { opening: intent.openings } : {}),
  };
  return {
    status: 'built',
    op,
    ...(Object.keys(choices).length > 0 ? { choices } : {}),
    sceneLine,
    movingSign,
    via: line.via,
    scope: along.seed.scope,
    ...(acrossLayers ? { acrossLayers } : {}),
  };
}

/** The kind folded: the folder's when it lands, the only one that lands, or inside (see the module docs). */
export function reverseKindToFold(chosen: FoldReverseKind | null, landing: readonly FoldReverseKind[]): FoldReverseKind {
  if (chosen !== null && (landing.length === 0 || landing.includes(chosen))) return chosen;
  return landing.length === 1 ? landing[0]! : (chosen ?? 'inside');
}

/** One way the tip opens: per flap that opens several ways, its opening. */
export interface FoldReverseOpenWay {
  /** In the order of the flaps that have several. */
  openings: readonly FoldOpening[];
  /** What the step stores for it. */
  stored: readonly FoldOpeningChoice[];
}

/**
 * Every way the tip opens, as the chooser steps through them: each flap
 * that opens several ways taking one of its openings, the first flap's
 * openings stepping slowest, at most {@link MAX_REVERSE_OPENINGS}. Empty when
 * no flap has a choice to make.
 */
export function reverseOpenWays(analysis: FoldReverseAnalysis): FoldReverseOpenWay[] {
  const choosing = analysis.flaps.filter((flap) => flap.openings.length > 1);
  if (choosing.length === 0) return [];
  let ways: FoldOpening[][] = [[]];
  for (const flap of choosing) {
    const grown: FoldOpening[][] = [];
    for (const way of ways) {
      for (const opening of flap.openings) {
        if (grown.length >= MAX_REVERSE_OPENINGS) break;
        grown.push([...way, opening]);
      }
    }
    ways = grown;
  }
  return ways.map((openings) => ({ openings, stored: openings.map((opening) => opening.stored) }));
}

/** The orders the engine lists for a kind; none when it lands with one. */
export function reverseOrdersOf(asked: FoldReverseAsked | null, kind: FoldReverseKind): readonly FoldCompletionChoice[] {
  return asked?.orders.find((listed) => listed.kind === kind)?.orders ?? [];
}

/** The listed choice at a stepped index, kept in range: the first while the list is empty or the index stale. */
export function chosenAt<T>(list: readonly T[], index: number): T | null {
  return list[index] ?? list[0] ?? null;
}
