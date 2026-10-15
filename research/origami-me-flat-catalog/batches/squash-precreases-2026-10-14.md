# Squash selection fix and Collapse design — 2026-10-14

**F019 resolved locally, ready for user audit.** A squash now recognizes the
same pocket when any of its exposed flat subdivisions is selected. Discovery
follows flat precreases to the spine and starts the hinge walk from a lower
face incident to its endpoint. The final flap still stops at the hinge, even
when an earlier squash unfolded it. Covered-layer and free-flap guards remain.

## Bird audit

- [Native editable Bird](../../2026-10-13-origami-fold-trials/models/in-progress/bird.osf)
- [Source tutorial](https://origami.me/bird/)
- [Exact historical failing picks](bird-pocket-picks.json)
- [New successful results and read-only model replay](squash-precreases-2026-10-14.json)
- [Repeatable audit script](../squash-precreases.mjs)

Select **Fold step 6**, choose Squash, and click either flat subdivision of the
visible triangular pocket. Both now give the same Fold step 7. The browser
test clicked the subdivision farther from the shared spine, previewed and
committed the squash, then compared it with the original successful branch.
This test branch was not written over the native Bird file.

![Squash committed from the previously failing subdivision](../../../artifacts/squash-precreases/bird-far-pocket-committed.png)

The exact two saved requests produce identical analysis, complete canonical
state keys and scenes, including face transforms, exposed sides and subface
layer stacks. Native regressions additionally check every exposed subdivision,
segmented spines, mirrored paper, symmetric/asymmetric targets, M/V under a
turned view, and the second squash with a previously unfolded upper hinge.
Every covered lower-face pick is still refused. Existing attachment and
invalid-pocket checks and the seeded squash campaign still pass.

Bird's native prefix already used the successful near-spine pick, so this fix
does **not** advance tutorial completion. It remains through source 6; F020's
later coupled opening is still an authoring investigation.

## Witch Hat and the next feature

The user clarified source 8 as a CP collapse and added a CP to the native
[Witch Hat file](../../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf).
It now contains **36 CP segments and the intact 13-node Fold sequence**, through
source 7 / Fold step 10. We preserved the file byte for byte.

F031 is now a **requested project-CP linking/display workflow**, not a request
for a specialized brim-fold primitive. The existing CP jump importer can
provide a flat state and chosen layer order for following folds; the new
feature needs project source linking, a saved revision, a CP-lines-only
**Collapse** presentation and explicit **Update from CP**. The user selected
explicit updates. See the [design proposal](../../../implementation-plans/linked-cp-collapse-step.md).

This workflow is discussed/planned, **not implemented in this change**. A
correct Witch Hat result still requires checking its chosen hidden layer order
and completing the remaining steps. No new design is counted complete here.

## Validation

- `cargo test --workspace`: **2,838 passed, 0 failed, 19 ignored**.
- Real-WASM squash, vertex tool and crease-overlay suites: **20 passed**.
  Both saved pocket branches serialize/load and replay on a fresh engine.
- Fold WASM rebuilt with the workspace npm script and exercised in the local
  Fold browser. Web TypeScript and changed-test ESLint passed.
- Rust format, focused Fold/bridge clippy and diff whitespace checks passed.
- **42 native models / 526 nodes / 568 states** replay with their original
  recorded canonical hashes. No model rewritten, including Heart and Cicada.
- Witch Hat's file hash differs from the older manifest because of the user's
  CP addition; its Fold states still match. The current preserved SHA-256 is
  `393e372da04d78201012f0dec2d436b61505c2f390ce608c682fe8d803fecce9`.

No new oracle-specific run: the changed squash discovery is original Fold
code, not a port. No desktop shell or production bundle run: no shell, routing,
CSS, binding schema or bundling change. Clippy reports the pre-existing unknown
`chunks_exact_to_as_chunks` lint in the local compiler configuration.
No PR, push, schedule, cuts, assembly or non-flat behavior.
