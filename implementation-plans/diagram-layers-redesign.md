# Diagram Layers Pane Redesign

## Goal

Give the Diagram workspace's Layers pane, in the Pages view and in
Annotate, a list-and-inspector layout in the manner of Photoshop and
Affinity. The design was reviewed and agreed on the canvas
(https://claude.ai/artifact/FB7x7DfbuGZYgpLSMxRe1d, 2026-10-18). Also
give the fold-and-unfold arrow the glyph drawn there, in the Annotate rail
and the list.

## Approach

Decisions made on the canvas's comment threads, which this plan builds as
agreed:

- **Rows are one line**, 28 px (the small control height; 44 px on a coarse
  pointer).
  - The selection is a flat accent fill with no outline. A step that holds a
    selected part gets a faint tint.
  - The "Moved" pill becomes a 6 px dot, "Placed by hand". A pin read as a
    "pin this" action, so it is not used.
  - The "Outside margin" pill becomes the warning icon.
  - A mark outside an enlarged step's frame is greyed, with no badge.
- **The Steps view card** swaps its "Placed by hand" pin for the same dot,
  so one mark means one thing.
- **A list header** says what the list holds: "Page 1 · 7 steps" or
  "Step 8 · 8 marks". On a flow page it carries Re-pack Page.
- **Parts open with a disclosure arrow** on any step that can be placed, not
  only the selected one. Selecting a part opens its step.
- **Numbered names in Annotate.** A kind label shown more than once gets a
  number in drawing order ("Circle 1", "Circle 2"). Text marks keep their
  text.
- **Two regions.** The list sits above the inspector, divided by a separator.
  Each region scrolls on its own. The list is at most half the pane until the
  separator is dragged, or moved with the arrow keys.
- **The inspector header** names the selection and where it lives: "Step 3 ›
  Text" over the step's instruction, or the mark's name over "Step 8 ·
  instruction". It holds no icon tile, which read as a button.
- **Pages inspector.**
  - A Placement section: Position is X and Y side by side in one row; then
    Size and Width, each with what Auto gives under it.
  - Each reset sits to the left of the inputs it resets and appears only once
    something was changed, so the inputs never move. This is scoped to this
    surface: it is a `FieldRow` prop, off by default.
  - Reset Layout moves into the header.
- **Annotate inspector.**
  - One toolbar of verbs: Flip Horizontal and Flip Vertical as icons; Flip
    Arc, Reset Shape and Turn 90° as words, since no icon says them; then
    Delete.
  - The mark's own rows follow.
  - An "In the folds" section closes the inspector. On a picture that doesn't
    know its flaps, it is one line of explanation instead of disabled
    controls.
- **Fields.**
  - Rows keep `FieldRow`'s spacing exactly. `NumberField` stays 26 px.
  - `NumberField` gains an optional label inside the frame (X, Y, a size
    glyph). Dragging that label scrubs the value; the field commits once, on
    release, as one undo entry.
  - The − / + steppers are dropped on a fine pointer and come back on a coarse
    one.
- **Spacing** follows the token scale: `--space-*` and the 28 px control
  height. The only off-scale values are the shared components' own.

Not in this change:

- **Hover highlighting.** Lighting a mark or step on the canvas when its row
  is hovered (and back) touches the canvas renderers. It is a follow-up.
- **Drag to reorder.** Still undecided on the canvas.
- **Live scrub preview.** The page updates on release, not during the drag.

## Affected Areas

- `apps/web/src/components/diagram/DiagramLayerList.tsx` and its module: one-line
  rows, the disclosure, the status slot, dimmed and holds-selection states, and the list header.
- `apps/web/src/components/diagram/DiagramLayersSplit.tsx` (new): the list and
  inspector regions and the separator; the clamp in `diagram/layers/layersSplit.ts`.
- `apps/web/src/components/diagram/DiagramInspectorHeader.tsx` (new), `DiagramPlacedMark.tsx` (new).
- `apps/web/src/components/diagram/DiagramPageLayers.tsx`, `DiagramStepPlacement.tsx`,
  `apps/web/src/diagram/pages/usePageLayers.ts`.
- `apps/web/src/components/diagram/DiagramLayers.tsx`, `DiagramBehindControls.tsx`,
  `apps/web/src/diagram/annotate/layerNames.ts` (new).
- `apps/web/src/components/ui/fieldRows/FieldRow.tsx` (`resetSide`, `resetLabel`),
  `apps/web/src/components/ui/NumberField.tsx` (`prefix`, scrubbing).
- `apps/web/src/components/diagram/DiagramAnnotateToolGlyph.tsx` (fold-and-unfold glyph),
  `DiagramStepCard.tsx` (the dot).
- `apps/web/public/locales/*/panels.json`: the new strings.
- Tests beside each.

## Checklist

- [x] Shared pieces: one-line `DiagramLayerRow`, the list header, `DiagramLayersSplit`, inspector header, placed dot
- [x] `FieldRow` `resetSide` / `resetLabel`; `NumberField` `prefix` with scrubbing
- [x] Pages view: header, disclosure parts, dot and warning status, the split
- [x] Pages inspector: header with Reset Layout, Placement section, X/Y pair, resets on the left
- [x] Annotate: header, numbered names, dimmed outside-frame rows, the split
- [x] Annotate inspector: header, verb toolbar, "In the folds" section
- [x] Steps view card: pin → dot
- [x] Fold-and-unfold arrow glyph
- [x] i18n: extract, translate 8 locales, stamp, check
- [x] Tests updated and added; lint, typecheck, relevant vitest
- [x] Browser check on the crane (Pages, Annotate flat and folded, scrub, step card, glyph; a phone was not checked)
- [ ] Draft PR
