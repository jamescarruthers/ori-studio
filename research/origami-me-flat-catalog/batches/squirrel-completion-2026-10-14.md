# Squirrel completion — 2026-10-14

**Update:** [Direct reverse/crimp implementation and migrated native files](direct-compound-priorities-2026-10-14.md). The findings below describe the earlier checkpoint.

[Native Fold project](../../2026-10-13-origami-fold-trials/models/completed/squirrel.osf) · [Source tutorial](https://origami.me/squirrel/) · [Recipe](../squirrel-completion.mjs)

All 26 instructions, 27 diagrams and the completed photograph were reviewed. The basic tutorial ends in a flat single-sheet squirrel; its optional more advanced tail treatment is not required. The native sequence has **34 nodes, 29 numbered folds and 35 states**, all fresh-replayed and visually checked in Fold. Status: **ready for user audit**. This is completion five in the current batch, following Penguin, Whale, Crow and Pumpkin.

## Source correspondence

| Source | Saved nodes | Fold behavior |
| --- | --- | --- |
| Setup, 1–5 | 1–8 | Diamond, kite, two corner precreases and inside reverses |
| 6–9 | 9–14 | Front corner reversals and raised flaps on both sides |
| 10–15 | 15–20 | Half fold, rotation and four head/neck precreases |
| 16 | 21 (Fold 19) | Saved CP collapse of the prepared neck crimp |
| 17–20 | 22–25 | Head reverse, outward nose reverse, snout precrease and reverse |
| 21–23 | 26–30 | Short pinch, front/back arms, two presentation turns |
| 24–26 | 31–34 | Raised tail, presentation rotation and two shaping folds |

The source-19 snout length, source-24 tail angle and final shaping lack exact diagram measurements. The recipe records the chosen snout setback, 60° tail hinge, and final free-line coordinates. These choices retain the intended white head, colored body, two arms and folded tail tip. Audit proportions against the reference; no claim of exact tracing is made.

## Neck crimp and retained failure

The prepared crimp hinges meet exactly at the packet boundary. The public inside-crimp operation refuses `crimp_lines_meet`; [exact request](squirrel-crimp16-attempt.json). The guard limitation is F039. A decomposition through the first reverse was also explored with all three available openings. The second reverse does not accept the nested arrangement under the tested inside/outside choices. [First reverse probes](squirrel-crimp-decomposition-probes.json), [second reverse probes](squirrel-crimp-second-probes.json), [paired requests](squirrel-crimp-pair-probes.json).

A public Import CP control completes the same flat motion. It keeps the first reverse hinges, assigns opposite second-reverse hinges by original material side, and restores the original central spine assignment inside the doubly reversed tip. Unused precreases are explicitly F. The correct assignment has a unique valid order; the opposite assignment does not. [Full control](squirrel-cp-crimp-controls.json), [source CP](squirrel-neck.fold), [saved checkpoint](squirrel-neck-cp-checkpoint.json).

The source-16 CP snapshot is an ordinary editable Import CP node with its chosen order saved. It is not a live project-CP link. No guard was changed. CP import omits unused F reference marks from subsequent scenes; their preparation remains visible earlier in the timeline. This does not change the checked material or layers.

## Verification and corrected authoring

The [material checks](squirrel-material-checks.json) and [reproducible checker](../squirrel-checks.mjs) verify:

- All 11 precreases retain the complete material stacks (225 sampled witnesses).
- All seven direct reverses reflect the intended original-sheet pieces, flip the correct side, and retain their pocket-wall ordering (109 material and 43 pocket-order witnesses).
- The CP crimp matches the intended two reflections, including the narrow neck band that moves once: 20 material witnesses and 17 stationary-order witnesses, with one solver order.
- The front-arm pinch lands on the existing vertical reference exactly.

The source-18 reverse must select one flap depth; selecting all layers recruits body material. The initial source-21 bisector sign was also corrected before publication. Both are authoring mistakes, not additional engine gaps. Every corrected state was reviewed in Fold. Final tail shape is explicitly approximate, as in the source.

[Replay manifest](squirrel.validation.json) · [Operation log](squirrel.operations.json) · [Fold screenshot](squirrel-ready-for-audit.png). Broad application tests were unnecessary for research-only changes; existing engine/UI work was preserved.
