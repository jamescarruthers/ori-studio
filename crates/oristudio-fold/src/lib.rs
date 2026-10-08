//! The Fold workspace's engine: fold a sheet the way a person does
//! (`implementation-plans/fold-workspace.md`, D1–D5; the evidence is
//! `research/2026-10-08-fold-workspace.md`).
//!
//! - [`State`]: a flat folded state — the crease pattern with stable ids
//!   ([`pattern`]), convex faces with their lineage, every face's isometry
//!   derived from a root and checked, the pairwise layer order, and the
//!   [`View`] kept outside the model frame. [`State::make`] is the only
//!   constructor and refuses, naming faces and vertices, anything that is not
//!   a valid flat folded state ([`refusal`]).
//! - [`PlainFold`]: valley and mountain folds through all layers or down to
//!   picked flaps, closed-form with no solver call ([`fold`]); precrease,
//!   refold, unfold, turn over and rotate.
//! - [`sheet`]: convex sheets — square, rectangle, regular polygon.
//! - [`numerics`]: one tolerance, line snapping and the minimum feature.
//! - [`scene`]: what a painter draws a state from (plan D12), a superset of
//!   the kernel's folded paper scene (schema 3) with each face's transform,
//!   the crease pattern and the faces' lineage.
//! - Queries for the tools and panes (plan D14): [`State::cross_section`],
//!   the paper along a fold line as display layers, with its flaps and
//!   "Layers"; [`State::depth_choices`], the distinct moving sets of the top
//!   1, 2, … layers at a point; [`State::fold_action`], a step's fold line
//!   with its visible and hidden spans, the faces that move and the arrow's
//!   grip; and [`summary`], the M/V/F counts and the crease-pattern diff.
//! - With the `kernel` feature: `kernel`, the one conversion to the CP
//!   kernel's model (plan D10), and `fold_file`, the FOLD export of a
//!   sequence path built on the kernel's FOLD writer.
//!
//! The layer order, its constraint problem and the checker are
//! `oristudio-layer-order`'s; the tolerance and the convex-polygon primitives
//! are `oristudio-geometry`'s.
//!
//! # Conventions (research §3.1)
//!
//! | | |
//! |---|---|
//! | Frames | Sheet coordinates: the unit sheet frame (y-up, longer side 1). The model frame: the folded frame the root-carried isometries give; the viewer of an unturned view is at +z. |
//! | Orientation | `det T_f = +1`: face f shows its front (front-up). |
//! | Order | `above(f, g)`: f is nearer +z of the model frame where they overlap. |
//! | Direction | Valley: the moving part rotates toward the viewer and lands on top. Mountain: away, underneath. As the viewer sees it. |
//! | Letters | Front-relative: a folded crease is V iff its front-up face lies below. |
//! | Turn over | Mirrors the view; every `above` inverts *as seen*; no letter changes. |

pub mod fold;
#[cfg(feature = "kernel")]
pub mod fold_file;
mod index;
pub mod isometry;
#[cfg(feature = "kernel")]
pub mod kernel;
pub mod numerics;
pub mod pattern;
pub mod refusal;
pub mod scene;
pub mod sheet;
pub mod state;
pub mod summary;
pub mod view;

#[cfg(feature = "kernel")]
pub use fold_file::{FoldExportError, export_fold_sequence, export_fold_sequence_json};
#[cfg(feature = "kernel")]
pub use kernel::{KernelFrame, fold_cp_to_model};

pub use fold::{
    ActionKind, ClosurePolicy, CrossSection, DepthChoice, FoldActionGeometry, FoldAnalysis,
    FoldLineSpan, FoldReport, Folded, Grip, Placement, PlainFold, Pleat, Push, Refold, RowOrder,
    SectionInterval, SectionRow, Seed, Snap,
};
pub use isometry::Isometry;
pub use pattern::{Crease, CreaseKind, EdgeId, Face, FaceId, Letter, VertexId};
pub use refusal::{Fix, Flap, FoldRefusal, NearMissCause, Refused, Side};
pub use scene::{FoldScene, ScenePoint};
pub use sheet::{Sheet, SheetShape};
pub use state::{State, StateParts};
pub use summary::{CreaseCounts, CreaseDiff, StepSummary};
pub use view::{Direction, StartSide, View};

/// The engine's behaviour version: bumped when the same inputs can land a
/// different state. Stored beside replay caches and on Diagram links for
/// diagnostics only; a bump alone never marks a link stale (plan D17).
pub const FOLD_ENGINE_VERSION: u32 = 1;
