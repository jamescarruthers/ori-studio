/**
 * What crosses the Fold bridge for the vertex folds — squash, petal fold,
 * rabbit ear and swivel (plan Phase 11) — as TypeScript sees it. Mirrors
 * `crates/oristudio-fold-wasm/src/ops_squash_family.rs` and the engine's
 * `compound::vertex`; the Rust side is the truth.
 *
 * - **Ops** are the document's (`FoldSquashOp`, `FoldPetalOp`,
 *   `FoldRabbitEarOp`, `FoldSwivelOp`), and a stored one replays through the
 *   ordinary `step` call: it lands with its `vertex` report, or is refused —
 *   the engine's codes, or the compound folds' `choice_needed` and
 *   `choice_broken` when its stored choice no longer decides the order.
 * - **The tools** fold through `vertexFold`: one order lands; more are held
 *   under a `pending` handle until a pick lands one, whose
 *   `vertex.stored` is the `FoldChoices.completion` the step stores.
 * - **The motion** (plan D15) is visual, in stages: each moving block turns
 *   about one of its creases per stage, or rests ({@link FoldStepMotionLegs},
 *   every compound step's).
 *
 * Pure types and constants: no React, no store, no wasm.
 */

import type { FoldCompletionChoice, FoldDirection, FoldModelLine } from '../document/foldSequenceDocument';
import type {
  FoldModelPoint,
  FoldRefold,
  FoldStepFingerprinted,
  FoldStepLanded,
  FoldStepMotionLegs,
} from './foldEngineWire';

/** Which vertex fold a report is (`VertexFoldKind`). */
export type FoldVertexFoldKind = 'squash' | 'petal' | 'rabbit_ear' | 'swivel';

/** What a vertex fold did (`VertexReport`, with the compound report flattened in). */
export interface FoldVertexReport {
  kind: FoldVertexFoldKind;
  /** Where its creases meet, in the parent's model frame. */
  vertices: FoldModelPoint[];
  /** The lines its blocks turn about, in the parent's model frame. */
  creases: FoldModelLine[];
  /** In the model frame. */
  direction: FoldDirection;
  /** The parent's faces that move. */
  moving: number[];
  /** Per block, the landed state's faces in it. */
  blocks: number[][];
  created: number[];
  unfolded: number[];
  refolded: FoldRefold[];
  /** Folded creases whose letter turned. */
  reversed: number[];
  split: number;
  motion: FoldStepMotionLegs;
  /** What the step stores: the order chosen among several, when there were several. */
  stored: { completion?: FoldCompletionChoice };
}

/** A landed vertex fold, as `step` and the tools' calls return it. */
export interface FoldVertexLanded extends FoldStepLanded {
  vertex: FoldVertexReport;
}

export interface FoldVertexFingerprinted extends FoldStepFingerprinted {
  vertex: FoldVertexReport;
}

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

export interface FoldVertexAnalysed {
  analysis: FoldVertexAnalysis;
}
