# Flat-fold functionality findings

This is an evidence log, not a list of features inferred from design names. **Current scope (2026-10-14): single-sheet, flat folding; no required cuts or multi-sheet assembly.** Historical evidence remains below, but F011 (cuts) and F024 (multi-sheet assembly) are deferred and are not current implementation requests.

**F012, F014 and F019 are resolved locally:** precreased rabbit ears, bounded reversal of existing flat creases and squash selection across flat subdivisions pass their saved reproductions. **F031 is also implemented locally:** project CP snapshots displayed as **Collapse**, with explicit Update from CP. Witch Hat now reaches source 10; F032 tracks its remaining collapse/pocket authoring investigation. F020 is resolved by the corrected Bird/Crow opening sequence; see [investigation](batches/bird-crow-opening-2026-10-14.md). F006 (source-note visibility) is deferred at the user’s request. **F030 and F039 are resolved locally:** coupled nested reverse packets and exact boundary-meeting crimps now work through the normal tools, saved choices and fresh replay. Dove now completes source 16; Squirrel uses a direct crimp in place of its CP workaround. Other active compound failures remain authoring/reference investigations. See [latest implementation and validation](batches/direct-compound-priorities-2026-10-14.md) and [reconciled status](RECONCILIATION-2026-10-14.md).

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

Non-flat simulation, inflated bodies, curved shaping, standing box walls, all required cuts, and all multi-sheet assembly (including flat modular models) are outside this campaign. They are not implementation requests. Keep affected tutorials in the catalog with their exclusion reasons and preserve existing prefixes. F025 (Goldfish) and F029 (Crab) remain evidence, but their tutorials require cuts and are no longer active blockers.

## F006 — Saved source notes are not visible in the Fold audit UI

**Confirmed UI/workflow gap; deferred at the user’s request (2026-10-14).** Do not implement or prioritize notes now; the user plans to change this later. Historical evidence follows.

 Both batch-1 files have an instruction reference and custom note on every saved node. The Fold strip, Steps cards, and Step inspector instead display generated fold descriptions. For example, Cat Face's source instruction 7 appears as Fold step 9, described only as a valley tuck. Inspection of `apps/web/src/fold/sequence/` and `components/fold/` confirms that the note is serialized but not consumed by these presentation surfaces.

**Needed:** display/edit a node's authored note and expose source instruction grouping/reference alongside Ori Studio's operation count. Keep turns, paired folds, and source numbers distinguishable. Acceptance: opening either batch-1 native file shows the saved source instruction reference and note on the corresponding step; save/reopen preserves edits. Do not change geometry or pretend source step numbers equal engine node indexes.

**Current workaround:** [batch-1 mapping table](batches/001.md). This is useful for audit, but not a missing primitive required to fold a design.

## F007 — Cat Face target and seed selection

**Resolved authoring investigation; no engine implementation requested.** An all-layer crown fold clipped the ears, a boundary seed was invalid, and choosing the exposed muzzle as the tuck target produced `tuck_infeasible`. The corrected depth seed and pocket support target complete the model using existing operations. Evidence and reproducible native state are in [batch 1](batches/001.md). Preserve this case for usability evaluation, but do not count the rejected inputs as unsupported flat folding.

## F008 — Bookmark pocket depth is not determined by the exposed face

