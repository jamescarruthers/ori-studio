# Folded AUX lines beneath edges

## Goal

Keep folded figures' auxiliary creases above their paper fills and beneath
their edges, including Diagram captures and paper exports.

## Approach

The live flat-fold canvas already inserts AUX between the Oriedita drawer's
fills and edges. The whole-face paper scene currently draws each outline
before its auxiliary creases. Emit a separate outline after AUX for faces
that carry those creases; retain a single filled-and-stroked path when no AUX
needs to go between them. Draw flat outline stretches before solid edges,
including the edges carried by woven-layer patches. Preserve face ordering,
hidden flags, erosion and round outline joins.

## Affected Areas

- `apps/web/src/cp-workspace/folded/foldedFlatScene.ts`
- Folded scene regression tests and browser rendering checks.

## Checklist

- [x] Trace canvas/export consumers and inspect the upstream drawing order.
- [x] Fix whole-face and patch line ordering.
- [x] Verify AUX endpoints, mixed outlines, overlapping layers and woven patches.
- [x] Run web lint, typecheck and tests; inspect browser output (273 focused tests
  and Chromium pixel checks passed).
- [ ] Open a draft PR against `main` and leave the local app available.
