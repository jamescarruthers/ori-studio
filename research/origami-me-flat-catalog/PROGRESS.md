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

## Functionality findings

See [GAPS.md](GAPS.md). Separate missing operations, UI limitations, authoring mistakes, and ambiguous diagram proportions. Record a suspected issue before investigation; call it a confirmed engine gap only with a reproducible refusal or wrong result under correct inputs.

## Campaign checklist

- [x] Inventory all five current index pages and cross-check the easy collection.
- [x] Carry forward previous models without overwriting user edits.
- [x] Save and validate the first two new flat models.
- [x] Schedule small continuation batches and maintain audit links.
- [ ] Receive user audits and resolve corrections.
- [ ] Classify and attempt every remaining eligible design.
- [ ] Consolidate evidenced implementation requirements.

## Next work

1. Audit [Easter Egg](models/easter-egg.osf) and [Cat Face](models/cat-face.osf); preserve user changes and record corrections.
2. Continue the remaining Very Easy models, including Bookmark, Dog, Paper Envelope, and Necktie; classify each before authoring.
3. Work through all remaining indexed designs in difficulty order, retaining explicit exclusions and access blockers.
4. Apply audit corrections before expanding a disputed folding technique to more models.
5. Reconcile the full catalog and group confirmed gaps into implementation work only after the evidence exists.

## Continuation

An hourly continuation is active in this chat (`origami-flat-design-audit`), with at most two designs per run and audit links in each meaningful progress report. It is local-only and must stop when the inventory is resolved.

The machine-readable [catalog.json](catalog.json) is the per-design ledger. Run `python3 research/origami-me-flat-catalog/render-progress.py` after ledger updates to refresh the table below. Do not erase the narrative, audit history, or gap records when regenerating the table. Report small batches with direct native-file links and tutorial links. Never push or create a PR.

<!-- catalog:start -->

## Per-design progress

Inventory: 151 entries. excluded 3D / flat variant: 2; queued: 144; ready for audit: 5.

