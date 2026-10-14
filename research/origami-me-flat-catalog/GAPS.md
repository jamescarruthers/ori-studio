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

## F014 — Partial precrease along an existing flat crease

**Confirmed public-operation restriction; open.** [Witch Hat](https://origami.me/witch-hat/) source 7 reverses only the central section of an existing horizontal precrease. The [native prefix](models/witch-hat.osf) reaches source 6 (12 nodes). The segment request refuses `extent_misses_layers`: [exact operation and result](batches/witch-hat-failure.json). The identical segment succeeds on a fresh sheet without the previous creases: [control](batches/witch-hat-partial-control.json).

`crates/oristudio-fold/src/fold/partial.rs` only adds marks where a face is newly split into moving and stationary parts. An existing crease lies on face boundaries, so no mark is added and the empty result is refused. The existing test suite explicitly exercises this restriction. A whole-line replacement would also mark the outer wings, so it is not the source operation. The coordinated brim collapse in source 8 remains unattempted; this finding does not claim it is unsupported.

**Acceptance:** from the exact saved state, allow a bounded reversal/mark along the existing crease with no added outer-wing crease, preserve face/material identity and provenance, and save/replay the result through the Fold UI. Retain guards for segments genuinely outside the selected paper. No engine code changed.

## F015 — Happi collar reference interpretation

**Authoring/source-reference investigation; not an engine gap.** [Happi](https://origami.me/happi/) source 6 lowers the rear upper flap and turns the model over. The attempted crease at the existing collar-bottom height produces the wrong body length and exposed regions. All operations succeed, but geometry does not match the next source diagram. The [native file](models/happi.osf) therefore stops at source 5 (nine nodes); [tentative downstream operations/states](batches/happi-unverified-downstream.json) remain separate. Resolve whether the collar reference positions the moving edge rather than the crease, and avoid duplicating the source turn-over arrow. Do not infer a missing sleeve squash from this invalid prefix. Acceptance requires correct collar exposure and hem position before attempting source 8's sleeves.

## F016 — Parrot connected wing collapse

**Authoring/compound investigation; not a confirmed engine gap.** [Parrot](https://origami.me/parrot/) source 6 opens a connected upper flap and flattens its far corner toward the center. Direct squash requests both before and after source 5's unfolding refuse `squash_flap_not_free`. [Folded request](batches/parrot-folded-squash-attempt.json), [unfolded request and analysis](batches/parrot-squash-analysis.json), [complete attempt log](batches/parrot-failure.json). The native prefix stops after source 5 (eight nodes), and every saved state has been compared in Fold. Resolve the correct coupled crease arrangement and test existing swivel/reverse composition before requesting a new operation. Sources 7–12 are reviewed but unattempted.

## A001 — Wallet source access

**Access blocker; no engine requirement inferred.** The [Wallet page](https://origami.me/wallet/) currently presents an Early Access notice, with no complete instructions or diagrams publicly available. The introductory description suggests a flat wallet, but eligibility cannot be established without the full tutorial. No purchase, registration, archive bypass, or alternate reconstruction was attempted. Revisit when the public tutorial is available or the user supplies authorized reference content.

## F017 — Fox central multi-ply squash

**Authoring/compound investigation; not a confirmed engine gap.** [Fox](https://origami.me/fox/) sources 8–9 lift and squash the middle flap. The [native prefix](models/fox.osf) reaches source 7, with all ten states checked in Fold. A [direct request](batches/fox-direct-squash.json) and a [tentative middle-fold request](batches/fox-squash-analysis.json) refuse `squash_no_flap` / `no_spine`. The latter preliminary fold also exposes an incorrect white flap, so [its downstream states](batches/fox-unverified-downstream.json) are not part of the native prefix. Determine the central connected layer group and crease geometry before claiming missing functionality. A temporary lifted pose is not itself a required non-flat endpoint.

## F018 — Lantern coupled pocket opening

**Authoring/compound investigation; not a confirmed engine gap.** [Lantern](https://origami.me/lantern/) source 5 explicitly calls for swivel folds to open the upper and lower flaps. The [native prefix](models/lantern.osf) contains three blintzes and their turns, through source 4 (17 nodes / 18 states checked in Fold). A direct squash refuses `squash_flap_not_free`: [exact request and analysis](batches/lantern-opening-attempt.json). This is not yet the source swivel operation; resolve and test its fold, edge, and target anchors. No public swivel failure or missing feature is established by the squash refusal.

## F019 — Squash pick depends on the selected flat subface

**Confirmed operation-selection limitation; workaround exists.** Bird source 4's precreased triangle squashes from view point (0.35, 0.59), but refuses `squash_no_flap` / `no_spine` at (0.15, 0.5) on another flat subdivision of the same visible two-ply pocket. [Both subface picks](batches/bird-pocket-picks.json), [uncreased control](batches/bird-uncreased-control.json). The source precreases are retained in the successful native square base. `compound/squash.rs` looks for a spine directly between the two picked faces before growing across flat creases; this explains the selection dependency. A future improvement should resolve the connected coplanar layer before discovering its spine, without accepting unrelated or covered pockets. The workaround is an ordinary Fold canvas pick nearer the shared spine; no guard or state was bypassed.

## F020 — Bird opening beneath its folded top triangle

**Authoring/compound investigation; not a confirmed engine gap.** [Bird](https://origami.me/bird/) source 7 opens the lower kite flaps while the top triangle remains lowered. The attempted single-crease unfold succeeds but moves six connected layers into a different silhouette; [invalid downstream operation and states](batches/bird-unverified-downstream.json). The [native prefix](models/bird.osf) stops at source 6 (14 nodes / 15 states verified in Fold). Resolve the coupled opening or correct material selection before attempting the petal and claiming missing functionality.

## F021 — Pajarita quarter-fold swivel

**Authoring/compound investigation; not a confirmed engine gap.** [Pajarita](https://origami.me/pajarita/) source 8 raises the lower strip and swivels its lower-right corner outward. The [native prefix](models/pajarita.osf) reaches source 7 (16 nodes / 17 states checked in Fold). Mapping the front strip's vertical raw edge onto the horizontal center line, meeting its vertical folded edge, refuses `swivel_misses_fold` at the existing precrease junction: [request and analysis](batches/pajarita-first-swivel.json). The same request after just the quarter fold, with no prior precreases, refuses `swivel_fold_wide`: [control](batches/pajarita-uncreased-swivel-control.json). Thus removing the junction does not validate these inputs. The source's background strip uses a horizontal hinge, while the front strip develops diagonal folds; confirm whether existing compound operations can express that geometry before proposing a new swivel case. Sources 9–13 are reviewed but unattempted.

Pajarita source 6's text says to unfold the preceding folds, while diagram 7 shows the entire colored square. The native sequence explicitly reopens all four underlying blintz corners to match that diagram. Initial crease-vertex and diagonal-boundary picks were corrected to interior crease and flap witnesses; they are authoring pick errors, not engine gaps.


## F022 — Shirt sleeve opening

**Authoring/compound investigation; not a confirmed engine gap.** [Shirt](https://origami.me/shirt/) source 7 opens the lower corners into sleeves. The [native prefix](models/shirt.osf) reaches source 6 (nine nodes / ten states checked in Fold). A direct squash on the colored pocket refuses `squash_no_flap` / `no_hinge`: [exact operation and analysis](batches/shirt-sleeve-attempt.json). An earlier white one-ply pick refused `single_layer` and is retained separately as a pick error. Resolve the preparatory hinge or coupled opening before specifying a new primitive. Sources 8–10, including the final tuck beneath both collar tips, remain unattempted.

## F023 — Elephant head swivel

**Authoring/source-reference investigation; not a confirmed engine gap.** [Elephant](https://origami.me/elephant/) source 8 swivels the head downward. The [native prefix](models/elephant.osf) reaches source 7 (eleven nodes / twelve states checked in Fold). A tentative edge-to-line request refuses `swivel_fold_wide`: [exact request and analysis](batches/elephant-head-attempt.json). Its target slope may rotate the edge in the wrong direction, so it does not establish unsupported geometry. Resolve the reference movement and crease intersection before claiming a missing case. The three subsequent trunk reverses are reviewed but unattempted. The source-4 pleat width is approximate and saved in the operation note.

## F011 extension — Layer-selective partial cuts

[Horse](https://origami.me/horse/) is a flat model with a required cut in source 8. Unlike Rectangle-to-Square's full strip separation, this cut starts at the lower tip and ends inside the selected front layer at the horizontal precrease; the operation is repeated on the opposite face. [Exact required path and retained scene](batches/horse-cut-requirement.json). The [native prefix](models/horse.osf) reaches source 7, all seventeen states verified in Fold. No fake unsupported request was submitted because no public cut variant exists. Acceptance needs layer selection, an interior cut endpoint, persistent raw-edge topology and replay, while preserving the other paper layers. Subsequent folds remain unattempted.


## F024 — Flat multi-sheet assembly and interlocking

**Confirmed missing public functionality; open.** [Ninja Star](https://origami.me/ninja-star/) requires placing two separately folded sheets together in source 8, then reciprocal pocket tucks in sources 9 and 11. All eleven instructions and thirteen diagrams were reviewed; the final assembly is flat. Both [unit A](models/ninja-star-a.osf) and [unit B](models/ninja-star-b.osf) reach the source-7 assembly pose, with all 23 saved states replayed and checked in Fold.

`crates/oristudio-fold-wasm/src/wire.rs` exposes one `Paper` per initial state and no insert, place, join or assembly operation in `Op`; the existing tuck targets material from that same state. Separate native sequences can retain both modules, but cannot express their combined layer order or interlocking steps. Do not substitute a CP jump or hand-built merged mesh for the missing editable operation.

**Acceptance:** place independently authored sheets in one flat assembly with stable sheet/material identity; store relative translation/rotation and initial overlap order; permit selected flaps of one sheet to tuck into a second sheet's pocket; save/replay the complete sequence in Fold and verify both faces' material ordering. No 3D behavior is required.

The initial module attempt used an all-layer second tip fold and moved the first tip again. A normal canvas depth seed fixes this authoring error; the invalid requests are retained in `batches/ninja-star-*-invalid-all-layers.json`. Material checks confirm the first tip stays unchanged and every exposed module subface is colored. Source 6's second-unit text says approximately 22 degrees, whereas the next diagram requires 45 degrees; the saved note explains following the diagram.


## F025 — Goldfish pocket collapse investigation

**Classification: authoring / compound-operation investigation, not a confirmed missing primitive.**

The [Goldfish tutorial](https://origami.me/goldfish/) source 11 opens the helmet pocket and collapses it in the perpendicular direction. The native sequence preserves the verified source-10 helmet (14 nodes / 15 states). A direct front-band squash at view `[0.12, 0.42]` refuses `squash_no_flap / no_hinge`. Turning to the plain back and halving the pocket before squashing three interior points refuses `squash_flap_not_free`. Correct compound decomposition is still unresolved; these refusals alone do not prove a missing feature.

Evidence: [direct request](batches/goldfish-opening-attempt.json), [prepared half-pocket control](batches/goldfish-half-pocket-control.json), [last valid state](batches/goldfish-before-opening.json), [native sequence](models/goldfish.osf). A rejected exact-vertex seed was fixed with an interior pick and is recorded separately as an authoring error.

Source 12 independently strengthens **F011**: cut only the outer layer from the lower corner along the lower edge about two-thirds of its length, repeat from the other face, retain the other layers, then unwrap the cut material in source 14. There is no public cut operation. The cut and unwrap remain unattempted because source 11 is unresolved.


### F011 additional preparation cases

[Rectangle to Hexagon](models/rectangle-to-hexagon.osf) source 6 requires an oblique boundary-to-boundary cut through both folded layers, discarding a triangular offcut. The remaining cut boundary becomes the alignment reference for source 7; another cut occurs at source 10 before unfolding. The exact first-cut view path and last valid scene are in [cut requirement](batches/rectangle-to-hexagon-cut-requirement.json).

[Square to Pentagon](models/pentagon-from-square-paper.osf) source 9 requires cutting a stacked packet along its nearest visible raw edge, retaining the lower wedge and unfolding it. [Cut requirement](batches/pentagon-from-square-paper-cut-requirement.json). Its partial reference pinches remain on the intended front ply, confirmed from original-sheet coordinates. Both preparation cases stop before the missing cut, without substituting a new polygon sheet.

## F026 — Four-Pointed Star first packet swivel (investigation)

The full [20-step tutorial](https://origami.me/4-pointed-star/) and 21 diagrams were reviewed. The [native packet](models/4-pointed-star.osf) matches through source 14 (21 nodes / 22 Fold-checked states). Eight partial creases, alignment precreases, and front-layer packet folds succeed. Source 15 needs a swivel at the junction of two existing folded creases. The picked upper-left edge lands on the diagonal; analysis finds the intended vertex and landing, but application refuses `fan_ray_blocked` (face 9). Both direction/kind feasibility pairs are unavailable. Retain this as an authoring/compound investigation: the mapped second crease and intervening folded layer need resolution before claiming a missing primitive.

Evidence: [exact request and analysis](batches/4-pointed-star-swivel-attempt.json), [refusal](batches/4-pointed-star-failure.json), [last valid scene](batches/4-pointed-star-before-swivel.json). No guard weakened or non-flat state introduced.

## F027 — Camellia first squash after reverse closure (investigation)

The [13-step tutorial](https://origami.me/camellia/) and 14 diagrams are flat. The [native prefix](models/camellia.osf) matches through source 6 (7 nodes / 8 Fold-checked states). The reverse fold requires choosing among two openings; the original bottom-fold spine gives the source result. This is supported functionality, not a gap. Material witnesses prove the bottom and right outer panels remain unchanged.

Source 7 opens the lower flap while turning it upward. A direct squash and three relevant interior/spine-adjacent picks all refuse `squash_flap_not_free` (face 19; flap 13,15,20). A valid compound decomposition remains unproven; do not call this a missing squash primitive. Source 10 untuck and later locks remain unattempted.

Evidence: [reverse selection](batches/camellia-reverse-attempt.json), [squash request](batches/camellia-first-squash-attempt.json), [pick controls](batches/camellia-squash-pick-controls.json), [refusal](batches/camellia-failure.json), [material checks](batches/camellia.material-checks.json).

## F028 — Chicken connected wing squash and source landmark

**Investigation / reference ambiguity; not a confirmed missing primitive.** [Chicken](https://origami.me/chicken/) source 10 follows an eight-ply inside reverse for the feet. A direct squash on the front wing refuses `squash_flap_not_free`, naming faces 26 and 30 outside flap 24/28. Three nearby picks give the same refusal. The connected opening may need a compound decomposition; none is established yet.

[Native prefix](models/chicken.osf): eleven nodes through source 9, twelve states replayed and checked in Fold. [Exact requests and controls](batches/chicken-wing-controls.json), [failed operation](batches/chicken-failure.json), [pre-reverse state](batches/chicken-before-feet.json), [last valid state](batches/chicken-after-feet.json), and [material proof](batches/chicken.material-checks.json). The reverse uses the central original-diagonal opening, with eight moving layers between four unchanged front and four unchanged back layers at the overlap witness.

The text calls the moving wing landmark the source-3 pinch, while the visible front-flap mark in the diagram appears to be the transformed source-4 pinch. This is an interpretation to resolve before asserting a target geometry or implementing a generalized squash. Later beak and comb operations remain unattempted. Keep the last valid prefix and establish the source's actual material/landing correspondence, then test an existing-operation decomposition. Do not weaken the free-flap guard.

## F029 — Crab petal after four pocket squashes

**Investigation; not a confirmed missing primitive.** [Crab](https://origami.me/crab/) source 12 lifts the truncated front flap after source 11's reference creases. The mapped petal returns `residual` 0.12132034355964205 at vertex 17 / face 31. A control before source 11 refuses `petal_no_flap` / `past_corner`; this does not establish the correct alternative geometry. The authoring correspondence between the source's preparation creases and the petal's computed hinges still needs resolving.

[Native prefix](models/crab.osf): 29 nodes through source 11, all 30 states replayed and checked in Fold. [Petal request](batches/crab-petal-attempt.json), [failure](batches/crab-failure.json), [uncreased control](batches/crab-uncreased-petal-control.json), [state before petal preparation](batches/crab-before-petal.json), and [material checks](batches/crab.material-checks.json). The four preceding pocket squashes work; paper sides match the colored upper triangle and white lower split flaps. Preserve guards until the source mapping and connected layers are established.

**Additional confirmed F011 cutting cases:** Crab sources 17 and 19 slit selected lower front/back flaps from the free tip into the paper, without discarding an offcut. Source 25 makes paired edge-inward incisions through every layer to free the upper tuck. Neither kind is expressible by the public Fold operations. These are required even if the earlier petal investigation is resolved.
