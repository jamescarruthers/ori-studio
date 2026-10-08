# oristudio-fold

The Fold workspace's engine: fold a sheet the way a person does. A flat folded
state, the one constructor that validates it, and the plain fold.

- `state`: the crease pattern with stable ids (`B | M | V | F`, an F crease
  remembering its last letter, every crease the step that made it; letters
  front-relative), convex faces with their lineage, isometries derived from a
  stationary root and checked, never averaged, the pairwise layer order in
  absolute terms, and the view (turn-over, rotation) kept outside the model
  frame. `State::make` is the only constructor: residual, hinge consistency,
  convexity, order completeness, the constraint families through
  `oristudio-layer-order`'s checker, and letters against the order, each
  refusal naming faces and vertices.
- `fold`: the plain fold, closed-form. Snap ℓ through landmarks unless that
  changes a vertex's class, classify once, close the moving set under
  adjacency (creases with an end on the moving side) and overlap (layers above
  for a valley, below for a mountain), split each crossed crease once, toggle
  hinges on ℓ, re-derive and check the isometries, carry the order by block and
  place the movers, derive the letters. Seeds: all layers, a depth at a sheet
  point, or flaps by sheet points; a tuck over or under a named face is accepted
  only if it validates. Precrease, refold, unfold, turn over and rotate.
- `sheet`: convex sheets only — square, rectangle, regular polygon with its
  first vertex at −π/2, or a convex outline in the unit frame.
- `numerics`: tol = 1e-6 of the sheet (the shared `TOL`) and the minimum
  feature μ = 1e-3, refusing near misses, short creases, thin pieces and
  slivers between faces whose relative isometry changed.
- `refusal`: typed refusals with stable codes and the fixes the engine can offer
  (include the flaps the closure adds, fold the other way, pick a flap, fold
  along the landmark line).

See `implementation-plans/fold-workspace.md` (D1–D5) and
`research/2026-10-08-fold-workspace.md` (§3, §4, §6). The core spike under
`artifacts/fold-spike/core/` was the behavioural reference; nothing is ported
from it.

## Tests

`cargo test -p oristudio-fold` runs:

- the unit tests beside each module;
- `tests/golden.rs`: the spike's sign conventions G1–G12 (valley and mountain
  from the front and the back, two layers, the top layer's corner, precrease,
  refold, unfold, the all-moving refusal, a rectangle), the closure (i)
  qualifier, and negative controls the gate must refuse.

Original work under `MIT OR Apache-2.0`.
