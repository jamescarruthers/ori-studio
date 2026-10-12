# Diagram caption resize

## Goal

On the Diagram's Pages view a step's caption (its text part) can be moved by
hand but not reshaped. A caption is set no wider than its picture (flow:
`captionWidthFor(pw)`, 28–50 mm; grid: `cellW × 0.8`), so a long one wraps into
a tall, narrow block. Zach: "I want to be able to adjust the width and height
of caption bounding boxes as well, not just move them around."

Let the author reshape a caption by its width — grips on its left and right
edges, a Text width row in the Step pane — and by its height in whole lines —
a grip on its bottom edge — while keeping every other step where it is.

## Approach

**One stored number.** `DiagramStepPlace.textWidth` (mm, to a tenth, finite,
above zero) pins the measure the caption's lines are set at. Absent means
automatic. Read and written beside the offsets and the pin; an older build
reads a placement with it as a newer build's (`placeNewer`), as it does any
field it has no name for. Not structure: it is in no page signature, so a
held flow page stays held.

**The layout honours it, and only for its own step.**

- Grid: the caption is set at the pinned width from where the cell starts its
  caption (`x + cellW × 0.1`). The picture, the scale runs and every other
  cell are worked out from the automatic caption, as a pinned picture scale
  leaves its run alone (Decision 3A). A pinned caption is never cut with "…":
  its height is its text's height.
- Flow, held page: the box stays; the caption is set at the pin and keeps its
  left edge where the box's automatic caption starts. The picture's room is
  read from the automatic caption, so the picture never changes with it. The
  caption's own overflow notice reads the pinned lines.
- Flow, packed (Re-pack Page / All Pages, or a structure change): the packer
  takes the pinned measure for that step's caption lines, and for its box
  width the pinned measure plus the side room a picture gets
  (`PICTURE_SIDE_MM`), so the caption stands in its box with the same 2 mm
  either side as an automatic one under its picture.
- Where a box centres a caption (`captionCentreWidth`): the box's automatic
  measure, or — for a pin wider than the automatic cap under a picture wider
  than the cap — the pin, as far as the picture's room. So a pin never moves
  the caption's left edge in a box up to 54 mm wide, never jumps when it is
  first set, and a box packed for a pin always holds it.
- The flow lane follows a placed step only where its frame or picture
  moved or its scale is pinned: the band runs through the picture, so a
  caption or number placed alone — moved, or its width pinned (the left
  grip writes an offset) — leaves the band as it was. Before this, any
  placement bent the band at that step.

**The grips** (`usePagePlacement`, one transaction with the picture's size
grips and the moves):

- Left and right, at the caption box's edge midpoints: the width follows the
  pointer from the box's edge; the lines rewrap live in the preview (the text
  is re-set with the pages' own `TextSetter`); one commit on release, one
  undo entry. The left grip keeps the box's right edge: the text part's x
  offset changes by the opposite amount, in the same commit. Snaps, unless
  Alt is held, to the automatic width (which clears the pin) and the
  picture's width. Held to the longest unbreakable run of the text (at least
  10 mm) and the page's printable width.
- Bottom, at the box's bottom midpoint: asks for a whole number of lines from
  the pointer's height; the width is the narrowest at which the text sets in
  that many lines, found by searching widths with the setter between the
  same bounds. Back at its first line count it changes nothing.
- The chip shows the width and the automatic width, or the lines and the
  width.

**The Step pane**: with the text part selected, a Text width (mm) row beside
X and Y, with "Auto: N mm" and a reset shown only while pinned.

**Resets**: `'textWidth'` clears the pin alone; Reset Text clears the text
offset and the pin; `'position'` keeps it, as it keeps the scale; Reset Layout
clears it.

**Analytics**: `diagram step placed` gains parts `text_width` (a width grip or
the pane) and `text_lines` (the bottom grip); `diagram placement reset` gains
part `text_width`. Enums only.

## Affected Areas

- `apps/web/src/diagram/document/` — `diagramDocument.ts`, `placeValues.ts`,
  `diagramFile.ts`.
- `apps/web/src/diagram/pages/` — `diagramPageLayout.ts`, `flowPacking.ts`,
  `flowArrangement.ts`, `pagePlacement.ts`, `placementPreview.ts`,
  `usePagePlacement.ts`, `placementActions.ts`, `useStepPlacement.ts`,
  `composeDiagramPage.ts` (a text-only composition skips the pictures).
- `apps/web/src/components/diagram/` — `DiagramPagesPlacement.tsx` and its
  module, `DiagramStepPlacement.tsx`.
- `apps/web/src/analytics/`, `docs/analytics.md`, locales.

## Checklist

- [x] Plan.
- [x] `textWidth` in the place model: normalise, patch, resets, read/write; tests.
- [x] Layout: grid and flow honour the pin; packer honours it; signature
      unchanged; held pages move no other step; lane unchanged; tests.
- [x] Caption geometry helpers: narrowest width, width for n lines, resize; tests.
- [x] Transaction and grips: width grips, left grip offset, bottom grip,
      snaps, chip, live rewrap preview; tests.
- [x] Step pane row; tests.
- [x] Analytics parts and docs; tests.
- [x] i18n extract, translations, stamp, check.
- [x] The band unchanged by a caption placed alone (found in the browser
      proof: the left grip's offset bent the band at a bend step).
- [x] Gates: typecheck (with the wasm prebuild), lint, i18n:check, full web
      suite (944 files, 13 239 tests passed, 15 skipped).
- [x] Browser proof (chipmunk, A4 landscape, seven a page) and exported PDF:
      `artifacts/layout-review/out/caption-resize/` (gitignored), from
      `artifacts/layout-review/caption-resize-probe.mjs`.

## Open behaviour to review

- Under a picture wider than 50 mm, a pin between 50 mm and the picture's
  width stands centred under the picture, so the right and bottom grips move
  the caption's left edge there by half as much as its width changes (the
  right edge still follows the pointer). Everywhere else the left edge stays.
  Keeping it fixed there too would need an offset the right grip writes,
  which a re-pack would then carry out of the step's box.
- The left grip's offset is an ordinary text offset: the Step pane's X shows
  it, the caption's home ghost shows where it would be without it, and Reset
  Text clears it with the width.
- Turn glyphs and enlarge arrows keep clear of a resized caption where it
  stands at home, as they do of every caption the layout places.
