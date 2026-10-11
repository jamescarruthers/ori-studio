/**
 * What crosses the Fold bridge for the vertex folds — squash, petal fold,
 * rabbit ear and swivel (plan Phase 11) — as TypeScript sees it. Mirrors
 * `crates/oristudio-fold-wasm/src/ops_squash_family.rs` and the engine's
 * `compound::vertex`; the Rust side is the truth.
 *
 * - **Ops** are the document's (`FoldSquashOp`, `FoldPetalOp`,
 *   `FoldRabbitEarOp`, `FoldSwivelOp`), and a stored one replays through the
 *   ordinary `step` call: it lands with its `compound` report
 *   (`family: 'vertex'`), or is refused — the engine's codes, or the compound
 *   folds' `choice_needed` and `choice_broken` when its stored choice no
 *   longer decides the order.
 * - **The tools** ask the compound question (`compoundAnalysis`,
 *   `family: 'vertex'`), as the reverse fold's tools do: what the op names,
 *   the orders it leaves (each the `FoldChoices.completion` that picks it),
 *   and a rabbit ear's two ridge options; then preview and commit the step
 *   with its choices through `step`. The family's own calls besides
 *   (`vertexFold`): one order lands; more are held under a `pending` handle
 *   until a pick lands one, whose `compound.stored` is the
 *   `FoldChoices.completion` the step stores.
 * - **The motion** (plan D15) is visual, in stages: each moving block turns
 *   about one of its creases per stage, or rests (`FoldStepMotionLegs`, every
 *   compound step's, read through `stepMotionLegsOf`).
 *
 * Pure types and constants: no React, no store, no wasm.
 */

import type { FoldCompletionChoice, FoldDirection, FoldModelLine } from '../document/foldSequenceDocument';
import type { FoldCompoundFingerprinted, FoldCompoundLanded, FoldCompoundReportBase } from './foldEngineCompoundWire';
import type { FoldModelPoint } from './foldEngineWire';

/** Which vertex fold a report is (`VertexFoldKind`). */
export type FoldVertexFoldKind = 'squash' | 'petal' | 'rabbit_ear' | 'swivel';

/** What a vertex fold did (`VertexReport`), as a compound step reports it under `family: 'vertex'`. */
export interface FoldVertexReport extends FoldCompoundReportBase {
  kind: FoldVertexFoldKind;
  /** Where its creases meet, in the parent's model frame. */
  vertices: FoldModelPoint[];
  /** The lines its blocks turn about, in the parent's model frame. */
  creases: FoldModelLine[];
  /** In the model frame. */
  direction: FoldDirection;
  /** What the step stores: the order chosen among several, when there were several. */
  stored: { completion?: FoldCompletionChoice };
}

/** A landed vertex fold, as `step` and the tools' calls return it. */
export type FoldVertexLanded = FoldCompoundLanded<'vertex'>;

export type FoldVertexFingerprinted = FoldCompoundFingerprinted<'vertex'>;

/** How many complete orders a completion offers (`ChoiceCount`). */
export interface FoldChoiceCount {
  orders: number;
  /** Whether that is every order; otherwise a lower bound. */
  exact: boolean;
}

/** What `vertexFold` came to: one order, landed; or a choice held under `pending`. */
export type FoldVertexTried =
  | ({ result: 'landed' } & FoldVertexFingerprinted)
  | {
      result: 'choose';
      pending: number;
      count: FoldChoiceCount;
      /** How many orders each independent component lists: a pick names one of each. */
      components: number[];
    };

// ---------------------------------------------------------------------------
// Analyses: what a tool previews before a vertex fold lands

