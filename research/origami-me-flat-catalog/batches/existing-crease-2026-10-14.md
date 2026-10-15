# Existing crease reuse — 2026-10-14

Segment and Pinch precreases now accept an existing flat crease. A reversal
changes only the selected interval's remembered M/V direction. Where an endpoint
falls inside an edge, both adjacent face rings receive the same new vertex;
face identities, isometries, layer order and original crease provenance remain
intact. No duplicate crease marks or relaxed geometry guards are involved.
The Step inspector reports the changed crease memories.

Ordinary full-line mountain and valley refolding already used existing hinges.
Both paths were verified after bounded reversals, including both starting paper
sides, opposite remembered letters, selected plies, and correct moving/stationary
layer order. No additional M/V tool or file-format change was needed.

## Witch Hat audit

- [Native editable file](../../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf)
- [Source tutorial](https://origami.me/witch-hat/)
- **Saved through source 7 / Fold step 10:** 13 native nodes, 14 replayed states.
- [Exact old request, successful result, saved Existing crease request and next-step diagnostic](witch-hat-existing-crease-2026-10-14.json)
- [Validation manifest](witch-hat.validation.json)
- [Original prefix](../../2026-10-13-origami-fold-trials/models/archive/checkpoints/witch-hat-before-existing-crease.osf)

The original failing request succeeds without changing any face geometry,
transforms, exposed paper sides, full subface layer stacks, sheet vertices or
lineage. Only the two central crease pieces (47 and 48) reverse. An equivalent
`via: crease` operation is saved so the file names the same operation offered
by the canvas.

The real browser workflow was exercised: Precrease → Existing crease → Segment,
pick the existing middle line and its two side-hinge intersections, then commit.
Both M and V previews also succeed on an existing diagonal. The native file was
then freshly reopened through the normal project reader, landing in Fold at
step 10 with “Refolds 2 precreases the other way.”

![Saved Witch Hat in Fold](../../../artifacts/existing-crease/witch-hat-fold-step-10.png)

This is a verified prefix, **not tutorial completion or user approval**. Source
8 still needs its coordinated brim collapse. A diagnostic ordinary mountain
fold on the upper horizontal line succeeds but refolds its outer-wing segments
too. That is not yet a source-equivalent decomposition; it is recorded as F031,
an authoring/compound investigation rather than a confirmed missing primitive.

## Next recommendation

**F019: squash selection across existing flat precreases.** Bird's same visible
pocket works when clicked near its shared spine but fails when another flat
subdivision is selected. Resolve the connected coplanar pocket before finding
its spine, preserving the free-flap and covered-layer guards. This is a confirmed
selection limitation with an existing workaround. Separately, map Witch Hat's
source-8 collapse to existing compound operations before deciding whether an
engine extension is required.

## Validation

- `cargo test --workspace`: **2,837 passed, 0 failed, 19 ignored**.
- Fold engine and bridge suites: **430 passed**.
- Fold WASM rebuilt through the workspace npm script.
- Real-WASM partial-precrease/document tests: **5 passed** (includes exact Witch
  request, native sequence serialization/replay and both M/V paths).
- Web TypeScript check and ESLint for the changed test passed.
- `cargo fmt --check` and `git diff --check` passed.
- Focused Fold/bridge clippy passed; the installed compiler emits the existing
  `unknown lint: clippy::chunks_exact_to_as_chunks` configuration warning.
- Current model library: **42 files, 526 nodes, 568 states**, no replay failures
  or manifest/hash mismatches. Heart, Cicada and other models were not rewritten.

No separate upstream oracle run: this changes the original Fold engine, not a
ported subsystem. No desktop-shell or production-bundle run: no shell, routing,
binding schema, styling or bundling code changed; the rebuilt WASM was exercised
in the local browser. No PR, push, schedule, cuts, assembly or non-flat behavior.
