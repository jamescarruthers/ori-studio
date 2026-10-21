# Fold regressions

One small Ori Studio project per bug fixed in the Fold workspace for its
launch (2026-10-21). Each is the shortest fold sequence that showed its bug,
built from scratch: every op written by hand, each axiom's root and each
step's fingerprint the engine's, saved as the app saves a project. None is a
user's model. Every step's `note` says what it folds.

`apps/web/src/fold/document/foldRegressions.wasm.test.ts` opens each file as
the app reads a project, replays every step to its stored fingerprint, and
asserts the fixed behaviour on the replayed states.
`apps/web/src/fold/canvas/foldRegressionFlows.wasm.test.tsx` makes the ghost
precrease through the tools, clicks and all.

- `ghost-precrease.osf`: a precrease of a flap's corner where the corner lies
  on the corner of the layer under it, which shows past the flap. Clicked on
  the folded pane, the corner took the lower layer's sheet point, the first
  the engine lists there, and the precrease was refused as "The point would
  stay put". Fixed by 0d4470484: the folded pane takes the point on the
  paper on top. With it, f187366ad marks on the crease pattern the point a
  click would take, before the click, and 8f0f4488e has the refusal offer
  "Use the point on the moving flap" when that lands.
- `tuck-target-layer.osf`: a mountain fold of a book's top corner tucked into
  its pocket against the back layer, a precrease lying on the fold line and
  splitting that layer. Refused (as "More flaps would move" from the tool,
  `tuck_infeasible` stored). Fixed by 35f40a740 (merge fa3934153), a tuck's
  target is its whole flat layer.
- `squash-covered.osf`: a squash of a triangle whose right corner is folded
  over the hinge. Refused as "The flap is covered". Fixed by d2fd94aab (merge
  ad3e65c0a): paper folded over the upper layer at the hinge rides with it.
- `squash-drawn-hinge.osf`: a squash about a precrease drawn as its hinge, so
  only the tip beyond it squashes. New with c43a92d18 (the engine's
  `Squash::hinge`), bdf246c7c (the step's `hinge`) and b6bde2278 (the tool's
  Hinge choice).
- `edge-crossing.osf`: a flap whose edge crosses the bottom edge and the
  folded edge of the triangle under it at slants, both in view. Neither
  crossing was a point to snap to. Fixed by 602b100b9 (merge 2e493821f): a
  crossing at a flap's edge is a point the viewer sees.
- `repeat-behind-diagonal.osf`: a preliminary base with the front flap's kite
  precreases and petal fold, repeated behind across the diagonal from the
  bottom left corner to the top right. Repeat never offered that diagonal: its
  model map is the identity with every layer pair reversed, and Repeat took
  only a 2D reflection that kept the layer order. It now carries a side and
  repeats behind (`apps/web/src/fold/repeat/repeatBehind.wasm.test.ts`).
- `independent-sides-orders.osf`: a square with two flaps folded in at the
  bottom left (the corner onto (5/8, 1/4), then that flap's point (1/4, 0)
  onto (9/16, 1/8)), the same mirrored at the top right, then the bottom-right
  corner folded along x - y = 9/16, landing across both sides. That last fold
  has two independent parts of three orders each (under both of a side's
  flaps, between them, or on top): nine in all. The chooser built from tuck
  recipes listed six and missed three, among them both sides between, which
  the file saves as a `solved` landing. Built by a script over the engine on
  2026-10-21; fixed by the solved listing (merge of fold-launch/solved-orders).
  `apps/web/src/fold/orders/independentSidesOrders.wasm.test.ts` lists all
  nine, saves each, writes and reads the project and replays it to that order.