**Resolved authoring investigation; no engine change needed.** Source: [Bookmark](https://origami.me/bookmark/), instruction 10. The initial outer-wall target was infeasible. Targeting the next wall gives a unique valid tuck between the original folded-corner pocket walls. A different feasible target inserts the same flap deeper and preserves both the silhouette and exposed material, so front-only checks are insufficient.

[Batch 2](batches/002.md) retains the last valid native state, exact rejected and accepted requests, and a valid-but-wrong deeper placement. Acceptance checks compare both complete pocket stacks: old depths 0–1 stay above the inserted layers, and old depths 2–5 stay below them. Four exposed material points must also remain unchanged. This extends the audit method; it is not a request to disallow intentionally deeper tucks.

## F009 — Dog body fold under the head flap

**Blocked authoring/compound-operation investigation; not a confirmed engine gap.** Source: [Dog](https://origami.me/dog/), instruction 13, with dependent head lowering in 14. The editable [partial model](../2026-10-13-origami-fold-trials/models/in-progress/dog.osf) stops at native node 15, source 12. Source 15 is also unattempted.

The required body fold must leave the overlying head flap available while its upper part passes underneath, on both sides of the model. A depth-one valley request includes that head paper in its connected moving block; the tuck version refuses `tuck_target_moves`, face 24. A tentative folded-edge swivel request refuses `swivel_not_a_fold`, which means the crease selection is not yet validated. [Inputs/results](batches/dog-step13-probe.json), [analysis/swivel attempt](batches/dog-step13-analysis.json), [recipe/probe](dog-step13-probe.mjs).

Before implementation is proposed, resolve the correct layer anchors and local crease arrangement, including whether source steps 13–14 form one compound flat transition. Test existing reverse/swivel operations with those verified inputs. A successful completion must preserve the source's head-flap layering, remove the exposed white body region in the intended way, and retain an editable replay through the final flat profile. No silhouette-only workaround was saved. Do not expand scope to 3D or weaken guards.

Related source ambiguity: source-12 text specifies a quarter turn but diagram 13 shows a 45° orientation. The file follows the diagram. A corner seed refusal in source 11 was separately corrected by an interior depth seed; it is not the blocker.

## F010 — Necktie protected back flap

**Authoring/compound interpretation investigation; not a confirmed engine gap.** [Necktie](https://origami.me/necktie/) source 5 lowers the upper body while the previously folded narrow back flap rises and remains separate. A simple depth-one front fold carries that connected flap down too. The later squash refusal is downstream of this mismatch, so it cannot establish a missing squash feature. The native checkpoint is rolled back to source 4; invalid operations/states and the refusal remain in [batch 3](batches/003.md). Resolve the coupled crease/unfold arrangement and layer anchors before implementation. Acceptance requires the upright small knot triangle visible in source diagram 6, then the two independent knot squashes and final tuck.

## F011 — Cutting paper in a Fold sequence

**Confirmed missing public operation; deferred outside scope by user on 2026-10-14.** The following requirements are historical evidence, not work needed to complete the current campaign. [Rectangle to Square](https://origami.me/rectangle-paper-to-square/) source 3 removes the strip marked by source 2. `crates/oristudio-fold-wasm/src/wire.rs` defines the full public `Op` enum; it has no cut, trim, or sheet-splitting operation. The saved prefix retains the short diagonal pinch and full strip-boundary precrease. No fabricated unsupported request is submitted. Starting a square sheet is a usable preparation workaround, but loses the authored cut and discarded strip, so it does not count as this tutorial's completion. Acceptance for a future implementation: a replayable cut on the existing crease, explicit retained piece, correct new paper boundary and preserved marks, editable in Fold and saved natively. Multi-layer partial cuts need separate evidence; not implied by this single-sheet example.

## F005 — Envelope follow-up

[Paper Envelope](https://origami.me/paper-envelope/) source 8–9 now supplies a real tutorial case for the retained wide-swivel investigation. The native prefix matches source 7; the request on its vertical folded edge toward the source corner's target line refuses `swivel_fold_wide` (faces 16,18). [Exact input/output](batches/paper-envelope-swivel-attempt.json). Confirm the source's crease/target interpretation before labeling this a missing primitive. Preserve the existing guard; saving a non-flat intermediate or replacing the corner with a silhouette is not a workaround.

## F012 — Rabbit ear on the tutorial's existing precreases

**Resolved locally, 2026-10-14.** Both Whale fish-base ears now succeed through the existing source precreases, including the four-pick Fold UI. The saved Dolphin ear succeeds too. See [implementation and validation](batches/rabbit-ear-precreases-2026-10-14.md) and [exact fresh results](batches/rabbit-ear-precreases-2026-10-14.json). [Whale now completes all ten source instructions](batches/whale-completion-2026-10-14.md), with native replay, visual checks, and material-order checks; user audit is pending. Dolphin remains excluded because source 11 requires a cut. No remaining in-scope recorded design is blocked on F012.

**Original confirmed limitation:** [Whale](https://origami.me/whale/) source 5 collapses the fish base after sources 1–4 establish diagonals and kite bisectors. The [native prefix](../2026-10-13-origami-fold-trials/models/archive/checkpoints/whale-before-rabbit-ear.osf) contains those seven nodes. The correctly oriented left-ear request refuses `fan_center` on the precreased central junction: [exact request/result](batches/whale-fish-base-attempt.json). A [control](whale-probe.mjs) with the same paper, triangle anchors and emergent direction, but without the extra source precreases, accepts both ears and produces the expected fish base; [first ear](batches/whale-control-probe.json), [second ear](batches/whale-control-second-ear.json). This distinguishes valid ear geometry from the existing-junction restriction. The engine's rabbit-ear tests explicitly exercise this guard.

**Acceptance target (now met for the reproduced fish base):** recognize a compatible existing crease fan and refold it without duplicate creases or losing stored material/layer identity. Acceptance starts from this exact precreased native state, reaches the tutorial's two-ear fish base, preserves crease provenance, saves replayable choices, and works through the Fold UI. Incompatible/intersecting fans must still refuse. A possible alternate multi-operation construction remains unproven; the finding does not claim that every possible public sequence has been exhausted. Omitting prescribed precreases is a control, not tutorial completion. No guard was weakened.

## F013 — Kimono connected sleeve collapse

**Authoring/compound investigation; not a confirmed engine gap.** [Kimono](https://origami.me/kimono/) source 8 raises the central front section while flattening two connected sleeves. The saved [prefix](../2026-10-13-origami-fold-trials/models/in-progress/kimono.osf) reaches source 7 (11 nodes). Direct squash requests at the central and side portions refuse `squash_flap_not_free`; a centerline witness also refuses as a boundary pick. Exact inputs/results are retained as `batches/kimono-squash-*.json`. The source needs a coupled collapse, so these single-pocket requests do not prove a missing squash primitive. Resolve its crease arrangement and test existing swivel/composed operations before specifying implementation. Acceptance must preserve the two long white front bands and colored sleeves on both sides, including the hidden connections.

## Corrected inputs in batch 3

Pigeon's first all-layer beak request also selected a raised wing and refused. Restricting the precrease to the two head plies and the reverse seed to the head flap succeeds. A material check proves the reversed tip lies between the original head walls and leaves wing, breast and tail unchanged. Santa's boundary-point depth seed was replaced by an interior witness on the same intended flap. Neither case requires engine changes. The rejected requests remain in the batch evidence.

## F014 — Partial precrease along an existing flat crease

**Scope clarification from user audit:** Precrease → Segment extent already exists and is the correct workflow. The recorded Witch Hat request already uses `kind: "precrease"` with `extent.kind: "segment"`. This finding concerns that existing workflow rejecting a segment coincident with an existing crease; it does not call for a new tool or extent selector.

**Resolved locally, 2026-10-14.** The exact saved-state request now succeeds. Existing flat hinges between moving and stationary material participate in Segment and Pinch precreases; only the selected interval’s remembered letter changes. Interior endpoints subdivide the crease and both incident face rings without splitting faces or moving material. Marks never overlap topology edges, and all minimum-feature and state-validity guards remain intact. Ordinary M/V refolds reuse the same hinges and were verified on both paper sides with layer-order assertions.

[Implementation and verification](batches/existing-crease-2026-10-14.md), [exact request and result](batches/witch-hat-existing-crease-2026-10-14.json), and [plan](../../implementation-plans/existing-crease-precreases.md). At this checkpoint, the Witch Hat prefix reached **source 7 / Fold step 10** (13 nodes); the current native file has since advanced through F031. All face geometry, transforms, subface layer stacks, vertices and lineage match the parent; only crease memories 47 and 48 reverse. The same operation was committed through the actual Fold controls and replayed from the saved native file. User audit remains pending.

Historical evidence: [original refusal](batches/witch-hat-failure.json), [uncreased control](batches/witch-hat-partial-control.json), [pre-fix recheck](batches/witch-hat-recheck-2026-10-14.json). The original 12-node model is retained in `models/archive/checkpoints/witch-hat-before-existing-crease.osf`. The following source step was addressed separately by F031 below.

## F015 — Happi collar reference interpretation

**Authoring/source-reference investigation; not an engine gap.** [Happi](https://origami.me/happi/) source 6 lowers the rear upper flap and turns the model over. The attempted crease at the existing collar-bottom height produces the wrong body length and exposed regions. All operations succeed, but geometry does not match the next source diagram. The [native file](../2026-10-13-origami-fold-trials/models/in-progress/happi.osf) therefore stops at source 5 (nine nodes); [tentative downstream operations/states](batches/happi-unverified-downstream.json) remain separate. Resolve whether the collar reference positions the moving edge rather than the crease, and avoid duplicating the source turn-over arrow. Do not infer a missing sleeve squash from this invalid prefix. Acceptance requires correct collar exposure and hem position before attempting source 8's sleeves.

## F016 — Parrot connected wing collapse

**Authoring/compound investigation; not a confirmed engine gap.** [Parrot](https://origami.me/parrot/) source 6 opens a connected upper flap and flattens its far corner toward the center. Direct squash requests both before and after source 5's unfolding refuse `squash_flap_not_free`. [Folded request](batches/parrot-folded-squash-attempt.json), [unfolded request and analysis](batches/parrot-squash-analysis.json), [complete attempt log](batches/parrot-failure.json). The native prefix stops after source 5 (eight nodes), and every saved state has been compared in Fold. Resolve the correct coupled crease arrangement and test existing swivel/reverse composition before requesting a new operation. Sources 7–12 are reviewed but unattempted.

## A001 — Wallet source access

**Access blocker; no engine requirement inferred.** The [Wallet page](https://origami.me/wallet/) currently presents an Early Access notice, with no complete instructions or diagrams publicly available. The introductory description suggests a flat wallet, but eligibility cannot be established without the full tutorial. No purchase, registration, archive bypass, or alternate reconstruction was attempted. Revisit when the public tutorial is available or the user supplies authorized reference content.

## F017 — Fox central multi-ply squash

**Authoring/compound investigation; not a confirmed engine gap.** [Fox](https://origami.me/fox/) sources 8–9 lift and squash the middle flap. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/fox.osf) reaches source 7, with all ten states checked in Fold. A [direct request](batches/fox-direct-squash.json) and a [tentative middle-fold request](batches/fox-squash-analysis.json) refuse `squash_no_flap` / `no_spine`. The latter preliminary fold also exposes an incorrect white flap, so [its downstream states](batches/fox-unverified-downstream.json) are not part of the native prefix. Determine the central connected layer group and crease geometry before claiming missing functionality. A temporary lifted pose is not itself a required non-flat endpoint.

## F018 — Lantern coupled pocket opening

**Authoring/compound investigation; not a confirmed engine gap.** [Lantern](https://origami.me/lantern/) source 5 explicitly calls for swivel folds to open the upper and lower flaps. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/lantern.osf) contains three blintzes and their turns, through source 4 (17 nodes / 18 states checked in Fold). A direct squash refuses `squash_flap_not_free`: [exact request and analysis](batches/lantern-opening-attempt.json). This is not yet the source swivel operation; resolve and test its fold, edge, and target anchors. No public swivel failure or missing feature is established by the squash refusal.

## F019 — Squash pick depends on the selected flat subface

**Resolved locally, 2026-10-14; ready for user audit.** Bird source 4's precreased pocket previously worked near its spine but refused `squash_no_flap / no_spine` on another flat subdivision. [Historical picks](batches/bird-pocket-picks.json) and [uncreased control](batches/bird-uncreased-control.json) remain intact. Discovery now grows both picked layers across flat creases before finding the spine, then starts the hinge walk from the actual incident lower face. Final hinge-bounded flap growth, coverage, attachment and geometry checks are unchanged.

[Verification](batches/squash-precreases-2026-10-14.md) proves identical analysis, geometry, exposed sides and full layer order for the two exact Bird requests, fresh saved-document replay, and a normal browser selection/commit from the previously failing subdivision. Native tests cover every exposed subdivision, segmented spines, both viewing directions, mirrored/asymmetric squashes and a second squash with a flat upper hinge. Bird's later F020 opening remains unresolved; this selection fix is not tutorial completion.

## F020 — Bird opening beneath its folded top triangle

**Resolved authoring/decomposition issue, 2026-10-14.** Lift the top triangle, open both kite sides, and lower it again for the source-7 endpoint. Release the triangle before Petal. Existing operations complete both petals with verified material stacks. Bird now reaches source 11 and Crow source 9, both Fold step 20; no engine implementation is needed. See [report and reproduction](batches/bird-crow-opening-2026-10-14.md). The original failed attempt follows as historical evidence.

**Authoring/compound investigation; not a confirmed engine gap.** [Bird](https://origami.me/bird/) source 7 opens the lower kite flaps while the top triangle remains lowered. The attempted single-crease unfold succeeds but moves six connected layers into a different silhouette; [invalid downstream operation and states](batches/bird-unverified-downstream.json). The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/bird.osf) stops at source 6 (14 nodes / 15 states verified in Fold). Resolve the coupled opening or correct material selection before attempting the petal and claiming missing functionality.

## F021 — Pajarita quarter-fold swivel

**Authoring/compound investigation; not a confirmed engine gap.** [Pajarita](https://origami.me/pajarita/) source 8 raises the lower strip and swivels its lower-right corner outward. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/pajarita.osf) reaches source 7 (16 nodes / 17 states checked in Fold). Mapping the front strip's vertical raw edge onto the horizontal center line, meeting its vertical folded edge, refuses `swivel_misses_fold` at the existing precrease junction: [request and analysis](batches/pajarita-first-swivel.json). The same request after just the quarter fold, with no prior precreases, refuses `swivel_fold_wide`: [control](batches/pajarita-uncreased-swivel-control.json). Thus removing the junction does not validate these inputs. The source's background strip uses a horizontal hinge, while the front strip develops diagonal folds; confirm whether existing compound operations can express that geometry before proposing a new swivel case. Sources 9–13 are reviewed but unattempted.

Pajarita source 6's text says to unfold the preceding folds, while diagram 7 shows the entire colored square. The native sequence explicitly reopens all four underlying blintz corners to match that diagram. Initial crease-vertex and diagonal-boundary picks were corrected to interior crease and flap witnesses; they are authoring pick errors, not engine gaps.


## F022 — Shirt sleeve opening

**Authoring/compound investigation; not a confirmed engine gap.** [Shirt](https://origami.me/shirt/) source 7 opens the lower corners into sleeves. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/shirt.osf) reaches source 6 (nine nodes / ten states checked in Fold). A direct squash on the colored pocket refuses `squash_no_flap` / `no_hinge`: [exact operation and analysis](batches/shirt-sleeve-attempt.json). An earlier white one-ply pick refused `single_layer` and is retained separately as a pick error. Resolve the preparatory hinge or coupled opening before specifying a new primitive. Sources 8–10, including the final tuck beneath both collar tips, remain unattempted.

## F023 — Elephant head swivel

**Authoring/source-reference investigation; not a confirmed engine gap.** [Elephant](https://origami.me/elephant/) source 8 swivels the head downward. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/elephant.osf) reaches source 7 (eleven nodes / twelve states checked in Fold). A tentative edge-to-line request refuses `swivel_fold_wide`: [exact request and analysis](batches/elephant-head-attempt.json). Its target slope may rotate the edge in the wrong direction, so it does not establish unsupported geometry. Resolve the reference movement and crease intersection before claiming a missing case. The three subsequent trunk reverses are reviewed but unattempted. The source-4 pleat width is approximate and saved in the operation note.

## F011 extension — Layer-selective partial cuts

[Horse](https://origami.me/horse/) is a flat model with a required cut in source 8. Unlike Rectangle-to-Square's full strip separation, this cut starts at the lower tip and ends inside the selected front layer at the horizontal precrease; the operation is repeated on the opposite face. [Exact required path and retained scene](batches/horse-cut-requirement.json). The [native prefix](../2026-10-13-origami-fold-trials/models/excluded/cuts/horse.osf) reaches source 7, all seventeen states verified in Fold. No fake unsupported request was submitted because no public cut variant exists. Acceptance needs layer selection, an interior cut endpoint, persistent raw-edge topology and replay, while preserving the other paper layers. Subsequent folds remain unattempted.


## F024 — Flat multi-sheet assembly and interlocking

**Confirmed missing public functionality; deferred outside scope by user on 2026-10-14.** The acceptance conditions below are retained as historical evidence, not an active implementation request. [Ninja Star](https://origami.me/ninja-star/) requires placing two separately folded sheets together in source 8, then reciprocal pocket tucks in sources 9 and 11. All eleven instructions and thirteen diagrams were reviewed; the final assembly is flat. Both [unit A](../2026-10-13-origami-fold-trials/models/excluded/multi-sheet/ninja-star-a.osf) and [unit B](../2026-10-13-origami-fold-trials/models/excluded/multi-sheet/ninja-star-b.osf) reach the source-7 assembly pose, with all 23 saved states replayed and checked in Fold.

`crates/oristudio-fold-wasm/src/wire.rs` exposes one `Paper` per initial state and no insert, place, join or assembly operation in `Op`; the existing tuck targets material from that same state. Separate native sequences can retain both modules, but cannot express their combined layer order or interlocking steps. Do not substitute a CP jump or hand-built merged mesh for the missing editable operation.

**Acceptance:** place independently authored sheets in one flat assembly with stable sheet/material identity; store relative translation/rotation and initial overlap order; permit selected flaps of one sheet to tuck into a second sheet's pocket; save/replay the complete sequence in Fold and verify both faces' material ordering. No 3D behavior is required.

The initial module attempt used an all-layer second tip fold and moved the first tip again. A normal canvas depth seed fixes this authoring error; the invalid requests are retained in `batches/ninja-star-*-invalid-all-layers.json`. Material checks confirm the first tip stays unchanged and every exposed module subface is colored. Source 6's second-unit text says approximately 22 degrees, whereas the next diagram requires 45 degrees; the saved note explains following the diagram.


## F025 — Goldfish pocket collapse investigation

**Classification: authoring / compound-operation investigation, not a confirmed missing primitive.**

The [Goldfish tutorial](https://origami.me/goldfish/) source 11 opens the helmet pocket and collapses it in the perpendicular direction. The native sequence preserves the verified source-10 helmet (14 nodes / 15 states). A direct front-band squash at view `[0.12, 0.42]` refuses `squash_no_flap / no_hinge`. Turning to the plain back and halving the pocket before squashing three interior points refuses `squash_flap_not_free`. Correct compound decomposition is still unresolved; these refusals alone do not prove a missing feature.

Evidence: [direct request](batches/goldfish-opening-attempt.json), [prepared half-pocket control](batches/goldfish-half-pocket-control.json), [last valid state](batches/goldfish-before-opening.json), [native sequence](../2026-10-13-origami-fold-trials/models/excluded/cuts/goldfish.osf). A rejected exact-vertex seed was fixed with an interior pick and is recorded separately as an authoring error.

Source 12 independently strengthens **F011**: cut only the outer layer from the lower corner along the lower edge about two-thirds of its length, repeat from the other face, retain the other layers, then unwrap the cut material in source 14. There is no public cut operation. The cut and unwrap remain unattempted because source 11 is unresolved.


### F011 additional preparation cases

[Rectangle to Hexagon](../2026-10-13-origami-fold-trials/models/excluded/cuts/rectangle-to-hexagon.osf) source 6 requires an oblique boundary-to-boundary cut through both folded layers, discarding a triangular offcut. The remaining cut boundary becomes the alignment reference for source 7; another cut occurs at source 10 before unfolding. The exact first-cut view path and last valid scene are in [cut requirement](batches/rectangle-to-hexagon-cut-requirement.json).

[Square to Pentagon](../2026-10-13-origami-fold-trials/models/excluded/cuts/pentagon-from-square-paper.osf) source 9 requires cutting a stacked packet along its nearest visible raw edge, retaining the lower wedge and unfolding it. [Cut requirement](batches/pentagon-from-square-paper-cut-requirement.json). Its partial reference pinches remain on the intended front ply, confirmed from original-sheet coordinates. Both preparation cases stop before the missing cut, without substituting a new polygon sheet.

## F026 — Four-Pointed Star first packet swivel (investigation)

The full [20-step tutorial](https://origami.me/4-pointed-star/) and 21 diagrams were reviewed. The [native packet](../2026-10-13-origami-fold-trials/models/in-progress/4-pointed-star.osf) matches through source 14 (21 nodes / 22 Fold-checked states). Eight partial creases, alignment precreases, and front-layer packet folds succeed. Source 15 needs a swivel at the junction of two existing folded creases. The picked upper-left edge lands on the diagonal; analysis finds the intended vertex and landing, but application refuses `fan_ray_blocked` (face 9). Both direction/kind feasibility pairs are unavailable. Retain this as an authoring/compound investigation: the mapped second crease and intervening folded layer need resolution before claiming a missing primitive.

Evidence: [exact request and analysis](batches/4-pointed-star-swivel-attempt.json), [refusal](batches/4-pointed-star-failure.json), [last valid scene](batches/4-pointed-star-before-swivel.json). No guard weakened or non-flat state introduced.

## F027 — Camellia first squash after reverse closure (investigation)

The [13-step tutorial](https://origami.me/camellia/) and 14 diagrams are flat. The [native prefix](../2026-10-13-origami-fold-trials/models/in-progress/camellia.osf) matches through source 6 (7 nodes / 8 Fold-checked states). The reverse fold requires choosing among two openings; the original bottom-fold spine gives the source result. This is supported functionality, not a gap. Material witnesses prove the bottom and right outer panels remain unchanged.

Source 7 opens the lower flap while turning it upward. A direct squash and three relevant interior/spine-adjacent picks all refuse `squash_flap_not_free` (face 19; flap 13,15,20). A valid compound decomposition remains unproven; do not call this a missing squash primitive. Source 10 untuck and later locks remain unattempted.

Evidence: [reverse selection](batches/camellia-reverse-attempt.json), [squash request](batches/camellia-first-squash-attempt.json), [pick controls](batches/camellia-squash-pick-controls.json), [refusal](batches/camellia-failure.json), [material checks](batches/camellia.material-checks.json).

## F028 — Chicken connected wing squash and source landmark

**Investigation / reference ambiguity; not a confirmed missing primitive.** [Chicken](https://origami.me/chicken/) source 10 follows an eight-ply inside reverse for the feet. A direct squash on the front wing refuses `squash_flap_not_free`, naming faces 26 and 30 outside flap 24/28. Three nearby picks give the same refusal. The connected opening may need a compound decomposition; none is established yet.

[Native prefix](../2026-10-13-origami-fold-trials/models/in-progress/chicken.osf): eleven nodes through source 9, twelve states replayed and checked in Fold. [Exact requests and controls](batches/chicken-wing-controls.json), [failed operation](batches/chicken-failure.json), [pre-reverse state](batches/chicken-before-feet.json), [last valid state](batches/chicken-after-feet.json), and [material proof](batches/chicken.material-checks.json). The reverse uses the central original-diagonal opening, with eight moving layers between four unchanged front and four unchanged back layers at the overlap witness.

The text calls the moving wing landmark the source-3 pinch, while the visible front-flap mark in the diagram appears to be the transformed source-4 pinch. This is an interpretation to resolve before asserting a target geometry or implementing a generalized squash. Later beak and comb operations remain unattempted. Keep the last valid prefix and establish the source's actual material/landing correspondence, then test an existing-operation decomposition. Do not weaken the free-flap guard.

## F029 — Crab petal after four pocket squashes

**Investigation; not a confirmed missing primitive.** [Crab](https://origami.me/crab/) source 12 lifts the truncated front flap after source 11's reference creases. The mapped petal returns `residual` 0.12132034355964205 at vertex 17 / face 31. A control before source 11 refuses `petal_no_flap` / `past_corner`; this does not establish the correct alternative geometry. The authoring correspondence between the source's preparation creases and the petal's computed hinges still needs resolving.

[Native prefix](../2026-10-13-origami-fold-trials/models/excluded/cuts/crab.osf): 29 nodes through source 11, all 30 states replayed and checked in Fold. [Petal request](batches/crab-petal-attempt.json), [failure](batches/crab-failure.json), [uncreased control](batches/crab-uncreased-petal-control.json), [state before petal preparation](batches/crab-before-petal.json), and [material checks](batches/crab.material-checks.json). The four preceding pocket squashes work; paper sides match the colored upper triangle and white lower split flaps. Preserve guards until the source mapping and connected layers are established.

**Additional confirmed F011 cutting cases:** Crab sources 17 and 19 slit selected lower front/back flaps from the free tip into the paper, without discarding an offcut. Source 25 makes paired edge-inward incisions through every layer to free the upper tuck. Neither kind is expressible by the public Fold operations. These are required even if the earlier petal investigation is resolved.


### F020 additional case — Crow

**Resolved with Bird, 2026-10-14.** The current file completes source 17 / Fold 28; see the [shaping report](batches/bird-crow-shaping-2026-10-14.md). The following source-6 details describe the archived checkpoint and original failed approach.

[Crow](https://origami.me/crow/) repeats the same square-base preparation and source-7 coupled kite opening. Its [native prefix](../2026-10-13-origami-fold-trials/models/completed/crow.osf) reaches source 6 (14 nodes / 15 states checked). Selecting all layers for the upper triangle gives exactly the same canonical states as Bird's depth-one request, so that choice does not resolve the issue. A depth-one unfold still moves the wrong connected packet; direct petal from the closed kite refuses `petal_no_flap / no_ends`. [Controls](batches/crow-opening-controls.json), [invalid downstream attempt](batches/crow-unverified-downstream.json), [material checks](batches/crow.material-checks.json). Correct decomposition is unresolved; this remains an investigation, not a new confirmed missing primitive.

Devilish Heart source 12 also requires a diagonal cut separating two creased triangular sheets (F011), but its required final center dimple is non-flat. The tutorial is excluded from flat completion; no variant or new cut test was authored.


### F012 additional case — Dolphin

The recorded ear now succeeds with the local implementation; [fresh result](batches/rabbit-ear-precreases-2026-10-14.json). Its later required cut remains out of scope. The original evidence follows.

[Dolphin](https://origami.me/dolphin/) source 4 collapses the upper half of the prepared diamond. The [exact rabbit-ear request](batches/dolphin-rabbit-ear-attempt.json) refuses `fan_center` at the precreased incenter. The same triangle, seed, stayer and emergent direction [succeed with only the necessary horizontal spine](batches/dolphin-rabbit-ear-control.json), confirming the existing-junction restriction rather than invalid triangle geometry. The source precreases are retained in the [seven-node native prefix](../2026-10-13-origami-fold-trials/models/excluded/cuts/dolphin.osf); all eight states are checked in Fold. Source 11 also requires a packet slit from the tail tip into the interior (F011). The later final swivel is flat but unattempted.


## F030 — Reverse a packet of nested flap pairs

**Resolved locally, 2026-10-14.** [Implementation, tests and local audit](batches/direct-compound-priorities-2026-10-14.md). Corresponding halves of selected nested openings on a common spine now follow their shared motion; each opening retains its own pocket contacts. Outer-only selection still refuses. The canonical Dove now completes source 16 / Fold 17, including both nested reverses and the boundary-meeting nested tail crimp. [Completion and validation](batches/dove-completion-2026-10-14.md): all 24 states replay.

**Original confirmed limitation:** Dove source 6 reverses two nested flap pairs together. Its six-node source-5 prefix is now checked in Fold and all seven states replay identically. Selecting only the outside pair refuses `reverse_tip_not_free`; selecting both pairs identifies the correct four moving pieces and both central openings, but refuses `reverse_kind_infeasible`.

A public CP-import control reverses exactly those four pieces, flips their exposed sides, and preserves every stationary piece and the stationary layer order. The two upper layers and the two lower layers reverse within their respective packets. The direct implementation gives each material flap its own blocks and uses `Across::Keep`, which carries the old order between different flaps. That constraint rules out this nested-packet result. This is narrower than a missing arbitrary reverse fold and does not imply the flat solver is unable to represent the result.

[Investigation, exact inputs and material checks](batches/dove-nested-reverse-2026-10-14.md). The CP control remains archived separately as the acceptance reference; the original source-5 prefix is now checkpointed. No tutorial-completion claim is made for Dove. Cross-block and pocket-contact guards remain, with the explicit packet motion carrying the corresponding nested halves’ order.

## F031 — Project CP linked as a Collapse step

**Resolved locally, 2026-10-14.** Fold's Import CP picker now links the project
CP as a Collapse step, preserving its snapshot, source revision and chosen
flat layer order. Following user audit feedback, the canvas and timeline always show the folded result with a Collapse label. Explicit Update
from CP preserves notes/branches and replays descendants, with Changed/Broken
indicators and one-step undo. Saved snapshots replay without the live source.

[Implementation and audit](batches/linked-cp-collapse-2026-10-14.md),
[plan](../../implementation-plans/linked-cp-collapse-step.md),
[Witch Hat prefix](../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf).
The user's original CP is preserved in the checkpoint. The active CP's M/V
assignments were corrected to the importer's front-relative convention.

## F032 — Witch Hat final collapse and pocket order

**Authoring/reference investigation, not a confirmed engine gap.** Source 8
now works through linked Collapse, followed by source 9–10 precreases. A
rabbit-ear candidate for source 11 reaches the source-13 silhouette, but its
hidden layer correspondence remains unverified and its source-14 tuck is
refused (`tuck_infeasible`; alternate targets can give `tuck_target_moves`).
Four alternate lower-flap CP orders were also probed without admitting the
tested tuck. A further 76 layer/direction probes found that some deeper body-layer folds land, but those select different paper from the middle ear and are not the requested tuck. Preserve the verified source-10 prefix and the separate candidate.

[Exact operations, states and refusals](batches/witch-hat-linked-collapse-investigation.json)
and [audit report](batches/linked-cp-collapse-2026-10-14.md). Establish the
source-11 material correspondence and the actual pocket walls before changing
an engine guard or naming another missing primitive.

## F033 — Bird outward tail/neck pull after raising the wings

**Authoring/compound investigation, not a confirmed missing primitive.** Bird now matches through source 13 / Fold 24 (32 nodes). Source 14 pulls an inner flap outward while the front/back wing triangles remain in place and the lower edges align. The source videos were reviewed, but the material-to-hinge correspondence for a valid swivel is not established. Candidate outer/root/central-edge swivels refuse `swivel_fold_wide` or identify non-edge/non-fold picks. Base unfolds can carry extra connected flaps. Do not infer a missing generalized swivel or weaken guards from these requests.

The [report and exact probes](batches/bird-crow-shaping-2026-10-14.md) preserve the 32-node valid state separately. Resolve the source-14 correspondence before proposing implementation; source 15 and the head remain unattempted.

## F034 — Envelope hidden flap reversal

**Authoring/compound investigation, not a confirmed missing primitive.** Envelope is verified through source 13 / Fold 18. Source 14 flips a hidden triangular flap while returning the surrounding pocket to its original position. Plain and existing-crease folds move additional body material. Reverse attempts on the hidden pair refuse `reverse_no_opening` / `no_body`. The tutorial video temporarily opens the packet, so a decomposition must be established before proposing an engine change.

[Verified prefix and exact attempts](batches/envelope-prefix-2026-10-14.md). Sources 15–24 remain unattempted; no tentative operation was appended to the canonical native file.

## F035 — Heart Card endpoint swivel

**Authoring/compound investigation; not a confirmed engine gap.** [Heart Card](https://origami.me/heart-card-2/) source 14 swings the left colored square above the card. The native prefix is verified through source 13 / Fold 17 (20 nodes). Current folded-edge requests refuse `swivel_misses_fold` at the crease endpoint; the free-pivot counterpart refuses `swivel_edge_short`. A feasible direct reverse produces only a corner reversal, and a simple unfold recruits the stationary body. [Full report and exact attempts](batches/heart-card-prefix-2026-10-14.md). Establish the correct material motion and a valid control before proposing endpoint support. The earlier source-6 pleat failure was corrected by using valley in the lifted flap’s frame, and is not an engine gap.

## F036 — Heart Corner Bookmark connected squash

**Authoring/compound investigation; not a confirmed engine gap.** [Heart Corner Bookmark](https://origami.me/heart-corner-bookmark/) source 9 squashes the right colored flap while leaving the card body in place. The native prefix is verified through source 8 / Fold 7 (ten nodes). The exposed-flap request identifies faces 26/28 but refuses `squash_flap_not_free` at its additional connection to face 30. Hidden-layer picks are correctly covered. [Full report and requests](batches/heart-corner-bookmark-prefix-2026-10-14.md). Confirm the crease propagation and original material ordering before defining a general connected-squash operation; this is distinct from resolved F019 precrease subdivision selection.

## F037 — Heart Envelope corner and pocket correspondence

**Authoring investigation, not a confirmed engine gap.** The [source-5 prefix](batches/heart-envelope-prefix-2026-10-14.md) is verified. Two tentative source-6 corner folds produce the expected silhouette, but the following source-7 mountain-fold candidate recruits stationary white body material. Establish the correct corner-layer selection and pocket motion before changing engine behavior. Exact accepted-but-wrong candidate operations and their states are retained separately; the native prefix stops before them.

## A002 — Mushroom source access

**Access blocker.** The current [Mushroom tutorial](https://origami.me/mushroom/) is limited to Origami Friends early access. Its public landing page announces release in five weeks. No native sequence is authored. Publicly exposed metadata image links are not a substitute for authorized access to the full tutorial. Revisit when the tutorial is public or the user supplies authorized source material; no engine change is implicated.

## F038 — Kitten side-opening collapse

**Authoring investigation.** [Kitten source 6](batches/kitten-prefix-2026-10-14.md) opens the two lower kite flaps as the bottom corner rises. Direct reverse folds do not produce the required outward side flaps. The native prefix is verified through source 5; exact opening choices and requests are retained. Establish a correct decomposition or CP control before proposing a compound primitive. The initial overlong precreases were an authoring mistake corrected with existing segment extent.

## F039 — Crimp hinges meeting at the packet boundary

**Resolved locally, 2026-10-14.** [Implementation and validation](batches/direct-compound-priorities-2026-10-14.md). Exact shared boundary endpoints are allowed when every other first-hinge contact is clear of the second line on one side. Interior crossings, coincident hinges and sub-minimum strips still refuse; scoring and final validity checks remain. Squirrel source 16 / Fold 19 now uses the direct crimp, with all later states matching the checked CP continuation.

**Original confirmed limitation:** Squirrel source 16 has two prepared neck hinges meeting at the packet's boundary. The public inside-crimp operation returns `crimp_lines_meet`. A unique flat CP control produces the prescribed two-reflection motion, preserves the stationary body's material and order, and supports all subsequent head and tail folds. This demonstrates a supported flat result that the direct crimp guard excludes; it does not justify removing intersection/contact checks generally.

[Full report, exact refused request and checked CP control](batches/squirrel-completion-2026-10-14.md). The acceptance distinction between a shared boundary endpoint and an interior crossing is now covered by positive and negative regressions. The prior complete CP version is checkpointed. CP-import loss of unused flat reference marks is a separate nonblocking representation limitation, also seen in Pumpkin.


### CP reference-mark clarification — 2026-10-14

The Pumpkin/Squirrel CP-control reports describe loss of reference lines classified as `F`. This is not evidence that the importer cannot retain precreases: `ImportKind::Unassigned { hint: Some(letter) }` already carries flat creases, and native FOLD exports provide direction hints. The research control snapshots stripped those hints and classified unused lines as auxiliary guides. Correct those authoring inputs before proposing importer changes; do not add this to the confirmed implementation backlog. Squirrel’s direct-crimp replacement no longer uses that snapshot.
