/**
 * The crimp and the tuck across the Fold engine's bridge (plan Phase 11), as
 * TypeScript sees them. Mirrors `crates/oristudio-fold-wasm/src/ops_crimp_tuck.rs`
 * and the engine's serde types it returns (`oristudio-fold/src/compound/`);
 * the Rust side is the truth.
 *
 * - **Inputs** are the document's `crimp` and `tuck` ops, with the tools'
 *   additions: a line already in the parent's model frame and a `side` of it.
 * - **Analyses** come before a fold lands: a crimp's tip at ℓ1 with how each
 *   of its flaps opens, and the kinds that land; a tuck's moving faces and
 *   every layer its block lands on, each with whether it takes the tuck.
 * - **A fold** lands, asks for an opening, or lists the orders that fit,
 *   each already landed under its own handle with what its step stores
 *   (`stored`, the document's `FoldChoices` keys). Every landed state stays
 *   held until it is released, as a step's does.
 *
 * A stored crimp or tuck replays through `apply`, like every step: it lands
 * only when its stored choices decide it (its `report` is then null — the
 * report is this file's calls'), and is refused `choice_needed` or
 * `choice_broken` otherwise.
 *
 * Pure types: no React, no store, no wasm.
 */

import type { FoldStateFingerprint } from '../document/foldDigest';
import type {
  FoldCompletionChoice,
  FoldCrimpKind,
  FoldCrimpOp,
  FoldDirection,
  FoldModelLine,
  FoldOpeningChoice,
  FoldTuckOp,
} from '../document/foldSequenceDocument';
import type { FoldOpening, FoldReverseAnalysis } from './foldEngineReverseWire';
import type {
  FoldEngineLine,
  FoldRefold,
  FoldSide,
  FoldSnap,
  FoldStateSummary,
  FoldStepMotionLegs,
} from './foldEngineWire';

// ---------------------------------------------------------------------------
// Inputs

/** A crimp as the bridge takes it: either line may be the tools' model line, ℓ1 with a `side`. */
export type FoldEngineCrimpOp = Omit<FoldCrimpOp, 'line' | 'second'> & {
  line: FoldEngineLine;
  second: FoldEngineLine;
  side?: FoldSide;
};

/** A tuck as the bridge takes it: its line may be the tools' model line, with a `side`. */
export type FoldEngineTuckOp = Omit<FoldTuckOp, 'line'> & { line: FoldEngineLine; side?: FoldSide };

// ---------------------------------------------------------------------------
// Analyses

/**
 * What a crimp moves and how its flaps open, before it lands (`CrimpAnalysis`):
 * its tip at ℓ1 is a reverse fold's (`foldEngineReverseWire.ts`).
 */
export interface FoldCrimpAnalysis {
  tip: FoldReverseAnalysis;
  /** ℓ2 after snapping, and its side away from ℓ1. */
  second: FoldModelLine;
  second_side: FoldSide;
  second_snap: FoldSnap;
  /** The tip's faces with paper beyond ℓ2. */
  beyond: number[];
}

export interface FoldCrimpAnalysed {
  analysis: FoldCrimpAnalysis;
  /** The kinds that land; null while a flap opening several ways is still to choose. */
  kinds: FoldCrimpKind[] | null;
}

/** Which side of its target a tuck's block lands on, in the model frame. */
export type FoldTuckPlacement = 'under' | 'over';

/** A layer a tuck's block lands on (`TuckTarget`). */
export interface FoldTuckTarget {
  face: number;
  /** An interior sheet point of it: what a step stores as `target`. */
  at: [number, number];
  /** Whether the block can lie against it; null when the listing's budget ran out first. */
  feasible: boolean | null;
}

/** What a tuck moves and the layers it can be tucked against (`TuckAnalysis`). */
export interface FoldTuckAnalysis {
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** In the model frame: a turned-over view's valley is a mountain here. */
  direction: FoldDirection;
  placement: FoldTuckPlacement;
  /** The parent's faces that move, in id order. */
  moving: number[];
  /** Every layer the block lands on that stays, in id order. */
  targets: FoldTuckTarget[];
}

export interface FoldTuckAnalysed {
  analysis: FoldTuckAnalysis;
}

// ---------------------------------------------------------------------------
// Landings

/**
 * What every compound fold did (`CompoundReport`), which a crimp's and a
 * tuck's reports extend. Its motion is a compound step's
 * (`FoldStepMotionLegs`, `foldEngineWire.ts`).
 */
export interface FoldCompoundReportBase {
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
}

/** What a crimp did (`CrimpReport`). */
export interface FoldCrimpReport extends FoldCompoundReportBase {
  first: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  second: FoldModelLine;
  second_side: FoldSide;
  second_snap: FoldSnap;
  kind: FoldCrimpKind;
  openings: FoldOpening[];
  /** The flaps with no spine, moving whole: the parent's faces of each. */
  whole: number[][];
  motion: FoldStepMotionLegs;
}

/** What a tuck did (`TuckReport`). */
export interface FoldTuckReport extends FoldCompoundReportBase {
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  direction: FoldDirection;
  placement: FoldTuckPlacement;
  /** T, which stays and keeps its id. */
  target: number;
  motion: FoldStepMotionLegs;
}

/** What a landed crimp or tuck stores beside its line's root: the document's choice keys. */
export interface FoldCompoundStored {
  opening?: FoldOpeningChoice[];
  completion?: FoldCompletionChoice;
}

/** A landed crimp or tuck, held under `state`. */
export interface FoldCompoundLanded<R> {
  state: number;
  report: R;
  summary: FoldStateSummary;
  stored: FoldCompoundStored;
}

export interface FoldCompoundFingerprinted<R> extends FoldCompoundLanded<R> {
  fingerprint: FoldStateFingerprint;
}

/** Where a crimp or tuck got to. */
export type FoldCompound<R, L extends FoldCompoundLanded<R> = FoldCompoundLanded<R>> =
  | ({ outcome: 'landed' } & L)
  /** A flap opens several ways: store one of each such flap's openings and fold again. Crimps only. */
  | { outcome: 'choose_opening'; analysis: FoldCrimpAnalysis }
  /** More than one order fits: each landed, up to sixteen; `orders` is the true count, `exact` whether it is. */
  | { outcome: 'choose_order'; orders: number; exact: boolean; candidates: L[] };

/** A stored compound choice that no longer resolves (`Broken`), as `choice_broken` carries it beside its code. */
export type FoldBrokenChoice =
  | { broken: 'witness'; witness: { cause: string; [field: string]: unknown } }
  | { broken: 'completion'; refusal: { code: string; [field: string]: unknown } }
  | { broken: 'not_unique'; orders: { orders: number; exact: boolean } }
  | { broken: 'gate'; refusal: { code: string; [field: string]: unknown } }
  | { broken: 'opening'; opening: number };
