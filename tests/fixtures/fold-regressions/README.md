# Fold regressions

Minimal Ori Studio projects, each built to reproduce one Fold bug that was
fixed, and replayed by a test so it stays fixed.

- `repeat-behind-diagonal.osf` — a preliminary base with the front flap's kite
  precreases and petal fold, repeated behind across the diagonal from the
  bottom left corner to the top right. Repeat never offered that diagonal: its
  model map is the identity with every layer pair reversed, and Repeat took
  only a 2D reflection that kept the layer order. It now carries a side and
  repeats behind (`apps/web/src/fold/repeat/repeatBehind.wasm.test.ts`).
