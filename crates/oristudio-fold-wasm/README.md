# oristudio-fold-wasm

The wasm-bindgen bridge for `oristudio-fold`, the Fold workspace's engine
(`implementation-plans/fold-workspace.md`, D1 and Phase 4a). The web app
runs it in `apps/web/src/workers/foldSequenceWorker.ts`; the TypeScript
shapes are `apps/web/src/fold/engine/foldEngineWire.ts`.

- **States stay here, by handle.** `FoldEngine` holds every landed state
  under a `u32` until it is released, so a step is one call whatever the
  state's size and a replay's cache holds handles, not copies. A worker that
  is terminated and respawned starts a new engine, which holds none of the
  old handles (`unknown_state`); the web side stamps each handle with its
  worker's generation so an old one is never sent to a new engine.
- **Coarse calls.** `sheet(paper)`; `apply(state, op, choices)` for valley,
  mountain, precrease, unfold, refold, turn and rotate, along a free line, a
  crease or an axiom; `summary`; `canonical_keys` for the `fs1` fingerprint;
  `release`, `clear`, `live`.
- **Queries on a handle** (plan D12, D14): `analyse(state, op, choices)`, what
  a fold would move (the moving set, the flaps, which the seed picked and
  which the closure added); `action(state, op, choices)`, its picture before
  it lands; `depth_choices(state, op, choices, at)`; `cross_section(state,
  line, side)`, the engine's section plus the `joins` where a bend meets the
  line between two rows (`src/joins.rs`); `axiom_candidates(state, line)`,
  each root's number, line and who moves, for the candidate chooser; `scene`;
  `landmarks(state, marks)`, Divide-line marks passed in as sheet points;
  `top_visible_at(state, at)`. A held state remembers the step that landed
  it, so `step_summary(state)` (counts, the crease-pattern diff, "Layers")
  and `step_action(state)` (the step's picture with the landed cover) are
  asked of the child alone, while its parent is still held
  (`parent_released` otherwise). An import keeps no parent: it replaces the
  state, so its summary is the pattern it brings (its counts, an empty diff,
  no layers) and it has no picture.
- **The document's shapes in** (`src/wire.rs`). A stored step crosses
  unchanged and resolves in its parent (`src/resolve.rs`) through
  `oristudio-fold`'s anchored folds: a free line through two sheet points'
  images, an existing crease by a point on it, an axiom on its inputs in the
  shared crate's slot order with its stored root (`choices.root`) replayed to
  the nearest candidate; sheet points through `State::resolve_point`; the
  moving side from the axiom, `moving` or the seed. The tools may also send a
  line already in the model frame (`via: 'model'`) with a `side`, a tuck's
  `placement` and the `closure` policy.
- **Refusals are values**: `{ status: 'refused', refusal: { code, … },
  fixes, faces, vertices }`, never a sentence. Codes are the engine's
  (`FoldRefusal`), an anchored line's (`LineRefusal`: `point_off_paper`,
  `free_line_too_short`, `no_root`, `no_side`, `side_on_line`,
  `mover_stays`, …) and the bridge's own (`unexpected_choice`,
  `root_missing`, `crease_not_found`, `crease_not_flat`,
  `crease_not_folded`, and Import CP's `import_*` for a stored `cp-jump`
  that no longer lands); they never collide. A sliver
  remedy's `use_line` fix also carries `step`, the document's op and
  choices that fold along it. Only a caller's mistake — malformed input, a
  handle this engine does not hold — throws, as the `{ code, message }`
  envelope every bridge uses.
- **Compound folds** (plan D4, `src/compound.rs`) are steps like any other —
  `apply`, `analyse`, `action`, `depth_choices`, a step's summary and
  picture — through one seam: a family's op resolves to a `CompoundOp`, and
  what it lands is held as a `CompoundLanded`, so each family is a module of
  its own (`src/ops_<family>.rs`) with an arm in `wire.rs` and
  `resolve.rs`. A landed one reports beside a plain fold's `report` as
  `compound`, tagged by its `op`. Their choices are the engine's own
  (plan D6): `opening`, per flap, its upper block by witnesses, and
  `completion`, the free pairs as FOLD `faceOrders` over witnesses. A step
  whose stored choices leave several results is refused as `choice_needed`
  (naming `opening` or `completion`), and one whose stored choice no longer
  resolves as `choice_broken` with the engine's cause; a replay marks
  either broken. The reverse fold (`src/ops_reverse.rs`: `inside-reverse`,
  `outside-reverse`) adds `reverse(state, op, choices)`, the tools' one
  query: the tip and each flap's openings, the kinds that land, and the
  choice still needed — an opening, or, per kind, up to eight orders, each
  the `completion` that picks it — of both kinds at once, so the answer
  does not wait on the kind.
