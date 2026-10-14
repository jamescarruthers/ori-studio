# Origami.me flat-fold campaign

Updated: 2026-10-13. Local worktree: `codex/fold-origami-trials`.

## Scope and working rules

Recreate every eligible tutorial in the [Origami.me index](https://origami.me/origami-index/) as an editable Ori Studio **Fold workspace** sequence. Start with Very Easy, then Easy, Challenging Easy, and Low-Intermediate. Review the complete tutorial before deciding whether its result is flat. Record exclusions instead of silently dropping them. The initial inventory covers all five index pages: **151 unique entries**, including all 142 entries from the easy collection. This is the site's current indexed inventory, not a claim that every historical unindexed article has been found.

Only flat states and flat final models are in scope. Required inflation, upright walls, curved shaping, and spatial assembly are excluded. An optional flat variant remains labeled a variant, never counted as full tutorial completion. Flat modular designs remain candidates; missing multi-sheet assembly is a functionality question, not a 3D exclusion. Paper-cutting preparation tutorials stay in the catalog for classification. Decorative eyes, whiskers, or printed patterns are not folding steps.

Models are native `.osf` projects that must open in **Fold**, with every operation and branch choice saved. A `.fold` interchange export is not the deliverable. Use existing public engine operations and record UI parity limitations. Do not implement speculative features or weaken engine guards to make a model pass.

Preserve user edits, especially the existing Heart and Cicada files. New attempts live in this directory. A generator must refuse to overwrite a model changed since its last generation. Keep failed attempts, exact inputs, refusal codes, last valid steps, and audit corrections.

## Status definitions

- **Queued / eligibility unreviewed:** indexed, but the complete diagram has not been assessed.
- **In progress:** source reviewed and authoring underway.
- **Blocked:** a reproducible issue prevents the next required flat step; link the evidence and gap.
- **Ready for audit:** replay and local visual checks passed; user approval is still pending.
- **Audited:** user explicitly accepted the model. Engine success alone never sets this status.
- **Excluded 3D / flat variant:** source completion needs 3D; any flat preparation is retained separately.

Check every intermediate step, visible paper side, layer order, tucked flap, and both faces where relevant. Match original-sheet material at occlusion witnesses when several layer orders share a silhouette. Keep proportion choices explicit when the tutorial supplies no exact reference. Compare source instruction numbers to saved step notes; a paired source step may require two engine operations.

## Audit batches

- Batch 0: [previous five-design report](../2026-10-13-origami-fold-trials/REPORT.md). Heart, Swan, and Cicada are existing flat sequences. Box and Crane are retained as excluded 3D completion / flat alternatives. Heart's corrected tuck order was acknowledged by the user; no blanket approval of all models is assumed.
- Batch 1: [Easter Egg and Cat Face](batches/001.md), both **ready for audit**. Two native models, 18 numbered folds, all states replayed. No new missing flat primitive; one open audit UI gap (F006).

- Batch 3: [Angelfish, Christmas Tree, Fish, Pigeon, and Santa](batches/003.md), all ready for audit; 68 nodes and 73 checked states. New cutting and precreased rabbit-ear gaps are recorded separately from unresolved compound attempts.

- Batch 2: [Bookmark and Dog](batches/002.md). Bookmark is **ready for audit**; Dog is **blocked at source 13**, with its valid prefix saved. All 29 saved states replayed. Bookmark adds an internal pocket-order audit case; Dog remains an investigation, not a confirmed missing primitive.

- Batch 4: [current running report](batches/004.md). Penguin is ready for audit. Seventeen native files have checked states; Witch Hat and the squash-selection case have confirmed restrictions, with remaining compound attempts marked as investigations.

## Functionality findings

See [GAPS.md](GAPS.md). Separate missing operations, UI limitations, authoring mistakes, and ambiguous diagram proportions. Record a suspected issue before investigation; call it a confirmed engine gap only with a reproducible refusal or wrong result under correct inputs.

## Campaign checklist

- [x] Inventory all five current index pages and cross-check the easy collection.
- [x] Carry forward previous models without overwriting user edits.
- [x] Save and validate the first two new flat models.
- [x] Maintain audit links and continuation records. The mistakenly created schedule was removed at the user's request.
- [x] Complete batch 2 and retain exact blocked operations and last valid states.
- [ ] Receive user audits and resolve corrections.
- [ ] Classify and attempt every remaining eligible design.
- [ ] Consolidate evidenced implementation requirements.

## Next work

1. Apply any user audit corrections first, preserving user-saved models.
2. Very Easy classification and first attempts are recorded. Continue Easy: Butterfly, Camellia, Candle, Candy Box, and Celebration Crane. `catalog.json` holds the current queue.
3. Batch 4 has one complete model (Penguin), verified prefixes for fourteen additional designs, explicit 3D exclusions, and Wallet's access blocker. A five-native-file audit checkpoint was reported while the completion count remains explicit.
4. Revisit connected opening and swivel investigations with exact source geometry; keep them distinct from confirmed limitations.
5. Consolidate implementation requirements after evidence exists. Continue locally without a schedule, PR, or push.

## Continuation

Work continuously in this chat. The user clarified that no scheduled task is wanted; the mistakenly created hourly automation was removed. Report an audit batch after every five completed designs, then continue working. Blocked attempts and exclusions remain recorded separately and do not count as completed designs. All work is local-only.

The machine-readable [catalog.json](catalog.json) is the per-design ledger. Run `python3 research/origami-me-flat-catalog/render-progress.py` after ledger updates to refresh the table below. Do not erase the narrative, audit history, or gap records when regenerating the table. Report small batches with direct native-file links and tutorial links. Never push or create a PR.

<!-- catalog:start -->

## Per-design progress

Inventory: 151 entries. blocked: 22; excluded 3D / flat variant: 26; queued: 91; ready for audit: 12.

| Design / tutorial | Difficulty | Eligibility | Progress | Fold file / notes |
| --- | --- | --- | --- | --- |
| [How to Make Rectangular Paper into a Square](https://origami.me/rectangle-paper-to-square/) | Very Easy | flat preparation | blocked | [Open .osf](models/rectangle-paper-to-square.osf); [Batch notes](batches/003.md); Flat preparation through source 2; required strip cut has no public Fold operation. |
| [Origami 3D Butterfly](https://origami.me/yoshizawa-butterfly/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/003.md); Required curved sides in 7 and spatial wing shaping in 9. |
| [Origami 5-Pointed Star](https://origami.me/5-pointed-star/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 10 instructions and 11 diagrams plus completed photograph reviewed. The finished modular star retains raised ridges; source describes a dimensional star. Excluded 3D completion, not a flat assembly blocked solely by F024. |
| [Origami Angel](https://origami.me/angel/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/003.md); Source 11 partially closes the body into a standing pose. |
| [Origami Angelfish](https://origami.me/angelfish/) | Very Easy | flat | ready for audit | [Open .osf](models/angelfish.osf); [Batch notes](batches/003.md); All steps replayed and visually checked in Fold; paper-side and material checks passed. |
| [Origami Bird](https://origami.me/bird/) | Very Easy | flat folded endpoint; optional flapping action | blocked | [Open .osf](models/bird.osf); [Batch notes](batches/004.md); Square base and closed kite through source 6 verified. Source 7 opening moved wrong connected layers; exact invalid attempt retained separately. |
| [Origami Boat](https://origami.me/traditional-boat/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 8 instructions and 12 diagrams reviewed. Required final opening forms a spatial hull; completed photograph confirms open cavity. |
| [Origami Bookmark](https://origami.me/bookmark/) | Very Easy | flat | ready for audit | [Open .osf](models/bookmark.osf); [Batch notes](batches/002.md); Complete; audit half-length precrease and both hidden pocket layers. |
| [Origami Cat Face](https://origami.me/cat-face/) | Very Easy | flat | ready for audit | [Open .osf](models/cat-face.osf); [Batch notes](batches/001.md); Complete flat sequence; audit pocket tuck and nose. Decorative eyes omitted. |
| [Origami Christmas Tree](https://origami.me/christmas-tree/) | Very Easy | flat | ready for audit | [Open .osf](models/christmas-tree.osf); [Batch notes](batches/003.md); All steps replayed and visually checked in Fold; paper-side and material checks passed. |
| [Origami Cicada](https://origami.me/cicada/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/cicada.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Existing sequence; preserve local user edits. |
| [Origami Cube](https://origami.me/cube/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions and 14 diagrams reviewed. Eight module steps plus four assembly steps. Assembly 3–4 closes six Sonobe units into a volume. |
| [Origami Cup](https://origami.me/cup/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 7 instructions and 8 diagrams reviewed. Required source 7 opens the top and presses a base into a curved container. |
| [Origami Dog](https://origami.me/dog/) | Very Easy | flat | blocked | [Open .osf](models/dog.osf); [Batch notes](batches/002.md); Partial through source 12. Step 13 layer/compound interpretation unresolved; no confirmed engine gap. |
| [Origami Duck](https://origami.me/duck/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); Full 13 instructions / 14 diagrams reviewed. Source 13 requires opening wings out of plane so it stands. Flat prefix is not tutorial completion. |
| [Origami Easter Egg](https://origami.me/easter-egg/) | Very Easy | flat | ready for audit | [Open .osf](models/easter-egg.osf); [Batch notes](batches/001.md); Complete flat sequence; approximate symmetric shaping. |
| [Origami Elephant](https://origami.me/elephant/) | Very Easy | flat | blocked | [Open .osf](models/elephant.osf); [Batch notes](batches/004.md); Source 8 head swivel inputs remain tentative; swivel_fold_wide is not evidence of missing functionality. Eleven-node verified prefix. |
| [Origami Fan](https://origami.me/fan/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Required source 11 spreads accordion pleats; completed fan retains out-of-plane ridges. |
| [Origami Fish](https://origami.me/fish/) | Very Easy | flat | ready for audit | [Open .osf](models/fish.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Floral Swirls](https://origami.me/floral-swirls/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 22 instructions and 28 diagrams reviewed. Four preparation, six unit, twelve assembly steps. Required final curl makes petals non-flat. Flat assembly through 11 would be a labeled variant, not tutorial completion. |
| [Origami Fortune Teller](https://origami.me/fortune-teller/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Final finger-pocket opening produces a spatial toy; flat preparation is not tutorial completion. |
| [Origami Fox](https://origami.me/fox/) | Very Easy | flat | blocked | [Open .osf](models/fox.osf); [Batch notes](batches/004.md); Central multi-ply squash unresolved; direct and tentative middle-fold requests lack a recognized spine. Prefix through 7 verified in Fold. |
| [Origami Goldfish](https://origami.me/goldfish/) | Very Easy | flat | blocked | [Open .osf](models/goldfish.osf); [Batch notes](batches/004.md); All 14 instructions and 15 diagrams reviewed. Fourteen-node prefix through source 10 checked in Fold. Source 11 pocket collapse remains an investigation; source 12 requires missing layer-selective cuts. |
| [Origami Happi](https://origami.me/happi/) | Very Easy | flat | blocked | [Open .osf](models/happi.osf); [Batch notes](batches/004.md); Source-6 collar reference unresolved; native file rolled back to the nine-node source-5 checkpoint. Invalid downstream attempt retained separately. |
| [Origami Heart](https://origami.me/heart/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/heart.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Existing sequence; preserve local user edits. |
| [Origami Heart Card](https://origami.me/heart-card/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions and 13 diagrams reviewed. Required source 12 adjusts the center fold into a standing V. Flat source-11 card is a possible variant, not full tutorial completion. Step-2 JPG link is broken; the page’s actual PNG image was reviewed. |
| [Origami Horse](https://origami.me/horse/) | Very Easy | flat | blocked | [Open .osf](models/horse.osf); [Batch notes](batches/004.md); Required source 8 partial cut through the front layer has no public Fold operation. Sixteen-node verified prefix; all 20 instructions and 21 diagrams reviewed. |
| [Origami Jack-O'-Lantern](https://origami.me/jack-o-lantern/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 21 instructions and 22 diagrams reviewed. Required source-20 three-ray stem pinch and source-21 curved shaping retain a non-flat stem. The pumpkin face is flat, but a flat stem variant would not reproduce the shown finish. |
| [Origami Kimono](https://origami.me/kimono/) | Very Easy | flat | blocked | [Open .osf](models/kimono.osf); [Batch notes](batches/003.md); Final connected sleeve collapse unresolved; single-pocket squash refusals are not proof of a missing primitive. Every saved prefix state checked in Fold. |
| [Origami Lantern](https://origami.me/lantern/) | Very Easy | flat | blocked | [Open .osf](models/lantern.osf); [Batch notes](batches/004.md); Three blintzes and turns verified. Source 5 requires a coupled swivel opening; direct squash is not free. Correct swivel inputs remain untested. |
| [Origami Leaf](https://origami.me/leaf/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Required final opening retains a raised center ridge and corrugated pleats, also visible in final photo; a flattened variant is not tutorial completion. |
| [Origami Necktie](https://origami.me/necktie/) | Very Easy | flat | blocked | [Open .osf](models/necktie.osf); [Batch notes](batches/003.md); Source-5 back flap moved incorrectly; valid prefix rolled back to 4. Downstream squash refusal is not an engine gap. |
| [Origami Ninja Star](https://origami.me/ninja-star/) | Very Easy | flat modular | blocked | [Open .osf](models/ninja-star-a.osf); [Batch notes](batches/004.md); Both mirrored modules through source 7 verified in Fold. Source 8 needs multi-sheet placement; 9 and 11 tuck one sheet into another. Public Fold has no assembly operation. |
| [Origami Pajarita](https://origami.me/pajarita/) | Very Easy | flat | blocked | [Open .osf](models/pajarita.osf); [Batch notes](batches/004.md); Sixteen nodes through source 7 verified. First swivel inputs refuse at existing crease junction; uncreased control also refuses wide-fold geometry. Correct operation mapping unresolved. |
| [Origami Parrot](https://origami.me/parrot/) | Very Easy | flat | blocked | [Open .osf](models/parrot.osf); [Batch notes](batches/004.md); Eight-node prefix through opening the upper flap. Direct squash refuses squash_flap_not_free; connected wing interpretation remains under investigation. |
| [Origami Penguin](https://origami.me/penguin/) | Very Easy | flat | ready for audit | [Open .osf](models/penguin.osf); [Batch notes](batches/004.md); All 12 states checked in Fold; outside reverse head wraps both neck walls, preserving white chest and colored wing. |
| [Origami Pigeon](https://origami.me/pigeon/) | Very Easy | flat | ready for audit | [Open .osf](models/pigeon.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Rose](https://origami.me/rose/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 10 diagrams plus the step-2 photograph reviewed. Required source 9 curls petals into non-flat surfaces. Flat source-8 variant is not tutorial completion. |
| [Origami Santa](https://origami.me/santa/) | Very Easy | flat | ready for audit | [Open .osf](models/santa.osf); [Batch notes](batches/003.md); All steps freshly replayed and visually checked in Fold; material and exposed-side checks passed. |
| [Origami Shirt](https://origami.me/shirt/) | Very Easy | flat | blocked | [Open .osf](models/shirt.osf); [Batch notes](batches/004.md); Source 7 sleeve opening requires a validated compound mapping; direct squash has no hinge. Nine-node verified prefix. |
| [Origami Star](https://origami.me/star/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 12 diagrams reviewed. Required final pinching puffs the pentagonal packet into a 3D lucky star. |
| [Origami Sunglasses](https://origami.me/sunglasses/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All nine instructions and ten diagrams reviewed. Source 9 requires both temples bent to 90 degrees out of plane. |
| [Origami Swan](https://origami.me/swan/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/swan.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Outside reverse neck and head. |
| [Origami Vampire Mouth](https://origami.me/vampire-mouth/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 16 instructions and 20 diagrams including alternative fangs reviewed, plus final photograph. Source 16 presses a three-ray lip dimple while leaving the model open; the final photo shows curved lower lip and raised center. Flat prefix/variant is not tutorial completion. |
| [Origami Wallet](https://origami.me/wallet/) | Very Easy | access blocked | blocked | [Batch notes](batches/004.md); Public page exposes only Early Access notice; full tutorial unavailable. Eligibility unconfirmed; no access bypass attempted. |
| [Origami Water Bomb](https://origami.me/waterbomb/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 9 instructions and 10 diagrams reviewed. Required source 9 inflates the packet into a volume; excluded completion. |
| [Origami Whale](https://origami.me/whale/) | Very Easy | flat | blocked | [Open .osf](models/whale.osf); [Batch notes](batches/003.md); Precreased fish-base rabbit ear refuses fan_center; matching unprecreased control accepts both ears. Every saved prefix state checked in Fold. |
| [Origami Witch Hat](https://origami.me/witch-hat/) | Very Easy | flat | blocked | [Open .osf](models/witch-hat.osf); [Batch notes](batches/004.md); Partial precrease on an existing flat crease refuses extent_misses_layers; 12-node valid prefix retained. |
| [Origami Yoda](https://origami.me/yoda/) | Very Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions, 16 diagrams and completed photo reviewed. Required source 15 rear stand is spatial; a flattened robe variant would not be tutorial completion. |
| [Paper Envelope](https://origami.me/paper-envelope/) | Very Easy | flat | blocked | [Open .osf](models/paper-envelope.osf); [Batch notes](batches/003.md); Partial through source 7; wide swivel 8–9 refused; interpretation under investigation. |
| [Rectangle to Hexagon](https://origami.me/rectangle-to-hexagon/) | Very Easy | flat preparation | blocked | [Open .osf](models/rectangle-to-hexagon.osf); [Batch notes](batches/004.md); All 11 instructions and 12 diagrams reviewed. Five-node prefix through source 5 verified in Fold. Source 6 requires an oblique cut through both folded layers; source 10 needs another cut. |
| [Square to Pentagon](https://origami.me/pentagon-from-square-paper/) | Very Easy | flat preparation | blocked | [Open .osf](models/pentagon-from-square-paper.osf); [Batch notes](batches/004.md); All 10 instructions and 12 diagrams reviewed. Nine-node prefix includes orientation for source 9; all 10 states verified. Required straight cut through the packet is missing. Front-ply-only reference marks checked. |
| [Easy Origami Lazy Susan](https://origami.me/lazy-susan/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 18 instructions and 19 diagrams reviewed. Required steps 17–18 open and curve the compartments into a container; excluded 3D completion. |
| [Origami 4-pointed Star](https://origami.me/4-pointed-star/) | Easy | flat | blocked | [Open .osf](models/4-pointed-star.osf); [Batch notes](batches/004.md); All 20 instructions and 21 diagrams reviewed. Twenty-one-node packet through source 14; all 22 states checked in Fold. Source 15 swivel refuses fan_ray_blocked; investigation, not a confirmed missing primitive. |
| [Origami Balloon Rabbit](https://origami.me/balloon-rabbit/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 15 instructions and 16 diagrams reviewed. Step 14 opens curved ears; required step 15 inflates the body. Excluded 3D completion. |
| [Origami Basket](https://origami.me/basket/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 20 instructions (3 preparation, 3 handle, 14 basket) and 21 diagrams reviewed. Curved handle plus basket steps 13–14 open and finish a spatial container. Excluded 3D completion. |
| [Origami Bat](https://origami.me/bat/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 12 instructions, 13 diagrams and completed photograph reviewed. Required step 12 spreads the wings while retaining a raised central pocket and ridges; photograph confirms non-flat completion. A pressed-flat alternative would be a variant. |
| [Origami Bellflower](https://origami.me/bellflower/) | Easy | 3D completion | excluded 3D / flat variant | [Batch notes](batches/004.md); All 21 instructions and 23 diagrams reviewed. Source 17 explicitly starts non-flat folding, retained through completion; final petals curl. Excluded 3D completion. |
| [Origami Box](https://origami.me/box/) | Easy | 3D completion | excluded 3D / flat variant | [Open .osf](../2026-10-13-origami-fold-trials/models/box.osf); Flat preparation only; upright walls excluded. |
| [Origami Butterfly](https://origami.me/butterfly/) | Easy | unreviewed | queued |  |
| [Origami Camellia](https://origami.me/camellia/) | Easy | unreviewed | queued |  |
| [Origami Candle](https://origami.me/candle/) | Easy | unreviewed | queued |  |
| [Origami Candy Box](https://origami.me/candy-box/) | Easy | unreviewed | queued |  |
| [Origami Celebration Crane](https://origami.me/celebration-crane/) | Easy | unreviewed | queued |  |
| [Origami Chick](https://origami.me/chick/) | Easy | unreviewed | queued |  |
| [Origami Chicken](https://origami.me/chicken/) | Easy | unreviewed | queued |  |
| [Origami Crab](https://origami.me/crab/) | Easy | unreviewed | queued |  |
| [Origami Crane](https://origami.me/crane/) | Easy | 3D completion | excluded 3D / flat variant | [Open .osf](../2026-10-13-origami-fold-trials/models/crane.osf); Flat alternative retained; final wing opening excluded. |
| [Origami Crow](https://origami.me/crow/) | Easy | unreviewed | queued |  |
| [Origami Devilish Heart](https://origami.me/devilish-heart/) | Easy | unreviewed | queued |  |
| [Origami Dolphin](https://origami.me/dolphin/) | Easy | unreviewed | queued |  |
| [Origami Dove](https://origami.me/dove/) | Easy | unreviewed | queued |  |
| [Origami Dragonfly](https://origami.me/dragonfly/) | Easy | unreviewed | queued |  |
| [Origami Eagle](https://origami.me/eagle/) | Easy | unreviewed | queued |  |
| [Origami Elephant Head](https://origami.me/elephant-head/) | Easy | unreviewed | queued |  |
| [Origami Envelope](https://origami.me/envelope/) | Easy | unreviewed | queued |  |
| [Origami Heart Bookmark](https://origami.me/heart-bookmark/) | Easy | unreviewed | queued |  |
| [Origami Heart Box](https://origami.me/heart-box/) | Easy | unreviewed | queued |  |
| [Origami Heart Card](https://origami.me/heart-card-2/) | Easy | unreviewed | queued |  |
| [Origami Heart Corner Bookmark](https://origami.me/heart-corner-bookmark/) | Easy | unreviewed | queued |  |
| [Origami Heart Envelope](https://origami.me/heart-envelope/) | Easy | unreviewed | queued |  |
| [Origami Hummingbird](https://origami.me/hummingbird/) | Easy | unreviewed | queued |  |
| [Origami Hydrangea](https://origami.me/hydrangea/) | Easy | unreviewed | queued |  |
| [Origami Iris](https://origami.me/iris/) | Easy | unreviewed | queued |  |
| [Origami Jumping Frog](https://origami.me/jumping-frog/) | Easy | unreviewed | queued |  |
| [Origami Kissing Lips](https://origami.me/kissing-lips/) | Easy | unreviewed | queued |  |
| [Origami Kitten](https://origami.me/kitten/) | Easy | unreviewed | queued |  |
| [Origami Kusudama Chrysanthemum](https://origami.me/kusudama-chrysanthemum/) | Easy | unreviewed | queued |  |
| [Origami Lily](https://origami.me/lily/) | Easy | unreviewed | queued |  |
| [Origami Lotus](https://origami.me/lotus/) | Easy | unreviewed | queued |  |
| [Origami Moon](https://origami.me/moon/) | Easy | unreviewed | queued |  |
| [Origami Mushroom](https://origami.me/mushroom/) | Easy | unreviewed | queued |  |
| [Origami Owl](https://origami.me/owl/) | Easy | unreviewed | queued |  |
| [Origami Panda](https://origami.me/panda/) | Easy | unreviewed | queued |  |
| [Origami Pig](https://origami.me/pig/) | Easy | unreviewed | queued |  |
| [Origami Pumpkin](https://origami.me/pumpkin/) | Easy | unreviewed | queued |  |
| [Origami Rabbit](https://origami.me/rabbit/) | Easy | unreviewed | queued |  |
| [Origami Sanbou Box](https://origami.me/sanbou-box/) | Easy | unreviewed | queued |  |
| [Origami Sea Turtle](https://origami.me/sea-turtle/) | Easy | unreviewed | queued |  |
| [Origami Seal](https://origami.me/seal/) | Easy | unreviewed | queued |  |
| [Origami Sitting Crane](https://origami.me/sitting-crane/) | Easy | unreviewed | queued |  |
| [Origami Sparrow](https://origami.me/sparrow/) | Easy | unreviewed | queued |  |
| [Origami Squirrel](https://origami.me/squirrel/) | Easy | unreviewed | queued |  |
| [Origami Star Box](https://origami.me/star-box/) | Easy | unreviewed | queued |  |
| [Origami Styracosaurus](https://origami.me/styracosaurus/) | Easy | unreviewed | queued |  |
| [Origami Swallow](https://origami.me/swallow/) | Easy | unreviewed | queued |  |
| [Origami Tulip](https://origami.me/tulip/) | Easy | unreviewed | queued |  |
| [Origami Turtle](https://origami.me/turtle/) | Easy | unreviewed | queued |  |
| [Origami Witch Hat Bookmark](https://origami.me/witch-hat-bookmark/) | Easy | unreviewed | queued |  |
| [Square to Hexagon](https://origami.me/square-paper-to-hexagon/) | Easy | unreviewed | queued |  |
| [Origami 5-Petal Lily](https://origami.me/5-petal-lily/) | Challenging Easy | unreviewed | queued |  |
| [Origami 6-Pointed Star](https://origami.me/6-pointed-star/) | Challenging Easy | unreviewed | queued |  |
| [Origami Cat](https://origami.me/cat/) | Challenging Easy | unreviewed | queued |  |
| [Origami Crocodile](https://origami.me/crocodile/) | Challenging Easy | unreviewed | queued |  |
| [Origami Dragon](https://origami.me/dragon/) | Challenging Easy | unreviewed | queued |  |
| [Origami Frog](https://origami.me/traditional-frog/) | Challenging Easy | unreviewed | queued |  |
| [Origami Giraffe](https://origami.me/giraffe/) | Challenging Easy | unreviewed | queued |  |
| [Origami Heart With Wings](https://origami.me/heart-with-wings/) | Challenging Easy | unreviewed | queued |  |
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
