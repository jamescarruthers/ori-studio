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

The axioms on flat and folded forms (plan Phase 3):

- `anchor`: what a stored step names paper by — sheet points and sheet
  segments — resolved in a state's model frame, boundaries included.
- `landmarks`: vertex images, raw edges, bends, visible creases, crossings and
  Divide-line marks (passed in as sheet points), deduplicated within the
  tolerance with every source kept, each source with the anchor a step stores.
  Visibility comes from the layer order as the viewer sees it, probed just
  inside each of a feature's faces. Also the existing-crease pick and the top
  visible layer at a point, where a mark goes.
- `silhouette`: the union of the face images as the `Paper` the constructions
  fold: per-face runs along a line merged within the tolerance.
- `axioms`: O1–O7 on anchors through `oristudio_geometry::construct`, each root
  with its moving side from the axiom's movers, or none for the step to name
  (O1, O4, an O3 whose `m1` straddles the fold, an O6 whose points lie on
  opposite sides: either side moves one point and the other's line); replay
  to the candidate nearest the stored line.
- `anchored`: a plain fold whose line is an axiom and its root, an existing
  crease or bend, or a free line through two sheet points; its side from the
  axiom, a `toward` point or the seed; the axiom's movers must be on layers
  that move.
- `remedy`: a fold refused as a sliver is offered the exact O5 or O7 line its
  pins allow (a point the line passes through, a line it is perpendicular to),
  as a step it can store, only if that lands.

See `implementation-plans/fold-workspace.md` (D1–D6, D8, D10, D12, D14, D16;
Phase 3) and `research/2026-10-08-fold-workspace.md` (§3, §4, §6, §7, §10).
The core spike under `artifacts/fold-spike/core/` and the sink spike's
importer were the behavioural references; nothing is ported from them, and
Flat-Folder's search is called through `treemaker-flatfold`, not copied.

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
- `tests/random.rs`: seeded random sequences along lines through landmarks,
  drawn by the `random` module below. Every landed state passes the full gate
  from scratch and a freshly built checker; every applied fold keeps each
  vertex's band between the line asked for and the line folded along, moves
  vertices rigidly and leaves creases off the line alone. About 760 folds per
  run (2 s in debug). A larger campaign is ignored by default:

  ```sh
  cargo test -p oristudio-fold --release --test random -- --ignored --nocapture
  ```

  On 2026-10-08 it applied 9,224 folds over four seeds (up to 178 faces) with
  no hard failure; the refusals were 1,902 "nothing stays", 1,029 "no moving
  side", 339 slivers, 288 near misses and 23 short creases. Its ignored
  `campaign_digest` prints a hash of every step's outcome over the same
  campaign, landed states to the bit: a change meant to leave the engine's
  results alone must print the digest the build before it does.
- `random` (feature `random-sequences`): the seeded sequences and their
  SplitMix64 generator as a library module, so the oracles replay exactly the
  draws the property tests make: `crates/oracle-tests`' `fold_oracle` checks
  the campaign's sequences against Oriedita and Flat-Folder. The crate is its
  own dev-dependency with the feature, so every test and example here draws
  from it and `cargo test -p oristudio-fold` runs its tests too.
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
- `tests/axioms.rs`: every axiom on flat sheets (a square, a rectangle, a
  precreased square) against `oristudio-geometry`'s construction on the
  rectangle, hundreds of roots each; every axiom on the book fold and on four
  stacked layers, both stacked copies of a mover landing on its target; axioms
  over the landmarks of random folded forms, each candidate stating its axiom
  before the fold and each landed fold after it; O6 roots with the points on
  opposite sides folded from either side, on the flat square (every such root
  of 4,000 random inputs) and on the book fold, with the mover check; replay
  after an inserted precrease and after a fold that takes one root's landing
  away; the existing-crease mode unfolding and refolding; a mover left behind;
  and the sliver remedy for an O4, a free line and an O2 (none).

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
run on a shared machine (load average 9–15; a run at load 50 was twice as
slow, so read p95 as pessimistic).

| Faces | Folds | Pairs (mean) | Closure | Fold mean / p95 | Full gate | Checker alone |
|---|---|---|---|---|---|---|
| 1–8 | 121 | 11 | 0.003 ms | 0.045 / 0.082 ms | 0.025 ms | 0.017 ms |
| 9–32 | 86 | 170 | 0.008 ms | 0.29 / 0.56 ms | 0.23 ms | 0.19 ms |
| 33–64 | 68 | 845 | 0.021 ms | 1.05 / 1.74 ms | 0.89 ms | 0.83 ms |
| 65–128 | 79 | 2,978 | 0.049 ms | 3.0 / 5.4 ms | 2.6 ms | 2.5 ms |
| 129–256 | 76 | 9,634 | 0.14 ms | 8.4 / 13.2 ms | 7.1 ms | 7.1 ms |

Against the engine before its closure index and landing were reworked (the
Wave 2 integration, `00954c01f`), three runs of each build alternated at
load 8–17: at 129–256 faces the fold was 11.8–12.1 / 21.9–22.6 ms (mean /
p95) and is 8.1–8.4 / 12.7–13.1 ms; the closure 1.6 ms and 0.14 ms; the full
gate 7.5–8.0 ms and 6.9–7.1 ms. At 65–128 faces, 3.8–4.0 / 6.9–7.1 ms and
2.9–3.2 / 5.2–6.7 ms. Every result is the same: the random campaign's
digest (`campaign_digest` in `tests/random.rs`, every landed state to the
bit over 14,774 steps) is identical on both builds. The layer order before
its own rework (commit `c0a3d44`) took 48.0 / 86.4 ms at 129–256.

*Closure* is `State::analyse_fold` (snap, classify, pieces, flaps, U); *fold*
the whole operation, its incremental gate included; *full gate* `State::make`
from scratch on the landed parts; *checker alone* `oristudio-layer-order`'s
check with a newly built problem. The example also times a top-layer fold on
each landed state; on these random stacks rule (i) usually still joins most
layers, so it is no cheaper.

- **The fold's own work is small**: fold minus gate is about 0.2 ms at 33–64
  faces and 1.3 ms at 129–256, under the JS spike's p95 for the op alone
  (2.2 ms and 17.2 ms, research §12). Most of what it was went to two
  places: the box index returned each of a stack's large boxes once per grid
  cell and sorted the repeats away, which was most of the closure; and
  landing tested every touched pair's children for overlap with a fresh
  penetration (a `hypot` per edge per test) and inserted the new order pair
  by pair. The index now takes a box in one cell and sizes its cells to the
  boxes; landing keeps each face's edge planes, stops an overlap test at the
  first plane that settles it, and builds the order in one sort.
- **The gate is most of it**, and almost all of the gate is the layer-order
  problem: above 128 faces the constraint build is 6.5 ms, 4.0 ms of it the
  overlay into cells, and the check on the built problem 0.7 ms (run the
  example with `FOLD_PERF_SPLIT=1` for the breakdown; before the layer
  order's rework they were 45 ms, 24 of it the overlay, and 11 ms).
- **Incrementality pays where an operation is local**: random all-layer
  folds touch most faces, and nearly every other face overlaps one of them,
  so their rebuild costs about what a build does. On these states a rebuild
  naming one face cost 3.9 ms against 6.3 ms for a build.
- These stacks are much deeper than real models (9,600 pairs at 129–256
  faces; Beloch's crane is 60 faces and 770 pairs), and the plan's tier-3
  budget is ≤ 50 ms at 256 faces in wasm.

`cargo run -p oristudio-fold --release --example sequences`: the same steps
on real sequences. Every state of the classic sequences with the sequence's
own next fold or precrease, and the final frame of each Beloch fixture
(`tests/fixtures/beloch/`) that replays: the file's crease pattern through
Import CP with the frame's own `faceOrders` as the stored order, a valley
fold along each of the state's crease lines from either side standing in
for the next step. Each time is the median of 15 runs; 2026-10-08, load
average 9–14.

| Sequence | States | Faces | Pairs | Scene | Landmarks | Cross-section mean / max | Depth choices mean / max | Fold mean / max (landed of tried) |
|---|---|---|---|---|---|---|---|---|
| kite-base | 5 | 4 | 2 | 0.001 ms | 0.008 ms | 0.002 / 0.002 ms | 0.003 / 0.006 ms | 0.012 / 0.015 ms (4 of 4) |
| precrease-four-layers | 5 | 8 | 28 | 0.002 ms | 0.023 ms | 0.002 / 0.003 ms | 0.007 / 0.012 ms | 0.023 / 0.048 ms (4 of 4) |
| top-layer-corner | 5 | 7 | 17 | 0.004 ms | 0.025 ms | 0.002 / 0.003 ms | 0.009 / 0.019 ms | 0.017 / 0.029 ms (4 of 4) |
| tuck-under-top | 3 | 3 | 3 | 0.001 ms | 0.008 ms | 0.002 / 0.002 ms | 0.003 / 0.005 ms | 0.010 / 0.012 ms (2 of 2) |
| Beloch, 2–8 faces | 42 | 8 | 28 | 0.003 ms | 0.029 ms | 0.002 / 0.006 ms | 0.009 / 0.049 ms | 0.011 / 0.056 ms (86 of 204) |
| Beloch, 9–16 faces | 4 | 16 | 120 | 0.007 ms | 0.106 ms | 0.005 / 0.012 ms | 0.050 / 0.238 ms | 0.036 / 0.111 ms (22 of 48) |
| Beloch crane | 1 | 60 | 770 | 0.28 ms | 1.1 ms | 0.040 / 0.089 ms | 1.75 / 3.37 ms | 1.10 / 1.91 ms (34 of 38) |

Faces and pairs are the most in a row; scene and landmarks the slowest
state's. 47 of the 56 Beloch fixtures replay. The rest, with the engine's
reason: cube-root, mark-overlay-regression and marks-demo (the file's crease
pattern does not fold flat as Import CP reads it), def-diagonals (its four
faces have no valid order), x-midpoint (the frame's order breaks a
taco-taco constraint on the imported faces), side-preliminary-1 to 3 (a
frame face's centroid lies in no imported face) and join-edge (a `J` edge,
which Import CP does not read).

Against D14's tiers, natively and nothing near a budget: per line, side and
direction (tier 2, which while a free line is dragged comes once per
pointer move, so held to tier 1's 4 ms) the crane's cross-section takes at
most 0.09 ms and its depth choices 3.4 ms, the closest to a budget, since
they analyse the fold once per layer at the point; per state (tier 2) its
scene takes 0.28 ms and its landmarks 1.1 ms; and a landed fold (tier 3,
≤ 50 ms at 256 faces in wasm) at most 1.9 ms, with the random 129–256-face
stacks at 13 ms p95.

`cargo run -p oristudio-fold --release --example landmarks`: every landmark of
a state and the candidates of an O2 and an O6 over them, on states made the
same way. 2026-10-08, one run at load average 138, so pessimistic:

| Faces | States | Points | Segments | Landmarks mean / p95 | O2 candidates | O6 candidates |
|---|---|---|---|---|---|---|
| 1–8 | 120 | 17 | 13 | 0.04 / 0.08 ms | 0.003 ms | 0.003 ms |
| 9–32 | 85 | 76 | 50 | 0.36 / 0.77 ms | 0.005 ms | 0.008 ms |
| 33–64 | 62 | 190 | 110 | 1.64 / 2.78 ms | 0.012 ms | 0.017 ms |
| 65–128 | 78 | 395 | 211 | 5.84 / 11.1 ms | 0.023 ms | 0.029 ms |
| 129–256 | 54 | 697 | 363 | 18.1 / 32.1 ms | 0.036 ms | 0.050 ms |

Landmarks are once per state, cached with it (plan D14 tier 2); a candidate
list is once per set of picked inputs.

Original work under `MIT OR Apache-2.0`.
