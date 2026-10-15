# Whale completion after the rabbit-ear fix

## Outcome

[Whale — editable native Fold file](../../2026-10-13-origami-fold-trials/models/completed/whale.osf) completes all ten instructions in the [source tutorial](https://origami.me/whale/). It is **ready for user audit**, not user-approved. The file opens directly in Fold and retains 20 operation nodes: 15 numbered folds and five rotations/turnovers. All 21 states, including the initial sheet, were replayed and visually checked in Fold.

The only recorded F012 designs were Whale and Dolphin. Whale was the only eligible completion target. [Dolphin](https://origami.me/dolphin/) still requires a slit in source 11 and remains excluded under the user's no-cuts scope. Its native prefix is unchanged, and its resolved rabbit-ear reproduction remains in [implementation evidence](rabbit-ear-precreases-2026-10-14.json). No recorded in-scope design remains blocked on F012. This is a focused completion checkpoint, not a claim that another five-design batch is finished.

## Source mapping

| Tutorial instruction | Native nodes | Fold step numbers | Check |
| --- | --- | --- | --- |
| Setup / 1 | 1–2 | rotation, 1 | White diamond; vertical diagonal precrease. |
| 2 | 3 | 2 | Horizontal diagonal precrease. |
| 3 | 4–5 | 3–4 | Both lower edge-to-center precreases. |
| 4 | 6–7 | 5–6 | Both upper edge-to-center precreases. |
| 5 | 8–9 | 7–8 | Two rabbit ears reuse the source precreases; both fin tips point upward. |
| 6 | 10–11 | 9, turnover | Top point folds behind to ear-tip height; turn exposes the plain colored face and small head triangle. |
| 7 | 12–13 | 10–11 | Symmetric corners fold inward, keeping their tips on the horizontal crease. |
| 8 | 14–15 | 12, rotation | Right half folds left; quarter-turn places the head left and tail right. |
| 9 | 16–19 | 13, turnover, 14, turnover | Each two-ply fin folds independently; returns to the source viewing side. |
| 10 | 20 | 15 | All four tail plies mountain-fold behind to form the upright tail. |

The final tail uses the tutorial's ordinary mountain-fold option. Its optional outside reverse is not required for completion. No drawn eye or decoration was added.

## Proportions and layer evidence

The source supplies approximate shaping, not exact measurements. Saved notes record symmetric corner creases at x=±(√2−1)/2, fin hinges at 60° to the horizontal, and a 45° tail crease crossing the upper edge at x=−0.15. These choices were compared with all eleven source diagrams. They are explicit authoring choices, not claimed measurements of the tutorial.

[Material checks](whale.material-checks.json) verify more than the silhouette:

- Each fin fold reverses exactly its two exposed plies onto the body. All underlying material at the original fin witness remains in place and in the same order.
- Complete head and tail-body stacks stay unchanged during both fin folds.
- The tail fold reverses all four plies together, while the head and fin overlap stacks remain unchanged.
- Every exposed subface is colored from the finished fish base onward. The final reverse viewing side is also entirely colored.

## Persistence and preservation

[Recipe](../whale-completion.mjs), [operation log](whale.operations.json), and [validation manifest](whale.validation.json) retain the public operations, original-sheet anchors, source notes, and canonical replay hashes. Every node uses an existing Fold UI operation: precrease, rabbit ear, mountain/valley fold with layer depth, rotation, or turnover. No CP import, fabricated mesh, or engine bypass was used.

The original seven-node [Whale prefix](../../2026-10-13-origami-fold-trials/models/archive/checkpoints/whale-before-rabbit-ear.osf) was archived before publishing. Hash checks prevent regeneration over user edits. The completed file moved from `in-progress/` to `completed/`; catalog, manifest, model-library index, and progress table now use the new location. Heart, Cicada, Dolphin, and every other native model were left unchanged.

Fresh reconciliation: 42 current native models, 525 nodes, 567 states; zero replay failures or recorded hash mismatches. [Results](reconciliation-2026-10-14.json). The archive adds one historical checkpoint; it is not another completed design.

Browser review opened the saved native file through the normal project reader, verified its Fold landing, and inspected every state. [Final Fold view](../../../artifacts/whale-completion/whale-completed.jpg); per-node screenshots are retained locally under `artifacts/whale-completion/`.

No engine/UI source changed in this completion pass. Validation covers the actual saved sequence, material order, browser rendering, fresh replay of the full model library, and whitespace checks; unrelated application build and port/oracle suites were not rerun.

## Recommended next feature

**F014: bounded precrease/reversal along an existing crease.** Witch Hat source 7 needs to reverse only the central portion of a precrease, leaving the outer wings unchanged. The current operation adds a partial mark only when it splits a face; a crease already lies on face boundaries, so the exact valid request refuses `extent_misses_layers`.

The [fresh recheck](witch-hat-recheck-2026-10-14.json) reproduces that refusal after the rabbit-ear implementation and confirms that the same segment succeeds on an uncreased control. Implement reuse/segmenting of the existing crease with preserved material identity and direction history, then verify that no marks spill into the wings and that the native sequence saves/replays through Fold. Keep rejection for segments genuinely outside the selected material.

This would unblock Witch Hat source 7. Its subsequent coordinated brim collapse still needs authoring and audit; the feature alone is not a promise of full Witch Hat completion. Other compound failures remain investigations until their input geometry and layer selections are established. Cuts, multi-sheet assembly, and non-flat behavior remain outside scope.
