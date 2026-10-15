# Envelope prefix — 2026-10-14

[Native Fold project](../../2026-10-13-origami-fold-trials/models/in-progress/envelope.osf) · [source tutorial](https://origami.me/envelope/) · [recipe](../envelope-prefix.mjs) · [replay manifest](envelope.validation.json)

The current Keiji Kitamura tutorial is eligible: single square, no cuts or assembly, flat locking envelope. All 24 instructions, 27 diagrams and completed photographs were reviewed. The source-14 demonstration video was also reviewed to distinguish the hidden flap from the visible lower panel.

The native file is verified through **source 13 / Fold 18**, with 20 editable nodes including two rotations. All 21 states replay identically and were inspected in the normal Fold workspace. Source numbering is retained in the saved notes. The source-4 pinch width is a chosen 0.1 normalized units; all fold positions follow the source's halves/quarters/eighths.

Precrease checks preserve the complete original-sheet material stack. After undoing source 6–8, the geometry, paper sides and full stacks match the source-5 state despite the extra crease subdivisions. Seven checks cover 157 stack witnesses. [Material checks](envelope-material-checks.json) · [normal Fold view](envelope-source13-fold.png).

## Source 14 investigation (F034)

The left hidden triangular flap must move to the right while the surrounding lower body returns to its current position. A plain valley/mountain operation on the vertical line carries additional connected body pieces and adds six crease pieces; it is not the source action. Picking the existing crease does not change that result. The inside/outside reverse attempt on the intended hidden material pair `[29,40]` refuses `reverse_no_opening` with cause `no_body`.

The video temporarily opens the surrounding structure. A valid decomposition through those temporary folds has not been established. These outcomes are **authoring/compound evidence, not a confirmed missing primitive**. Do not propose a general layer-order override, remove guards, or append a silhouette-only candidate. Source 15–24 are unattempted.

Exact evidence: [plain folds](envelope-hidden-fold-attempts.json), [existing-crease folds](envelope-existing-crease-attempts.json), [reverse attempts](envelope-reverse-attempts.json), [last valid scene](envelope-source13-state.json). Diagnostic attempts with an `extent` attached to a valley/mountain operation were discarded: that wire field is supported only for precreases, so those were authoring errors and are not evidence for missing functionality. Boundary/junction picks during the source-9 unfolds were likewise corrected to interior witnesses.

The native file contains only the verified prefix. Generation is artifact-only by default; `--publish` uses the existing file hash guard to protect user edits. No engine/UI source changed, and all previously existing native files were hash-checked unchanged during publication.
