# Pumpkin completion — 2026-10-14

[Native Fold project](../../2026-10-13-origami-fold-trials/models/completed/pumpkin.osf) · [Source tutorial](https://origami.me/pumpkin/) · [Recipe](../pumpkin-completion.mjs)

All 18 instructions, 20 diagrams and two completed photographs were reviewed. The tutorial explicitly permits a flat endpoint; the optional standing arrangement is omitted. The finished native has 25 nodes, 23 numbered folds and 26 saved states. Fresh replay reproduces every canonical state. All states were opened and compared in Fold, including the intermediate exposed paper sides and the back before the final turn. Status: **ready for user audit**, not user-approved. Pumpkin is the fourth completion in the current five-completion batch, after Penguin, Whale and Crow.

## Material and layer choices

Source 6 releases the left corner from its pleat. Ordinary unfold requests either recruit the whole pleat or move the body; those exact requests remain in [untuck attempts](pumpkin-untuck-attempts.json), and are not treated as proof of an engine gap. A public CP import instead flattens only two internal corner creases. Of seven flat layer orders, order 6 alone preserves body order and places the released corner above it: 12 material positions, 57 stationary-order witnesses and five exposed-tip witnesses pass. [Checks](pumpkin-source6-control-checks.json).

Source 9 repeats the operation on the right with the same material criteria. [Control and all candidate checks](pumpkin-right-untuck-control.json). Ordinary unfolds and refolds then match sources 7–9.

Source 13 is a prepared four-ray stem collapse. Its three prescribed rays form a 90° sector, rather than a nondegenerate triangular rabbit-ear incenter. The attempted legacy free-vertex operation refuses `fan_center`; that legacy signature is also not the current UI tool surface. [Exact diagnostic](pumpkin-stem-fan-probe.json). No missing generalized fan feature is inferred.

The saved CP produces two flat orders. Both pass 19 material/face-side checks and 51 stationary-order checks. The distinguishing overlap is at normalized view coordinate (7/12, 19/48): order 0 has the newly collapsed stem pieces above both stationary right-corner layers, as the illustrated lifted-and-flattened flap requires; order 1 puts those pieces underneath. Order 0 is retained. [Checks](pumpkin-stem-material-checks.json). The final visible cells independently check colored body below the shoulder and reverse-colored stem above it.

## Editable CP checkpoints

All three CP jumps use the public Fold **Import CP** file path and save their complete snapshots and selected layer orders. The remaining folds are ordinary editable operations. These are imported snapshots, not links to a live project CP. Supporting source files are [left untuck](pumpkin-left.fold), [right untuck](pumpkin-right.fold), and [stem](pumpkin-stem.fold); [serialized choices](pumpkin-cp-checkpoints.json) are part of the recipe.

The importer currently omits flat/unfolded crease marks from the imported scene. The checkpoint sources explicitly classify those edges as `F`, rather than exported `U` (which import treats as an unknown folded assignment). This does not alter the material transforms or endpoint order, but some reference-only crease marks disappear after a jump. The ordinary source-11/12 precreases are retained in earlier timeline states. This limitation is recorded separately from a missing folding primitive.

Source 2's short center pinch is an explicit 6% mark. Later fold proportions use the illustrated edge/crease intersections. Broad engine/UI tests were not run because this continuation changes only research models, recipes and reports. [Replay manifest](pumpkin.validation.json), [operations](pumpkin.operations.json), and [precrease stack checks](pumpkin-precrease-checks.json) retain the evidence.
