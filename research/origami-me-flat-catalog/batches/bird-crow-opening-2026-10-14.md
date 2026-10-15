# Bird and Crow: shared opening resolved

2026-10-14. F020 is a **corrected authoring/decomposition issue**, not a missing engine operation. No engine or UI code changed. Source-note UI work (F006) is deferred at the user's request.

## Result and audit files

| Model | Verified through tutorial | Fold cursor | Native file |
| --- | --- | --- | --- |
| [Bird tutorial](https://origami.me/bird/) | 11: second petal / completed bird base | 20 (24 nodes) | [Bird](../../2026-10-13-origami-fold-trials/models/in-progress/bird.osf) |
| [Crow tutorial](https://origami.me/crow/) | 9: repeat petal / completed bird base | 20 (24 nodes) | [Crow](../../2026-10-13-origami-fold-trials/models/in-progress/crow.osf) |

Both remain unfinished designs, with verified prefixes ready for user audit. They are now **in progress**, not blocked on source 7. Completion count remains 13. Original 14-node files are retained unchanged in `models/archive/checkpoints/{bird,crow}-before-opening.osf`. All other native files, including Heart and Cicada, were hash checked and remain unchanged.

## Cause and correct construction

The static source-7 diagram shows the two kite sides opening under a lowered top triangle. The original attempt tried to unfold a side while that triangle was still locked down, which correctly included a larger connected packet. Merely changing the depth seed cannot remove those material connections.

The [source-7 video](https://videos.files.wordpress.com/ihkPXhUR/origami-crow-paper-fold-step-7_mp4_hd.mp4) shows the missing motion: lift the top triangle, release the two side flaps, and lower the triangle again. The native sequence now records those four flat operations, reaching precisely the next diagram's endpoint. Source 7 is Fold steps **12–15**, with the matched endpoint at **15**.

The first petal also needs the hinge released. Calling Petal while the triangle covers it is refused with `squash_flap_covered`; that guard is appropriate for the existing operation. The [source-8 video](https://videos.files.wordpress.com/FGg5qNUD/origami-crow-paper-fold-step-8_mp4_hd.mp4) moves the triangle with the opening. Our flat decomposition opens the triangle first, then uses the existing Petal operation. Source 8 is Fold steps **16–17**. The resulting front and reverse match the reference, including the upright triangle visible after turning over in Bird source 10.

Turn over, precrease the other two kite edges, and Petal again to reach the common bird base at Fold **20**. Crow's repeated preparation is represented by the equivalent fold-and-unfold operations before its second petal.

No CP replacement, layer-state injection, alternative silhouette, non-flat state, or engine-guard change was used. Every native step uses public Fold operations already available in the UI.

## Validation

- Fresh replay of **50 states across the two files** passes, with identical canonical fingerprints to the authored states.
- The two models' complete state fingerprints are identical, despite their original source-6 depth/all selection difference.
- Twelve independent material comparisons (140 sampled complete layer stacks) verify the triangle release, square-base recovery, source-7 endpoint, first petal, and second petal. These compare original-sheet anchors, front/back orientation, layer count, and ordered hidden material; they are not silhouette-only checks.
- The source-7 endpoint matches a control that folds only the square base's top triangle. Both petals match independent direct petals from the square base, allowing different subdivisions from remembered precreases.
- Both files open in the normal Fold workspace. Newly added shared intermediate geometry was checked on the Fold canvas; source 7, first petal, reverse side, precreases, and completed base match the reference diagrams. User approval remains pending.
- [Machine-readable verification](bird-crow-opening-2026-10-14.json); [reproduction script](../bird-crow-opening.mjs).
- Local browser evidence: [source 7](../../../artifacts/bird-crow-investigation/bird-source7-fold.png), [first petal](../../../artifacts/bird-crow-investigation/bird-first-petal-fold.png), [completed base](../../../artifacts/bird-crow-investigation/bird-base-fold.png).

Reproduce without writing native files:

```sh
node research/origami-me-flat-catalog/bird-crow-opening.mjs --verify
```

The script uses the preserved source-6 checkpoints once they exist. `--publish` is deliberately guarded against overwriting a changed current file, including its own previously published continuation. App/engine test suites were not rerun: this change only adds research scripts, native sequences, validation evidence, and documentation. The real WASM engine replay and browser checks cover those changes.

## Remaining work

Bird sources 12–17 and Crow sources 10–17 still need completion and audit. Brief exploratory continuations are recorded in [unverified continuation probes](bird-crow-continuation-probes.json), separate from the authoritative native models: Bird's operations through source 13 accepted; Crow reached a foot reverse that requires an explicit opening choice. Those later shapes and choices have not been source/material audited and establish no new engine gap. Continue from the verified base or validate those candidates before promotion.

Next queue: finish Bird and Crow, then audit Dove and continue Dragonfly/Eagle. Neither this investigation nor the blocked/excluded entries count toward the requested five-completed-design report.
