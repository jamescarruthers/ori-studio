/**
 * What the Fold tools read from the engine, as TypeScript: the serde shapes of
 * `crates/oristudio-fold` (`refusal.rs`, `fold/mod.rs`, `view.rs`) and of the
 * cross-section query plan D14 specifies.
 *
 * Mirrored by hand until the bridge (`oristudio-fold-wasm`, plan Phase 4a)
 * exists; the bridge then hands these shapes over unchanged, so field names are
 * the Rust ones — snake_case, tagged unions keyed by `code` and `fix` as serde
 * writes them. Face and vertex ids are the engine's numbers.
 *
 * React-free and store-free: data only.
 */

/** A point in sheet coordinates (y-up, longer side 1) or the model frame. */
export type FoldPoint = readonly [number, number];

/** An infinite line `n · p = d`, `|n| = 1` (`oristudio_geometry::Line`). */
export interface FoldLine {
  readonly n: readonly [number, number];
  readonly d: number;
}

/** A side of a line, relative to its normal: `positive` is where `n · p > d` (`refusal::Side`). */
export type FoldSide = 'positive' | 'negative';

/** A plain fold's direction, as the viewer sees it (`view::Direction`). */
export type FoldDirection = 'valley' | 'mountain';

/**
 * A flap: a connected part of the moving side, joined across creases with an
 * end on the moving side (plan D3). The chips and the layer picker use this
 * grouping and never one of their own.
 */
export interface FoldFlap {
  /** Its faces, ascending. */
  readonly faces: readonly number[];
  /** An interior sheet point of one of its faces: what a seed names it by (D6). */
  readonly witness: FoldPoint;
}

/** Why a near miss is one (`refusal::NearMissCause`). */
export type FoldNearMissCause = 'band' | 'snap_changes_side' | 'snap_ambiguous';

/** Every refusal code, in `FoldRefusal::code`'s order: the stable ids the UI and analytics use (D18). */
export const FOLD_REFUSAL_CODES = [
  'sheet_too_few_points',
  'sheet_not_finite',
  'sheet_not_convex',
  'sheet_side_too_short',
  'sheet_not_in_unit_frame',
  'invalid_rectangle',
  'invalid_sides',
  'duplicate_id',
  'unknown_vertex',
  'crease_unknown_vertex',
  'unused_vertex',
  'face_too_small',
  'missing_crease',
  'crease_face_count',
  'non_convex_face',
  'area_mismatch',
  'unknown_root',
  'unreached_face',
  'residual',
  'hinge_orientation',
  'folded_image',
  'layer_order',
  'no_moving_side',
  'near_miss',
  'witness_not_in_face',
  'seed_not_on_moving_side',
  'empty_seed',
  'nothing_stays',
  'closure_adds_flaps',
  'tuck_target_moves',
  'degenerate_split',
  'short_crease',
  'thin_piece',
  'sliver',
  'prediction_mismatch',
  'precrease_unfold_moved_more',
] as const;

export type FoldRefusalCode = (typeof FOLD_REFUSAL_CODES)[number];

/**
 * A refusal (`refusal::FoldRefusal`), tagged by its code. Only the fields the
 * tools read are typed; every variant carries the rest of its Rust fields too.
 */
export type FoldRefusal =
  | { readonly code: 'closure_adds_flaps'; readonly added: readonly number[] }
  | {
      readonly code: 'near_miss';
      readonly vertex: number;
      readonly distance: number;
      readonly cause: FoldNearMissCause;
    }
  | { readonly code: 'sliver'; readonly vertex: number; readonly face: number; readonly penetration: number }
  | { readonly code: Exclude<FoldRefusalCode, 'closure_adds_flaps' | 'near_miss' | 'sliver'> };

/** A remedy the engine offers with a refusal (`refusal::Fix`, plan D14). */
export type FoldFix =
  /** Include these flaps (indices into the analysis' flaps), which the closure would move anyway. */
  | { readonly fix: 'include_flaps'; readonly flaps: readonly number[] }
  /** The same fold the other way is valid. */
  | { readonly fix: 'opposite_direction' }
  /** Everything would move: pick one of these flaps to fold. */
  | { readonly fix: 'pick_flap'; readonly flaps: readonly FoldFlap[] }
  /** Fold along this landmark line instead, with the same moving side. */
  | { readonly fix: 'use_line'; readonly line: FoldLine; readonly side: FoldSide };

/** A refused operation and what could be done instead (`refusal::Refused`). */
export interface FoldRefused {
  readonly refusal: FoldRefusal;
  readonly fixes: readonly FoldFix[];
}

/** The snap actually applied to the fold line (`fold::Snap`, plan D5). */
export interface FoldSnap {
  readonly clusters: number;
  readonly angle: number;
  readonly max_shift: number;
}

/** What a fold would move, before anything is cut (`fold::FoldAnalysis`, plan D14 tier 2). */
export interface FoldAnalysis {
  readonly line: FoldLine;
  readonly side: FoldSide;
  readonly snap: FoldSnap;
  /** In the model frame. */
  readonly direction: FoldDirection;
  readonly flaps: readonly FoldFlap[];
  /** The flaps the seed named. */
  readonly picked: readonly number[];
  /** The flaps the closure added beyond those. */
  readonly added: readonly number[];
  /** U: the faces that move, in id order. */
  readonly moving: readonly number[];
}

/**
 * A display layer where it meets the fold line (D14 cross-section, 2): faces
 * joined across flat creases, which share one isometry. Rows, row counts and
 * picker targets are display layers, never faces, so one physical layer
 * crossed by a precrease is one row.
 */
export interface FoldSectionLayer {
  /** Its faces, ascending. */
  readonly faces: readonly number[];
  /** Where it meets ℓ, as parameters along the line, from ≤ to. */
  readonly span: readonly [number, number];
  /** The flap it belongs to (an index into the section's flaps); null for a layer that stays. */
  readonly flap: number | null;
  /**
   * The stacks do not order it against the row above: their spans are
   * disjoint, and span position put it here (D14 cross-section, 3).
   */
  readonly unordered: boolean;
}

/** One stretch of ℓ between subface boundaries, with its stack (D14 cross-section, 1). */
export interface FoldSectionInterval {
  readonly span: readonly [number, number];
  /** Its `faces_top_to_bottom` stack. */
  readonly faces: readonly number[];
  /** The same stack as display layers, top to bottom: indices into the section's layers. */
  readonly layers: readonly number[];
}

/**
 * Where a fold that crosses ℓ joins two rows: the bracket the picker draws,
 * at the parameter along ℓ where the folded edge meets the line.
 */
export interface FoldSectionJoin {
  /** Indices into the section's layers; `upper` is the higher row. */
  readonly upper: number;
  readonly lower: number;
  readonly at: number;
}

/**
 * The cross-section at the fold line (plan D14), computed once per line, side
 * and direction (tier 2), whatever the seed.
 */
export interface FoldCrossSection {
  /** The moving side's flaps (D3), which the layers name by index. */
  readonly flaps: readonly FoldFlap[];
  /** The display layers as rows, top to bottom as the viewer sees them. */
  readonly layers: readonly FoldSectionLayer[];
  readonly intervals: readonly FoldSectionInterval[];
  readonly joins: readonly FoldSectionJoin[];
  /** "Layers": the maximum stack depth along ℓ, in display layers (D14 cross-section, 5). */
  readonly depth: number;
  /**
   * Grouping faces into layers made a cycle (a woven layer): the row order is
   * meaningless, and only the per-interval stacks are shown, one interval at
   * a time.
   */
  readonly woven: boolean;
}
