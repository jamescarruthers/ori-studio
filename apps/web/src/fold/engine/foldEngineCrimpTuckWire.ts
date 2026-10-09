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
import type {
  FoldEngineLine,
  FoldFlap,
  FoldIsometry,
  FoldRefold,
  FoldSide,
  FoldSnap,
  FoldStateSummary,
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

/** Why a flap of a tip has no opening (`NoOpening`). */
export type FoldNoOpening = 'no_spine' | 'no_split' | 'no_body' | 'bodies_cross';

/** One way a flap of the tip opens (`Opening`): two blocks, split along a spine. */
export interface FoldOpening {
  /** T1, the lower block: the parent's faces, in id order. */
  lower: number[];
  /** T2, the upper block. */
  upper: number[];
  /** The line the creases across the opening lie on, in the model frame. */
  spine: FoldModelLine;
  /** The creases across the opening: they turn M↔V. */
  across: number[];
  /** The faces each block is hinged to on ℓ, which stay. */
  lower_body: number[];
  upper_body: number[];
  /** What a step stores to choose it. */
  stored: FoldOpeningChoice;
}

/** A flap of the tip and the ways it opens (`TipFlap`). */
export interface FoldTipFlap {
  /** Its index among the moving side's flaps. */
  index: number;
  flap: FoldFlap;
  /** Fewest lower faces first. */
  openings: FoldOpening[];
  /** The scan stopped short: more openings may exist. */
  truncated: boolean;
  /** Why there is none, when there is none. */
  none?: FoldNoOpening;
}

/** A reverse fold's tip at its line (`ReverseAnalysis`): what a crimp's ℓ1 opens. */
export interface FoldTipAnalysis {
  /** The line after snapping, and the tip's side of it. */
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** The parent's faces that move, in id order. */
  tip: number[];
  flaps: FoldTipFlap[];
}

/** What a crimp moves and how its flaps open, before it lands (`CrimpAnalysis`). */
export interface FoldCrimpAnalysis {
  tip: FoldTipAnalysis;
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

/** Paper turning about one hinge during one leg (`MotionGroup`). */
export interface FoldMotionGroup {
  /** The landed state's faces that turn together. */
  faces: number[];
  /** The hinge, in the parent's model frame. */
  axis: FoldModelLine;
  /** The side of `axis` the faces start on. */
  side: FoldSide;
  /** Radians: 0 where they lay in the parent, ±π where they land; positive lifts toward +z. */
  from: number;
  to: number;
  /** Where ±π puts the faces from where they land, when not there: a crimp's tip about ℓ1. */
  before?: FoldIsometry;
}

/** One leg of a compound step's motion: groups turning at once (`MotionLeg`). */
export interface FoldMotionLeg {
  name: 'spread' | 'close';
  /** Whose layer order draws the turning paper against what stays. */
  stacking: 'parent' | 'landed';
  groups: FoldMotionGroup[];
}

/** A compound step's motion (plan D15): `visual` when only its ends are states. */
export interface FoldCompoundMotion {
  kind: 'rigid' | 'visual';
  legs: FoldMotionLeg[];
}

/** What every compound fold did (`CompoundReport`). */
export interface FoldCompoundReport {
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
export interface FoldCrimpReport extends FoldCompoundReport {
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
  motion: FoldCompoundMotion;
}

/** What a tuck did (`TuckReport`). */
export interface FoldTuckReport extends FoldCompoundReport {
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  direction: FoldDirection;
  placement: FoldTuckPlacement;
  /** T, which stays and keeps its id. */
  target: number;
  motion: FoldCompoundMotion;
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

/** A stored compound choice that no longer resolves (`Broken`), as `choice_broken` carries it. */
export type FoldBrokenChoice =
  | { broken: 'witness'; witness: { cause: string; [field: string]: unknown } }
  | { broken: 'completion'; refusal: { code: string; [field: string]: unknown } }
  | { broken: 'not_unique'; orders: { orders: number; exact: boolean } }
  | { broken: 'gate'; refusal: { code: string; [field: string]: unknown } }
  | { broken: 'opening'; opening: number };
