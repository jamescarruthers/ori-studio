> Current status is in [PROGRESS.md](PROGRESS.md). Later work resolved F012, F014, F019, F031 and the F020 Bird/Crow authoring issue; F006 is deferred. The counts and active-gap statements below are historical snapshots.

# Reconciled campaign status — 2026-10-14

Later implementation update: [F012 is resolved locally](batches/rabbit-ear-precreases-2026-10-14.md), and [Whale is completed, ready for user audit](batches/whale-completion-2026-10-14.md). The historical reconciliation below predates that change; use [PROGRESS.md](PROGRESS.md) for current counts and queue. F014 remains the confirmed active engine requirement.


## Current scope and progress

Recreate the indexed Origami.me tutorials that can be completed with **one sheet, entirely flat, without required cuts or multi-sheet assembly**, using native editable Ori Studio Fold sequences. Optional decorations do not count as folding. Required spatial finishes are excluded; flat alternatives stay explicitly labeled and do not count as tutorial completion. Work remains local, with no schedule, push, or PR.

The catalog contains 151 entries across all five index pages. The following categories are mutually exclusive:

| Status | Designs | Meaning |
| --- | ---: | --- |
| Completed, ready for audit | 12 | Saved sequences passed prior local visual/material checks; user approval is not implied. |
| Incomplete, verified native prefix | 18 | Last retained state was checked in Fold; next fold remains blocked or unresolved. |
| Unfinished draft | 1 | Dove replays but has not received its source/visual audit. |
| Source access blocker | 1 | Wallet’s full tutorial is not publicly accessible. |
| Excluded: required 3D | 32 | Retained flat variants are not tutorial completions. |
| Excluded: required cuts | 7 | Existing prefixes/evidence are preserved. |
| Excluded: required multi-sheet assembly | 1 | Ninja Star modules are preserved; assembly is out of scope. |
| Unreviewed | 79 | Eligibility and required functionality are not yet established. |
| **Total** | **151** | **71 full source reviews plus Wallet’s access assessment; 79 remain.** |

There are 111 entries not currently excluded, but this is not a fixed completion target: further source review can identify additional exclusions. Do not interpret 12/111 as a final completion percentage.

## What was recovered after the interruption

- **Dolphin:** seven saved nodes through source 3, with all eight states already replayed and checked in Fold. Its rabbit-ear control reinforces F012, but its required tail cut now excludes tutorial completion.
- **Dove:** six saved nodes through authored source 5, seven replayable states, and exact source-6 reverse failures. The file was absent from the ledger. It is now recorded as an unfinished draft, with visual/source audit pending (F030). It is not a newly completed model.
- **Easter Egg / Cat Face:** their manifest labels still said “pending visual review” despite the completed checks documented in batch 1. Metadata now points to that existing evidence; no new audit or user approval is claimed.
- **User edits:** Heart’s fold operations are unchanged; its saved layout changes remain. Cicada contains five additional user-authored branch nodes. All replay successfully, but that branch has not received a source/visual audit. The original completed path’s audit status does not certify the added branch.
- Historical prototypes and combined files do not represent extra completed tutorials. **The recovered work does not increase the completed count beyond 12.**

The read-only [reconciliation script](reconcile-saved-work.mjs) parses JSON/native projects across both research trees and freshly replays every individual model under the consolidated [models library](../2026-10-13-origami-fold-trials/models/README.md), excluding `archive/`, including branches. It found **42 model files, 512 saved nodes, 554 states including initial sheets, zero replay failures, and zero mismatches against recorded file/state hashes**. The 37 campaign files have recorded hash manifests; the five original models were freshly replayed without those campaign manifests. See the [machine-readable results](batches/reconciliation-2026-10-14.json). This verifies persistence and deterministic replay, not a new visual audit. Native files were never regenerated.

## Completed models available for audit

