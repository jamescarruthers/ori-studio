# History-based Unfold to step — 2026-10-14

## Result

Implemented locally and ready for audit. **Fold → Unfold to step…** previews
a return to an earlier step on the current branch, then appends it as a new
diagram step. **Unfold last step** selects the immediate predecessor.
The result restores material positions, paper sides, orientation and layer
order while retaining all physical creases and partial precreases. Editor
Undo/Redo and existing branches remain independent.

This works from recorded history, including compound operations and saved
CP Collapse/import transitions. If a CP revision omitted an older crease,
the history union still retains it. Changed dependencies require an explicit
**Rebuild unfold**; the app does not silently replace the saved target pose.
Rebuild preserves the step ID, descendants and annotations. Cancel returns to
the existing step, and an unchanged rebuild adds no editor Undo entry.

## Try locally

Open [unfold-to-step.osf](../../2026-10-13-origami-fold-trials/models/examples/unfold-to-step.osf)
in the Fold workspace at <http://localhost:5327/fold>.

1. Step 1 folds vertically; step 2 folds horizontally, followed by an
   unnumbered quarter turn.
2. Step 3 returns to step 1: its pose and orientation are restored, and the
   horizontal crease remains available.
3. Step 4 refolds that retained crease.
4. Step 5 returns to the starting sheet with both creases visible.
5. Choose another earlier step using **Unfold to step…**, inspect the actual
   folded/CP preview, and use **Append unfold**. Editor Undo removes that
   authoring edit; it does not erase the saved earlier folds.

The example has six operation nodes and seven states. It is a feature
example, not another completed tutorial. No existing model was migrated or
overwritten for this feature.

## Validation

- Public Rust/WASM tests check ordinary folds, refolds, partial precreases,
  both starting sides, turns, inside/outside reverses, nested reverses,
  both crimps, tucks, squash, petal, rabbit ears across precreases, swivel,
  open/closed sinks, unsinks and recorded CP graph replacement. They compare
  material transforms, exposed sides and overlapping layer order, including
  repeated returns and subsequent refolding.
- The [native audit](unfold-to-step-native-audit.json) freshly replayed
  **38 completed/in-progress files, 570 saved steps**, and **1,102 returns**
  to immediate predecessors or the starting sheet. No replay or return
  failed. This includes Heart, Cicada, Witch Hat, Pumpkin, Squirrel and Dove.
  Engine validation is not a replacement for the user's visual tutorial audit.
- All **72 pre-existing `.osf` files** in the model library were hash-checked
  and remain byte-identical. Only the new feature example was added.
- The example passes the actual native document reader/writer round trip,
  dependency digest checks, two fresh-engine replays with matching state
  fingerprints, and FOLD export parsing.
- Browser checks used a disposable Square Base sample: preview and append
  returned it to a flat sheet with all eight creases visible; its inspector
  reported six opened creases and eight flat creases. Rebuild and Cancel
  both retained the same two-step sequence and restored the saved cursor.
  Rebuild previews no longer incorrectly announce a new branch.
- `cargo test --workspace`, focused Fold/Fold-WASM tests and clippy passed.
  The relevant web suite passed **158 files / 1,225 tests**. A final focused
  run after the rebuild-label adjustment passed **18 files / 98 tests**.
  Web lint, typecheck, i18n checks, all WASM builds and the production web
  build with landing prerender passed.

Raw local logs and the reproducible audit/example-check scripts are under
`artifacts/reversible-fold/`. Lint retains one existing React compiler
warning for the timeline virtualizer; the configured Rust lint name also
produces an existing warning. Neither caused a failure.

No separate external oracle run was needed: this is original Fold behavior,
and vendored ports were unchanged. No Tauri shell code changed; the UI and
commands use the shared web renderer. Native desktop dialog interaction was
not independently tested. The entire unrelated web test suite was not rerun;
the Fold, menu, capabilities and affected store suites were covered.

## Limits and foundations

- Targets must be strict ancestors on the current branch or the starting
  sheet. A return reverses a contiguous suffix; it does not selectively remove
  an interior operation while leaving its dependent operations applied.
- Playback crossfades between checked flat endpoints. It does not claim a
  continuous physical inverse motion, particularly for CP Collapse.
- Dense crease histories can hit explicit refinement limits (4,096 collected
  segments/marks or 4,096 result faces) and are refused without editing the
  sequence. Superseded previews cannot commit stale results.
- The engine primitive uses material coordinates and a checked target pose,
  independent of document IDs. This provides a foundation for later inverse
  tools. Inferring a predecessor or reverse rabbit ear from an arbitrary CP
  remains out of scope, along with cuts, assembly and non-flat endpoints.

See the [implementation plan](../../../implementation-plans/reversible-fold-steps.md).
Campaign completion counts and the next design queue are unchanged.
