# Flat-fold functionality findings

This is an evidence log, not a list of features inferred from design names. New work stays 2D. No new engine gap has yet been confirmed by the expanded campaign.

| ID | State / category | Design and evidence | Requirement / acceptance condition |
| --- | --- | --- | --- |
| F001 | Resolved locally — operation and UI | [Swan](https://origami.me/swan/), [prior report](../2026-10-13-origami-fold-trials/REPORT.md) | Explicit outside reverse folds for neck and head, including the UI choice; do not replace with inside reverse. Re-audit visually when touched. |
| F002 | Resolved locally — operation and UI | [Heart](https://origami.me/heart/), step 8; prior report and native acceptance fixtures | Tuck beneath multiple stationary layers with saved, replayable target choices. |
| F003 | Corrected authoring error — regression retained | Heart step 8; [corrected view](../2026-10-13-origami-fold-trials/heart-tuck-corrected-workspace.jpg), `tests/fixtures/fold-design-completion/heart-tuck-layer-order.json` | Choose the valid order exposing the lowered flap over the original lower triangle. Do not use `candidates[0]` as a correctness criterion. Material witnesses must match the diagram. This is not an outstanding missing primitive. |
| F004 | Resolved locally — saving workflow | Original five trials; prior report | Native `.osf` must reopen in Fold with the editable sequence and choices. A rendered `.fold` in Edit does not meet the requirement. |
| F005 | Investigation retained — not a campaign blocker yet | [Prior compound probes](../2026-10-13-origami-fold-trials/compound-probes.json), `swivel_fold_wide` / `fan_ray_blocked` | Retain conservative guards. Establish whether a particular eligible tutorial actually requires an unsupported wide swivel before specifying implementation. No blanket swivel-parity claim. |

## New finding template

For each finding record: source URL and instruction number; desired fold and paper layers; native file and last valid node; exact operation/choices or UI actions; actual result/refusal; expected visible material and geometry; classification (confirmed engine gap / UI gap / authoring error / ambiguous source / access blocker); workaround fidelity; proposed acceptance check; affected models; resolution and user audit history.

## Excluded scope

Non-flat simulation, inflated bodies, curved shaping, standing box walls, and 3D assembly are intentionally outside this campaign. They are not implementation requests. Keep the affected tutorials in the catalog with the reason for exclusion.

## F006 — Saved source notes are not visible in the Fold audit UI

**Confirmed UI/workflow gap; open.** Both batch-1 files have an instruction reference and custom note on every saved node. The Fold strip, Steps cards, and Step inspector instead display generated fold descriptions. For example, Cat Face's source instruction 7 appears as Fold step 9, described only as a valley tuck. Inspection of `apps/web/src/fold/sequence/` and `components/fold/` confirms that the note is serialized but not consumed by these presentation surfaces.

**Needed:** display/edit a node's authored note and expose source instruction grouping/reference alongside Ori Studio's operation count. Keep turns, paired folds, and source numbers distinguishable. Acceptance: opening either batch-1 native file shows the saved source instruction reference and note on the corresponding step; save/reopen preserves edits. Do not change geometry or pretend source step numbers equal engine node indexes.

**Current workaround:** [batch-1 mapping table](batches/001.md). This is useful for audit, but not a missing primitive required to fold a design.

## F007 — Cat Face target and seed selection

**Resolved authoring investigation; no engine implementation requested.** An all-layer crown fold clipped the ears, a boundary seed was invalid, and choosing the exposed muzzle as the tuck target produced `tuck_infeasible`. The corrected depth seed and pocket support target complete the model using existing operations. Evidence and reproducible native state are in [batch 1](batches/001.md). Preserve this case for usability evaluation, but do not count the rejected inputs as unsupported flat folding.

## F008 — Bookmark pocket depth is not determined by the exposed face

**Resolved authoring investigation; no engine change needed.** Source: [Bookmark](https://origami.me/bookmark/), instruction 10. The initial outer-wall target was infeasible. Targeting the next wall gives a unique valid tuck between the original folded-corner pocket walls. A different feasible target inserts the same flap deeper and preserves both the silhouette and exposed material, so front-only checks are insufficient.

[Batch 2](batches/002.md) retains the last valid native state, exact rejected and accepted requests, and a valid-but-wrong deeper placement. Acceptance checks compare both complete pocket stacks: old depths 0–1 stay above the inserted layers, and old depths 2–5 stay below them. Four exposed material points must also remain unchanged. This extends the audit method; it is not a request to disallow intentionally deeper tucks.

## F009 — Dog body fold under the head flap

**Blocked authoring/compound-operation investigation; not a confirmed engine gap.** Source: [Dog](https://origami.me/dog/), instruction 13, with dependent head lowering in 14. The editable [partial model](models/dog.osf) stops at native node 15, source 12. Source 15 is also unattempted.

The required body fold must leave the overlying head flap available while its upper part passes underneath, on both sides of the model. A depth-one valley request includes that head paper in its connected moving block; the tuck version refuses `tuck_target_moves`, face 24. A tentative folded-edge swivel request refuses `swivel_not_a_fold`, which means the crease selection is not yet validated. [Inputs/results](batches/dog-step13-probe.json), [analysis/swivel attempt](batches/dog-step13-analysis.json), [recipe/probe](dog-step13-probe.mjs).

Before implementation is proposed, resolve the correct layer anchors and local crease arrangement, including whether source steps 13–14 form one compound flat transition. Test existing reverse/swivel operations with those verified inputs. A successful completion must preserve the source's head-flap layering, remove the exposed white body region in the intended way, and retain an editable replay through the final flat profile. No silhouette-only workaround was saved. Do not expand scope to 3D or weaken guards.

Related source ambiguity: source-12 text specifies a quarter turn but diagram 13 shows a 45° orientation. The file follows the diagram. A corner seed refusal in source 11 was separately corrected by an interior depth seed; it is not the blocker.
