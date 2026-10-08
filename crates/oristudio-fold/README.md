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
- `scene`: per state, a superset of the kernel's folded paper scene, schema 3
  (faces with sheet vertex ids and edge kinds, the overlay's cells with full
  stacks, sheet points), in the view's frame the way the kernel carries its
  rear pass, plus each face's transform, the crease pattern with Fold's edge
  ids and the step that made each crease, and the faces' lineage.
- `fold::section`: the cross-section along a fold line (D14): intervals cut
  where a face's contact with ℓ starts or ends, each with its stack; display
  layers (faces joined across F creases), ordered topologically with the
  unordered pairs named and a woven fallback; each row's flap; "Layers". And
  the depth-choice preview: the distinct moving sets of the top 1, 2, …
  layers at a point.
- `fold::action`: a fold's geometry on its parent (D12): ℓ across the
  silhouette, its visible and hidden spans, the moving faces, and a grip with
  its image and the layers over each.
- `summary`: per step, the M/V/F counts, the crease-pattern diff (added,
  reversed, unfolded, refolded) and "Layers".
- `kernel` (feature `kernel`, which adds `oristudio-cp` and `treemaker-fold`):
  `fold_cp_to_model`, the one conversion to the CP kernel's model (plan D10):
  B → `Black0`, M → `Red1`, V → `Blue2`, F remembering X → `None` with the
  direction hint X, placed where the kernel's FOLD reader puts every pattern
  (`KernelFrame`), so its FOLD writer and reader return the model to the bit.
- `fold_file` (feature `kernel`): the FOLD export of a sequence path,
  `file_classes: ["diagrams", "singleModel"]`. The root frame is the final
  crease pattern from the kernel's FOLD writer, which Edit opens like Send to
  Edit; each state is a flat `foldedForm` frame (`frame_parent: 0`,
  `frame_inherit: false`) with its vertices folded as the viewer sees them,
  `F` for unfolded creases, `faceOrders` in FOLD's convention, an
  `oristudio:fold-step` marker and per-face sheet → folded matrices in
  Beloch's `beloch:faces_matrix` layout under `oristudio:faces_matrix`. The
  size is held against the 3D writer's element cap (`interchange.rs`), summed
  over the whole file.
- `Unordered` and `complete`: parts whose layer order is still to be decided
  (the gate's checks up to the order, a crease whose letter is unknown folded
  without one), and the engine's one "complete the rest" entry: an adapter
  from `oristudio-layer-order`'s constraint problem and cells to
  `treemaker-flatfold`'s `complete_layer_order`, with fixed pairs *carried* or
  *seed*, per-component choices, a true ‹ n of m › with truncation reported,
  and a node or deadline budget. Import CP uses it now; compound folds will.
- `import`: Import CP (plan D16, D10's inverse) from plain segments, no kernel.
  The sheet from the border (`outline::detect_border_loops`, one loop, square
  or rectangle), matched against the sequence's sheet (a quarter turn when
  that is what fits) or adopted by an empty sequence; B, M, V kept,
  unassigned with a hint a precrease, unassigned without one folded with its
  letter left to the completion, aux a guide; the planar graph and convex
  faces, refusing a crease that is no full chord; the root continuing the
  previous state's. Completion is seeded by the letters, and "Start from
  Edit's folded figure" adds Oriedita's relations as seeds. Refusals have
  `import_*` codes and name points in the input's coordinates.
- `witness`: stored choices (plan D6) with faces named by interior sheet
  points and pairs as FOLD `faceOrders` triples, which read the same whatever
  the root's orientation; Import CP's `orderJson` and a compound fold's pick.
  Replay resolves the witnesses and completes: exactly one order, or the node
  is broken.

See `implementation-plans/fold-workspace.md` (D1–D6, D8, D10, D12, D14, D16) and
`research/2026-10-08-fold-workspace.md` (§3, §4, §6, §7, §10). The core spike
under `artifacts/fold-spike/core/` and the sink spike's importer were the
behavioural references; nothing is ported from them, and Flat-Folder's search
is called through `treemaker-flatfold`, not copied.

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
- `tests/queries.rs`: the output and queries. The cross-section's display
  layers (a layer crossed by a precrease is one row; two precreased layers are
  two rows, one flap or two by where the spine is), unordered rows, the depth
  picker, the action geometry (a hidden line behind, the back view), the
  summaries, the scene's kernel schema and a golden scene for the kite base
  (`tests/fixtures/scenes/kite-base.json`, both views; bless as above), then
  seeded random sequences checking every query against the state: each
  interval's stack against the stack just inside the moving side, rows within
  one isometry and one flap, never woven, spans on ℓ, the diff against the
  fold's report, nested depth choices, each cell's stack.
