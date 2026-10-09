/**
 * What crosses the Fold engine's bridge for the sinks (plan Phase 11,
 * research §5.4; `crates/oristudio-fold-wasm/src/ops_sinks.rs`), as
 * TypeScript sees it. Mirrors the engine's serde types, snake_case; the Rust
 * side is the truth.
 *
 * A sink is the document's op (`FoldSinkOp`: `open-sink`, `closed-sink`,
 * `unsink`), which the bridge lands through `apply` like any step, so a
 * commit lands exactly as a replay will. A sink tool asks first what the
 * point is and how it sinks (`sinkAnalysis`), and — when more than one order
 * fits — how many (`sinkOrders`) and what a pick stores (`sinkPick`). What a
 * step stores comes back in the engine's shapes and goes into the document's
 * through {@link sinkStoredChoices}.
 *
 * A landed sink's report carries its motion (plan D15): legs, each turning
 * groups of faces about a hinge, with exact endpoints. The engine's
 * `StepMotion` is every compound fold's; it is here, beside its first user.
 *
 * Pure types, constants and one conversion: no React, no store, no wasm.
 */

import type {
  FoldChoices,
  FoldCompletionChoice,
  FoldModelLine,
  SheetPoint,
} from '../document/foldSequenceDocument';
import type {
  FoldEngineOp,
  FoldEngineRefused,
  FoldFlap,
  FoldLetter,
  FoldModelPoint,
  FoldRefold,
  FoldSide,
  FoldSnap,
} from './foldEngineWire';

/** Which way a point sinks. */
export type FoldSinkKind = 'open' | 'closed';

/** The document's sink ops, as their kind spells them. */
export const FOLD_SINK_OP_KINDS = ['open-sink', 'closed-sink', 'unsink'] as const;

export type FoldSinkOpKind = (typeof FOLD_SINK_OP_KINDS)[number];

/** A sink op as the bridge folds it: the document's, its line possibly the tools' model line with a `side`. */
export type FoldEngineSinkOp = Extract<FoldEngineOp, { kind: FoldSinkOpKind }>;

/** Whether an op is a sink. */
export function isFoldSinkOp(op: FoldEngineOp): op is FoldEngineSinkOp {
  return (FOLD_SINK_OP_KINDS as readonly string[]).includes(op.kind);
}

/** The engine's refusals of a sink, in `FoldRefusal::code`'s order: the preconditions a sink tool words. */
export const FOLD_SINK_REFUSAL_CODES = [
  'sink_several_points',
  'sink_point_open',
  'sink_outline_mixed',
  'sink_no_axis',
  'sink_line_tilted',
  'sink_no_pocket',
  'unsink_not_sunk',
] as const;

// ---------------------------------------------------------------------------
// The point

/** A closed sink's pocket as a step stores it: a sheet point on the face just above it and one just below. */
export interface FoldStoredPocket {
  above: SheetPoint;
  below: SheetPoint;
}

/** A gap in the point's layers that a closed sink goes into. */
export interface FoldPocket {
  /** The parent's faces above it and below it, ascending. */
  upper: number[];
  lower: number[];
  /** The outline creases across it, ascending: they turn. */
  seams: number[];
  /** What a step stores to choose it. */
  stored: FoldStoredPocket;
}

/** A point and the ways it sinks, before anything lands (`sinkAnalysis`). */
export interface FoldSinkPoint {
  /** ℓ after snapping, in the parent's model frame, and the side the point's tip is on. */
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** The point: the moving side's flap the seed names. */
  point: FoldFlap;
  /** The folded creases on its outline, ascending. */
  outline: number[];
  /** The letter they share, the point's outside; null when they carry both. */
  exterior: FoldLetter | null;
  /** Where its two sides meet; null without an axis. */
  apex: FoldModelPoint | null;
  /** The line square to the point's axis where ℓ crosses it: the open sink's landmark. */
  square: FoldModelLine | null;
  /** The pockets a closed sink can go into, fewest lower faces first. */
  pockets: FoldPocket[];
  /** The scan stopped at its cap: more may exist. */
  truncated: boolean;
}

