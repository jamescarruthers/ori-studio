# Diagram flow pages: packed by shape, held once packed

**Status: built (Phases 1–5), 2026-10-12, on `claude/diagram-launch-completion-59e60c`
(PR #443's head plus the 12 Oct Layers commits), to land on #443 before
launch.** Builds on `diagram-flow-pages.md` (pagination, per-page counts,
placement), and replaces its flow geometry (balanced equal cells).

Zach chose this after an interactive prototype on his crane
(https://claude.ai/artifact/SaDBhGgDFvetqZufT5i6hi; source and its packing
code in the gitignored `artifacts/layout-review/proto2/` of this worktree:
`template.html` holds the reference algorithm, `extract.mjs` pulls step
pictures from a dev server). The prototype is the visual reference: the
build must look like it at its defaults.

## Goal

- Flow pages pack like real diagrams (Zach's reference: a Kawahata Pegasus
  page): each step takes the width its shape needs, bands fill the page's
  height, wide steps nest by rising or dropping in their band, a step may
  stand in a bend where that packs better, and the ribbon meanders through
  the picture centres.
- **A picture or caption edit never moves another step** (Zach: anything else
  is "unacceptable"). A page is packed only when its structure changes, and
  its arrangement is then stored in the file and held.
- Every packing parameter is a page setting, with Zach's defaults: Bands
  Auto preferring 3 (strength 0.5), steps in bends allowed, nesting 0.8,
  scale steadiness 0.85.
- Packing a page takes tens of milliseconds; drawing a held page costs what
  today's layout costs.

## Decisions

1. **Packed once, then held.** Each flow page's arrangement (every step's box,
   its printed scale, its band and whether it stands in a bend) is stored in
   the document, keyed by a signature of the page's structure. The layout uses
   the stored arrangement while the signature matches and packs the page only
   when it does not (or when none is stored).
2. **Structure** (what the signature covers): the page's steps in order, the
   turns before each, its index, side, whether it hands over at its spine,
   whether it is the last page, its capacity (per-page count or default), the
   page setup's geometry (size, orientation, margin, title shown, page numbers
   shown), the packing parameters, and an algorithm version tag. **Not**
   covered: pictures, captions, annotations, hand placements, path width and
   colour, style.
3. **Held means held.** A held step draws at its stored printed scale
   (`mmPerUnit` or `frameMm`, absolute, as a pin is) inside its stored box,
   so another step's re-pose or Fit each run change never resizes it. If its
   own new picture or caption no longer fits its box, the page reports it
   ("Step N no longer fits its place") and offers **Re-pack Page**; nothing
   moves until the user asks.
4. **Re-pack Page / Re-pack All Pages** clear stored arrangements on demand.
   Frames placed by hand on a repacked page go home with the existing reflow
   notice; Undo restores the old arrangement.
5. **Old files** (no stored arrangement) are packed when opened. The packed
   arrangement is adopted into the open document without dirtying it or adding
   an undo entry, and is written on the next save. Packing is deterministic,
   so reopening an unsaved file packs it the same way.
6. **Hand placements** stay offsets from the step's home, which is now its
   stored box: fully stable. A page whose signature changes (it will be
   repacked) sends its placed frames home in the same commit (`settlePlaces`),
   as any cell change does today.
