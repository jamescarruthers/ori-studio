//! Layer order for flat folded states.
//!
//! Holds what the Fold engine, the "start from Edit's folded figure" bridge
//! and the oracle tests share (plan D8, `implementation-plans/fold-workspace.md`):
//!
//! - [`view`]: the input, a folded state as face images and the creases
//!   between them;
//! - [`order`]: the pairwise order on overlapping faces (cyclic relations
//!   allowed, undetermined pairs reported), with conversions to FOLD
//!   `faceOrders` and to Oriedita's convention;
//! - [`overlay`]: the overlay of convex face images into cells;
//! - the constraint problem (variables, taco-taco, taco-tortilla and
//!   tortilla-tortilla buckets, transitivity from shared cells);
//! - one checker that names faces.
//!
//! Everything is decided at the one tolerance, `oristudio_geometry::tol::TOL`,
//! with the convex primitives of `oristudio_geometry::convex`.

pub mod error;
pub mod order;
pub mod overlay;
pub mod view;

pub use error::LayerOrderError;
pub use order::{FacePair, LayerOrder, OrieditaRelation, Stacking};
pub use overlay::{Cell, Overlay};
pub use view::{Edge, EdgeKind, Face, FaceId, FoldedView, Letter};
