# Heart Card prefix — 2026-10-14

[Source](https://origami.me/heart-card-2/) · [native Fold file](../../2026-10-13-origami-fold-trials/models/in-progress/heart-card-2.osf) · [recipe](../heart-card-prefix.mjs)

All 18 instructions, 19 diagrams and the completed photograph were reviewed. This is a flat, single-sheet model starting from a supplied 1:2 rectangle. No cutting operation is required by its numbered folding sequence; suggested preparation by cutting a square is not part of the authored model.

The verified file reaches **source 13 / Fold 17**, with 20 nodes and 21 states. Every state opens and was visually compared in Fold. Fresh replay matches every state hash. Ninety-nine material-stack witnesses check seven precreases and the source-3 unfolding against its original uncreased pose. The front/back side and hem exposure match through both corner reversals and book folds. Both reverse folds have a unique feasible opening.

## Corrected authoring

Source 6 is a simultaneous pleat with V/M letters on the initial sheet. After executing its first valley, the second crease is seen from the opposite face and is also a **valley in the current view**. An early mountain request moved the body and produced an invalid prefix. Those discarded probes are not engine-gap evidence; no such operation appears in the published file. Likewise, an initial rectangle-coordinate error in a separate bookmark attempt was corrected before publishing.

## Source 14: endpoint swivel

The diagram swings the left colored square above the card and leaves a connecting colored triangle below it. Its visible square is normalized x=0.25…0.5, y=0.75…1. The attempted folded-edge swivel places the bisector at the endpoint of the vertical fold. The bridge refuses `swivel_misses_fold`; the corresponding free-pivot request refuses `swivel_edge_short`. The operation's current on-fold implementation requires a crossing inside a crease run. A direct inside-reverse request is feasible but only reverses the corner, and does not by itself produce the required square position. A simple unfold also recruits the large stationary body, so it was rejected as a continuation.

[F035 exact folded-edge attempts](heart-card-swivel-attempts.json), [free-pivot attempts](heart-card-swivel-free-attempts.json), [reverse analysis](heart-card-reverse14-attempts.json), [unfold results](heart-card-unfold14-attempts.json). These are **authoring/compound investigations**, not proof that the correct swivel is impossible. Confirm the material movement and a valid CP or decomposed sequence before specifying endpoint-swivel support. Sources 14–18 are not completed.

[Replay manifest](heart-card-2.validation.json) · [saved operations](heart-card-2.operations.json) · [material checks](heart-card-material-checks.json). Publishing is explicit and refuses to overwrite a user-edited native file. No engine or UI source changed.