| Design / tutorial | Difficulty | Eligibility | Progress | Fold file / notes |
| --- | --- | --- | --- | --- |
| [How to Make Rectangular Paper into a Square](https://origami.me/rectangle-paper-to-square/) | Very Easy | unreviewed | queued |  |
| [Origami 3D Butterfly](https://origami.me/yoshizawa-butterfly/) | Very Easy | unreviewed | queued |  |
| [Origami 5-Pointed Star](https://origami.me/5-pointed-star/) | Very Easy | unreviewed | queued |  |
| [Origami Angel](https://origami.me/angel/) | Very Easy | unreviewed | queued |  |
| [Origami Angelfish](https://origami.me/angelfish/) | Very Easy | unreviewed | queued |  |
| [Origami Bird](https://origami.me/bird/) | Very Easy | unreviewed | queued |  |
| [Origami Boat](https://origami.me/traditional-boat/) | Very Easy | unreviewed | queued |  |
| [Origami Bookmark](https://origami.me/bookmark/) | Very Easy | unreviewed | queued |  |
| [Origami Cat Face](https://origami.me/cat-face/) | Very Easy | flat | ready for audit | [Open .osf](models/cat-face.osf); [Batch notes](batches/001.md); Complete flat sequence; audit pocket tuck and nose. Decorative eyes omitted. |
| [Origami Christmas Tree](https://origami.me/christmas-tree/) | Very Easy | unreviewed | queued |  |
| [Origami Cicada](https://origami.me/cicada/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/cicada.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Existing sequence; preserve local user edits. |
| [Origami Cube](https://origami.me/cube/) | Very Easy | unreviewed | queued |  |
| [Origami Cup](https://origami.me/cup/) | Very Easy | unreviewed | queued |  |
| [Origami Dog](https://origami.me/dog/) | Very Easy | unreviewed | queued |  |
| [Origami Duck](https://origami.me/duck/) | Very Easy | unreviewed | queued |  |
| [Origami Easter Egg](https://origami.me/easter-egg/) | Very Easy | flat | ready for audit | [Open .osf](models/easter-egg.osf); [Batch notes](batches/001.md); Complete flat sequence; approximate symmetric shaping. |
| [Origami Elephant](https://origami.me/elephant/) | Very Easy | unreviewed | queued |  |
| [Origami Fan](https://origami.me/fan/) | Very Easy | unreviewed | queued |  |
| [Origami Fish](https://origami.me/fish/) | Very Easy | unreviewed | queued |  |
| [Origami Floral Swirls](https://origami.me/floral-swirls/) | Very Easy | unreviewed | queued |  |
| [Origami Fortune Teller](https://origami.me/fortune-teller/) | Very Easy | unreviewed | queued |  |
| [Origami Fox](https://origami.me/fox/) | Very Easy | unreviewed | queued |  |
| [Origami Goldfish](https://origami.me/goldfish/) | Very Easy | unreviewed | queued |  |
| [Origami Happi](https://origami.me/happi/) | Very Easy | unreviewed | queued |  |
| [Origami Heart](https://origami.me/heart/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/heart.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Existing sequence; preserve local user edits. |
| [Origami Heart Card](https://origami.me/heart-card/) | Very Easy | unreviewed | queued |  |
| [Origami Horse](https://origami.me/horse/) | Very Easy | unreviewed | queued |  |
| [Origami Jack-O'-Lantern](https://origami.me/jack-o-lantern/) | Very Easy | unreviewed | queued |  |
| [Origami Kimono](https://origami.me/kimono/) | Very Easy | unreviewed | queued |  |
| [Origami Lantern](https://origami.me/lantern/) | Very Easy | unreviewed | queued |  |
| [Origami Leaf](https://origami.me/leaf/) | Very Easy | unreviewed | queued |  |
| [Origami Necktie](https://origami.me/necktie/) | Very Easy | unreviewed | queued |  |
| [Origami Ninja Star](https://origami.me/ninja-star/) | Very Easy | unreviewed | queued |  |
| [Origami Pajarita](https://origami.me/pajarita/) | Very Easy | unreviewed | queued |  |
| [Origami Parrot](https://origami.me/parrot/) | Very Easy | unreviewed | queued |  |
| [Origami Penguin](https://origami.me/penguin/) | Very Easy | unreviewed | queued |  |
| [Origami Pigeon](https://origami.me/pigeon/) | Very Easy | unreviewed | queued |  |
| [Origami Rose](https://origami.me/rose/) | Very Easy | unreviewed | queued |  |
| [Origami Santa](https://origami.me/santa/) | Very Easy | unreviewed | queued |  |
| [Origami Shirt](https://origami.me/shirt/) | Very Easy | unreviewed | queued |  |
| [Origami Star](https://origami.me/star/) | Very Easy | unreviewed | queued |  |
| [Origami Sunglasses](https://origami.me/sunglasses/) | Very Easy | unreviewed | queued |  |
| [Origami Swan](https://origami.me/swan/) | Very Easy | flat | ready for audit | [Open .osf](../2026-10-13-origami-fold-trials/models/swan.osf); [Batch notes](../2026-10-13-origami-fold-trials/REPORT.md); Outside reverse neck and head. |
| [Origami Vampire Mouth](https://origami.me/vampire-mouth/) | Very Easy | unreviewed | queued |  |
| [Origami Wallet](https://origami.me/wallet/) | Very Easy | unreviewed | queued |  |
| [Origami Water Bomb](https://origami.me/waterbomb/) | Very Easy | unreviewed | queued |  |
| [Origami Whale](https://origami.me/whale/) | Very Easy | unreviewed | queued |  |
| [Origami Witch Hat](https://origami.me/witch-hat/) | Very Easy | unreviewed | queued |  |
| [Origami Yoda](https://origami.me/yoda/) | Very Easy | unreviewed | queued |  |
| [Paper Envelope](https://origami.me/paper-envelope/) | Very Easy | unreviewed | queued |  |
| [Rectangle to Hexagon](https://origami.me/rectangle-to-hexagon/) | Very Easy | unreviewed | queued |  |
| [Square to Pentagon](https://origami.me/pentagon-from-square-paper/) | Very Easy | unreviewed | queued |  |
| [Easy Origami Lazy Susan](https://origami.me/lazy-susan/) | Easy | unreviewed | queued |  |
| [Origami 4-pointed Star](https://origami.me/4-pointed-star/) | Easy | unreviewed | queued |  |
| [Origami Balloon Rabbit](https://origami.me/balloon-rabbit/) | Easy | unreviewed | queued |  |
| [Origami Basket](https://origami.me/basket/) | Easy | unreviewed | queued |  |
| [Origami Bat](https://origami.me/bat/) | Easy | unreviewed | queued |  |
| [Origami Bellflower](https://origami.me/bellflower/) | Easy | unreviewed | queued |  |
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
