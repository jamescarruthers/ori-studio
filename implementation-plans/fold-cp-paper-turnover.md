# Fold crease-pattern paper colors and turnover

## Goal

Draw the Fold workspace's crease-pattern sheet in its paper style's front/back
colors and let the user turn it over left to right to inspect the back, with
mountain and valley creases reversed.

## Approach

Use the renderer's existing sheet-fill channel beneath the crease strokes.
Keep the CP side as view state, independent of the folding sequence's Turn over
step and starting side. Mirror the pane's model-to-screen transform about the
sheet's horizontal midpoint so picking, hover and tool overlays stay aligned.
Reverse M/V appearance for both ordinary and instruction creases, retaining
Edit's line styles and widths. Compose the existing viewport toolbar control
on desktop and its overflow menu on phones; record an enum-only analytics event.

## Affected Areas

- `apps/web/src/fold/canvas/`: CP paper geometry, side, and stroke appearance.
- `apps/web/src/components/fold/canvas/`: pane rendering and toolbar wiring.
- Fold Paper help text, localization, and central analytics.
- Focused rendering, interaction and toolbar regression tests.

## Checklist

- [x] Inspect repository guidance, paper rendering, camera/picking and toolbar patterns.
- [x] Bootstrap this worktree and create a feature branch.
- [x] Implement sheet colors, horizontal turnover, and reversed M/V presentation.
- [x] Add toolbar access, help text, localization and analytics.
- [x] Test asymmetric sheets, reverse creases, picking/overlays, and repeat turnover.
- [x] Run web lint, typecheck, unit tests, i18n checks and browser verification.
- [x] Open a draft PR against main and leave a local testing server running.

Draft PR: https://github.com/zacharyfmarion/ori-studio/pull/544.

Browser verification in Chromium covered custom front/back colors on the
pleat-in-eighths fixture, reversed M/V appearance, return to front without a
document change, and back-side snapping (the displayed upper-left corner
selects sheet point `[1, 1]`). Light and dark themes and the touch-phone
overflow menu were inspected, with no page errors. Screenshots are under the
ignored `artifacts/fold-cp-*.png` paths. The server is at
`http://localhost:5371`, started with `scripts/dev-server.sh`.

Validation passed: web lint, web typecheck, i18n check, `git diff --check`,
and the complete web unit suite (1,260 passing files; 16,154 passing tests,
one expected failure and 21 skipped tests). New coverage checks polygon
fills, back-side camera/pointer coordinates, M/V inks and dash patterns,
instruction creases, desktop and phone controls, unchanged sequence data,
and the enum-only analytics event.

The worktree bootstrap copied stale generated dependencies, so the full
`npm run typecheck:web` prehook rebuilt the simulator and every WASM bridge
before validation. Node 26's native `localStorage` shadows jsdom's storage;
the unit suite runs with `NODE_OPTIONS=--no-experimental-webstorage` (the
repository's CI uses Node 22). No source workaround was needed.

Rust workspace/oracle tests and native desktop checks are out of scope: this
change is shared frontend presentation and view state, with no engine,
file-format or shell changes. Production bundling is unchanged, so a web
production build is unnecessary.
