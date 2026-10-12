# Diagram flow pages: #436's look, balanced rows, a count per page

**Status: building, 2026-10-11, on `claude/diagram-launch-completion-59e60c`
(fast-forwarded to PR #443's head 21040323f), to land on #443 before launch.**

Supersedes the "balanced ribbon packing" of #443 (Decision 7 of
`diagram-page-overrides.md` as built on 10–11 Oct). Evidence for every claim
below is in the gitignored `artifacts/layout-review/` of this worktree; the
critique is published at https://claude.ai/artifact/21Eybwyc4oKEgVFGHUzq9Y.

## Goal

- Flow pages look like #436's cell layout, which Zach judged best on 11 Oct:
  every other step on a row a little lower, each picture hanging from the top
  of its cell, the ribbon one smooth curve through the picture centres. Never
  straighten rows or centre pictures on a line ("too stiff, mechanically
  straight, not what origami diagrams look like").
- Each page can hold its own number of steps (Zach: "per page, not a global
  setting").
- No step is stranded on a short row, and step 1 always starts at the top
  left.
- Layout takes milliseconds: a 50-step diagram in at most 50 ms on an
  M1-class desktop, 250 ms at 4× CPU throttle, on the main thread, no worker.
  #443's packing took 4.6 s for the 28-step crane and 1.3 s per typed
  character.
- A step's computed place (its home) depends only on the page setup, the
  pagination and its index on its page, never on any step's content, so hand
  placements (offsets from the home) keep their meaning. The layout freezes
  at launch; a golden of every fixture's homes enforces it.

## Decisions (Zach's standing "go with your recs" applies to the open ones)

1. Base: #436's cell layout, plus what steps per page needs. Packing is
   dropped.
2. Uneven counts: rows balanced, counts differing by at most one, the extra
   steps on the FIRST rows in reading order (7 → 3·2·2, 8 → 3·3·2,
   10 on 3 rows → 4·3·3, 12 on 5 rows → 3·3·2·2·2). Rows are therefore never
   longer than the row before, so every bend turns inward or level.
3. A short row spreads its steps evenly across the full width ("spread").
4. Odd row counts only where needed: a left page that hands over at its spine
   (not the diagram's last page). Right pages, a first page on the right and
   the last page take whichever row count prints largest. Step 1 is always top
   left; later pages start where the ribbon left off (D10, Decision 8).
5. Each page remembers its own count, stored on the step that starts it.
   Adding or deleting a step inside such a page changes its count to match, so
   later pages do not shift. Pages without a count fill with the diagram's
   default "Steps per page".
6. Pages fill in order; the finished model prints at its run's scale.
7. Keys on Pages: keep the 11 Oct click model (first click selects the whole
   step, the next an inner part; arrows nudge a selected frame). Delete and
   Backspace delete the step again, with its confirm. A click focuses the
   step, so Enter opens it.
8. The placement UI ships at launch, after the layout is frozen by the homes
   golden.
9. The Annotate line-type move stays in #443 (it lands as a whole now).

## Approach

### Model and file format

- `DiagramStep.pageSteps?: number`, an integer 1–30: "a page starts at this
  step and holds this many steps". It implies a page start, as `breakBefore`
  does. `DiagramPageSetup.stepsPerPage` (2–30) stays as the default for pages
  without a count.
- `diagramFile.ts`: `pageSteps` joins `STEP_KEYS`; written only when set; read
  as an integer 1–30. Out-of-range or non-integer values follow the reader's
  existing rule for out-of-range numbers (newer data: carried, not dropped).
  Round-trip tests. The v1 contract (`diagram-workspace.md` Contracts block)
  gains the key and the pagination rule.
- Grid ignores `pageSteps` (grid pages are columns × rows) but keeps it, so a
  switch back to flow restores the counts.

### Pagination (one pure function, shared by layout, `stepPlaces` and the panes)

Walk the steps in order. A step starts a new page when it is the first step,
or it has `breakBefore` or `pageSteps`, or the current page has reached its
capacity. A page's capacity is its first step's `pageSteps`, else the
default. A page ends at its capacity or at the next step that starts a page,
whichever comes first. Turns take no place, as today.

Each page reports: its step indices, its first step id, whether it has its
own count, its capacity, and its **layout count**: the number of steps it is
laid out for. That is its own size for every page except an automatic last
page, which is laid out for its capacity so a few leftover steps keep a full
page's cell size (filled in order).

### Keeping later pages still (edit rules, in the store's `commit`)

Run a pure `retainPageCounts(before, after)` in `commit`, before
`settlePlaces`, so every structural edit is covered whatever verb made it.
Behaviour (each with a unit test):

1. Inserting n steps after step X: they join X's page; a page with its own
   count gains n (clamped to 30). Inserting before the first step joins
   page 1.
2. Deleting steps: a page with its own count loses its deleted members. If
   its first step goes, its count moves to its next remaining step. A page
   that loses every step disappears.
3. Moving steps (reorder, drag, a block): moved steps leave their page (rule
   2) and join the page of the step they land after (rule 1).
4. Duplicate and paste behave as inserts after their anchor.
5. Automatic pages behave as today.
6. A page with its own count whose first step stays put keeps that step as
   its first step.

A store verb `setDiagramPageSteps(pageIndex, count | null)`:

- `null` removes the page's own count (it becomes automatic).
- A count first gives every earlier automatic page its current size as its
  own count, so a later edit there cannot spill a step across this page's
  start. It then sets this page's count and moves the boundary with the next
  page: if that page has its own count or a break, its start moves to the step
  at this page's start plus the count, and its own count changes so its last
  step stays where it was (a page emptied this way disappears, and the move
  continues into the one after). An automatic next page simply refills.
- One undo entry. `settlePlaces` then sends moved frames home as today.

### Layout (`diagramPageLayout.ts`, flow branch)

Start from the cell path (#436's code, as on the 90b4cf001 Phase 1b commit)
and remove everything packing added.

- Per page, from its layout count `n` and the printable area (the paper inside
  its margins, as `flowShape` measures it):
  - rows: `flowShape`'s largest-picture rule, restricted to odd counts on a
    left page that hands over at its spine;
  - counts per row: balanced, extras on the first rows in reading order;
  - cell height: the page inside its margins less header and footer, over the
    rows; cell width (each step's room): the printable width over the longest
    row; text width 0.8 × that cell width, as #436;
  - a row of `c` steps puts its steps at slot centres `(i + 0.5) / c` of the
    printable width, mirrored on a row that reads right to left;
  - every other step on a row, by its place in reading order, sits
    `FLOW_STEP` of the cell lower, as #436;
  - a short automatic last page fills its rows in order at the full page's
    slots.
- `flowPagePlan` from the page's rows; with odd rows on spine pages its first
  row always reads left to right.
- Each cell's row and direction are explicit properties, set for every flow
  cell from the page plan. Remove every `flowRow !== undefined` mode switch
  (flowLane, placeTurns, zoomArrows) and keep #436's behaviour at each.
- Fit each: per-cell fits into `scaleRuns` exactly as #436 (`fitOf`'s cell
  branch). Pins, then `zoomScales`, as now. An enlarged step's explicit Size is
  held to its room again with its reduced flag, as #436; only a hand pin draws
  past its room (Decision 3A).
- A minimum gap of 2.5 mm between a caption's last line and the next row's
  step number (in `cellFoot` / `slotBottom`).
- The ribbon: #436's `flowLane` through each picture's centre, no packed
  branch, no fairing. A bend's apex stands outside the outer of the two row
  ends. On the diagram's last page the ribbon ends just after its last step.
  No empty-cell stops are needed any more: only an automatic last page is ever
  short.
- Turn glyphs and enlarge arrows where #436's `placeTurns` puts them, with the
  row of `k` read from the page plan.
- Hand placement on top, as #443 does (`placeCell`), frame X along the row's
  reading direction (now independent of content).

### Removals and moves

- Delete `ribbonPacking.ts` and its test, `glyphPacking.ts` if nothing else
  needs it, `ribbonPath.ts` and its test if only packing used it.
- Move `rectangle`, `separate`, `convexHull` and `Polygon` into a geometry
  module beside the page code before deleting packing (`pagePlacement`,
  `pictureFootprint`, `diagramPages` import them).
- Footprints: computed lazily, only for steps whose clashes are checked
  (placed steps), cached by step id and measure inside `layoutDiagram`.
- `stepPlaces.ts`: `cellSlots`/`sameCell` key a flow cell on the shared
  pagination and page plan (page or first step, k, the page's layout count and
  rows), not on a global shape.

### Tests

- Revert every timeout #443 raised (file-wide 120 s, the 30 s suites).
- Restore the assertions #443 loosened, from #436's versions:
  `referencesCardMarks` 2% and flow `cellMm` equality, the `zoomPages` flow
  lift case, the flow row-end turn-room test, the right-page arrow aim and flip
  assertions, `stepFiles`' strict page-frame expectation.
- New: pagination (counts, breaks, defaults, last page), every edit rule,
  `setDiagramPageSteps` boundary moves, file round trip, layout of 7 and 12 a
  page (balanced rows, odd rows on spine pages, top-left start), a layout time
  budget for a 50-step fixture with annotations and turns, a caption-edit test
  that moves no other step's home, a golden digest of every fixture's homes
  (cell, number, text origin), grid goldens with an explicit Size of 2 and 6.
- Flow goldens are re-recorded and checked by eye; grid goldens must not
  change except where the explicit-Size fix restores #436.

### UI and the review fixes

- Page pane, flow: "Steps per page" stays as the default. A new row sets the
  current page's own count, with a way back to the default. The current page
  is the page in view in the Pages view, else the selected step's page, else
  page 1. Analytics: the existing page-setup event with a new `setting` value;
  no values sent.
- The verified review findings (see the critique): click focus; Delete;
  nudges flushed on view change; lost pointer capture cancels; keys not
  swallowed during a relayout; a pending preview cleared on a failed layout;
  shortcut labels and the placement scope translated in all nine catalogs;
  "Reset This Page" acts on the page in view; the Step pane keeps its values
  during a relayout; the page-break offer only where a break helps; clash
  wording that separates overlaps, margin and path; part ghosts after the
  frame offset; clashes against the arrows as printed; analytics `via`
  labels, doc comments and doc rows; layout constants imported, not copied;
  token use in the placement CSS modules; one undo entry per nudge sitting;
  the stale Pages docstring and dead code.

## Affected Areas

- `apps/web/src/diagram/document/diagramDocument.ts`, `diagramFile.ts`,
  `__fixtures__/` and their tests.
- `apps/web/src/diagram/pages/`: `diagramPageLayout.ts`, `flowLane.ts`,
  `stepPlaces.ts`, `diagramPages.ts`, `pagePlacement.ts`, `pictureFootprint.ts`,
  `zoomArrows.ts`, a new pagination and geometry module, deletions above, and
  tests.
- `apps/web/src/store/workspaceStore/slices/diagramSlice.ts` and types.
- `apps/web/src/components/panels/DiagramPagePanel.tsx`,
  `components/diagram/` placement components, `diagram/pages/usePagePlacement.ts`
  and friends, `i18n/shortcutLabels.ts`, `public/locales/*`, analytics and
  `docs/analytics.md`.
- Plans: this file, `diagram-page-overrides.md` (Decision 7),
  `diagram-workspace.md` (v1 contract).

## Checklist

### Phase 1: model, pagination, edit rules
- [x] `pageSteps` in the model and file, with tests.
- [ ] Shared pagination function; `cellSlots` and the layout read it.
- [ ] `retainPageCounts` in `commit`; `setDiagramPageSteps`; tests for every rule.

### Phase 2: the layout
- [ ] Geometry helpers moved; packing, its cache and tests deleted.
- [ ] Balanced rows, odd rows on spine pages, #436's step-down and lane.
- [ ] Explicit flow cell rows; packed mode switches gone.
- [ ] Fit each per cell; explicit Size held to its room; caption gap.
- [ ] Lazy, cached footprints.
- [ ] Timeouts reverted, assertions restored, new tests and goldens.

### Phase 3: UI and review fixes
- [ ] Page pane per-page count.
- [ ] The review fixes listed above.

### Phase 4: gate and land
- [ ] Lint, typecheck, i18n check, full web suite (Node 22), build and prerender.
- [ ] Browser: all four diagrams, Pages vs PDF and Print, per-page counts,
  drag/nudge/undo, reflow notice, phone emulation; Chromium and WebKit agree.
- [ ] Renders for Zach; plans and PR body updated; pushed to #443.
