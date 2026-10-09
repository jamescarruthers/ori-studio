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
  (`parent_released` otherwise).
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
  `mover_stays`, …) and the bridge's own (`unsupported_op`,
  `unexpected_choice`, `root_missing`, `crease_not_found`,
  `crease_not_flat`, `crease_not_folded`); they never collide. A sliver
  remedy's `use_line` fix also carries `step`, the document's op and
  choices that fold along it. Only a caller's mistake — malformed input, a
  handle this engine does not hold — throws, as the `{ code, message }`
  envelope every bridge uses.
- **`fs1` keys** (`src/canonical.rs`): one per fact of the state, none naming
  a face, vertex or crease by its number; the digest over them is
  TypeScript's `keyDigest`.

Import CP is the one op kind `wire::Op` still names and refuses as
`unsupported_op`; its loaders arrive as calls of their own.

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
| Without `kernel`, before the queries (sheet, analyse, apply, summary, keys; the same engine) | 641,223 B (626 KiB) | 236,181 B (231 KiB) |
| Without `kernel`, with the queries and axiom ops | 907,733 B (886 KiB) | 336,478 B (329 KiB) |
| With `kernel` | not yet measured | — |

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
  build with them is over it** by 118 KiB raw, 41 KiB gzipped: the owner's
  call whether to raise it (to 1 MiB raw, 384 KiB gzipped, say, about the
  precrease bridge's size) or to trim.
- `kernel` may add at most **512 KiB gzipped** over the build without it
  (about a third of the CP bridge every visitor already downloads). Past
  that, take D1's fallback: `kernel` stays native and test-only, and Send to
  Edit, export and Import CP go through the existing CP worker as FOLD text.

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

- **The plain fold** is at the JS spike's p95 (research §12: ≤ 2.2 ms at
  33–64, ≤ 17.2 ms at 129–256): 2.45 ms and 15.9 ms here, under load.
- **Tier 3 is within 50 ms at 256 faces on average, not at p95**, and the
  scene is most of it: computing it, not serializing it (the scene alone,
  computed with nothing returned, is 22 of its 25 ms at 129–256; through
  `JSON.parse` instead of serde-wasm-bindgen is no faster). Its subface
  stacks are the engine's, in `oristudio-fold`'s `scene.rs`.
- **No tier-2 cache in the bridge.** The calls keyed by line, side and
  direction take a few milliseconds at 256 faces, and the tools ask once per
  line. The costly ones are `depth_choices` (keyed by a point as well) and
  `landmarks` and `scene`, which are per state: a state is immutable under
  its handle, so the web side keeps them by handle.

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
  roots.
- `wasm-pack test --node crates/oristudio-fold-wasm`: `tests/node.rs`, the
  same calls across the wasm boundary (plain objects in and out, refusals as
  values, thrown envelopes). CI runs no wasm-pack tests, so this is a local
  gate.
- `apps/web/src/fold/engine/foldSequence.wasm.test.ts` drives the built
  bridge from TypeScript, every call included, and an axiom step through the
  document's replayer.

Original work under `MIT OR Apache-2.0`.