- **`fs1` keys** (`src/canonical.rs`): one per fact of the state, none naming
  a face, vertex or crease by its number; the digest over them is
  TypeScript's `keyDigest`.
- **Import CP, Send to Edit and the FOLD export** (`src/io.rs`; plan D10,
  D16), through the CP kernel's own loaders and writers (below):
  - `import_cp(file, bytes, target, limits)` reads a `.cp`, `.fold`, `.ori`
    or `.orh` file (`file` is its format, and whether it is one of the
    samples, `tests/fixtures/fold-samples`), imports it into an empty
    sequence (which adopts its square or rectangle) or after a state, and
    completes its layer order
    from its letters: a true ‹ n of m ›, within a node budget, held under an
    import handle. `import_pick(import, choice)` lands one order as a step
    and returns the `cp-jump` op that stores it, landed by `apply` exactly
    as every replay will land it; `release_imports`, `live_imports`.
  - `import_edit_folded_figure(scene, target, limits)` starts from Edit's
    folded figure: the kernel's folded paper scene, whose stacks decide the
    order (Oriedita's relations, `ImportedPattern::from_oriedita`).
  - `send_to_edit(state, title)` is the state's crease pattern as the FOLD
    text Edit's import takes; `export_fold(states, title)` a path of states
    as one FOLD file.
  - A stored `cp-jump` — `cpJson`, the pattern as the kernel's FOLD writer
    writes it; `orderJson`, the order by sheet-point witnesses — is applied
    like any op: imported after its parent, its witnesses deciding the
    order, or refused (`import_*`) and the step broken.
- **Sinks** (`src/ops_sinks.rs`; plan Phase 11): `open-sink`, `closed-sink`
  and `unsink` ops land through `apply`, their line resolved as a fold's,
  the seed naming the point (or the sunk tip), and `choices.pocket` (a
  sheet point either side of a closed sink's pocket) and
  `choices.completion` (the engine's `WitnessOrder`, as `orderJson` holds a
  whole order) stored as results. `apply`'s answer carries the engine's
  `sink` report, its motion's legs among it. A sink that needs a choice the
  step does not store is refused `choice_needed` (`pocket` or `completion`);
  a stored one that no longer resolves, `choice_broken` — the compound
  folds' own codes (`src/compound.rs`). `sink_analysis` previews the point (its
  outline, outside letter, apex, the square line, why an open sink is
  refused, the pockets with what a step stores), `sink_orders` counts what a
  completion leaves, and `sink_pick` gives the completion a step stores.

## The `kernel` feature

`oristudio-fold`'s `kernel` feature is on (plan D1), so the browser reuses
the CP kernel's loaders and writers rather than a second copy of them: Import
CP reads files with them, Send to Edit and the FOLD export write with them,
and a step's `cpJson` is the kernel's FOLD. The bridge now links
`oristudio-cp` (the Oriedita port) and `treemaker-fold`, both MIT OR
Apache-2.0; nothing it reaches has an edge to `treemaker-core`.

## Size

`npm --workspace @treemaker/web run build:oristudio-fold-wasm` (release,
`wasm-opt` by wasm-pack's default), 2026-10-08:

| Build | `.wasm` raw | gzip -9 |
|---|---|---|
| Without `kernel`, before the queries (sheet, analyse, apply, summary, keys; the same engine) | 641,223 B (626 KiB) | 236,181 B (231 KiB) |
| Without `kernel`, with the queries and axiom ops | 907,733 B (886 KiB) | 336,478 B (329 KiB) |
| With `kernel` and the io calls, before the queries | 1,594,829 B (1,557 KiB) | 655,855 B (640 KiB) |
| With `kernel`, the io calls, the queries and axiom ops | 1,879,638 B (1,836 KiB) | 752,479 B (735 KiB) |
| The same at `d0990bbde`, with the compound pipeline and the reverse folds (2026-10-09) | 1,916,660 B (1,872 KiB) | 768,949 B (751 KiB) |
| With the vertex folds: squash, petal fold, rabbit ear, swivel (2026-10-09) | 2,162,136 B (2,111 KiB) | 862,907 B (843 KiB) |

The vertex folds add **245,476 B raw (+240 KiB), 93,958 B gzipped
(+92 KiB)**: the staged motions, the fan scoring and the general pieces
pipeline in the engine, and the four ops, the held-choice store and their
serializers in the bridge. The last row is now the bridge that ships, and it
is **over the two budgets' 800 KiB sum by 43 KiB gzipped**; the open
question below now covers it too.

The fourth row was the bridge that shipped when the budget was set. Rebuilt at `44005c2d9`, with the
Fold workspace's UI merged, it is the same 1,879,638 B raw, and 752,480 B
through this machine's `gzip -9`. The rows without `kernel` cannot be
rebuilt at that commit: `kernel` has been linked since the io branch
merged, and the bridge has no switch to leave it out. They were measured on
branches before it, the second in another worktree.

The io branch measured `kernel`'s cost before the queries, against the
Wave 2 bridge built in the same worktree (638,301 B raw, 236,078 B
gzipped): **+956,528 B raw (+934 KiB), +419,777 B gzipped (+410 KiB)**.
After both merged, the last row is +971,905 B raw (+949 KiB) and
**+416,001 B gzipped (+406 KiB)** over the row without `kernel` with the
queries; that row was built in another worktree the same day, so read the
difference as approximate.

Phase 4a first measured the bridge without `kernel` at 609 KiB raw (228 KiB
gzipped); the calls added since bring it to the first row. By `twiggy` on an
unoptimized build, most of `kernel`'s difference is
`serde_json` (with the workspace's `float_roundtrip` parser), the serde code
for FOLD documents and the folded paper scene, the kernel's loaders and FOLD
writer, and `encoding_rs`'s decoders and tables for `.orh`'s Japanese and
Chinese charsets.

The queries and axioms link in the engine they reach — the scene, the
cross-section and depth choices, landmarks, the constructions, anchored
folds and the sliver remedy — and the serializers of their results. The
bridge crate's own code is about 75 KB of it before `wasm-opt`. Neither
lever tried moved it: results through `serde_json` and `JSON.parse`
(941,911 B, larger) and `wasm-opt -Oz` (904,380 B).

For scale: the precrease bridge is 861 KiB raw (338 KiB gzipped) and the CP
kernel's bridge 3.1 MiB (1.4 MiB gzipped). The PWA warms every `.wasm` it
emits, so this is paid by every installed visitor on their first load.

**Budget.**

- Without `kernel`: **768 KiB raw, 288 KiB gzipped**, set before the queries
  as a quarter of headroom for the scene, cross-section and axioms. **The
  build with them is over it** by 118 KiB raw, 41 KiB gzipped (907,733 B
  and 336,478 B against 786,432 B and 294,912 B).
- `kernel` may add at most **512 KiB gzipped** over the build without it
  (about a third of the CP bridge every visitor already downloads). Past
  that, take D1's fallback: `kernel` stays native and test-only, and Send to
  Edit, export and Import CP go through the existing CP worker as FOLD text.
  It adds about 406 KiB, within it.

Together the two allow 800 KiB gzipped. The bridge that shipped when they
were set was 735 KiB, inside their sum only because `kernel` used less than
its allowance; the engine's own share was over its line. With the vertex
folds it is 843 KiB, over the sum, and the budget has not been raised.

**Open, for the owner: the budget without `kernel`.** Raise it (to 1 MiB
raw, 384 KiB gzipped, say, about the precrease bridge's size) or trim the
engine side by 41 KiB gzipped — about 149 KiB since the compound pipeline
(16 KiB) and the vertex folds (92 KiB), taking `kernel`'s share as fixed. The two levers tried (above) did not move it.

**Decision (2026-10-08): `kernel` stays in the bridge.** Measured before the
queries it added 410 KiB gzipped, within the 512 KiB allowance, so D1's
fallback is not taken. After the queries it adds about 406 KiB (the
difference between two worktrees' builds, so approximate), which leaves
about 106 KiB gzipped for the kernel's other writers (`.cp`, `.ori` and
`.orh` export, D10), not linked yet.

## Performance

Measured through the built bridge in Node 22 (2026-10-08, load average
about 30 on a shared machine), on random all-layer folds along lines near
the middle of the sheet, 80 runs, 1,006 folds. Tier 2 (plan D14, once per
line, side and direction) is bucketed by the parent's faces; tier 3 by the
landed state's. Times include crossing the boundary.

| Call | 33–64 faces mean / p95 | 129–256 faces mean / p95 |
|---|---|---|
| `analyse` | 0.12 / 0.25 ms | 0.96 / 2.75 ms |
| `cross_section` (with joins) | 0.16 / 0.41 ms | 0.64 / 2.34 ms |
| `action` (the preview's picture) | 0.20 / 0.44 ms | 1.46 / 3.69 ms |
| `depth_choices` | 1.19 / 3.88 ms | 18.3 / 74.8 ms |
| `landmarks` (per state) | 2.25 / 3.66 ms | 15.7 / 25.1 ms |
| `scene` (per state) | 1.75 / 3.31 ms | 29.2 / 66.4 ms |
| `apply` (the fold and `State::make`) | 1.55 / 2.45 ms | 9.91 / 15.9 ms |
| Tier 3: `apply`, then the child's `step_summary` and `scene` | 3.30 / 5.73 ms | 40.0 / 79.7 ms |

An earlier run (40 runs, seed 7) agreed within a few tenths at 33–64 and
within 15% at 129–256.

**Since then** the scene stacks its cells through a table of the order on
face positions (`oristudio_layer_order::OrderTable`) instead of the order's
map, and `depth_choices` grows one closure layer by layer instead of
analysing every depth. Both give the same output: an A/B of the two builds
over the same folds (80 runs, two interleaved passes, load average about
15–20) hashed every landed state's subfaces and every depth answer, the same
for both. 118 states and 55 depth previews fell at 129–256 faces:

| Call | before mean / p95 | after mean / p95 |
|---|---|---|
| `depth_choices` | 17–18 / 80 ms | 0.65–0.81 / 1.3–2.1 ms |
| `scene` (per state) | 37 / 114–129 ms | 4.5–5.5 / 8.3–12.7 ms |
| Tier 3: `apply`, `step_summary`, `scene` | 45–47 / 125–141 ms | 13–16 / 27–32 ms |

The A/B's states are deeper than the table's above (lines through the
sheet's lower left quarter rather than its middle), so its "before" is
slower than the table's.

- **The plain fold** is at the JS spike's p95 (research §12: ≤ 2.2 ms at
  33–64, ≤ 17.2 ms at 129–256): 2.45 ms and 15.9 ms here, under load.
- **Tier 3 is within D14's 50 ms at 256 faces, at p95 too**, since the
  scene's subface stacks went through a table: they had been most of it
  (the scene alone, computed with nothing returned, was 22 of its 25 ms at
  129–256). What is left of it is mostly `apply`.
- **No tier-2 cache in the bridge.** The calls keyed by line, side and
  direction take a few milliseconds at 256 faces, and the tools ask once per
  line; `depth_choices`, keyed by a point as well, is as cheap since it grows
  one closure. The costly ones are `landmarks` and `scene`, which are per
  state: a state is immutable under its handle, so the web side keeps them by
  handle.

## Tests

- `cargo test -p oristudio-fold-wasm`: `tests/bridge.rs`, natively, through
  JSON shaped as the web app sends it — the document's ops resolving in their
  parent, axioms along their stored roots (a drifted root replays to the
  same state; a missing one, `no_root`, `mover_stays`), a sliver remedy's
  stored step landing, refusals as codes with fixes and no sentence
  anywhere, unfold and refold along a crease, a model line's side against
  its normal as given, every query on a handle, handles, the `fs1` keys
  following the state rather than its numbering, and `oristudio-fold`'s
  classic sequences replayed through the bridge to the outcomes their
  fixtures record, along model lines and again along O1 axioms with their
  roots. `tests/reverse.rs`: the reverse fold through the same JSON — the
  preliminary base from the triangle by two inside reverses, the kinds the
  query says land and the other kind offered as the fix, an opening and an
  order (the engine's campaign case s1-287, its plain folds as model-line
  steps) chosen through the query, stored and replayed, `choice_needed` and
  `choice_broken`.
- `cargo test -p oristudio-fold-wasm --test io`: `tests/io.rs`, the io
  calls natively — Send to Edit, then Import CP, giving the same state
  (`fs1` keys equal) over the classics and 364 seeded random states, with
  the import's completion offering that order; an Import-CP golden through
  `.cp` and `.fold` (the same state, its valleys where the files draw them,
  the flaps showing their backs); the samples each importing to their one
  order; open and pick (every listed order landed, exactly one the state
  sent), an empty sequence adopting the pattern's sheet, stored ops that no
  longer land refused; and Edit's folded figure, folded by the kernel from
  114 states, front and rear, landing the state it was folded from.
- `cargo test -p oristudio-fold-wasm --test sink`: `tests/sink.rs`, the
  sinks natively on the samples as Import CP lands them — open and closed
  sinks and the unsink back by `apply`, the pocket asked for, stored and
  replayed, the tilted line's fixes, the choices a sink takes, the queries.
- `wasm-pack test --node crates/oristudio-fold-wasm`: `tests/node.rs` and
  `tests/io_node.rs`, the same calls across the wasm boundary (plain objects
  in and out, refusals as values, thrown envelopes, the kernel's scene object
  as input). CI runs no wasm-pack tests, so this is a local gate.
- `apps/web/src/fold/engine/foldSequence.wasm.test.ts` drives the built
  bridge from TypeScript, every call included, and an axiom step through the
  document's replayer; `foldEngineIo.wasm.test.ts` drives the io calls and
  folds Edit's figure with the CP kernel's bridge in the same process.

Original work under `MIT OR Apache-2.0`.
