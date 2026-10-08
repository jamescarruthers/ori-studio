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

Later waves add their calls the same way: the scene and the cross-section as
queries on a handle, axiom lines and Import CP as the op kinds `wire::Op`
already names and refuses as `unsupported_op` today.

## The `kernel` feature

Plan D1 enables `oristudio-fold`'s `kernel` feature here by default, so the
browser reuses the CP kernel's writers and loaders. It is being built in
parallel and is not enabled yet; `Cargo.toml` says where it goes. When it
lands, re-measure below with and without it and decide against the budget.

## Size

`npm --workspace @treemaker/web run build:oristudio-fold-wasm` (release,
`wasm-opt` by wasm-pack's default), 2026-10-08:

| Build | `.wasm` raw | gzip -9 |
|---|---|---|
| Without `kernel` | 625,707 B (611 KiB) | 233,797 B (228 KiB) |
| With `kernel` | not yet measured | — |

For scale: the precrease bridge is 861 KiB raw (338 KiB gzipped) and the CP
kernel's bridge 3.1 MiB (1.4 MiB gzipped). The PWA warms every `.wasm` it
emits, so this is paid by every installed visitor on their first load.

**Budget.**

- Without `kernel`: **768 KiB raw, 288 KiB gzipped** — a quarter of headroom
  over today for the scene, cross-section and axioms.
- `kernel` may add at most **512 KiB gzipped** over the build without it
  (about a third of the CP bridge every visitor already downloads). Past
  that, take D1's fallback: `kernel` stays native and test-only, and Send to
  Edit, export and Import CP go through the existing CP worker as FOLD text.

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
- `wasm-pack test --node crates/oristudio-fold-wasm`: `tests/node.rs`, the
  same calls across the wasm boundary (plain objects in and out, refusals as
  values, thrown envelopes). CI runs no wasm-pack tests, so this is a local
  gate.
- `apps/web/src/fold/engine/foldSequence.wasm.test.ts` drives the built
  bridge from TypeScript.

Original work under `MIT OR Apache-2.0`.
