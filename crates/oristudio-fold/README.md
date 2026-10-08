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
  qualifier, a near miss with its landmark line, a sliver, and negative
  controls the gate must refuse.
- `tests/classics.rs`: the kite base and a flap unfold, a top layer's corner
  after two folds, a precrease through four layers then refold, and a tuck,
  each recorded under `tests/fixtures/classics/` as its operations and the
  canonical outcome of every step, and replayed from the JSON alone.
  Regenerate with `ORISTUDIO_FOLD_BLESS=1` and review the diff.
- `tests/random.rs`: seeded random sequences along lines through landmarks.
  Every landed state passes the full gate from scratch and a freshly built
  checker; every applied fold keeps each vertex's band between the line asked
  for and the line folded along, moves vertices rigidly and leaves creases off
  the line alone. About 760 folds per run (2 s in debug). A larger campaign
  is ignored by default:

  ```sh
  cargo test -p oristudio-fold --release --test random -- --ignored --nocapture
  ```

  On 2026-10-08 it applied 9,224 folds over four seeds (up to 178 faces) with
  no hard failure; the refusals were 1,902 "nothing stays", 1,029 "no moving
  side", 339 slivers, 288 near misses and 23 short creases.

## Performance

`cargo run -p oristudio-fold --release --example perf`: all-layer folds along
random lines through the middle of the folded model, from the flat square to
more than 256 faces, 40 runs, bucketed by the landed state's faces like the
core spike's `perf.mjs`. Apple Silicon, native release build, 2026-10-08, one
run on a shared machine (load average 17–23; a run at load 50 was twice as
slow, so read p95 as pessimistic).

| Faces | Folds | Pairs (mean) | Closure | Fold mean / p95 | Full gate | Checker alone |
|---|---|---|---|---|---|---|
| 1–8 | 121 | 11 | 0.004 ms | 0.050 / 0.094 ms | 0.028 ms | 0.020 ms |
| 9–32 | 86 | 170 | 0.015 ms | 0.34 / 0.68 ms | 0.25 ms | 0.21 ms |
| 33–64 | 68 | 845 | 0.073 ms | 1.3 / 2.3 ms | 0.97 ms | 0.91 ms |
| 65–128 | 79 | 2,978 | 0.29 ms | 3.9 / 7.0 ms | 2.8 ms | 2.8 ms |
| 129–256 | 76 | 9,634 | 1.5 ms | 11.9 / 21.3 ms | 7.6 ms | 7.7 ms |

The same example on the layer order before its rework (commit `c0a3d44`), run
straight after at load 12–16: 3.7 / 6.6 ms at 33–64 faces and 48.0 / 86.4 ms
at 129–256, the full gate 43.2 ms.

*Closure* is `State::analyse_fold` (snap, classify, pieces, flaps, U); *fold*
the whole operation, its incremental gate included; *full gate* `State::make`
from scratch on the landed parts; *checker alone* `oristudio-layer-order`'s
check with a newly built problem. The example also times a top-layer fold on
each landed state; on these random stacks rule (i) usually still joins most
layers, so it is no cheaper.

- **The fold's own work is small**: fold minus gate is about 0.3 ms at 33–64
  faces and 4 ms at 129–256, under the JS spike's p95 for the op alone (2.2 ms
  and 17.2 ms, research §12).
- **The gate is most of it**, and almost all of the gate is the layer-order
  problem: above 128 faces the overlay into cells is 5.0 ms, the rest of the
  constraint build 2.7 ms and the check on the built problem 0.7 ms (run the
  example with `FOLD_PERF_SPLIT=1` for the breakdown; before the rework, run
  back to back, they were 24, 21 and 11 ms).
- **The drop came from how the overlay is built** (`oristudio-layer-order`'s
  README) and from tables in place of ordered maps, more than from
  incrementality: random all-layer folds touch most faces, and nearly every
  other face overlaps one of them, so the rebuild still costs about what a
  build does. Where an operation is local it pays: on these states a rebuild
  naming one face costs 3.9 ms against 6.3 ms for a build (before: 23
  against 31 ms).
- These stacks are much deeper than real models (9,600 pairs at 129–256
  faces; Beloch's crane is 60 faces at step 17), and the plan's tier-3 budget
  is ≤ 50 ms at 256 faces in wasm.

Original work under `MIT OR Apache-2.0`.
