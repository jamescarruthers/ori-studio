//! The tolerance policy shared by the precrease planner and the Fold engine.
//!
//! Provisional: `oristudio-precrease/src/tol.rs` moves here (with its
//! derivation from Oriedita's point epsilon) in the plan's Phase 1a. Until
//! then this holds the same value so dependants can compile against it.

/// Position tolerance in unit-sheet units and direction tolerance in radians.
pub const TOL: f64 = 1e-6;