7. **Parameters** (`DiagramPageSetup`, flow only, each written only when not
   its default so files that never set one read Zach's default):
   - `flowBands`: `'auto' | 2 | 3 | 4 | 5`, default `'auto'`;
   - `flowPreferBands`: 0–1, default 0.5 (Auto only: how strongly three bands
     are preferred);
   - `flowBendSteps`: boolean, default true;
   - `flowNesting`: 0–1, default 0.8;
   - `flowSteadiness`: 0–1, default 0.85.
   A fixed even band count on a left page that hands over at its spine uses
   the odd count either side that packs larger (step 1 top left; Decision 8).
8. Grid pages are unchanged. Pagination, per-page counts and the last page laid
   out for its capacity are unchanged.

## The packing (port of the prototype's `packPage` / `layoutPage`)

Per flow page, with `n` = its layout count (a short last page padded to its
capacity with invisible stand-ins: cyclic copies of its own steps, as the
prototype does; only real steps are kept):

- **Reference size.** Each step's picture at its reference scale: the scale
  Fit each gives it in today's cell layout at that page's count (the existing
  `scaleRuns`/`zoomScales` path), measured with its marks. The page scale `k`
  multiplies every reference scale on the page.
- **A step's box at `k`:** number at the top left; picture below it (5 mm);
  caption under the picture, wrapped at `round(clamp(pictureWidth, 28, 50))`
  mm with the layout's text setter; box width `max(pictureWidth + 4, caption
  width)`, height `5 + pictureHeight + 2 + lines × leading`.
- **Plans:** a band count `B` (Auto: 1–3 when `n ≤ 4`, else 2–5; odd only on a
  left page that hands over at its spine; a fixed count as Decision 7), an
  optional step in each bend between bands (when allowed), and every split of
  the remaining steps into `B` bands of at least one.
- **Fits at `k`:** every band's boxes side by side, a 5 mm gap between steps
  and a 13 mm turn gutter before a step that has turns before it, plus the
  column a bend step takes at that end of each band it joins, within the
  printable width; the bands' heights plus 6 mm between them within the
  printable height (page inside margins, less header and footer).
- **Scale:** the largest `k` that fits (binary search), capped at
  `min(1.4, kPrev × (1 + 0.6 × (1 − steadiness)))` where `kPrev` is the page
  before's `k`.
- **Score:** `ln k − prefer × 0.4 × |B − 3| − 0.025 × bendSteps − 0.6 ×
  unevenness − steadiness × 1.5 × |ln(k / kPrev)|`, unevenness the standard
  deviation of the bands' fill shares. Highest score wins; ties keep the first
  found, so the result is deterministic.
- **Placement:** bands stacked in reading order (from the foot on a right page
  that reads up), spare height shared between them; within a band, each
  step's gutter then the spare width shared evenly; rows alternate direction;
  each step dips or rises by `nesting × slack / 2` alternately (slack = band
  height − box height); a bend step stands in the edge column, centred between
  the two bands it joins.
- **Ribbon:** `flowLane` through the picture centres; a bend step is a stop the
  lane turns through (no extra apex beside it); bends without one stay round
  at the page edge; the last page ends just after its last real step.
- **Turn glyphs** stand in their gutter, on the bend when the turn crosses
  bands, or between a bend step and its neighbour; enlarge arrows as today.

## As built

Phase 1 (model and file, 2026-10-12):

- `DiagramPageSetup.flowBands` (`DiagramFlowBands`), `flowPreferBands`,
  `flowBendSteps`, `flowNesting`, `flowSteadiness`; defaults in
  `DEFAULT_FLOW_PACKING`, ranges `FLOW_BANDS_RANGE` and `FLOW_WEIGHT_RANGE`
  (in the import-free `document/pageRanges.ts`). Each is written only when
  not its default; a count not whole is rounded, a number past its range or a
  band word other than `auto` is a newer build's (carried in `newer.page`).
- `DiagramDocument.pageArrangements` (`DiagramPageArrangement`,
  `DiagramArrangedStep`); values, reading and writing in
  `document/pageArrangements.ts` (`roundPageArrangement`,
  `samePageArrangement(s)`, `readPageArrangements`, `writePageArrangements`).
  Rounded when adopted, read as written. An arrangement with any part that
  does not read is dropped whole (a page cannot be held with a step it has
  no place for); one with a field, a scale measure or a band past 4 this
  build has no name for is carried whole in `newer.pageArrangements`, wins
  over this build's on write, and goes only with a re-pack of its page.
  Written only in the flow.
- `pages/pageSignature.ts`: `pageSignature(input, pageIndex)`, `pageSignatures`,
  `titleShown` (the layout's predicate too), `PACKING_VERSION = 'pack-1'`.
  Readings of Decision 2 made here: the turns before a page's first step are
  its own; the turns after the diagram's last step count on the last page; a
  turn's kind does not count (every turn keeps the same gutter), nor does a
  newer build's turn (the layout does not draw it); "title shown" is the tab
  as printed (asked for and a title there); a page's own count equal to the
  default is the same capacity. Enlarge arrows are not in the signature.
- `stepPlaces.ts`: a flow step keeps its cell exactly while its page keeps its
  signature and its stored arrangement (`CellSlots.signatures`, `.stored`).
  So a flow page's frames now go home on a paper, orientation, margin, title
  tab, page numbers, side or packing change, and when the page is renumbered;
  grid pages keep the old rule.
- `pages/pageArrangements.ts`: `heldPageArrangements`,
  `dropStalePageArrangements` (run in the store's `commit`, after
  `settlePlaces`, so an edit that re-cuts a page drops its arrangement in the
  same undo step and the file never carries one no page holds),
  `adoptPageArrangements` (held means held; an offered one must match the
  page's signature and place every step; stand-ins are left out; stale ones
  go) and `repackPages`.
- Store: `adoptDiagramPageArrangements(arrangements, ofDocument)` (same
  document only, not read-only, no dirty, no undo entry, history untouched),
  `repackDiagramPage(pageIndex)` and `repackDiagramPages()` (undoable;
  `settlePlaces` sends the page's frames home with the reflow notice).

Phase 2 (the packer, 2026-10-12; not wired into the layout yet):

- `pages/flowPacking.ts`: `packFlowPage(input, setter)`. A page is its steps
  (`PackStep`: id, picture size at the reference scale with its marks, the
  part of that its marks take at their pt size, number width, caption, turns
  before it), its layout count, the area (`packingArea(paper, headMm,
  footMm)`: the prototype's 3 mm under the header and 2 mm over the footer,
  each only when shown), `up`, `handsOver`, the five settings and `kPrev`.
  Side, last page and capacity act only through those, so they are not
  inputs. Out: `k`, the plan (`bands`, `bends`), each real step's box,
  picture, number baseline, caption (origin, measure, lines), band, bend and
  reading direction, the bands' tops and heights, `fits`, and a summary
  (score, unevenness, cap, stand-ins, plans scaled and passed over). The
  prototype's constants are named exports; `stepPartsInBox` and
  `captionWidthFor` are there for Phase 3 to draw a held step in its box.
- Faithful: the tests keep the prototype's own code as the reference and hold
  the port to it on the crane (`flowPacking.fixtures.ts`, from
  `raw-steps.json`) at 4, 7, 9, 10 and 13 a page under nine settings each:
  the same plan and `k`, every box within 1e-9 mm (bit-identical in
  practice).
- Decided where the prototype never went: a fixed even count on a spine page
  packs at the odd count either side with the larger `k`, the lower on a tie;
  a fixed count past the page's steps is held to them; Prefer three bands
  weighs only in Auto; the steadiness cap never falls under the least scale,
  0.25; a picture's marks keep their size as `k` changes (the prototype
  scaled its cropped picture whole, which a step with no marks given still
  does); and a page no plan fits at 0.25 shares its steps evenly over the
  candidate band count that overflows least there, no bend steps, and says
  `fits: false` for Phase 3 to report.
- Kept from the prototype, worth knowing in Phase 3: spare height is shared
  `spare / B` between and half that above and below, so tight bands can sit
  closer than the 6 mm the fit reserves (3 mm for two bands, 4 mm for three);
  one band sits at the area's top; a bend step's height is not counted in
  any band's.
- Speed, without changing an answer: captions are set once per step and
  measure (a whole mm, 28–50); a split whose band is too wide at any scale is
  cut off with every split giving that band more steps; a plan whose score
  bound (a scale ceiling from its widths, then from its band heights at the
  ceiling, brought down three times) cannot beat the best is never scaled.
  The crane's 13-step page packs in about 1.5 ms with a warm setter and 7 ms
  with a fresh font setter (its first faces); 30 a page on A4, which fits
  nothing, in 2 ms; fixed five bands at 13 a page in about 8 ms. The budget
  test holds a 13-step page with a fresh setter to 32 ms, 3× its median as
  the whole suite runs (10.6 ms).
- Checked against the prototype's own renders of the crane at its defaults
  (`shot-13.png`): 4·4·5 at 0.84, 5·4·4 at 0.79, 3·3·3·3 with a step in
  bend 1 at 0.83, page for page as packed here (0.8383, 0.7944, 0.8285).

Phase 3 (layout, 2026-10-12):

- `layoutDiagramPages(steps, setup, title, setter, arrangements)`: a flow
  page holds the arrangement under its first step while its signature is the
  page's and it places every step there; else it is packed and handed back in
  `DiagramPagesLayout.packed`. Either way the page is drawn from the
  arrangement as the store keeps it (`packedArrangement`, rounded), so a page
  draws the same once adopted. `LayoutPage.packing` says its `k`, whether it
  was packed by this layout, and whether every box fits its area (false only
  for the least-scale fallback); cells carry `band`, `bend` and `overflow`.
- Reference scales come from the page cut into cells as a grid's are, at the
  page's own plan: Fit each's drawn scale (a picture its caption shrank,
  shrunk) before any pin, an enlarged step's its run's. The flow's step-down,
  the caption gap over the next row and the room kept for turns at a row's
  end are gone, so these cells are a grid's exactly. Each picture is measured
  at its reference scale for the packing (`LayoutStep.pictureAt`): measured
  at a card's size, the crane's step 21 was packed 0.77 mm short and reported
  a false overflow at once.
- A held step (`flowArrangement.ts`): its number at the box's top left, its
  picture at its kept scale centred under it, its caption at the measure read
  back from the box (`captionWidthFor(box.w − 4)`, never narrower than
  packed, so never more lines). `overflow` is `picture` where the picture by
  itself needs more of the box, else `caption` where the caption runs out of
  its foot, 0.5 mm allowed. A picture of the other measure is fitted to the
  room its box leaves; an empty step's placeholder fills that room; a pin
  draws over it as anywhere, `placed.auto` being the kept scale.
- `layoutDiagram` packs once: the first layout packs, every later measuring
  pass holds what it packed, and the result reports it as packed. The
  `atMost` re-measure skips flow steps (their boxes hold their marks).
- Adoption: `useDiagramPages` adopts `layout.packed` into the store's diagram
  while it is still the one laid out; the adopted diagram takes the same
  pages (`PreparedDiagramPages.adoptedAs`) and their composed images, with no
  second layout. A save built before an adoption leaves the project clean
  (`onlyPackedSince`). Export, Print and step files pack the same way through
  `layoutDiagram` and write nothing back.
- Lane: a bend with no step turns at the paper's edge, half the margin in
  (`apexInset`), moved out only as far as `bendReach` needs for a wide band.
  A step in a bend is a stop heading straight down or up, with no apex; each
  side turns through a quarter circle as wide as that side is near, with a
  straight run for the rest (`bendStepFeet`), and each side keeps its own
  handle at the step (tangent, not C1, there): a shared handle pinched the
  wider turn to a radius of 2.7 mm. A straight run's handles never shorten
  its neighbours'. The last page's band ends at the last box's edge, or heads
  on down from a step in a bend.
- Turns: midway between two boxes in a band; on the band at a bend's apex
  height (held on the paper, 7 mm in); on the lane midway between a step in a
  bend and its neighbour; half the packed turn gutter outside a page's first
  or last box. A page with turns keeps its boxes `TURN_GUTTER_MM − 2` from the
  paper's edge in a narrower margin, as a grid does. An enlarge arrow keeps a
  turn's gutter, so it is in the signature (`signedSteps` reads
  `enlargeArrowArea`); an enlarged step's read-out is said against its area as
  that prints on a packed page. The tallest aimed arrow, which only the row
  end's room used, is gone.
- Tests: flow assertions rewritten for bands (`flowLane.test.ts`,
  `diagramPageLayout.test.ts`, `diagramPages.test.ts`, `zoomPages.test.ts`,
  `referencesCardMarks.pages.test.ts`, `DiagramPagesView.test.tsx`,
  `composeDiagramPage.test.ts`, `stepFiles.test.ts`); every flow digest of
  both goldens re-recorded, grid digests unchanged. The time budget holds a
  held 50-step layout to 100 ms (10–11 ms alone) and a fresh pack to 300 ms
  (41–49 ms alone, about 130 ms under the suite).
- Browser (:5320): the crane at 10 a page packs 3·3·4, 4·3·3, 3·3·4 as the
  prototype does; at 13, 4·4·5 and the last page as the prototype, page 2
  5·5·3 where the prototype has 5·4·4 (its references are 9-a-page cells and
  it keeps no gutter for the enlarge arrow before step 24). Held layout of
  the crane 14 ms, a fresh pack 20 ms. Hold proven in the running app: a long
  caption on step 11, a far push arrow on step 13 and a new picture on step
  15 moved no box of 28; 11 said `caption`, 13 `picture`, 15 was fitted.

Phase 4 (UI, 2026-10-12):

- Page pane: `components/diagram/DiagramPagePacking.tsx`, a Packing section
  under Layout, the flow's alone. Bands is a segmented row (Auto, 2–5);
  Prefer three bands (a nested slider, shown only for Auto), Nesting and
  Scale steadiness are sliders 0–1 in twentieths, each with a reset to
  Zach's default while it is not; Steps in bends is a switch. Each is one
  `setDiagramPage`, one undo step and one count. A setting re-signs every
  page, so a slider hands its value over only where it is let go:
  `SliderRow` gained an `onCommit` mode (it holds the drag itself, shows it,
  and commits once per drag or keyboard step, never a drag that ends where it
  began) and a `help` prop. Under the rows, Re-pack Page (the current page,
  `useCurrentDiagramPage`) and Re-pack All Pages.
- The verbs: a page action catalog, `diagram/actions/diagramPageActions.ts`
  (`foldedFigureActions.ts`'s shape; none on a grid; each held back, with
  why, on a read-only diagram or where nothing is stored to let go — only a
  moment, before a layout's packing is taken in). Bound in
  `pages/repackActions.ts` (`repackPage`, `repackAllPages`,
  `diagramPageActions` for a menu as it opens) and for a pane in
  `pages/useDiagramPageActions.ts`. Surfaces: the Packing section, the
  Layers pane's page list (Re-pack Page under the list), the overflow
  notice, and a page's context menu in the Pages view (a right-click on a
  page past its steps: Add Step, then Re-pack Page and Re-pack All Pages).
  The step catalog has no place for a page's verbs, so they are their own.
  No keyboard shortcut.
- The overflow report reads `LayoutCell.overflow` and `LayoutPage.packing.fits`
  (`pages/pageOverflow.ts`, words in `pages/overflowLabels.ts`): the Pages
  view outlines the step's place (its frame) dashed, with a "No longer fits"
  tab over its top right, clear of what runs out of its foot, and names the
  option "Step N, no longer fits its place"; the Layers pane badges the row;
  `DiagramPageOverflowNotice` over the Pages view (the Diagram panel's
  notice slot, like the enlarge-split notice) names the current page's steps
  and offers Re-pack Page, or for a page no plan fits says only fewer steps
  mend it (no Re-pack: it would pack the same); the export dialog lists the
  steps and the unfit pages for the PDF and the SVG, as it lists clashes.
- Analytics: `diagram page setup changed` gains `flow_bands`,
  `flow_prefer_bands`, `flow_bend_steps`, `flow_nesting`, `flow_steadiness`
  (which setting, never the value); `diagram pages repacked` with `scope`
  (`page`/`all`) and `via` (`page_pane`/`layers_pane`/`notice`/`context_menu`),
  sent only when an arrangement was let go. Both in `docs/analytics.md`.
- Browser (:5320, the crane, `artifacts/layout-review/packing-ui-probe.mjs`,
  screenshots in `out/packing-ui/`): each control re-packs as expected —
  Bands 4 gives page 2 four bands while the left pages keep three (the odd
  count either side, Decision 7); Prefer three bands 0 gives page 2 two
  bands (5·4 from the foot); Steps in bends off and Scale steadiness 0 each
  give page 2 3·4·2 with no step in a bend (k 1.0017 against 1.0465 with
  steps 13 and 16 in bends); Nesting 0 lines page 1's steps up in their
  bands; every change is one "Change page setup" undo step. A long caption
  on step 11 shows the tag, the badge, the notice and the export line;
  Re-pack Page from the notice re-packs page 2 alone (two bands, 5·4, k
  1.0601) and the notice goes; the page's context menu re-packs it too.

Phase 5 (tests and gate, 2026-10-12):

- Goldens: no digest moved in Phases 4 or 5, so both stay as Phase 3
  re-recorded them (grid digests unchanged since Phase 2). Each of the 19
  flow pages that changed was rasterised (Inkscape, 60 dpi) and looked at:
  bands in reading order, odd on a page that hands over, steps in bends,
  turns in their gutters and on bends, the lane meeting the spine and
  ending at the last box. Both notes in `placeGolden.test.ts` say so.
- `pages/heldPages.test.ts`, every page-golden fixture with the real fonts,
  each edit landed as `commit` lands it: a long caption, an emptied one, a
  wider capture and a photo on the first, middle and last step of each page
  move no step's home, draw every other flow step exactly as before and pack
  nothing; a turn before the last step, a page break, the first step removed
  and a packing setting pack exactly the pages whose signature changed (a
  turn before the last step, only the last page), and every held page draws
  its steps and turns as before; every fixture packs the same twice and
  after a write and read. Two things the tests pinned down, both as designed:
  across a spread the lane meets the spine halfway between the two pages'
  end stops, so a held page's band past its last step (or before its first)
  follows a re-packed neighbour while its steps, turns and band through them
  stay; and an empty step's placeholder gives way to its own longer caption,
  which then starts higher in its box (only that step).
- Budgets (`diagramLayoutBudget.test.ts`): the held 50-step layout now
  asserts it packs no page (10–12 ms alone), a file holding its arrangements
  opened with every picture new to the layout is held to the same 100 ms
  (21–24 ms alone; a grid 15–19 ms), and a fresh pack keeps its 300 ms
  (40–49 ms alone).
- Old files (`store.test.ts`): a flow diagram written with no arrangement
  opens through the store's real `openProject`, packs every page (the same
  on a second open), is adopted with the project clean and no history,
  saves every page's arrangement, and reopens with every page held and drawn
  as packed.
- Across engines (`artifacts/layout-review/cross-engine.mjs`, :5320): the
  crane, chipmunk, heart and Stanford logo at 9, 10 and 13 a page pack
  byte-identical arrangements in Playwright Chromium and WebKit, and every
  box agrees (one drawn picture differs by 7e-15 mm). WebKit logs the dev
  server's COEP refusal of the engine workers, which predates this work and
  does not touch the layout (main thread).
- Browser check (`probe.mjs`, `artifacts/layout-review/out/gate-*`): the
  four diagrams at 9, 10 and 13 a page, every page looked at. Plans: crane
  3·3·3 | 3·2·2, steps 13 and 16 in bends | 3·3·3 | 1 at 9; 3·3·4 | 4·3·3 |
  3·3·2 at 10; 4·4·5 | 5·5·3 | 2 at 13. Chipmunk 3·3·3 | 3·2, 13 in a bend;
  3·3·4 | 4·1; 4·4·5 | 2. Heart 3·2·4 | 3·3·2; 3·3·4 | 3·4; 4·5·4 | 4.
  Stanford logo (one page) 3·3·2; 2·2·3·1; 3·4·1. Every page fits.
- Against the prototype at 9 a page (`proto2/proto-9.png`, its defaults):
  pages 1, 3 and 4 pack as it does; page 2 is 3·2·2 with steps 13 and 16 in
  bends at k 1.05 where the prototype has 3·2·3 with 13 in a bend at 1.16.
  The cause, now confirmed: Fit each gives steps 14–17 a reference scale
  1.31× that of 10–13 (0.1711 against 0.1307 mm a unit), as the Reference
  size rule says, where the prototype's extracted pictures all had one
  (0.1249); so our 14–17 print larger, and `k` is not comparable between the
  two. Phase 3's 13-a-page difference has the same source.
- Gate: typecheck, full lint and `i18n:check` clean; the full web suite
  (Node 22) 942 files and 13,143 tests passed (2 files and 15 tests
  skipped); `npm run build:web` builds, every wasm bridge rebuilt by its
  hook, and its prerender writes all 37 pages.
- Review (targeted, by this phase's author): adoption in `useDiagramPages`
  and the store (identity checks, placement preview, undo across an
  adoption), `commit`'s drop of stale arrangements, Re-pack as an edit,
  `SliderRow`'s commit mode, and the arrangements' reader and writer. No
  defect found.

Review fixes (the third review's verified findings, 2026-10-12). Where these
change an earlier phase's note, this section is what holds:

- One test for "a page holds its arrangement" (hold-6): `holdsArrangement`
  in `pageSignature.ts` — signature the page's and every step placed — read
  by the layout and by `heldPageArrangements`, so a damaged arrangement the
  layout packs over is replaced at adoption and dropped at the next commit.
- Structure only in the signature (hold-1): a step counts as enlarged
  (`DiagramStep.zoom`, which only the Enlarge verbs change), no longer as
  "an arrow prints before it", which turned on the step's picture and the
  area mark on the step before. The packing keeps a turn's gutter before
  every enlarged step after another (`keepsGlyphGutter`), arrow or not, so a
  mark or picture edit that brings or takes away the arrow re-packs nothing.
  This replaces Phase 3's "an enlarge arrow ... is in the signature". Cost:
  an enlarged run keeps a gutter between its steps (the crane's 24–26 at 10
  and 16 a page pack a little smaller, k 1.106 → 1.098 on page 3 at 10).
- An enlarged step's own Size on a held page (hold-2): the arrangement keeps
  the Size each enlarged step was packed for (`DiagramArrangedStep.zoomScale`,
  unsaid for Fill; v1 contract text updated). A Size changed since scales its
  kept window by the new Size over the packed one (a step packed at Fill by
  the ratio it prints at now; Fill fills its box's room, 1–6 times its area),
  drawn as far as its box holds and reported as no longer fitting when it
  asks for more, so Re-pack Page is offered and then packs it for the Size.
  The read-out says what the step prints against its area as that prints, and
  `zoomReadout` says a Size as typed only where it prints at it. Comparing
  against the area alone would have flagged freshly packed steps whose area
  prints on another page, or that their cell had reduced.
- Fonts (hold-4): a layout that went without a CJK face its text needs is
  drawn, but its packing is not adopted.
- Contract wording (hold-5): this build writes its own arrangements only in
  the flow; a newer build's are carried in either layout.
- Boxes cut to what prints (F3): after packing, each picture is measured at
  its kept scale and its box grows by what it lacks where that is more than
  half `ARRANGED_SLACK_MM` (`grownToHold`), so a page never reports a step it
  has just packed (the crane at 7 a page, A4 landscape: step 21's box 58.69
  → 59.3 mm).
- No step in a bend before only stand-ins (F4): a bend seats a step only with
  a real step after it; the prototype reference in the tests takes the same
  rule. Two fixtures' short last pages re-pack.
- A page no plan fits (F5): drawn at the largest scale at which its overflow
  does not grow (the caption floor overflows the width at any scale), not at
  0.25. Holding the steps a page may hold to what the paper can hold is left
  to Zach.
- `PACKING_VERSION` is `pack-2`: F3, F4 and F5 pack the same structure
  differently, so pages stored by `pack-1` are packed afresh when opened.
- Glyphs beside a step in a bend (F1): they start midway between the two
  pictures' centres (the prototype's place), and on a flow page every glyph
  stack moves the least way clear of each step's number, picture and caption
  (`clearSpot`, 0.5 mm), held on the paper — clear of where the layout puts a
  step, not of a part placed onto it by hand, which stays a reported clash.
  The matrix of 120 configurations (four diagrams × 7/9/10/13/16 a page × A4
  portrait, A4 landscape, Letter × either first side) went from 15 glyphs on
  steps and one fresh overflow to none (`artifacts/layout-review/fixes/`).
- Re-pack buttons (UI-1): held back only on a read-only diagram; a press with
  nothing stored does nothing. This replaces Phase 4's "where nothing is
  stored to let go". Focus stays on the button after Enter (checked in the
  browser).
- Steps view (UI-2): a card says "No longer fits" for a flow step past its
  place (`stepPageFits`), as "Text doesn't fit" for a grid cell's cut text.
- Touch targets (UI-3): a segmented option is never narrower than
  `--touch-target` on a coarse pointer (Bands' 2–5 now 44 × 44).
- Analytics docs (UI-4, UI-5): Re-pack All Pages from the context menu, and a
  re-pack that changes nothing still counts.
- Left for Zach: reference scales cut per page, so spine parity changes
  picture sizes between pages (F2), and a newer build's arrangement packed
  afresh in every session here (hold-3, the documented forward-compatibility
  trade-off).

## Affected Areas

- `apps/web/src/diagram/pages/`: a new pure `flowPacking.ts` (+ tests);
  `diagramPageLayout.ts` (flow geometry from arrangements), `flowLane.ts` (bend
  steps), `placeTurns`/`zoomArrows`, `stepPlaces.ts` (signature-driven cell
  change), `diagramPages.ts`/`useDiagramPages.ts` (adopting new arrangements),
  overflow reports.
- `apps/web/src/diagram/document/diagramDocument.ts`, `diagramFile.ts`
  (arrangements and the five parameters; v1 contract text in
  `implementation-plans/diagram-workspace.md`).
- `apps/web/src/store/workspaceStore/slices/diagramSlice.ts` (adopt without
  dirtying, Re-pack Page / All).
- `apps/web/src/components/panels/DiagramPagePanel.tsx` and a packing section
  component; the Layers page list and Page pane get Re-pack Page and the
  overflow notice; the export dialog lists overflow like clashes.
- i18n catalogs, analytics (`docs/analytics.md`), goldens.

## Checklist

### Phase 1: model and file
- [x] The five parameters in `DiagramPageSetup` with defaults, ranges, reading and writing (unsaid = default), tests.
- [x] `DiagramDocument.pageArrangements` (by page's first step id: signature, `k`, per step box, scale, band, bend), rounding, reading (malformed dropped, newer carried) and writing, round-trip tests, v1 contract text.
- [x] `pageSignature(document, page)` and the rule in `settlePlaces`.

### Phase 2: packing
- [x] `flowPacking.ts`: the port, pure and deterministic, with unit tests (plans, odd bands, bend steps, nesting, steadiness cap, short last page, fixed band counts) and a time budget (a 13-step page packs within 50 ms under vitest).

### Phase 3: layout
- [x] Flow geometry from stored arrangements; packing for pages without a valid one; new arrangements returned to the caller; held steps drawn at their stored scale in their box; overflow reported.
- [x] `flowLane` bend steps; turn glyphs and enlarge arrows; hand placement on top.
- [x] Adopting arrangements in `useDiagramPages` (same document only, no dirty, no undo entry); export, print and step files pack missing pages the same way.

### Phase 4: UI
- [x] Page pane "Packing" section (flow only): Bands, Prefer three bands (Auto only), Steps in bends, Nesting, Scale steadiness; Re-pack All Pages.
- [x] Re-pack Page in the Layers page list and the Page pane; the overflow notice; the export dialog's overflow line; analytics; i18n.

### Phase 5: tests and gate
- [x] Goldens re-recorded and checked by eye against the prototype; a test that a picture or caption edit moves no step; full suite, build, browser check of the four diagrams at 9, 10 and 13 a page; review.

### Review fixes (third review)
- [x] hold-6: one predicate for a held page, layout and store.
- [x] hold-1: the signature reads structure only; an enlarged step after another keeps the arrow's gutter.
- [x] hold-2: an enlarged step's own Size resizes it on a held page, reported when its box is too small; honest read-out.
- [x] hold-4: no adoption of a layout without a CJK face it needs.
- [x] hold-5: v1 contract wording for a newer build's arrangements.
- [x] F3: packed boxes hold their pictures as they print.
- [x] F4: no step in a bend before only stand-ins.
- [x] F5: an unfit page drawn as large as its overflow allows (the steps-per-page cap left to Zach).
- [x] F1: glyphs beside a bend step clear of every step.
- [x] UI-1 … UI-5: Re-pack keeps focus; Steps view warning; touch targets; analytics docs.
- [ ] F2 and hold-3: design calls for Zach.
