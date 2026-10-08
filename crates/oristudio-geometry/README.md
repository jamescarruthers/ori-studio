# oristudio-geometry

Shared origami geometry for Ori Studio, used by the precrease planner
(`oristudio-precrease`) and the Fold engine (`oristudio-fold`):

- `tol` — the one tolerance, in unit-sheet units and radians.
- `convex` — convex-polygon primitives: orientation, clipping, half-plane
  splits, overlap.
- Canonical lines, tolerance-aware indexes, sheet frames and outlines, and
  the seven Huzita–Justin constructions over a `Paper` (moved from
  `oristudio-precrease`, which re-exports them).

Original work under `MIT OR Apache-2.0`. See
`implementation-plans/fold-workspace.md` (D9) for why these live together.
