# Diagram flow pages: packed by shape, held once packed

**Status: building, 2026-10-12, on `claude/diagram-launch-completion-59e60c`
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
- [ ] `flowPacking.ts`: the port, pure and deterministic, with unit tests (plans, odd bands, bend steps, nesting, steadiness cap, short last page, fixed band counts) and a time budget (a 13-step page packs within 50 ms under vitest).

### Phase 3: layout
- [ ] Flow geometry from stored arrangements; packing for pages without a valid one; new arrangements returned to the caller; held steps drawn at their stored scale in their box; overflow reported.
- [ ] `flowLane` bend steps; turn glyphs and enlarge arrows; hand placement on top.
- [ ] Adopting arrangements in `useDiagramPages` (same document only, no dirty, no undo entry); export, print and step files pack missing pages the same way.

### Phase 4: UI
- [ ] Page pane "Packing" section (flow only): Bands, Prefer three bands (Auto only), Steps in bends, Nesting, Scale steadiness; Re-pack All Pages.
- [ ] Re-pack Page in the Layers page list and the Page pane; the overflow notice; the export dialog's overflow line; analytics; i18n.

### Phase 5: tests and gate
- [ ] Goldens re-recorded and checked by eye against the prototype; a test that a picture or caption edit moves no step; full suite, build, browser check of the four diagrams at 9, 10 and 13 a page; review.
