/**
 * What crosses the Fold bridge for the vertex folds — squash, petal fold,
 * rabbit ear and swivel (plan Phase 11) — as TypeScript sees it. Mirrors
 * `crates/oristudio-fold-wasm/src/ops_squash_family.rs` and the engine's
 * `compound::vertex`; the Rust side is the truth.
 *
 * - **Ops** are the document's (`FoldSquashOp`, `FoldPetalOp` — its H by a
 *   precrease's `crease` point, or by its two `ends`, which the fold creases
 *   itself — `FoldRabbitEarOp`, `FoldSwivelOp`), and a stored one replays through the
 *   ordinary `step` call: it lands with its `compound` report
 *   (`family: 'vertex'`), or is refused — the engine's codes, or the compound
 *   folds' `choice_needed` and `choice_broken` when its stored choice no
 *   longer decides the order.
 * - **The tools** ask the compound question (`compoundAnalysis`,
 *   `family: 'vertex'`), as the reverse fold's tools do: what the op names,
 *   which of a fan's fourth rays land, and the orders it leaves (each the
 *   `FoldChoices.completion` that picks it); then preview and commit the
 *   step with its choices through `step`. A rabbit ear's fourth crease rises
 *   as its ridge, so there is no ridge to choose. The family's own calls besides
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

/**
 * A petal fold's ends, corner, kite creases and layers (`PetalAnalysis`),
 * whichever way its op names H (`FoldPetalOp`'s `crease` or `ends`).
 */
export interface FoldPetalAnalysis {
  /** H, in the parent's model frame. */
  line: FoldModelLine;
  /** H's ends on the flap's folded edges, and the corner the kite creases meet at. */
  ends: [FoldModelPoint, FoldModelPoint];
  corner: FoldModelPoint;
  /** The kite creases from each end: precreased, or — H named by its ends — the bisector of H and the folded edge there. */
  kites: [FoldModelLine, FoldModelLine];
  /** The parent's faces of the top and second layers: below H, or across it where H is not creased. */
  top: number[];
  second: number[];
  /**
   * What the fold creases itself (H named by its ends): H where it crosses
   * the top layer, and each kite crease (in `kites`' order) where it crosses
   * the top two layers. All false over precreases, and always for H named by
   * a crease. The bridge always sends both; they are optional only so an
   * analysis written before them still types.
   */
  scores_line?: boolean;
  scores_kites?: [boolean, boolean];
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

/**
 * The compound question's answer for a vertex op (`VertexAnalysed`): what it
 * names, and what a tool chooses among — which fourth rays land, and the
 * orders it leaves, its stored completion aside.
 */
export interface FoldVertexAnalysed {
  analysis: FoldVertexAnalysis;
  /**
   * A rabbit ear's or a swivel's: per emergent candidate, whether the fold
   * lands with it, its other inputs as asked. Empty for the other folds.
   */
  emergents: boolean[];
  /** Null when it lands with one order, or is refused (the preview says why). */
  orders: FoldVertexOrders | null;
}

// ---------------------------------------------------------------------------
// Refusals the tools read the fields of (`FoldRefusal`'s vertex block)

/** Why there is no flap to squash at a point (`NoFlap`). */
export type FoldNoFlap = 'single_layer' | 'no_spine' | 'no_hinge' | 'upper_not_hinged';

/**
 * Which crease of a petal fold is not precreased (`PetalCrease`). H named by
 * its ends creases what is missing, except H across the second layer's paper
 * outside a kite crease (`line`).
 */
export type FoldPetalCrease = 'line' | 'kite';

/** Why a petal fold has no flap (`NoPetal`). */
export type FoldNoPetal = 'no_ends' | 'no_corner';

/**
 * What a `petal_no_flap` cause names more precisely, where it does
 * (`NoPetalDetail`), as the refusal's optional `detail`:
 *
 * - `misses_flap` (with `no_ends`): H misses the flap altogether; its top
 *   layer, the refusal's `faces`, lies wholly on the petal's side of it.
 * - `past_corner` (with `no_corner`): the kite creases meet below H at
 *   `corner` (model frame), but the flap reaches past it; `faces` are the
 *   paper beyond. H lies too near the flap's closed point.
 */
export type FoldNoPetalDetail = { kind: 'misses_flap' } | { kind: 'past_corner'; corner: FoldModelPoint };