export interface FoldSinkAnalysed {
  analysis: FoldSinkPoint;
  /** Why an open sink of this point is refused, with its fixes; null when one may land. */
  open: Omit<FoldEngineRefused, 'status'> | null;
}

// ---------------------------------------------------------------------------
// The motion (plan D15)

/** Whether every frame is a pose the paper can take, or only the ends are states. */
export type FoldMotionKind = 'rigid' | 'visual';

/** A leg: the moving paper lifting to edge-on, or coming down to where it lands. */
export type FoldMotionLegName = 'spread' | 'close';

/** Which state's layer order draws the turning paper during a leg. */
export type FoldMotionStacking = 'parent' | 'landed';

/** Paper turning about one hinge during one leg. */
export interface FoldMotionGroup {
  /** The landed state's faces that turn together. */
  faces: number[];
  /** The hinge, in the parent's model frame. */
  axis: FoldModelLine;
  /** The side of `axis` the faces start on. */
  side: FoldSide;
  /** The turn at the leg's start and end, radians: 0 where they lay in the parent, ±π where they land; positive lifts toward +z. */
  from: number;
  to: number;
}

export interface FoldMotionLeg {
  name: FoldMotionLegName;
  stacking: FoldMotionStacking;
  groups: FoldMotionGroup[];
}

/** A compound step's motion: its legs, played in order. */
export interface FoldStepMotionLegs {
  kind: FoldMotionKind;
  legs: FoldMotionLeg[];
}

// ---------------------------------------------------------------------------
// A landed sink

export type FoldSinkStep = 'open' | 'closed' | 'unsink';

/** What a step stores for a sink, in the engine's shapes. */
export interface FoldSinkStored {
  pocket?: FoldStoredPocket;
  order?: FoldCompletionChoice;
}

/** What a sink or an unsink did (`FoldStepLanded.sink`). */
export interface FoldSinkReport {
  step: FoldSinkStep;
  /** ℓ after snapping, and the side the moving paper started on. */
  line: FoldModelLine;
  side: FoldSide;
  snap: FoldSnap;
  /** A closed sink's pocket. */
  pocket?: FoldPocket;
  /** The landed state's creases between the moved paper and the paper that stays: folded by a sink, flat after an unsink. */
  ring: number[];
  /** The parent's faces that move. */
  moving: number[];
  /** Per block, the landed state's faces in it. */
  blocks: number[][];
  /** The creases the step made. */
  created: number[];
  /** Folded creases that lie flat now. */
  unfolded: number[];
  /** Flat creases that fold again. */
  refolded: FoldRefold[];
  /** Folded creases whose letter turned. */
  reversed: number[];
  /** How many faces were split. */
  split: number;
  motion: FoldStepMotionLegs;
  /** What the step stores: the pocket chosen among several, the order chosen among several. */
  stored: FoldSinkStored;
}

/** How many orders a sink leaves with its choices (`sinkOrders`): one when it is decided. */
export interface FoldSinkOrders {
  count: { orders: number; exact: boolean };
  /** Per independent component, how many orders are listed to pick from. */
  components: { orders: number; truncated: boolean }[];
}

/** What a step stores for a pick (`sinkPick`); null when the sink is decided. */
export interface FoldSinkPicked {
  completion: FoldCompletionChoice | null;
}

/** A stored pocket as the document's choice holds it: the point above, then the point below. */
export function pocketChoice(pocket: FoldStoredPocket): readonly [SheetPoint, SheetPoint] {
  return [pocket.above, pocket.below];
}

/** What a landed sink's step stores, as the document's choices: none when it chose nothing. */
export function sinkStoredChoices(stored: FoldSinkStored): FoldChoices {
  return {
    ...(stored.pocket ? { pocket: pocketChoice(stored.pocket) } : {}),
    ...(stored.order && stored.order.orders.length > 0 ? { completion: stored.order } : {}),
  };
}
