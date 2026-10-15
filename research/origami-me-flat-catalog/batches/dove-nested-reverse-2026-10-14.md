# Dove nested reverse investigation — 2026-10-14

**Update:** [Direct reverse/crimp implementation and migrated native files](direct-compound-priorities-2026-10-14.md). The findings below describe the earlier checkpoint.

[Source tutorial](https://origami.me/dove/) · [verified native prefix](../../2026-10-13-origami-fold-trials/models/in-progress/dove.osf) · [diagnostic CP control](../../2026-10-13-origami-fold-trials/models/archive/diagnostics/dove-source6-cp-control.osf)

The canonical Dove remains unchanged through source 5 / Fold 5 (six nodes including setup rotation). All seven states now have a visual audit in the normal Fold workspace and replay identically. Source 1's prose says unfold, but diagrams 1–2 require the retained triangle; the saved note records that choice. All 16 source instructions and their diagrams were reviewed; optional spatial tail styling is excluded.

## Source 6 finding

The front folded triangle contains two nested material pairs. The right tip has view-space order `[11,15,17,13]`; its stationary body order is `[12,16,18,14,4,6]`. These are engine lineage IDs, not screen positions. The fold is the vertical precrease at view `x=sqrt(0.5)/4`.

- One outer pair: `reverse_tip_not_free`, because the inner pair blocks it.
- Both pairs (depth 2): the analysis finds all four intended tip pieces and a central opening for each pair, but application refuses `reverse_kind_infeasible`.
- All-layer selection additionally includes the rear body and is not the desired fold.

[Exact public requests, analyses and refusals](dove-nested-reverse-attempts.json).

## Independent flat control

Export the actual source-5 CP, retain its vertex and edge geometry, reverse both existing tip spines, and assign M/M/V/V to the four tip precreases. Public `import_cp` / `import_pick` finds four flat orders. Order 0 reorders stationary layers and is rejected as a continuation. Order 2 preserves all stationary material and puts the reversed packet in its correct nested pockets.

At the overlap witness, the result is `[12,16,15,11,13,17,18,14,4,6]`. In particular the moving packet order changes from `[11,15 | 17,13]` to `[15,11 | 13,17]`. Both halves reverse together. Each pair remains inside its own stationary walls.

[Exact saved CP operation and resulting scene](dove-nested-reverse-cp-control.json) · [checks and replay hashes](dove-nested-reverse-verification.json).

Checks passed: 34 original-sheet material witnesses (intended reflection or stationary pose, plus physical paper side), five stationary-order cells, the full nested packet overlap, and fresh replay of all eight control states. The Fold rendering matches source 7, including the concealed tip and exposed front trapezoid. This control is an explicitly labeled research artifact, not an unverified continuation in the canonical model.

## Implementation implication

`compound/reverse.rs::Tip::prepare` gives each material flap separate upper/lower motion blocks and sets `Across::Keep`. The needed order changes are between blocks belonging to different flaps, so this direct request is ruled out despite a valid flat state. F030 is a confirmed limitation for coupled nested packet reversals. It is not evidence for weakening the flat solver or removing contact guards. Grouping the two packet halves must retain pocket contacts and material continuity. A decomposed authoring path has not been established, and source 7 onward has not been authored.

No engine or UI source changed. The canonical Dove and all other existing native files were preserved during this investigation.
