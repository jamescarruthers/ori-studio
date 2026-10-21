# Fold regressions

Ori Studio projects (`.osf`) that reproduce a Fold workspace bug, each the
smallest sequence that showed it. They are built from scratch, never copied
from anyone's project. Each section below says how its file was made, what
went wrong, and which test opens it.

## independent-sides-orders.osf

A square, five valley folds, each made with axiom 2 (point onto point), each
moving only the flap at its seed:

1. The bottom-left corner onto (5/8, 1/4).
2. That flap's point (1/4, 0) onto (9/16, 1/8): the flap's edge folded back,
   so the bottom left holds two flaps.
3. The top-right corner onto (3/4, 3/8): step 1 mirrored across x + y = 1.
4. That flap's point (1, 3/4) onto (7/8, 7/16): step 2 mirrored.
5. The bottom-right corner onto (9/16, 7/16), along x - y = 9/16, which the
   mirror keeps. The corner lands across both sides.

Steps 1 to 4 each land one way. Step 5 has two independent parts, one per
side, of three orders each: the corner under both of that side's flaps,
between them, or on top. Nine orders in all.

The chooser before the solved listing (the recipe search, run to the end)
listed six of them and missed three: bottom left under with top right on top,
both sides between, and bottom left between with top right on top. The file
saves step 5 in the order with both sides between, as a `solved` landing.

It was built by a script over the engine (not through the tools) on
2026-10-21; the old count comes from the bridge built at `eafc5786e`, the
last commit before the solved listing.
`apps/web/src/fold/orders/independentSidesOrders.wasm.test.ts`
opens it as the app reads a project, lists step 5's orders (all nine, exact,
by the solver), saves each in place of step 5, writes and reads the project
and replays it to that order, and checks the saved order is among them with
both sides between.
