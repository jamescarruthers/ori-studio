//! Shared origami geometry for Ori Studio.
//!
//! The pieces the precrease planner (References workspace) and the Fold engine
//! both need, so each exists once:
//!
//! - [`tol`]: the one tolerance, in unit-sheet units and radians.
//! - [`convex`]: convex-polygon primitives (orientation, clipping, half-plane
//!   splits, overlap) used by the layer-order crate and the Fold engine.
//!
//! The precrease modules (canonical lines, point and line indexes, sheet
//! frames and outlines, and the Huzita–Justin constructions over a `Paper`)
//! move here from `oristudio-precrease`, which re-exports them; see
//! `implementation-plans/fold-workspace.md` (D9).
//!
//! # Coordinate space
//!
//! The unit sheet frame: y-up, origin at the lower left, longer side 1 (the
//! precrease and ReferenceFinder convention). Tolerances are fractions of that
//! sheet.

pub mod convex;
pub mod tol;
