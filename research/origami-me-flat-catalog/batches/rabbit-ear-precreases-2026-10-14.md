# Rabbit-ear hinge regions and precreases — local implementation

The rabbit-ear tool now takes three triangle corners, then a click in the region
containing the hinge (fourth) crease. Kawasaki geometry fixes one ray in that
region. There is no separate fourth-crease selector or alternative-ray overlay.
The tool first tries holding the larger remaining region still, then the other
anchor if needed. Neither attempt changes the selected hinge. An unavailable
region disables commit and asks for a different region or layer selection.

The engine groups coplanar faces joined by flat precreases inside the triangle
as one logical layer. It clips that material into the fan's wedges, reuses
existing vertices, retains crease provenance and face ancestry, and preserves
unrelated precreases. The shared motion, residual, minimum-feature and layer-order
gates remain active. This does not add cuts, multi-sheet assembly or non-flat
states, and does not claim every existing folded junction is compatible.

## Evidence

- [Exact public operations and fresh results](rabbit-ear-precreases-2026-10-14.json): both ears from the preserved Whale prefix succeed (13 then 14 faces); the recorded Dolphin ear also succeeds. Original failed operations are retained unchanged.
- [Portable regression fixture](../../../tests/fixtures/fold-examples/rabbit-ear-precreased-whale.json) retains Whale's seven preparation nodes and both ear operations.
- Rust comparisons cover eight valley/mountain and selected-layer cases, 16 successful prepared folds, incompatible hinge refusals, material positions, exposed sides, stack order, and independent precrease history.
- The real WASM/UI-builder regression makes the same fold as the exact saved Whale operation. Both ears match the clean control in original-sheet material and stack order at sampled interior points, and serialized operations replay identically.
- Browser verification at `http://localhost:5327/fold`: opened the native Whale file, clicked all four picks, selected another hinge region, confirmed the incompatible body-side region stays blocked, committed both ears, and verified undo/redo. The inspector reports each ear adds one crease and refolds three existing precreases. [Screenshot](../../../artifacts/rabbit-ear/whale-fish-base.jpg).
- [Read-only reconciliation](reconciliation-2026-10-14.json): all 42 current native files, 512 nodes and 554 states replay, with zero hash mismatches. No native model was rewritten, including Heart and Cicada. The stored operation schema is unchanged, so migration is unnecessary.

## Validation

- Fold Rust suite: 316 tests passed; subsequently the expanded rabbit-ear file passed all 10 tests, including the additional unrelated-precrease regression.
- Fold bridge native suite: 86 tests passed; Fold WASM rebuilt successfully.
- Fold web suite: 134 files / 1,007 tests passed. Updated tool-window/rail component checks and window-model checks: 47 tests passed.
- Web typecheck, full web lint, i18n check, and focused Fold clippy passed. Lint retains the existing unrelated TanStack Virtual compiler warning; the installed clippy reports an existing unknown configured lint warning.
- Component tests use `NODE_OPTIONS=--no-experimental-webstorage` for Node 26's native-storage conflict with jsdom; no application workaround was added.
- Unrelated port/oracle suites and the native Tauri packaging build were not rerun: their code and interfaces did not change. Native desktop and browser share this Fold renderer and bridge surface.

## Campaign handoff

Later update: [Whale is now completed and ready for user audit](whale-completion-2026-10-14.md). The implementation-time handoff below is historical.

F012 is resolved locally for these reproductions. Whale returns to **in progress**;
its canonical native file still stops after source 4, and the remaining tutorial
must be authored and visually audited before completion. The fish-base check is
not a completed Whale or user approval. Dolphin stays **excluded cuts** because
source 11 requires a slit. F014 is the next confirmed active engine requirement.
No schedule, push or PR was created.
