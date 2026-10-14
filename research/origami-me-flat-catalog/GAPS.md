# Flat-fold functionality findings

This is an evidence log, not a list of features inferred from design names. New work stays 2D. The expanded campaign has confirmed a missing cutting operation and a rabbit-ear restriction on existing precreases; other compound refusals remain investigations.

| ID | State / category | Design and evidence | Requirement / acceptance condition |
| --- | --- | --- | --- |
| F001 | Resolved locally — operation and UI | [Swan](https://origami.me/swan/), [prior report](../2026-10-13-origami-fold-trials/REPORT.md) | Explicit outside reverse folds for neck and head, including the UI choice; do not replace with inside reverse. Re-audit visually when touched. |
| F002 | Resolved locally — operation and UI | [Heart](https://origami.me/heart/), step 8; prior report and native acceptance fixtures | Tuck beneath multiple stationary layers with saved, replayable target choices. |
| F003 | Corrected authoring error — regression retained | Heart step 8; [corrected view](../2026-10-13-origami-fold-trials/heart-tuck-corrected-workspace.jpg), `tests/fixtures/fold-design-completion/heart-tuck-layer-order.json` | Choose the valid order exposing the lowered flap over the original lower triangle. Do not use `candidates[0]` as a correctness criterion. Material witnesses must match the diagram. This is not an outstanding missing primitive. |
| F004 | Resolved locally — saving workflow | Original five trials; prior report | Native `.osf` must reopen in Fold with the editable sequence and choices. A rendered `.fold` in Edit does not meet the requirement. |
| F005 | Investigation retained — not a campaign blocker yet | [Prior compound probes](../2026-10-13-origami-fold-trials/compound-probes.json), `swivel_fold_wide` / `fan_ray_blocked` | Retain conservative guards. Establish whether a particular eligible tutorial actually requires an unsupported wide swivel before specifying implementation. No blanket swivel-parity claim. |

## New finding template

For each finding record: source URL and instruction number; desired fold and paper layers; native file and last valid node; exact operation/choices or UI actions; actual result/refusal; expected visible material and geometry; classification (confirmed engine gap / UI gap / authoring error / ambiguous source / access blocker); workaround fidelity; proposed acceptance check; affected models; resolution and user audit history.

## Excluded scope

Non-flat simulation, inflated bodies, curved shaping, standing box walls, and 3D assembly are intentionally outside this campaign. They are not implementation requests. Keep the affected tutorials in the catalog with the reason for exclusion.

## F006 — Saved source notes are not visible in the Fold audit UI

**Confirmed UI/workflow gap; open.** Both batch-1 files have an instruction reference and custom note on every saved node. The Fold strip, Steps cards, and Step inspector instead display generated fold descriptions. For example, Cat Face's source instruction 7 appears as Fold step 9, described only as a valley tuck. Inspection of `apps/web/src/fold/sequence/` and `components/fold/` confirms that the note is serialized but not consumed by these presentation surfaces.

**Needed:** display/edit a node's authored note and expose source instruction grouping/reference alongside Ori Studio's operation count. Keep turns, paired folds, and source numbers distinguishable. Acceptance: opening either batch-1 native file shows the saved source instruction reference and note on the corresponding step; save/reopen preserves edits. Do not change geometry or pretend source step numbers equal engine node indexes.

**Current workaround:** [batch-1 mapping table](batches/001.md). This is useful for audit, but not a missing primitive required to fold a design.

## F007 — Cat Face target and seed selection

**Resolved authoring investigation; no engine implementation requested.** An all-layer crown fold clipped the ears, a boundary seed was invalid, and choosing the exposed muzzle as the tuck target produced `tuck_infeasible`. The corrected depth seed and pocket support target complete the model using existing operations. Evidence and reproducible native state are in [batch 1](batches/001.md). Preserve this case for usability evaluation, but do not count the rejected inputs as unsupported flat folding.

## F008 — Bookmark pocket depth is not determined by the exposed face

**Resolved authoring investigation; no engine change needed.** Source: [Bookmark](https://origami.me/bookmark/), instruction 10. The initial outer-wall target was infeasible. Targeting the next wall gives a unique valid tuck between the original folded-corner pocket walls. A different feasible target inserts the same flap deeper and preserves both the silhouette and exposed material, so front-only checks are insufficient.

[Batch 2](batches/002.md) retains the last valid native state, exact rejected and accepted requests, and a valid-but-wrong deeper placement. Acceptance checks compare both complete pocket stacks: old depths 0–1 stay above the inserted layers, and old depths 2–5 stay below them. Four exposed material points must also remain unchanged. This extends the audit method; it is not a request to disallow intentionally deeper tucks.

## F009 — Dog body fold under the head flap

**Blocked authoring/compound-operation investigation; not a confirmed engine gap.** Source: [Dog](https://origami.me/dog/), instruction 13, with dependent head lowering in 14. The editable [partial model](models/dog.osf) stops at native node 15, source 12. Source 15 is also unattempted.

The required body fold must leave the overlying head flap available while its upper part passes underneath, on both sides of the model. A depth-one valley request includes that head paper in its connected moving block; the tuck version refuses `tuck_target_moves`, face 24. A tentative folded-edge swivel request refuses `swivel_not_a_fold`, which means the crease selection is not yet validated. [Inputs/results](batches/dog-step13-probe.json), [analysis/swivel attempt](batches/dog-step13-analysis.json), [recipe/probe](dog-step13-probe.mjs).

Before implementation is proposed, resolve the correct layer anchors and local crease arrangement, including whether source steps 13–14 form one compound flat transition. Test existing reverse/swivel operations with those verified inputs. A successful completion must preserve the source's head-flap layering, remove the exposed white body region in the intended way, and retain an editable replay through the final flat profile. No silhouette-only workaround was saved. Do not expand scope to 3D or weaken guards.

Related source ambiguity: source-12 text specifies a quarter turn but diagram 13 shows a 45° orientation. The file follows the diagram. A corner seed refusal in source 11 was separately corrected by an interior depth seed; it is not the blocker.

## F010 — Necktie protected back flap

**Authoring/compound interpretation investigation; not a confirmed engine gap.** [Necktie](https://origami.me/necktie/) source 5 lowers the upper body while the previously folded narrow back flap rises and remains separate. A simple depth-one front fold carries that connected flap down too. The later squash refusal is downstream of this mismatch, so it cannot establish a missing squash feature. The native checkpoint is rolled back to source 4; invalid operations/states and the refusal remain in [batch 3](batches/003.md). Resolve the coupled crease/unfold arrangement and layer anchors before implementation. Acceptance requires the upright small knot triangle visible in source diagram 6, then the two independent knot squashes and final tuck.

## F011 — Cutting paper in a Fold sequence

**Confirmed missing public operation; flat paper-preparation scope.** [Rectangle to Square](https://origami.me/rectangle-paper-to-square/) source 3 removes the strip marked by source 2. `crates/oristudio-fold-wasm/src/wire.rs` defines the full public `Op` enum; it has no cut, trim, or sheet-splitting operation. The saved prefix retains the short diagonal pinch and full strip-boundary precrease. No fabricated unsupported request is submitted. Starting a square sheet is a usable preparation workaround, but loses the authored cut and discarded strip, so it does not count as this tutorial's completion. Acceptance for a future implementation: a replayable cut on the existing crease, explicit retained piece, correct new paper boundary and preserved marks, editable in Fold and saved natively. Multi-layer partial cuts need separate evidence; not implied by this single-sheet example.

## F005 — Envelope follow-up

[Paper Envelope](https://origami.me/paper-envelope/) source 8–9 now supplies a real tutorial case for the retained wide-swivel investigation. The native prefix matches source 7; the request on its vertical folded edge toward the source corner's target line refuses `swivel_fold_wide` (faces 16,18). [Exact input/output](batches/paper-envelope-swivel-attempt.json). Confirm the source's crease/target interpretation before labeling this a missing primitive. Preserve the existing guard; saving a non-flat intermediate or replacing the corner with a silhouette is not a workaround.

## F012 — Rabbit ear on the tutorial's existing precreases

**Confirmed limitation of the public rabbit-ear operation; open.** [Whale](https://origami.me/whale/) source 5 collapses the fish base after sources 1–4 establish diagonals and kite bisectors. The [native prefix](models/whale.osf) contains those seven nodes. The correctly oriented left-ear request refuses `fan_center` on the precreased central junction: [exact request/result](batches/whale-fish-base-attempt.json). A [control](whale-probe.mjs) with the same paper, triangle anchors and emergent direction, but without the extra source precreases, accepts both ears and produces the expected fish base; [first ear](batches/whale-control-probe.json), [second ear](batches/whale-control-second-ear.json). This distinguishes valid ear geometry from the existing-junction restriction. The engine's rabbit-ear tests explicitly exercise this guard.

**Needed:** recognize a compatible existing crease fan and refold it without duplicate creases or losing stored material/layer identity. Acceptance starts from this exact precreased native state, reaches the tutorial's two-ear fish base, preserves crease provenance, saves replayable choices, and works through the Fold UI. Incompatible/intersecting fans must still refuse. A possible alternate multi-operation construction remains unproven; the finding does not claim that every possible public sequence has been exhausted. Omitting prescribed precreases is a control, not tutorial completion. No guard was weakened.

## F013 — Kimono connected sleeve collapse

**Authoring/compound investigation; not a confirmed engine gap.** [Kimono](https://origami.me/kimono/) source 8 raises the central front section while flattening two connected sleeves. The saved [prefix](models/kimono.osf) reaches source 7 (11 nodes). Direct squash requests at the central and side portions refuse `squash_flap_not_free`; a centerline witness also refuses as a boundary pick. Exact inputs/results are retained as `batches/kimono-squash-*.json`. The source needs a coupled collapse, so these single-pocket requests do not prove a missing squash primitive. Resolve its crease arrangement and test existing swivel/composed operations before specifying implementation. Acceptance must preserve the two long white front bands and colored sleeves on both sides, including the hidden connections.

## Corrected inputs in batch 3

Pigeon's first all-layer beak request also selected a raised wing and refused. Restricting the precrease to the two head plies and the reverse seed to the head flap succeeds. A material check proves the reversed tip lies between the original head walls and leaves wing, breast and tail unchanged. Santa's boundary-point depth seed was replaced by an interior witness on the same intended flap. Neither case requires engine changes. The rejected requests remain in the batch evidence.
