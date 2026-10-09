/**
 * What crosses the bridge for the reverse fold (plan Phase 9), as TypeScript
 * sees it. Mirrors `crates/oristudio-fold-wasm/src/ops_reverse.rs` and the
 * engine's `compound/reverse.rs`; the Rust side is the truth.
 *
 * - **The op** is the document's `inside-reverse` or `outside-reverse`
 *   (`FoldReverseOp`), or one the tools are previewing along a model line.
 * - **The query** (`reverse`) answers what the tip is and how each of its
 *   flaps opens, which kinds land with the openings named, and the choice
 *   the step still needs: an opening, or one of the orders listed, each the
 *   `completion` that picks it.
 * - **A landed one** reports as `compound` beside a plain fold's report:
 *   its kind, its openings, its blocks, the spine creases it reversed, the
 *   motion the animation plays and what it stores.
 *
 * Pure types: no React, no store, no wasm.
 */

import type {
  FoldCompletionChoice,
  FoldModelLine,
  FoldOpeningChoice,
  FoldReverseKind,
  FoldReverseOp,
} from '../document/foldSequenceDocument';
import type {
  FoldEngineLine,
  FoldFlap,
  FoldRefold,
  FoldSide,
  FoldSnap,
  FoldStepMotionLegs,
  FoldToolMotion,
} from './foldEngineWire';

/** Which way the tip goes: into the flap, between its layers, or round its outside (the document's). */
export type { FoldReverseKind };

export const FOLD_REVERSE_KINDS: readonly FoldReverseKind[] = ['inside', 'outside'];

/** A reverse op as the tools fold it: the document's, its line possibly the tools' model line. */
export type FoldEngineReverseOp = Omit<FoldReverseOp, 'line'> & { line: FoldEngineLine } & Pick<FoldToolMotion, 'side'>;

/** Why a flap of the tip has no opening (`NoOpening`). */
export type FoldNoOpening = 'no_spine' | 'no_split' | 'no_body' | 'bodies_cross';

/**
 * One way a flap of the tip opens: a lower block T1 and an upper block T2
 * of the parent's faces, the spine the creases across them lie on (they
 * turn M↔V), each block's body on ℓ, and what a step stores to choose it.
 */
export interface FoldOpening {
  lower: number[];
  upper: number[];
  spine: FoldModelLine;
  across: number[];
  lower_body: number[];
  upper_body: number[];
  stored: FoldOpeningChoice;
}

/** A flap of the tip and the ways it opens, fewest lower faces first. */
export interface FoldTipFlap {
  /** Its index among the moving side's flaps. */
  index: number;
  flap: FoldFlap;
  openings: FoldOpening[];
  /** The scan stopped at its cap: more may exist. */
  truncated: boolean;
  /** Why there is none, when there is none. */
  none?: FoldNoOpening;
}

/** What a reverse fold moves and how its flaps open, before it lands. */
export interface FoldReverseAnalysis {
  /** The line folded along, after snapping, and the tip's side of it. */
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** The parent's faces that move. */
  tip: number[];
  flaps: FoldTipFlap[];
}

/** How many orders a choice has: the product of its components', and whether that is all of them. */
export interface FoldChoiceCount {
  orders: number;
  exact: boolean;
}

/** A choice a reverse fold still needs before it lands. */
export type FoldReverseNeeds =
  | { choice: 'opening' }
  | {
      choice: 'completion';
      count: FoldChoiceCount;
      /** The first few, each the `completion` that picks it. */
      orders: FoldCompletionChoice[];
      /** More are listed than `orders` holds. */
      more: boolean;
    };

/** The `reverse` query's answer. */
export interface FoldReverseAsked {
  analysis: FoldReverseAnalysis;
  /** The kinds that land with the openings named; none while an opening is still to choose. */
  kinds: FoldReverseKind[];
  /** What is still to choose; null when it lands as asked, or is refused (which a preview says). */
  needs: FoldReverseNeeds | null;
}

/** What a landed reverse fold did (`ReverseReport`), as a compound step reports it. */
export interface FoldReverseReport {
  op: 'reverse';
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  kind: FoldReverseKind;
  /** Each opening flap's opening: its blocks are `blocks[2k]` (lower) and `blocks[2k + 1]` (upper). */
  openings: FoldOpening[];
  /** The tip's flaps that moved whole, with no spine to open along: the parent's faces of each. */
  whole: number[][];
  /** The parent's faces that moved. */
  moving: number[];
  /** Per block, the landed state's faces in it. */
  blocks: number[][];
  created: number[];
  unfolded: number[];
  refolded: FoldRefold[];
  /** The spine creases that turned M↔V. */
  reversed: number[];
  split: number;
  /** What the animation plays (plan D15). */
  motion: FoldStepMotionLegs;
  /** What the step stores: the openings chosen among several, the order chosen among several. */
  stored: { openings?: FoldOpeningChoice[]; order?: FoldCompletionChoice };
}
