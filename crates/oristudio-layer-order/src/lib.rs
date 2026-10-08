//! Layer order for flat folded states.
//!
//! Holds what the Fold engine, the "start from Edit's folded figure" bridge
//! and the oracle tests share (plan D8, `implementation-plans/fold-workspace.md`):
//!
//! - the pairwise order on overlapping faces (cyclic relations allowed,
//!   undetermined pairs reported), with conversions to FOLD `faceOrders` and
//!   to Oriedita's convention;
//! - the overlay of convex face images into cells;
//! - the constraint problem (variables, taco-taco, taco-tortilla and
//!   tortilla-tortilla buckets, transitivity from shared cells);
//! - one checker that names faces.