- `tests/kernel_scene.rs`: a Fold scene read as the kernel's
  `FoldedPaperScene`, and the kernel's own folded figure of the same crease
  pattern (the kite base, a Z-fold) agreeing with it from the front and the
  back: the same faces up and the same stacks as seen.
- `tests/import.rs`: Import CP on hand-built patterns. The preliminary and
  waterbomb bases with the sink spike's assignments import to 1 order with
  their letters and 18 without (the spike's Flat-Folder counts), the one
  stacked as the spike derived; a book fold to 1 and 2; the shape and chord
  refusals; a stored order replayed under renumbering and against a
  pattern whose letters contradict it; every pick of the open base replayed;
  the budget; Edit's folded figure through Oriedita's relations from either
  orientation; and a round trip of 129 seeded random folded states (2 to 52
  faces) through their crease patterns, each state's own order among the
  choices its letters leave.

`cargo test -p oristudio-fold --features kernel` adds:

- `tests/kernel.rs`: every state of the classics, a dyadic path and seeded
  random paths (square, rectangles, polygons) converts with one segment per
  crease and comes back equal, coordinates to the bit, through the kernel's
  FOLD writer and reader; through FOLD text, within `serde_json`'s default
  float parsing (one ulp seen), and to the bit on the dyadic path. The
  folding colours of all 228 folded states fold to `Solved` in Oriedita.
- `tests/fold_export.rs`: the root against the kernel writer and Edit's
  opener; every step frame against its state (vertices, edges, letters,
  rings); `faceOrders` against FOLD's rule read off the frame's own winding;
  the matrices against the frame's coordinates; a turn-over and a rotation;
  the whole-file cap refusing one element short; Edit saving the file with
  the step frames kept.

## Performance

`cargo run -p oristudio-fold --release --example perf`: all-layer folds along
random lines through the middle of the folded model, from the flat square to
more than 256 faces, 40 runs, bucketed by the landed state's faces like the
core spike's `perf.mjs`. Apple Silicon, native release build, 2026-10-08, one
run on a shared machine (load average 16–28; a run at load 50 was twice as
slow, so read p95 as pessimistic).

| Faces | Folds | Pairs (mean) | Closure | Fold mean / p95 | Full gate | Checker alone |
|---|---|---|---|---|---|---|
| 1–8 | 121 | 11 | 0.004 ms | 0.066 / 0.15 ms | 0.043 ms | 0.034 ms |
| 9–32 | 86 | 170 | 0.014 ms | 0.71 / 1.6 ms | 0.61 ms | 0.58 ms |
| 33–64 | 68 | 845 | 0.073 ms | 3.7 / 6.6 ms | 3.3 ms | 3.3 ms |
| 65–128 | 79 | 2,978 | 0.30 ms | 13.6 / 26.8 ms | 12.7 ms | 12.7 ms |
| 129–256 | 76 | 9,634 | 1.5 ms | 47.0 / 81.8 ms | 42.5 ms | 42.3 ms |

*Closure* is `State::analyse_fold` (snap, classify, pieces, flaps, U); *fold*
the whole operation, its incremental gate included; *full gate* `State::make`
from scratch on the landed parts; *checker alone* `oristudio-layer-order`'s
check with a newly built problem. The example also times a top-layer fold on
each landed state; on these random stacks rule (i) usually still joins most
layers, so it is no cheaper.

- **The fold's own work is small**: fold minus gate is about 0.3 ms at 33–64
  faces and 4 ms at 129–256, under the JS spike's p95 for the op alone (2.2 ms
  and 17.2 ms, research §12).
- **The gate dominates**, and almost all of it is the layer-order problem: at
  130–260 faces the overlay into cells is 10–30 ms and the constraint build
  another 10–25 ms (run the example with `FOLD_PERF_SPLIT=1` for the
  breakdown). Random all-layer folds touch nearly every face, so the
  incremental rebuild costs what a full build does, and the overlay is always
  rebuilt in full.
- These stacks are much deeper than real models (9,600 pairs at 129–256
  faces; Beloch's crane is 60 faces at step 17). Against the plan's tier-3
  budget (≤ 50 ms at 256 faces, in wasm) the gate is the part to make
  incremental: an overlay updated over the touched faces' region, in
  `oristudio-layer-order`.

Original work under `MIT OR Apache-2.0`.
