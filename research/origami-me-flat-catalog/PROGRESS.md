# Origami.me flat-fold campaign

Updated: 2026-10-14. Local worktree: `codex/fold-origami-trials`.

All native projects now live in the shared [models library](../2026-10-13-origami-fold-trials/models/README.md), organized into `completed/`, `in-progress/`, `excluded/`, and `archive/`. Save ongoing edits there; catalog paths and audit loaders use those files.

## Scope and working rules

Recreate every eligible tutorial in the [Origami.me index](https://origami.me/origami-index/) as an editable Ori Studio **Fold workspace** sequence. Start with Very Easy, then Easy, Challenging Easy, and Low-Intermediate. Review the complete tutorial before deciding whether its result is flat. Record exclusions instead of silently dropping them. The initial inventory covers all five index pages: **151 unique entries**, including all 142 entries from the easy collection. This is the site's current indexed inventory, not a claim that every historical unindexed article has been found.

Only single-sheet flat states and flat final models are in scope. Required cuts, multi-sheet assembly, inflation, upright walls, and curved shaping are excluded. This includes flat modular assemblies and cutting-only paper preparation. Preserve their existing trials and evidence, but do not include their missing features in the active implementation target. An optional flat variant remains labeled a variant, never counted as full tutorial completion. Decorative eyes, whiskers, or printed patterns are not folding steps.

Models are native `.osf` projects that must open in **Fold**, with every operation and branch choice saved. A `.fold` interchange export is not the deliverable. Use existing public engine operations and record UI parity limitations. Do not implement speculative features or weaken engine guards to make a model pass.

Preserve user edits, especially the existing Heart and Cicada files. New attempts live in this directory. A generator must refuse to overwrite a model changed since its last generation. Keep failed attempts, exact inputs, refusal codes, last valid steps, and audit corrections.

## Status definitions

- **Queued / eligibility unreviewed:** indexed, but the complete diagram has not been assessed.
- **In progress:** source reviewed and authoring underway.
- **Blocked:** a reproducible issue prevents the next required flat step; link the evidence and gap.
- **Ready for audit:** replay and local visual checks passed; user approval is still pending.
- **Audited:** user explicitly accepted the model. Engine success alone never sets this status.
- **Excluded 3D / flat variant:** source completion needs 3D; any flat preparation is retained separately.
- **Excluded cuts:** required cutting is outside the current scope; valid prefixes remain available.
- **Excluded multi-sheet assembly:** required assembly of separate sheets is outside the current scope, even if the result is flat.

Check every intermediate step, visible paper side, layer order, tucked flap, and both faces where relevant. Match original-sheet material at occlusion witnesses when several layer orders share a silhouette. Keep proportion choices explicit when the tutorial supplies no exact reference. Compare source instruction numbers to saved step notes; a paired source step may require two engine operations.

## Reconciled status — 2026-10-14

[Latest five-completion checkpoint](batches/five-completion-checkpoint-2026-10-14.md). Of 151 indexed entries: **17 ready for audit**, **20 blocked with verified native prefixes**, **1 verified design in progress (Bird)**, **2 source-access blockers**, **70 excluded** (53 required 3D, 14 required cuts, 3 multi-sheet assembly), and **41 queued**. Witch Hat Bookmark has a complete eligibility review; the other 40 queued entries await review. Categories are mutually exclusive. [Earlier reconciliation](RECONCILIATION-2026-10-14.md) is retained as historical evidence.

A fresh read-only reconciliation replayed **42 individual native files, 525 nodes, 567 states**, with no failures or recorded hash mismatches. Dolphin was already verified; Dove had not reached the ledger or visual audit. User Heart/Cicada edits were preserved, including five extra Cicada branch nodes whose visual audit remains pending. See [machine-readable results](batches/reconciliation-2026-10-14.json).

## Implementation priorities — 2026-10-14

New diagram authoring is paused at the user’s request. [F030 and F039 are implemented and verified locally](batches/direct-compound-priorities-2026-10-14.md): nested flap pairs reverse together without losing their pocket contacts, and crimp hinges can meet at an exact packet boundary endpoint. Both operations were committed through the normal Fold tools.

At this implementation checkpoint, Dove reached **source 6 / Fold 6** (7 nodes, 8 states); its subsequent completion is recorded below. Squirrel remains complete through **source 26 / Fold 29**, with its source-16 CP workaround replaced by a direct **Crimp at Fold 19**. All 43 saved states replay; material and full stack checks match the independent controls. The two previous native files are archived, and the other 67 pre-existing native files are byte-identical, including Heart and Cicada. No new designs or additional tutorial completions were counted.

## Dove completion — 2026-10-14

[The Dove is complete and ready for audit](batches/dove-completion-2026-10-14.md): source 16 / Fold 17, 23 nodes and 24 replayed states. Its back-side nested reverse and final two-pair boundary crimp exercise both new compound fixes. All new states were inspected in Fold, with original-sheet material and stationary layer-order checks. This completes an existing trial; no new design was started. Further campaign authoring remains paused for implementation priorities.

## History-based unfolding — 2026-10-14

[Unfold to step is implemented and verified locally](batches/unfold-to-step-2026-10-14.md). It appends a return to an ancestor pose while retaining physical creases, including across compound folds and saved CP Collapse steps. A read-only audit covered **38 models, 570 saved steps, and 1,102 returns**, with no failures. All **72 pre-existing native files** remain byte-identical, including Heart and Cicada. The [feature example](../2026-10-13-origami-fold-trials/models/examples/unfold-to-step.osf) is ready for audit; it does not count as a tutorial completion. Reverse authoring from arbitrary imported CPs remains deferred.

## Rabbit-ear implementation — 2026-10-14

[F012 implementation and local checks](batches/rabbit-ear-precreases-2026-10-14.md): the tool selects the hinge region after three corners, with no separate crease chooser. Whale’s prepared fish base now folds through both ears. [Whale continuation](batches/whale-completion-2026-10-14.md) now completes all ten source instructions and is ready for audit in `completed/`. Its original prefix is archived; other native files remain unchanged. Dolphin stays excluded because it requires a cut. No in-scope recorded F012 blocker remains.

## Linked CP Collapse — 2026-10-14

[F031 implementation and Witch Hat audit](batches/linked-cp-collapse-2026-10-14.md).
The saved CP remains authoritative until explicit Update from CP; affected
later folds are replayed and marked. Per the user's screen audit, Collapse
always shows the folded result in the normal canvas and timeline. Witch Hat now has a verified prefix
through **source 10 / Fold step 13**. Its source-8 Collapse is Fold step 11.
The later candidate is archived separately; F032 is an authoring/layer-order
investigation, not a confirmed missing engine operation. Completion counts
are unchanged.

## Bird and Crow opening — 2026-10-14

[F020 investigation](batches/bird-crow-opening-2026-10-14.md): resolved with existing operations. Temporarily lifting the top triangle releases the kite sides; releasing it again allows the first petal. Bird reaches **source 11 / Fold 20**, Crow **source 9 / Fold 20**. Both remain in progress, with verified prefixes, rather than blocked. Fifty saved states replayed and complete material stacks match independent controls. Native originals are checkpointed. Source-note UI work (F006) is deferred at the user’s request.

## Bird/Crow shaping — 2026-10-14

[Crow completion and Bird continuation](batches/bird-crow-shaping-2026-10-14.md): Crow completes source 17 / Fold 28 using existing reverse folds, with explicit central-spine choices. Bird reaches source 13 / Fold 24; its source-14 pull remains an authoring investigation (F033). All 68 saved states replayed; Crow material and pocket-order checks passed. Original bird bases are checkpointed. Three designs now count toward the next five-completion report.

## Dove nested reverse and Easy review — 2026-10-14

[Dove investigation](batches/dove-nested-reverse-2026-10-14.md): the six-node prefix is now visually verified. F030 identifies a direct reverse-fold limitation for nested flap pairs; the public CP control reflects the intended material and preserves stationary order. No engine guard was changed. [Eligibility review](batches/easy-eligibility-2026-10-14.md) excludes Dragonfly (cuts and 3D), Eagle and Elephant Head (required 3D completion).

## Envelope preparation — 2026-10-14

[Verified Envelope prefix](batches/envelope-prefix-2026-10-14.md) reaches source 13 / Fold 18 (20 nodes, 21 states). All saved states replay and were checked in Fold; 157 material-stack witnesses pass. The source-14 hidden-flap flip is F034, an authoring investigation. Heart Bookmark is excluded because its first source instruction cuts the square. The running completion count remains **3 of 5**.

## Heart tutorials — 2026-10-14

[Full eligibility review](batches/heart-eligibility-2026-10-14.md): Heart Card is verified through source 13 / Fold 17; Heart Corner Bookmark through source 8 / Fold 7. Both have fresh replay, all-state Fold visual checks and material-stack checks. F035/F036 retain their next compound requests as investigations. Heart Box and Heart with Wings require 3D completion. Heart Envelope is flat and next to author. Completion count remains **3 of 5**.

## Completed five-design checkpoint — 2026-10-14

[Penguin, Whale, Crow, Pumpkin and Squirrel are ready for audit](batches/five-completion-checkpoint-2026-10-14.md): 124 nodes / 129 saved states. Pumpkin and Squirrel use saved public CP imports with checked material correspondence and explicit layer choices. F039 records the direct boundary-meeting crimp limitation; completion uses the existing CP path. The next five-completion counter starts at zero.

Heart Envelope and Kitten now have verified source-5 prefixes (F037/F038). The remaining Easy sources were reviewed, with required cuts, assembly and 3D completion excluded individually. Mushroom is access-blocked. The next eligible Easy design is Witch Hat Bookmark, distinct from the existing Witch Hat investigation.

## Audit batches

- Batch 0: [previous five-design report](../2026-10-13-origami-fold-trials/REPORT.md). Heart, Swan, and Cicada are existing flat sequences. Box and Crane are retained as excluded 3D completion / flat alternatives. Heart's corrected tuck order was acknowledged by the user; no blanket approval of all models is assumed.
- Batch 1: [Easter Egg and Cat Face](batches/001.md), both **ready for audit**. Two native models, 18 numbered folds, all states replayed. No new missing flat primitive; one open audit UI gap (F006).

- Batch 3: [Angelfish, Christmas Tree, Fish, Pigeon, and Santa](batches/003.md), all ready for audit; 68 nodes and 73 checked states. New cutting and precreased rabbit-ear gaps are recorded separately from unresolved compound attempts.

- Batch 2: [Bookmark and Dog](batches/002.md). Bookmark is **ready for audit**; Dog is **blocked at source 13**, with its valid prefix saved. All 29 saved states replayed. Bookmark adds an internal pocket-order audit case; Dog remains an investigation, not a confirmed missing primitive.

- Batch 4: [five completed designs and audit links](batches/five-completion-checkpoint-2026-10-14.md). Penguin, Whale, Crow, Pumpkin and Squirrel are ready for audit. Retained prefixes and exact failures are recorded, including recovered Dolphin progress and the now-verified Dove prefix. Historical cut and modular findings are now excluded from the active target.

## Functionality findings

See [GAPS.md](GAPS.md). Separate missing operations, UI limitations, authoring mistakes, and ambiguous diagram proportions. Record a suspected issue before investigation; call it a confirmed engine gap only with a reproducible refusal or wrong result under correct inputs.

## Campaign checklist

- [x] Inventory all five current index pages and cross-check the easy collection.
- [x] Carry forward previous models without overwriting user edits.
- [x] Save and validate the first two new flat models.
- [x] Maintain audit links and continuation records. The mistakenly created schedule was removed at the user's request.
- [x] Complete batch 2 and retain exact blocked operations and last valid states.
- [x] Reconcile all saved campaign files after the interrupted conversation; recover Dove and correct stale audit metadata.
- [x] Apply the user’s no-cuts and no-multi-sheet-assembly scope.
- [x] Implement hinge-region rabbit-ear selection and resolve the F012 precrease reproductions; preserve all native models.
- [x] Complete and visually verify Whale after F012; retain Dolphin’s cut exclusion.
- [x] Resolve F014 existing-crease Segment/Pinch reuse; advance Witch Hat through source 7 and verify M/V refolds.
- [x] Resolve F019 squash selection across flat precreases; verify Bird and preserve all native models.
- [x] Implement linked Collapse snapshots and explicit Update from CP, including descendant replay, undo and offline reopening.
- [x] Advance Witch Hat through source 10 / Fold step 13; preserve the original project and separate the unverified later attempt.
- [x] Resolve Bird/Crow F020 with existing operations and verify both bird bases.
- [x] Finish Crow through source 17 / Fold 28 and verify its reverse-fold pockets.
- [x] Advance Bird through source 13 / Fold 24 with verified book folds and wings.
- [x] Verify Dove source 5 and confirm F030 using a nested-packet CP control.
- [x] Save and verify Envelope, Heart Card and Heart Corner Bookmark prefixes; retain exact blocked operations.
- [x] Review the next heart tutorials and record cut/3D exclusions separately.
- [x] Save and verify Heart Envelope and Kitten prefixes; distinguish authoring failures from missing functionality.
- [x] Complete Pumpkin and Squirrel through saved public CP imports; finish the five-design batch.
- [x] Review the remaining accessible Very Easy/Easy tutorials and record every exclusion with source evidence.
- [x] Resolve F030 nested reverse and F039 boundary crimp; migrate existing examples with archived checkpoints.
- [x] Pause new diagram authoring while implementation priorities are addressed.
- [x] Finish the existing Dove through source 16 / Fold 17 and verify all 24 saved states.
- [x] Plan history-based unfolding with retained creases; defer reverse authoring from imported CPs.
- [x] Implement and verify history-based unfolding, including compound folds, saved CP transitions, fresh replay and explicit rebuild.
- [ ] Resolve Bird source 14 (F033), then finish its tail, neck, and head.
- [ ] Resolve Witch Hat F032 and finish source 11–14.
- [ ] Receive user audits and resolve corrections.
- [ ] Classify and attempt every remaining eligible design.
- [ ] Consolidate evidenced implementation requirements.

Latest authoring investigations and validation: [current continuation](batches/continuation-2026-10-14.md). Latest implementation: [history-based unfolding](batches/unfold-to-step-2026-10-14.md).

## Next work

1. Apply user audit feedback first; preserve user-saved native files.
2. Keep new diagram authoring paused. F030 and F039 are resolved locally; the remaining in-scope compound blockers are investigations, not yet confirmed missing operations.
3. The [history-based unfolding foundation](../../implementation-plans/reversible-fold-steps.md) is implemented locally and ready for user testing. Reverse authoring from imported CPs is deferred. Bird F033 and Witch Hat F032 remain open investigations for later continuation.
4. F012, F014, F019 and F031 are also resolved locally; F020 needed corrected authoring. F006 notes UI remains deferred. Cuts, assembly and non-flat behavior remain out of scope.
5. Preserve `nextQueue` for when authoring resumes: Witch Hat Bookmark, Five-Petal Lily, Six-Pointed Star, Cat, Crocodile. Dove is completion 1 of the next five. Continue locally without a schedule, PR or push.

## Continuation

Prioritize implementation and existing blocker investigation before adding new diagrams. Work continuously in this chat. The user clarified that no scheduled task is wanted; the mistakenly created hourly automation was removed. Report an audit batch after every five completed designs, then continue working. Blocked attempts and exclusions remain recorded separately and do not count as completed designs. All work is local-only.

The machine-readable [catalog.json](catalog.json) is the per-design ledger. Run `python3 research/origami-me-flat-catalog/render-progress.py` after ledger updates to refresh the table below. Do not erase the narrative, audit history, or gap records when regenerating the table. Report small batches with direct native-file links and tutorial links. Never push or create a PR.

<!-- catalog:start -->

## Per-design progress

Inventory: 151 entries. blocked: 22; excluded 3D / flat variant: 53; excluded cuts: 14; excluded multi-sheet assembly: 3; in progress: 1; queued: 41; ready for audit: 17.

| Design / tutorial | Difficulty | Eligibility | Progress | Fold file / notes |
| --- | --- | --- | --- | --- |
| [How to Make Rectangular Paper into a Square](https://origami.me/rectangle-paper-to-square/) | Very Easy | flat preparation | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/rectangle-paper-to-square.osf); [Batch notes](batches/003.md); Excluded from current completion target: required cuts. Flat preparation through source 2; required strip cut has no public Fold operation. |
| [Origami 3D Butterfly](https://origami.me/yoshizawa-butterfly/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/003.md); Required curved sides in 7 and spatial wing shaping in 9. |
| [Origami 5-Pointed Star](https://origami.me/5-pointed-star/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 10 instructions and 11 diagrams plus completed photograph reviewed. The finished modular star retains raised ridges; source describes a dimensional star. Excluded 3D completion, not a flat assembly blocked solely by F024. |
| [Origami Angel](https://origami.me/angel/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/003.md); Source 11 partially closes the body into a standing pose. |
| [Origami Angelfish](https://origami.me/angelfish/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/angelfish.osf); [Batch notes](batches/003.md); All steps replayed and visually checked in Fold; paper-side and material checks passed. |
| [Origami Bird](https://origami.me/bird/) | Very Easy | flat folded endpoint; optional flapping action | in progress | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/bird.osf); [Batch notes](batches/bird-crow-shaping-2026-10-14.md); Verified through source 13 / Fold 24 (32 nodes). Source 14 outward pull remains an authoring/compound investigation; failed probes are separate from the native prefix. No confirmed engine gap. |
| [Origami Boat](https://origami.me/traditional-boat/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 8 instructions and 12 diagrams reviewed. Required final opening forms a spatial hull; completed photograph confirms open cavity. |
| [Origami Bookmark](https://origami.me/bookmark/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/bookmark.osf); [Batch notes](batches/002.md); Complete; audit half-length precrease and both hidden pocket layers. |
| [Origami Cat Face](https://origami.me/cat-face/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/cat-face.osf); [Batch notes](batches/001.md); Complete flat sequence; audit pocket tuck and nose. Decorative eyes omitted. |
| [Origami Christmas Tree](https://origami.me/christmas-tree/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/christmas-tree.osf); [Batch notes](batches/003.md); All steps replayed and visually checked in Fold; paper-side and material checks passed. |
| [Origami Cicada](https://origami.me/cicada/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/cicada.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Original completed path remains ready for audit. User edits preserved: five additional branch nodes replay successfully but have not received a source/visual audit; readiness does not certify that branch. |
| [Origami Cube](https://origami.me/cube/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions and 14 diagrams reviewed. Eight module steps plus four assembly steps. Assembly 3–4 closes six Sonobe units into a volume. |
| [Origami Cup](https://origami.me/cup/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 7 instructions and 8 diagrams reviewed. Required source 7 opens the top and presses a base into a curved container. |
| [Origami Dog](https://origami.me/dog/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/dog.osf); [Batch notes](batches/002.md); Partial through source 12. Step 13 layer/compound interpretation unresolved; no confirmed engine gap. |
| [Origami Duck](https://origami.me/duck/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); Full 13 instructions / 14 diagrams reviewed. Source 13 requires opening wings out of plane so it stands. Flat prefix is not tutorial completion. |
| [Origami Easter Egg](https://origami.me/easter-egg/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/easter-egg.osf); [Batch notes](batches/001.md); Complete flat sequence; approximate symmetric shaping. |
| [Origami Elephant](https://origami.me/elephant/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/elephant.osf); [Batch notes](batches/004.md); Source 8 head swivel inputs remain tentative; swivel_fold_wide is not evidence of missing functionality. Eleven-node verified prefix. |
| [Origami Fan](https://origami.me/fan/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Required source 11 spreads accordion pleats; completed fan retains out-of-plane ridges. |
| [Origami Fish](https://origami.me/fish/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/fish.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Floral Swirls](https://origami.me/floral-swirls/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 22 instructions and 28 diagrams reviewed. Four preparation, six unit, twelve assembly steps. Required final curl makes petals non-flat. Flat assembly through 11 would be a labeled variant, not tutorial completion. |
| [Origami Fortune Teller](https://origami.me/fortune-teller/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Final finger-pocket opening produces a spatial toy; flat preparation is not tutorial completion. |
| [Origami Fox](https://origami.me/fox/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/fox.osf); [Batch notes](batches/004.md); Central multi-ply squash unresolved; direct and tentative middle-fold requests lack a recognized spine. Prefix through 7 verified in Fold. |
| [Origami Goldfish](https://origami.me/goldfish/) | Very Easy | flat | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/goldfish.osf); [Batch notes](batches/004.md); Excluded from current completion target: required cuts. All 14 instructions and 15 diagrams reviewed. Fourteen-node prefix through source 10 checked in Fold. Source 11 pocket collapse remains an investigation; source 12 requires missing layer-selective cuts. |
| [Origami Happi](https://origami.me/happi/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/happi.osf); [Batch notes](batches/004.md); Source-6 collar reference unresolved; native file rolled back to the nine-node source-5 checkpoint. Invalid downstream attempt retained separately. |
| [Origami Heart](https://origami.me/heart/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/heart.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Existing completed sequence; user save/layout edits preserved. Fold operations unchanged and freshly replayed. |
| [Origami Heart Card](https://origami.me/heart-card/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions and 13 diagrams reviewed. Required source 12 adjusts the center fold into a standing V. Flat source-11 card is a possible variant, not full tutorial completion. Step-2 JPG link is broken; the page’s actual PNG image was reviewed. |
| [Origami Horse](https://origami.me/horse/) | Very Easy | flat | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/horse.osf); [Batch notes](batches/004.md); Excluded from current completion target: required cuts. Required source 8 partial cut through the front layer has no public Fold operation. Sixteen-node verified prefix; all 20 instructions and 21 diagrams reviewed. |
| [Origami Jack-O'-Lantern](https://origami.me/jack-o-lantern/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 21 instructions and 22 diagrams reviewed. Required source-20 three-ray stem pinch and source-21 curved shaping retain a non-flat stem. The pumpkin face is flat, but a flat stem variant would not reproduce the shown finish. |
| [Origami Kimono](https://origami.me/kimono/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/kimono.osf); [Batch notes](batches/003.md); Final connected sleeve collapse unresolved; single-pocket squash refusals are not proof of a missing primitive. Every saved prefix state checked in Fold. |
| [Origami Lantern](https://origami.me/lantern/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/lantern.osf); [Batch notes](batches/004.md); Three blintzes and turns verified. Source 5 requires a coupled swivel opening; direct squash is not free. Correct swivel inputs remain untested. |
| [Origami Leaf](https://origami.me/leaf/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Required final opening retains a raised center ridge and corrugated pleats, also visible in final photo; a flattened variant is not tutorial completion. |
| [Origami Necktie](https://origami.me/necktie/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/necktie.osf); [Batch notes](batches/003.md); Source-5 back flap moved incorrectly; valid prefix rolled back to 4. Downstream squash refusal is not an engine gap. |
| [Origami Ninja Star](https://origami.me/ninja-star/) | Very Easy | flat modular | excluded multi-sheet assembly | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/multi-sheet/ninja-star-a.osf); [Batch notes](batches/004.md); Excluded from current completion target: multi-sheet assembly. Both mirrored modules through source 7 verified in Fold. Source 8 needs multi-sheet placement; 9 and 11 tuck one sheet into another. Public Fold has no assembly operation. |
| [Origami Pajarita](https://origami.me/pajarita/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/pajarita.osf); [Batch notes](batches/004.md); Sixteen nodes through source 7 verified. First swivel inputs refuse at existing crease junction; uncreased control also refuses wide-fold geometry. Correct operation mapping unresolved. |
| [Origami Parrot](https://origami.me/parrot/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/parrot.osf); [Batch notes](batches/004.md); Eight-node prefix through opening the upper flap. Direct squash refuses squash_flap_not_free; connected wing interpretation remains under investigation. |
| [Origami Penguin](https://origami.me/penguin/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/penguin.osf); [Batch notes](batches/004.md); All 12 states checked in Fold; outside reverse head wraps both neck walls, preserving white chest and colored wing. |
| [Origami Pigeon](https://origami.me/pigeon/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/pigeon.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Rose](https://origami.me/rose/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 10 diagrams plus the step-2 photograph reviewed. Required source 9 curls petals into non-flat surfaces. Flat source-8 variant is not tutorial completion. |
| [Origami Santa](https://origami.me/santa/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/santa.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Shirt](https://origami.me/shirt/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/shirt.osf); [Batch notes](batches/004.md); Source 7 sleeve opening requires a validated compound mapping; direct squash has no hinge. Nine-node verified prefix. |
| [Origami Star](https://origami.me/star/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 12 diagrams reviewed. Required final pinching puffs the pentagonal packet into a 3D lucky star. |
| [Origami Sunglasses](https://origami.me/sunglasses/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All nine instructions and ten diagrams reviewed. Source 9 requires both temples bent to 90 degrees out of plane. |
| [Origami Swan](https://origami.me/swan/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/swan.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Outside reverse neck and head. |
| [Origami Vampire Mouth](https://origami.me/vampire-mouth/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 16 instructions and 20 diagrams including alternative fangs reviewed, plus final photograph. Source 16 presses a three-ray lip dimple while leaving the model open; the final photo shows curved lower lip and raised center. Flat prefix/variant is not tutorial completion. |
| [Origami Wallet](https://origami.me/wallet/) | Very Easy | access blocked | blocked | [Batch notes](batches/004.md); Public page exposes only Early Access notice; full tutorial unavailable. Eligibility unconfirmed; no access bypass attempted. |
| [Origami Water Bomb](https://origami.me/waterbomb/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 10 diagrams reviewed. Required source 9 inflates the packet into a volume; excluded completion. |
| [Origami Whale](https://origami.me/whale/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/whale.osf); [Batch notes](batches/whale-completion-2026-10-14.md); Completed all 10 source instructions with 20 editable nodes (15 numbered folds, five turns/rotations). All 21 states replayed and visually checked in Fold; fin/body/tail material stacks checked. F012 resolved. Approximate shaping proportions documented; user audit pending. |
| [Origami Witch Hat](https://origami.me/witch-hat/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf); [Batch notes](batches/linked-cp-collapse-2026-10-14.md); Linked source-8 Collapse implemented; verified prefix through source 10 (16 nodes / 13 numbered steps). Source 11–13 candidate archived separately: final tuck is refused, and hidden layers need authoring verification. Original user CP checkpoint preserved; front-relative M/V correction recorded. |
| [Origami Yoda](https://origami.me/yoda/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions, 16 diagrams and completed photo reviewed. Required source 15 rear stand is spatial; a flattened robe variant would not be tutorial completion. |
| [Paper Envelope](https://origami.me/paper-envelope/) | Very Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/paper-envelope.osf); [Batch notes](batches/003.md); Partial through source 7; wide swivel 8–9 refused; interpretation under investigation. |
| [Rectangle to Hexagon](https://origami.me/rectangle-to-hexagon/) | Very Easy | flat preparation | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/rectangle-to-hexagon.osf); [Batch notes](batches/004.md); Excluded from current completion target: required cuts. All 11 instructions and 12 diagrams reviewed. Five-node prefix through source 5 verified in Fold. Source 6 requires an oblique cut through both folded layers; source 10 needs another cut. |
| [Square to Pentagon](https://origami.me/pentagon-from-square-paper/) | Very Easy | flat preparation | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/pentagon-from-square-paper.osf); [Batch notes](batches/004.md); Excluded from current completion target: required cuts. All 10 instructions and 12 diagrams reviewed. Nine-node prefix includes orientation for source 9; all 10 states verified. Required straight cut through the packet is missing. Front-ply-only reference marks checked. |
| [Easy Origami Lazy Susan](https://origami.me/lazy-susan/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 18 instructions and 19 diagrams reviewed. Required steps 17–18 open and curve the compartments into a container; excluded 3D completion. |
| [Origami 4-pointed Star](https://origami.me/4-pointed-star/) | Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/4-pointed-star.osf); [Batch notes](batches/004.md); All 20 instructions and 21 diagrams reviewed. Twenty-one-node packet through source 14; all 22 states checked in Fold. Source 15 swivel refuses fan_ray_blocked; investigation, not a confirmed missing primitive. |
| [Origami Balloon Rabbit](https://origami.me/balloon-rabbit/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions and 16 diagrams reviewed. Step 14 opens curved ears; required step 15 inflates the body. Excluded 3D completion. |
| [Origami Basket](https://origami.me/basket/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 20 instructions (3 preparation, 3 handle, 14 basket) and 21 diagrams reviewed. Curved handle plus basket steps 13–14 open and finish a spatial container. Excluded 3D completion. |
| [Origami Bat](https://origami.me/bat/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions, 13 diagrams and completed photograph reviewed. Required step 12 spreads the wings while retaining a raised central pocket and ridges; photograph confirms non-flat completion. A pressed-flat alternative would be a variant. |
| [Origami Bellflower](https://origami.me/bellflower/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 21 instructions and 23 diagrams reviewed. Source 17 explicitly starts non-flat folding, retained through completion; final petals curl. Excluded 3D completion. |
| [Origami Box](https://origami.me/box/) | Easy | 3D completion | excluded 3D / flat variant | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/3d/box.osf); Flat preparation only; upright walls excluded. |
| [Origami Butterfly](https://origami.me/butterfly/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions, 17 diagrams and completed photograph reviewed. Source 15 adds lifted wings/body after the last flat fold. A fully flat endpoint before that styling is possible but remains a labeled variant, not full tutorial completion. |
| [Origami Camellia](https://origami.me/camellia/) | Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/camellia.osf); [Batch notes](batches/004.md); All 13 instructions and 14 diagrams reviewed. Seven nodes through source 6; all eight states checked in Fold. Inside-reverse closure works with the original bottom-fold opening. First squash refuses flap_not_free at several relevant picks; investigation. |
| [Origami Candle](https://origami.me/candle/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions and 16 diagrams reviewed. Required source 13 rolls the body into a cylinder; source 14 locks it and source 15 shapes the flame. Excluded 3D completion. |
| [Origami Candy Box](https://origami.me/candy-box/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 22 instructions and 23 diagrams reviewed. Source 22 spreads the top and raises the base into an open container. Excluded 3D completion. |
| [Origami Celebration Crane](https://origami.me/celebration-crane/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 28 instructions, 30 diagrams (including the final drawing) and completed photograph reviewed. Source 28 opens the feather pleats into a spatial fan. Excluded 3D completion; a closed packet would be a labeled variant. |
| [Origami Chick](https://origami.me/chick/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 13 instructions, 14 diagrams and completed photograph reviewed. The current Basket Chick tutorial requires opening a hollow container at source 13; excluded 3D completion. |
| [Origami Chicken](https://origami.me/chicken/) | Easy | flat (optional 3D styling omitted) | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/chicken.osf); [Batch notes](batches/004.md); All 17 instructions and 18 diagrams reviewed. Eleven nodes through source 9; all 12 states checked in Fold. Partial pinches and eight-ply inside reverse verified by material stacks. Source 10 connected wing squash and pinch naming remain under investigation. |
| [Origami Crab](https://origami.me/crab/) | Easy | flat with cuts | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/crab.osf); [Batch notes](batches/004.md); Excluded from current completion target: required cuts. All 32 instructions and 34 diagrams reviewed. Twenty-nine nodes through source 11; all 30 states checked in Fold. Four pocket squashes work; first petal rejects the mapped geometry. Cutting is additionally required at sources 17, 19 and 25. |
| [Origami Crane](https://origami.me/crane/) | Easy | 3D completion | excluded 3D / flat variant | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/3d/crane.osf); Flat alternative retained; final wing opening excluded. |
| [Origami Crow](https://origami.me/crow/) | Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/crow.osf); [Batch notes](batches/bird-crow-shaping-2026-10-14.md); Complete flat endpoint; all 34 nodes replayed and 35 states checked in Fold. Central-spine feet/head choices and hidden pocket order verified. Ready for user audit; no engine change needed. |
| [Origami Devilish Heart](https://origami.me/devilish-heart/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 20 instructions, 21 diagrams and completed photograph reviewed. Required source-20 center dimple retains a non-flat three-ray vertex. A flattened heart would be a variant. Source 12 additionally requires cutting the precreased square into two triangles; no native variant authored. |
| [Origami Dolphin](https://origami.me/dolphin/) | Easy | flat with cuts | excluded cuts | [Open .osf](../2026-10-13-origami-fold-trials/models/excluded/cuts/dolphin.osf); [Batch notes](batches/004.md); Excluded: source 11 requires a tail slit. F012 is resolved locally and the recorded source-4 ear succeeds, but no cut or substitute completion was added. Retained native prefix through source 3 is unchanged; 17 instructions and 20 diagrams previously reviewed. |
| [Origami Dove](https://origami.me/dove/) | Easy | flat endpoint; optional 3D tail shaping omitted | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/dove.osf); [Batch notes](batches/dove-completion-2026-10-14.md); Complete flat Dove: 23 nodes / 24 states, 17 numbered folds. Direct nested reverses on both sides and a direct inside tail crimp. Material, exposed sides and stationary layer order checked; all new states inspected in Fold. Optional non-flat tail styling omitted. |
| [Origami Dragonfly](https://origami.me/dragonfly/) | Easy | requires cuts and 3D completion | excluded cuts | [Batch notes](batches/easy-eligibility-2026-10-14.md); All 17 instructions, 22 diagrams and 8 photographs reviewed. Required source 15 splits the wings with scissors; source 16 opens wings perpendicular to the body. No flat variant counted. |
| [Origami Eagle](https://origami.me/eagle/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-2026-10-14.md); All 22 instructions, 23 diagrams and 2 photographs reviewed. Sources 16–17 open the wing pleats without flattening; final photograph retains raised pleats. A pressed-flat variant is not tutorial completion. |
| [Origami Elephant Head](https://origami.me/elephant-head/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-2026-10-14.md); All 12 instructions, 13 diagrams and 3 photographs reviewed. Required source 12 is a partial center mountain fold that gives the head depth. Flat source 11 would be a labeled variant. |
| [Origami Envelope](https://origami.me/envelope/) | Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/envelope.osf); [Batch notes](batches/envelope-prefix-2026-10-14.md); Current 24-step tutorial reviewed. Verified through source 13 / Fold 18: 20 nodes, 21 states replayed and checked in Fold; 157 material-stack witnesses. Source 14 hidden-flap mapping unresolved; F034 is an authoring investigation. |
| [Origami Heart Bookmark](https://origami.me/heart-bookmark/) | Easy | flat with required cut preparation | excluded cuts | [Batch notes](batches/easy-eligibility-2026-10-14.md); All 20 instructions and 21 diagrams reviewed. Required source 1 cuts a square in half. Starting from a half-square rectangle would be a variant; no cut support or native variant added. |
| [Origami Heart Box](https://origami.me/heart-box/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/heart-eligibility-2026-10-14.md); Required heart/container walls raised at sources 23–27. Full tutorial and final photograph reviewed; no flat variant authored. |
| [Origami Heart Card](https://origami.me/heart-card-2/) | Easy | flat; supplied 1:2 rectangle | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/heart-card-2.osf); [Batch notes](batches/heart-card-prefix-2026-10-14.md); Verified through source 13 / Fold 17 (20 nodes). All saved states replayed and visually checked in Fold. Next compound step remains an authoring investigation, not a confirmed engine gap. |
| [Origami Heart Corner Bookmark](https://origami.me/heart-corner-bookmark/) | Easy | flat; supplied 1:2 rectangle | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/heart-corner-bookmark.osf); [Batch notes](batches/heart-corner-bookmark-prefix-2026-10-14.md); Verified through source 8 / Fold 7 (10 nodes). All saved states replayed and visually checked in Fold. Next compound step remains an authoring investigation, not a confirmed engine gap. |
| [Origami Heart Envelope](https://origami.me/heart-envelope/) | Easy | flat; supplied rectangle | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/heart-envelope.osf); [Batch notes](batches/heart-envelope-prefix-2026-10-14.md); Verified through source 5 / Fold 8 (9 nodes, 10 states). All states replayed and visually checked in Fold; 49 material-stack witnesses. Sources 6–7 layer selection is an authoring investigation. |
| [Origami Hummingbird](https://origami.me/hummingbird/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); Full tutorial and diagrams reviewed. Source 25 shapes a spatial beak/head/neck; full diagrams and final video reviewed. |
| [Origami Hydrangea](https://origami.me/hydrangea/) | Easy | multi-sheet assembly and 3D | excluded multi-sheet assembly | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); Full tutorial and diagrams reviewed. Full model assembles 10–15 blossom sheets plus leaves around a paper ball; a flat blossom is only a unit. |
| [Origami Iris](https://origami.me/iris/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); Full tutorial and diagrams reviewed. Source 18 opens four petals spatially, even without optional curling. |
| [Origami Jumping Frog](https://origami.me/jumping-frog/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); Full tutorial and diagrams reviewed. Source 22 extends the leg spring into a standing/jumping pose; pressed-flat preparation is a variant. |
| [Origami Kissing Lips](https://origami.me/kissing-lips/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); Full tutorial and diagrams reviewed. Source 17 partially opens the model into raised lips. |
| [Origami Kitten](https://origami.me/kitten/) | Easy | flat | blocked | [Open .osf](../2026-10-13-origami-fold-trials/models/in-progress/kitten.osf); [Batch notes](batches/kitten-prefix-2026-10-14.md); Verified through source 5 / Fold 7: eight nodes, nine states, 37 material-stack witnesses. Source-6 simultaneous side opening remains an authoring investigation. |
| [Origami Kusudama Chrysanthemum](https://origami.me/kusudama-chrysanthemum/) | Easy | multi-sheet assembly and 3D | excluded multi-sheet assembly | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); 13 unit instructions plus assembly, 18 diagrams and 3 photos reviewed. Six flower units are glued into a spatial ball. |
| [Origami Lily](https://origami.me/lily/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 20 instructions, 22 diagrams and 2 photos reviewed. Source 20 opens petals to roughly 90 degrees; curling is additionally optional. |
| [Origami Lotus](https://origami.me/lotus/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 16 instructions, 17 diagrams and completed photo reviewed. Petals are reversed upright and curved; required 3D completion. |
| [Origami Moon](https://origami.me/moon/) | Easy | cuts and 3D corrugation | excluded cuts | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 14 instructions, 16 diagrams and finished photo reviewed. Numbered source 4 cuts out a narrow diamond; source 14 retains spatial corrugations. Suggested uncut fish-base alternative still has the non-flat finish. |
| [Origami Mushroom](https://origami.me/mushroom/) | Easy | access blocked | blocked | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); The current tutorial is restricted to Origami Friends early access. Public landing page says release in five weeks. No model authored; do not use image URLs from page metadata to reconstruct gated instructions. |
| [Origami Owl](https://origami.me/owl/) | Easy | flat with required cuts | excluded cuts | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 18 instructions, 21 diagrams and final photo reviewed. Sources 15 and 18 cut the talons and ear tufts. |
| [Origami Panda](https://origami.me/panda/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 26 instructions, 27 diagrams and final photo reviewed, plus final-step video. Source 26 only partially releases the snout, leaving the muzzle raised; a flat source-25 endpoint would be a labeled variant. |
| [Origami Pig](https://origami.me/pig/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 29 instructions, 31 diagrams and completed photo reviewed. Tail curl, shaped ears and source-29 curved body require 3D completion. |
| [Origami Pumpkin](https://origami.me/pumpkin/) | Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/pumpkin.osf); [Batch notes](batches/pumpkin-completion-2026-10-14.md); All 18 instructions complete; 25 nodes / 26 states replayed and checked in Fold. Three public CP imports retain explicit material/layer choices. Optional standing display omitted; flat completion is an explicit tutorial option. |
| [Origami Rabbit](https://origami.me/rabbit/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part2-2026-10-14.md); All 14 instructions and 15 diagrams reviewed. Source 14 opens the ears spatially; source 11 also leaves the feet curved. A pressed-flat model before shaping would be a variant. |
| [Origami Sanbou Box](https://origami.me/sanbou-box/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 13 instructions / 15 diagrams and completed photograph reviewed. Source 13 opens a raised-base container; required spatial completion. |
| [Origami Sea Turtle](https://origami.me/sea-turtle/) | Easy | flat with required cuts | excluded cuts | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 27 instructions / 30 diagrams and final video still reviewed. Source 24 cuts the top layer for the rear flippers; out of scope. |
| [Origami Seal](https://origami.me/seal/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 21 instructions / 22 diagrams and completed photograph reviewed. Source 21 folds both flippers to 90 degrees for standing. |
| [Origami Sitting Crane](https://origami.me/sitting-crane/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 21 instructions / 23 diagrams and completed photograph reviewed. Source 21 opens the pleated wings into a spatial fan and spreads the tail. |
| [Origami Sparrow](https://origami.me/sparrow/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 19 instructions / 22 diagrams and completed photograph reviewed. Source 19 uses 90-degree feet for the standing model; source-18 flat form would be a variant. |
| [Origami Squirrel](https://origami.me/squirrel/) | Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/squirrel.osf); [Batch notes](batches/direct-compound-priorities-2026-10-14.md); All 26 instructions complete; 34 nodes / 35 states replay. Source 16 / Fold 19 now uses a direct boundary-meeting crimp. All 14 states from the crimp onward preserve the previous checked CP sequence’s full material stacks. F039 resolved locally; optional advanced tail shaping omitted. |
| [Origami Star Box](https://origami.me/star-box/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 15 instructions / 16 diagrams and final photograph reviewed. Source 15 opens four flaps and forms the spatial container. |
| [Origami Styracosaurus](https://origami.me/styracosaurus/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 28 instructions / 29 diagrams and final photograph reviewed. Source 28 rounds the body and legs into a standing spatial model. |
| [Origami Swallow](https://origami.me/swallow/) | Easy | flat with required cuts | excluded cuts | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 23 instructions / 24 diagrams and final photograph reviewed. Source 22 cuts the top layer for the forked tail. |
| [Origami Tulip](https://origami.me/tulip/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 14 instructions / 16 diagrams reviewed. Source 13 inflates the flower and source 14 opens curved petals. |
| [Origami Turtle](https://origami.me/turtle/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 19 instructions / 21 diagrams and two final photos reviewed. Source 15 introduces a spatial shell; source 19 shapes the legs with volume. |
| [Origami Witch Hat Bookmark](https://origami.me/witch-hat-bookmark/) | Easy | flat | queued | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); Full tutorial and diagrams reviewed. Single-sheet flat completion eligible; authoring queued. |
| [Square to Hexagon](https://origami.me/square-paper-to-hexagon/) | Easy | flat with required cuts | excluded cuts | [Batch notes](batches/easy-eligibility-part3-2026-10-14.md); 9 instructions / 10 diagrams and final photograph reviewed. Source 9 cuts the six triangle flaps off. |
| [Origami 5-Petal Lily](https://origami.me/5-petal-lily/) | Challenging Easy | unreviewed | queued |  |
| [Origami 6-Pointed Star](https://origami.me/6-pointed-star/) | Challenging Easy | unreviewed | queued |  |
| [Origami Cat](https://origami.me/cat/) | Challenging Easy | unreviewed | queued |  |
| [Origami Crocodile](https://origami.me/crocodile/) | Challenging Easy | unreviewed | queued |  |
| [Origami Dragon](https://origami.me/dragon/) | Challenging Easy | unreviewed | queued |  |
| [Origami Frog](https://origami.me/traditional-frog/) | Challenging Easy | unreviewed | queued |  |
| [Origami Giraffe](https://origami.me/giraffe/) | Challenging Easy | unreviewed | queued |  |
| [Origami Heart With Wings](https://origami.me/heart-with-wings/) | Challenging Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/heart-eligibility-2026-10-14.md); Source 23 spreads pleated wings; the completed photograph retains raised corrugation. Full tutorial and final photograph reviewed; no flat variant authored. |
| [Origami Hedgehog](https://origami.me/hedgehog/) | Challenging Easy | unreviewed | queued |  |
| [Origami Imoseyama Cranes](https://origami.me/imoseyama-cranes/) | Challenging Easy | unreviewed | queued |  |
| [Origami Koi](https://origami.me/koi/) | Challenging Easy | unreviewed | queued |  |
| [Origami Lion](https://origami.me/lion/) | Challenging Easy | unreviewed | queued |  |
| [Origami Maple Leaf](https://origami.me/maple-leaf/) | Challenging Easy | unreviewed | queued |  |
| [Origami Mouse](https://origami.me/mouse/) | Challenging Easy | unreviewed | queued |  |
| [Origami Phoenix](https://origami.me/phoenix/) | Challenging Easy | unreviewed | queued |  |
| [Origami Skull](https://origami.me/skull/) | Challenging Easy | unreviewed | queued |  |
| [Origami Snail](https://origami.me/snail/) | Challenging Easy | unreviewed | queued |  |
| [Origami Snake](https://origami.me/snake/) | Challenging Easy | unreviewed | queued |  |
| [Origami Snowflake](https://origami.me/snowflake/) | Challenging Easy | unreviewed | queued |  |
| [Origami T-Rex](https://origami.me/t-rex/) | Challenging Easy | unreviewed | queued |  |
| [Origami Vertigo](https://origami.me/vertigo/) | Challenging Easy | unreviewed | queued |  |
| [Advanced Origami Skull](https://origami.me/skull-advanced/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Camel](https://origami.me/camel/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Chameleon](https://origami.me/chameleon/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Ditto](https://origami.me/ditto/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Dragon v2](https://origami.me/dragon-advanced/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Ghost](https://origami.me/ghost/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Hexagonal Box](https://origami.me/hexagonal-box/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Leviathan](https://origami.me/leviathan/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Lucky Cat](https://origami.me/lucky-cat/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Manta Ray](https://origami.me/manta-ray/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Rhinoceros](https://origami.me/rhinoceros/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Shark](https://origami.me/shark/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Spider](https://origami.me/spider/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Squid](https://origami.me/squid/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Tiger](https://origami.me/tiger/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Turkey](https://origami.me/turkey/) | Low-Intermediate | unreviewed | queued |  |
| [Origami Vase](https://origami.me/vase/) | Low-Intermediate | unreviewed | queued |  |
| [How to Make an Easy Origami Pinwheel or Windmill](https://origami.me/pinwheel/) | Unlisted | unreviewed | queued |  |
| [How to Make an Easy Origami Samurai Helmet](https://origami.me/samurai-helmet/) | Unlisted | unreviewed | queued |  |
| [How to Make an Easy Origami Santa Hat](https://origami.me/santa-hat/) | Unlisted | unreviewed | queued |  |

<!-- catalog:end -->
