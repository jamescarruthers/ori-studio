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
mod index;
pub mod isometry;
pub mod numerics;
pub mod pattern;
pub mod refusal;
pub mod sheet;
pub mod state;
pub mod view;

pub use fold::{
    ClosurePolicy, FoldAnalysis, FoldReport, Folded, Placement, PlainFold, Refold, Seed, Snap,
};
pub use isometry::Isometry;
pub use pattern::{Crease, CreaseKind, EdgeId, Face, FaceId, Letter, VertexId};
pub use refusal::{Fix, Flap, NearMissCause, Refusal, Refused, Side};
pub use sheet::{Sheet, SheetShape};
pub use state::{State, StateParts};
pub use view::{Direction, StartSide, View};

/// The engine's behaviour version: bumped when the same inputs can land a
/// different state. Stored beside replay caches and on Diagram links for
/// diagnostics only; a bump alone never marks a link stale (plan D17).
pub const FOLD_ENGINE_VERSION: u32 = 1;
