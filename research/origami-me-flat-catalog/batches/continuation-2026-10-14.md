# Campaign continuation — 2026-10-14

The current batch now has **5 of 5 completions**: Penguin, Whale, Crow, Pumpkin and Squirrel. [Five-design audit links](five-completion-checkpoint-2026-10-14.md). The partial investigations and exclusions below do not count as completions. All finished models remain ready for user audit.

| Design | Current native sequence | Source position | Result |
| --- | --- | --- | --- |
| [Crow](https://origami.me/crow/) | [completed/crow.osf](../../2026-10-13-origami-fold-trials/models/completed/crow.osf) | All 17 instructions; Fold 28; 34 nodes | Complete, ready for audit. Central reverse-opening choices and both feet/head pockets verified. |
| [Bird](https://origami.me/bird/) | [in-progress/bird.osf](../../2026-10-13-origami-fold-trials/models/in-progress/bird.osf) | Source 13; Fold 24; 32 nodes | Advanced through both book folds and lifted flaps. Source-14 inner-flap pull remains F033. |
| [Dove](https://origami.me/dove/) | [in-progress/dove.osf](../../2026-10-13-origami-fold-trials/models/in-progress/dove.osf) | Source 5; Fold 5; 6 nodes | Recovered prefix fully audited. Source-6 coupled nested reverse is confirmed direct-operation limitation F030. |
| [Envelope](https://origami.me/envelope/) | [in-progress/envelope.osf](../../2026-10-13-origami-fold-trials/models/in-progress/envelope.osf) | Source 13; Fold 18; 20 nodes | New verified prefix. Source-14 hidden flap flip is authoring investigation F034. |
| [Heart Card](https://origami.me/heart-card-2/) | [in-progress/heart-card-2.osf](../../2026-10-13-origami-fold-trials/models/in-progress/heart-card-2.osf) | Source 13; Fold 17; 20 nodes | New verified prefix. Source-14 endpoint swivel is authoring investigation F035. |
| [Heart Corner Bookmark](https://origami.me/heart-corner-bookmark/) | [in-progress/heart-corner-bookmark.osf](../../2026-10-13-origami-fold-trials/models/in-progress/heart-corner-bookmark.osf) | Source 8; Fold 7; 10 nodes | New verified prefix. Source-9 connected squash is authoring investigation F036. |
| [Heart Envelope](https://origami.me/heart-envelope/) | [in-progress/heart-envelope.osf](../../2026-10-13-origami-fold-trials/models/in-progress/heart-envelope.osf) | Source 5; Fold 8; 9 nodes | Verified prefix; source-6/7 corner and pocket correspondence is F037. |
| [Kitten](https://origami.me/kitten/) | [in-progress/kitten.osf](../../2026-10-13-origami-fold-trials/models/in-progress/kitten.osf) | Source 5; Fold 7; 8 nodes | Verified prefix; source-6 side opening is F038. |
| [Pumpkin](https://origami.me/pumpkin/) | [completed/pumpkin.osf](../../2026-10-13-origami-fold-trials/models/completed/pumpkin.osf) | All 18 instructions; Fold 23; 25 nodes | Complete using three saved public CP imports. |
| [Squirrel](https://origami.me/squirrel/) | [completed/squirrel.osf](../../2026-10-13-origami-fold-trials/models/completed/squirrel.osf) | All 26 instructions; Fold 29; 34 nodes | Complete using one saved public CP neck crimp. |


These ten current sequences contain **198 nodes / 208 saved states**, all fresh-replayed and visually compared in Fold. Separate original-material and order checks cover Crow’s packet reversals, Dove’s eight-state CP control, Envelope’s unfolding/precreases, and the two heart prefixes. The direct operation failures are retained exactly. Source 14 and later for Bird, source 6 and later for Dove, source 14 and later for Envelope/Heart Card, and source 9 and later for Heart Corner Bookmark are not counted as complete.

## Confirmed implementation priority

**Dove’s coupled nested-packet reverse (F030).** The intended tips are two nested material pairs. The public CP solver produces a valid flat state with correct stationary body order and each tip inside its own walls. The direct reverse operation refuses because its separate motion blocks preserve inter-flap ordering that must change. This is stronger evidence than a silhouette or an isolated refusal. The next implementation should group the two packet halves while preserving contact guards and pocket order. [Evidence, exact inputs and verification](dove-nested-reverse-2026-10-14.md).

Squirrel adds F039: direct crimps reject hinges meeting at the packet boundary. The checked CP import provides completion today; this is lower priority than blocked F030. Other failures above remain authoring investigations. Do not implement a broad swivel or squash change based on them yet. Heart Card’s source-6 pleat was an authoring-direction mistake and was corrected with existing valley folds.

## Scope review

[Easy exclusions](easy-eligibility-2026-10-14.md): Dragonfly requires cuts and 3D wings, Eagle and Elephant Head require non-flat completion, and Heart Bookmark explicitly cuts at source 1.

[Heart reviews](heart-eligibility-2026-10-14.md): Heart Box and Heart with Wings require 3D completion. Heart Envelope now has a verified source-5 prefix. Supplied rectangular sheets are allowed; no cutting or additional sheet is added to a sequence.

[Further Easy reviews](easy-eligibility-part2-2026-10-14.md) and [last Easy reviews](easy-eligibility-part3-2026-10-14.md) record each cut, assembly and required 3D exclusion with source-step evidence. Mushroom remains access-blocked; no gated diagrams were reconstructed.

Current ledger: **16 ready for audit, 21 blocked verified native prefixes, 1 verified in-progress Bird, 2 access blockers, 70 excluded, and 41 queued**. Total: 151. Witch Hat Bookmark is already eligibility-reviewed; the other 40 queued entries await review. Next queue: Witch Hat Bookmark, Five-Petal Lily, Six-Pointed Star, Cat, Crocodile.

## Preservation and validation

The 57 pre-existing native files outside the deliberately advanced Bird/Crow files are byte-for-byte unchanged, including Heart and Cicada. Original Bird and Crow prefixes are checkpointed. New authoring generators refuse to overwrite user-edited native files. [Preservation evidence](continuation-native-preservation-2026-10-14.json).

No engine/UI code, guards, scheduling, remote branch, or PR was changed in this continuation. Validation used public engine replay, ordinary native-project opening, Fold visual checks, material-order checks, ledger consistency and `git diff --check`. Broad application tests were unnecessary because only research recipes, models and reports changed here; earlier dirty implementation work was left intact.

Detailed reports: [Crow/Bird](bird-crow-shaping-2026-10-14.md), [Dove](dove-nested-reverse-2026-10-14.md), [Envelope](envelope-prefix-2026-10-14.md), [Heart Card](heart-card-prefix-2026-10-14.md), [Heart Corner Bookmark](heart-corner-bookmark-prefix-2026-10-14.md).

Additional reports: [Heart Envelope](heart-envelope-prefix-2026-10-14.md), [Kitten](kitten-prefix-2026-10-14.md), [Pumpkin](pumpkin-completion-2026-10-14.md), [Squirrel](squirrel-completion-2026-10-14.md).