| Design | Native Fold project | Source tutorial | Existing audit evidence |
| --- | --- | --- | --- |
| Angelfish | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/angelfish.osf) | [Tutorial](https://origami.me/angelfish/) | [Report](batches/003.md) |
| Bookmark | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/bookmark.osf) | [Tutorial](https://origami.me/bookmark/) | [Report](batches/002.md) |
| Cat Face | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/cat-face.osf) | [Tutorial](https://origami.me/cat-face/) | [Report](batches/001.md) |
| Christmas Tree | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/christmas-tree.osf) | [Tutorial](https://origami.me/christmas-tree/) | [Report](batches/003.md) |
| Cicada | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/cicada.osf) | [Tutorial](https://origami.me/cicada/) | [Report](../2026-10-13-origami-fold-trials/REPORT.md) |
| Easter Egg | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/easter-egg.osf) | [Tutorial](https://origami.me/easter-egg/) | [Report](batches/001.md) |
| Fish | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/fish.osf) | [Tutorial](https://origami.me/fish/) | [Report](batches/003.md) |
| Heart | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/heart.osf) | [Tutorial](https://origami.me/heart/) | [Report](../2026-10-13-origami-fold-trials/REPORT.md) |
| Penguin | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/penguin.osf) | [Tutorial](https://origami.me/penguin/) | [Report](batches/004.md) |
| Pigeon | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/pigeon.osf) | [Tutorial](https://origami.me/pigeon/) | [Report](batches/003.md) |
| Santa | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/santa.osf) | [Tutorial](https://origami.me/santa/) | [Report](batches/003.md) |
| Swan | [Open .osf](../2026-10-13-origami-fold-trials/models/completed/swan.osf) | [Tutorial](https://origami.me/swan/) | [Report](../2026-10-13-origami-fold-trials/REPORT.md) |

Cicada’s current saved cursor may show the added user branch; use the original completed path for the prior audit result. Heart’s corrected tuck order was acknowledged in the conversation, but none of these entries has been blanket-marked user-approved.

## Work needed to complete the current scope

### Confirmed engine requirements

1. **F012 — Rabbit ears on compatible existing precrease junctions.** Whale’s prepared fish-base triangle refuses `fan_center`; the corresponding unprecreased triangle succeeds. Implement reuse of compatible existing creases and junctions while preserving sheet identity, crease assignments, and layer order. Keep guards for genuinely incompatible fans. Replay and audit the entire Whale continuation afterward; the current evidence does not establish support for every later fold.
2. **F014 — Partial precrease/reversal along an existing crease.** Witch Hat’s bounded mark on a preexisting flat crease refuses `extent_misses_layers`, while the equivalent fresh-sheet control succeeds. Support the requested segment without extending the reversal into the outer wings. Verify untouched material and assignments, then continue the later brim collapse, which has not yet been attempted.

These are the confirmed engine blockers established so far, not an exhaustive implementation specification for the 79 unreviewed tutorials. Outside reverse folds, saved tuck target choices, native Fold persistence, and the original Heart tuck-order correction were already handled in the original five-design work; they are not outstanding requirements.

### Authoring and reference investigations

Sixteen verified prefixes still need correct geometry, material anchors, or compound-operation mapping established before proposing an engine extension. Keep exact refused requests and last valid states. First retest existing operations with verified inputs; a refusal from a wrong layer selection is not proof of a missing fold.

| Design | Verified through source | Investigation |
| --- | ---: | --- |
| [Bird](../2026-10-13-origami-fold-trials/models/in-progress/bird.osf) | 6 | F020: open lower kite while keeping top triangle lowered. |
| [Crow](../2026-10-13-origami-fold-trials/models/in-progress/crow.osf) | 6 | F020: same connected kite opening; depth controls did not resolve it. |
| [Dog](../2026-10-13-origami-fold-trials/models/in-progress/dog.osf) | 12 | F009: body fold beneath protected head flap. |
| [Elephant](../2026-10-13-origami-fold-trials/models/in-progress/elephant.osf) | 7 | F023: head swivel direction and anchors. |
| [Fox](../2026-10-13-origami-fold-trials/models/in-progress/fox.osf) | 7 | F017: central connected multi-ply squash. |
| [Happi](../2026-10-13-origami-fold-trials/models/in-progress/happi.osf) | 5 | F015: collar reference/landing; downstream geometry was invalid. |
| [Kimono](../2026-10-13-origami-fold-trials/models/in-progress/kimono.osf) | 7 | F013: connected sleeve collapse. |
| [Lantern](../2026-10-13-origami-fold-trials/models/in-progress/lantern.osf) | 4 | F018: coupled swivel opening; direct squash was not the source operation. |
| [Necktie](../2026-10-13-origami-fold-trials/models/in-progress/necktie.osf) | 4 | F010: lower body while preserving upright back flap. |
| [Pajarita](../2026-10-13-origami-fold-trials/models/in-progress/pajarita.osf) | 7 | F021: quarter-fold swivel and crease mapping. |
| [Parrot](../2026-10-13-origami-fold-trials/models/in-progress/parrot.osf) | 5 | F016: connected wing collapse. |
| [Shirt](../2026-10-13-origami-fold-trials/models/in-progress/shirt.osf) | 6 | F022: sleeve opening/hinge preparation. |
| [Paper Envelope](../2026-10-13-origami-fold-trials/models/in-progress/paper-envelope.osf) | 7 | F005: folded-edge swivel mapping. |
| [4-pointed Star](../2026-10-13-origami-fold-trials/models/in-progress/4-pointed-star.osf) | 14 | F026: first packet swivel across an existing folded junction. |
| [Camellia](../2026-10-13-origami-fold-trials/models/in-progress/camellia.osf) | 6 | F027: squash after reverse closure. |
| [Chicken](../2026-10-13-origami-fold-trials/models/in-progress/chicken.osf) | 9 | F028: wing squash and ambiguous source pinch landmark. |

Dove adds a seventeenth investigation, but its six-node prefix must first pass a visual/material audit. Source-6 reverse attempts currently give `reverse_tip_not_free` or `reverse_kind_infeasible`; correct packet selection remains unresolved.

### Workflow improvements, not hard folding blockers

- **F006:** show and edit saved source-step references and authored notes in Fold’s strip/cards/inspector. The notes already persist; the UI displays generated descriptions. Batch mapping tables provide a temporary audit workaround.
- **F019:** make squash selection resolve the connected coplanar layer across flat precreases. Bird currently succeeds from a pick near the spine and fails from another subface of the same pocket. A normal canvas-pick workaround exists.

### Remaining campaign and acceptance work

1. Finish Dove’s prefix audit and reverse investigation, then continue **Dragonfly, Eagle, Elephant Head, and Envelope**. Preserve difficulty order, then process remaining Easy, Challenging Easy, and Low-Intermediate entries.
2. Review all 79 remaining full tutorials and diagrams before classifying them. Record required cuts, multi-sheet assembly, and non-flat finishes as exclusions, without substituting alternate tutorials or silently counting variants.
3. Revisit Wallet only when the full source becomes publicly available or authorized reference content is supplied. No engine requirement can be inferred from the inaccessible steps.
4. For each eligible completion, save all public-operation choices and source notes; freshly replay every state; open it in Fold; compare intermediate geometry, exposed paper sides, and internal layer order against the source. Resolve user feedback before marking audited.
5. Report each five completed designs with native/source/report links. Mixed review checkpoints, blocked prefixes, and exclusions do not count toward that five. Batch 4 still has one completion: Penguin.

## Excluded requirements retained as evidence

**F011 (all required cuts) and F024 (all multi-sheet assembly) are out of scope by explicit user instruction on 2026-10-14.** They are not work needed for this campaign.

The seven newly cut-excluded entries are Rectangle to Square, Goldfish, Horse, Rectangle to Hexagon, Square to Pentagon, Crab, and Dolphin. Devilish Heart was already excluded for required 3D completion and also requires a cut; it is counted once. Ninja Star is excluded for multi-sheet assembly even though the finished model is flat. Other already-3D exclusions retain that primary status.

Goldfish’s F025 and Crab’s F029 investigations remain available as evidence but are no longer active completion blockers. Dolphin’s F012 evidence remains relevant to the in-scope Whale. The retained modules and prefixes must not be deleted or regenerated over user edits.

## Validation for this reconciliation

Research/ledger changes only; no engine or product code changed. Regenerated the progress table from `catalog.json`, parsed all evidence/native JSON, replayed all individual models, checked every catalog model/report link, and ran `git diff --check`. Broad Rust/web tests are unnecessary for these documentation and read-only reconciliation changes. Existing Heart/Cicada user edits are preserved.

## File organization

All 53 native projects were subsequently consolidated into the [models library](../2026-10-13-origami-fold-trials/models/README.md). The 42 current models are grouped by status; the 11 historical prototypes/checkpoints/bundles are archived separately. [Move manifest with original hashes](batches/models-reorganization-2026-10-14.json). This reorganization changes no native file contents or completion status.