/** A squash's flap and creases (`SquashAnalysis`). */
export interface FoldSquashAnalysis {
  vertex: FoldModelPoint;
  hinge: FoldModelLine;
  spine: FoldModelLine;
  /** Unit directions from the vertex: a target is a direction between them. */
  hinge_direction: FoldModelPoint;
  spine_direction: FoldModelPoint;
  /** The flap's layers: the parent's faces. */
  upper: number[];
  lower: number[];
  /** Each layer's own crease, through the vertex. */
  upper_crease: FoldModelLine;
  lower_crease: FoldModelLine;
  /** The wedge from the hinge to the spine, radians, and the target's share of it. */
  wedge: number;
  share: number;
}

/** A petal fold's ends, corner, kite creases and layers (`PetalAnalysis`). */
export interface FoldPetalAnalysis {
  line: FoldModelLine;
  ends: [FoldModelPoint, FoldModelPoint];
  corner: FoldModelPoint;
  kites: [FoldModelLine, FoldModelLine];
  top: number[];
  second: number[];
}

/** A rabbit ear's or a swivel's rays and layers (`FanAnalysis`). */
export interface FoldFanAnalysis {
  center: FoldModelPoint;
  /** The three given rays' directions. */
  given: FoldModelPoint[];
  /** Every direction the fourth ray can take (three at most): what a tool offers. */
  candidates: FoldModelPoint[];
  /** The candidate the op's emergent ray names. */
  emergent: number | null;
  /** The layers the creases cut, the first nearest the side the direction names. */
  layers: number[];
}

export type FoldVertexAnalysis =
  | ({ kind: 'squash' } & FoldSquashAnalysis)
  | ({ kind: 'petal' } & FoldPetalAnalysis)
  | ({ kind: 'rabbit-ear' } & FoldFanAnalysis)
  | ({ kind: 'swivel' } & FoldFanAnalysis);

/** The orders a vertex fold leaves to choose from (`VertexOrders`), as a reverse fold's question lists its own. */
export interface FoldVertexOrders {
  /** The true ‹ n of m ›. */
  count: FoldChoiceCount;
  /** The first eight, each the `completion` that picks it. */
  orders: FoldCompletionChoice[];
  /** More are listed than `orders` holds. */
  more: boolean;
}

/** One of a rabbit ear's two ridge options: a ray of its far wedge (`VertexRidge`). */
export interface FoldVertexRidge {
  /** The ray, a direction from the incenter in the parent's model frame: what the step stores as `ridge`. */
  direction: FoldModelPoint;
  /** Which corner's ray it is, in the op's corner order; null for the emergent ray. */
  given: number | null;
  /** Whether the ear lands with it. */
  lands: boolean;
  /** The orders it leaves, when more than one. */
  orders: FoldVertexOrders | null;
}

/**
 * The compound question's answer for a vertex op (`VertexAnalysed`): what it
 * names, and what a tool chooses among — the orders it leaves, its stored
 * completion aside, and a rabbit ear's ridges when it was asked without one.
 */
export interface FoldVertexAnalysed {
  analysis: FoldVertexAnalysis;
  /**
   * A rabbit ear's or a swivel's: per emergent candidate, whether the fold
   * lands with it, its other inputs as asked (a rabbit ear's without its
   * ridge). Empty for the other folds.
   */
  emergents: boolean[];
  /** Null when it lands with one order, or is refused (the preview says why). */
  orders: FoldVertexOrders | null;
  /** Empty unless a rabbit ear was asked without its ridge and got as far as its completion. */
  ridges: FoldVertexRidge[];
}

// ---------------------------------------------------------------------------
// Refusals the tools read the fields of (`FoldRefusal`'s vertex block)

/** Why there is no flap to squash at a point (`NoFlap`). */
export type FoldNoFlap = 'single_layer' | 'no_spine' | 'no_hinge' | 'upper_not_hinged';

/** Which crease of a petal fold is not precreased (`PetalCrease`). */
export type FoldPetalCrease = 'line' | 'kite';

/** Why a petal fold has no flap (`NoPetal`). */
export type FoldNoPetal = 'no_ends' | 'no_corner';
