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
- **Coarse calls.** `sheet(paper)`; `analyse(state, op)` for what a fold
  would move (the moving set, the flaps, which the seed picked and which the
  closure added); `apply(state, op, choices)` for valley, mountain,
  precrease, unfold, refold, turn and rotate; `summary`; `canonical_keys`
  for the `fs1` fingerprint; `release`, `clear`, `live`.
- **The document's shapes in** (`src/wire.rs`). A stored step crosses
  unchanged and its sheet anchors resolve here, in the parent
  (`src/resolve.rs`): a free line through two sheet points' images, a crease
  line by a point on the crease, the moving side from a sheet point or the
  seed. The tools may also send a line already in the model frame
  (`via: 'model'`) with a `side`, a tuck's `placement` and the `closure`
  policy.
- **Refusals are values**: `{ status: 'refused', refusal: { code, … },
  fixes, faces, vertices }`, with the engine's stable codes and the bridge's
  own (`unsupported_op`, `unexpected_choice`, `point_off_paper`,
  `degenerate_line`, `crease_not_found`, `crease_not_flat`,
  `crease_not_folded`, `moving_side_missing`, `moving_side_on_line`), never a
  sentence. Only a caller's mistake — malformed input, a handle this engine
  does not hold — throws, as the `{ code, message }` envelope every bridge
  uses.
- **`fs1` keys** (`src/canonical.rs`): one per fact of the state, none naming
  a face, vertex or crease by its number; the digest over them is
  TypeScript's `keyDigest`.
- **Import CP, Send to Edit and the FOLD export** (`src/io.rs`; plan D10,
  D16), through the CP kernel's own loaders and writers (below):
  - `import_cp(format, bytes, target, limits)` reads a `.cp`, `.fold`, `.ori`
    or `.orh` file, imports it into an empty sequence (which adopts its
    square or rectangle) or after a state, and completes its layer order
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

Later waves add their calls the same way: the scene and the cross-section as
queries on a handle, axiom lines as the op kind `wire::Op` already names and
refuses as `unsupported_op` today.

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
| Without `kernel` (the Wave 2 bridge) | 638,301 B (623 KiB) | 236,078 B (231 KiB) |
| With `kernel` (and the io calls) | 1,593,982 B (1,557 KiB) | 655,285 B (640 KiB) |
| Difference | +955,681 B (+933 KiB) | **+419,207 B (+409 KiB)** |

Phase 4a first measured the bridge without `kernel` at 609 KiB raw (228 KiB
gzipped); the calls added since bring it to the first row. By `twiggy` on an
unoptimized build, most of the difference is
`serde_json` (with the workspace's `float_roundtrip` parser), the serde code
for FOLD documents and the folded paper scene, the kernel's loaders and FOLD
writer, and `encoding_rs`'s decoders and tables for `.orh`'s Japanese and
Chinese charsets.

For scale: the precrease bridge is 861 KiB raw (338 KiB gzipped) and the CP
kernel's bridge 3.1 MiB (1.4 MiB gzipped). The PWA warms every `.wasm` it
emits, so this is paid by every installed visitor on their first load.

**Budget.**

- Without `kernel`: **768 KiB raw, 288 KiB gzipped** — a quarter of headroom
  over the first measurement for the scene, cross-section and axioms.
- `kernel` may add at most **512 KiB gzipped** over the build without it
  (about a third of the CP bridge every visitor already downloads). Past
  that, take D1's fallback: `kernel` stays native and test-only, and Send to
  Edit, export and Import CP go through the existing CP worker as FOLD text.

**Decision (2026-10-08): `kernel` stays in the bridge.** It adds 409 KiB
gzipped, within the 512 KiB allowance, so D1's fallback is not taken. The
103 KiB gzipped left is what the kernel's other writers (`.cp`, `.ori` and
`.orh` export, D10), not linked yet, would have to fit in.

## Performance

A rough first measurement, not a gate: `apply` (the fold and its gate,
`State::make` included) through the bridge in Node 22, on random all-layer
folds along lines through the middle of the sheet, 40 runs, bucketed by the
landed state's faces. Two runs a minute apart on a shared machine (load
average 40, then 90) differed by three times; the faster:

| Faces | Folds | Mean | p95 |
|---|---|---|---|
| 1–8 | 122 | 0.23 ms | 0.51 ms |
| 9–32 | 115 | 1.0 ms | 2.1 ms |
| 33–64 | 85 | 3.9 ms | 6.8 ms |
| 65–128 | 112 | 13.4 ms | 23.8 ms |
| 129–256 | 181 | 42.7 ms | 76.9 ms |
| 257–512 | 70 | 79.9 ms | 126.7 ms |

That is about native speed (`oristudio-fold`'s README), and like native it
is mostly the layer-order gate: these random stacks are far deeper than real
models, and the plan's tier-3 budget (≤ 50 ms at 256 faces) waits on the
incremental overlay in `oristudio-layer-order`.

## Tests

- `cargo test -p oristudio-fold-wasm`: `tests/bridge.rs`, natively, through
  JSON shaped as the web app sends it — the document's ops resolving in their
  parent, refusals as codes with fixes and no sentence anywhere, unfold and
  refold along a crease, a model line's side against its normal as given,
  handles, the `fs1` keys following the state rather than its numbering, and
  `oristudio-fold`'s classic sequences replayed through the bridge to the
  outcomes their fixtures record.
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
- `wasm-pack test --node crates/oristudio-fold-wasm`: `tests/node.rs` and
  `tests/io_node.rs`, the same calls across the wasm boundary (plain objects
  in and out, refusals as values, thrown envelopes, the kernel's scene object
  as input). CI runs no wasm-pack tests, so this is a local gate.
- `apps/web/src/fold/engine/foldSequence.wasm.test.ts` and
  `foldEngineIo.wasm.test.ts` drive the built bridge from TypeScript; the
  latter folds Edit's figure with the CP kernel's bridge in the same
  process.

Original work under `MIT OR Apache-2.0`.
