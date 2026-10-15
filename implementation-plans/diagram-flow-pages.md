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
laid out for. That is its own size for every page except the last page,
which is laid out for its capacity (its own count, or the default), so a
few leftover steps keep a full page's cell size and a count there sizes the
page as it says (filled in order).

### Keeping later pages still (edit rules, in the store's `commit`)

Run a pure `retainPageCounts(before, after)` in `commit`, before
`settlePlaces`, so every structural edit is covered whatever verb made it.
Behaviour (each with a unit test):

1. Inserting n steps after step X: they join X's page; a page with its own
   count gains n (clamped to 30). Inserting before the first step joins
   page 1. Steps added after the diagram's last step gain its page nothing
   (review L1): no later page needs holding still, so they fill the last
   page to its count and then start an automatic page.
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

As built (Phase 1, `diagram/pages/pagePlan.ts` and `pageCounts.ts`):

- Which steps moved is read from the two orders alone: the steps that keep
  their place are the longest run both orders share. Where two runs are as
  long, the one that keeps a counted page's first step wins (rule 6), so
  Move Earlier on a page's first step is read as the step before it moving
  later: `s0 s1 s2 | s3 …` becomes `s0 s1 | s3 s2 …`, not `s0 s1 s3 s2 | …`.
- Counts are the flow's on a grid too: both the edit rules and the verb read
  the flow pagination whatever the layout.
- A newer build's step is never edited: a count it carries stays as it came,
  and the verb refuses an edit that would have to change one (an earlier page
  it starts is just left without a count).
- A count set to what the page already holds changes nothing (no earlier
  page is frozen either).
- A cell is keyed on its page's layout count and rows, so anything that
  changes a page's rows sends its frames home: a page added after a left page
  (it then hands over at its spine, odd rows), the first page's side, or the
  orientation, where they change some page's rows.
- *Superseded for flow pages, twice.* Since packing, a flow page's frames
  are judged when the page is packed afresh, not by its cell. Zach's rule of
  2026-10-13 kept an offset while the step stayed on its page and in its
  band; his rule of 2026-10-15 replaces it: the offset is kept while the
  step keeps its **place** — its page, its band and its place along the band
  as it reads — and goes home when any changes, so Steps on page N, the title
  block's toggle and a step put in or taken out before it send home the
  steps they move along. Everything inside a step's box stays. See
  `diagram-document-evolution.md`, part 2.

As built (the second review, 2026-10-11; the layout itself unchanged):

- A count is held to what the page can hold (`pageStepsRange`, which the
  Page pane's field offers too): never more than the steps from its start to
  the diagram's end, so a count never says more than the page holds (R2-U2),
  except on the last page, which takes any count up to 30;
  never every step of a later page that starts by a page break, which moves
  on to that page's last step and comes back as the page shrinks, so a break
  is never lost with its page (L4); and never so few that a counted next page,
  starting earlier to keep its last step, would need more than 30 (L3).
- The last page is laid out for its capacity, its own count or the default,
  the steps it holds filling it in order (11 Oct, decided under Zach's
  standing "go with your recs"; it replaced "a counted page is laid out for
  the steps it holds", which made every count from the steps held up print
  the same page and one press below the default blow its few steps up to the
  whole page). So on the last page 1 gives the finished model the page and
  each count in between sizes it smoothly; an automatic last page given the
  default stays automatic; a count below the steps it holds sends the rest to
  an automatic page after it. Fixture 'flow, a last page with its own count'
  holds the rule in the homes golden. The row shows every page's layout count.
- Every page in front of a page with its own count holds one too (L2). Use
  default leaves such a page as it is (`countHoldsLaterPages`), and the row
  says "Keeps later pages in place" where its button would be: without its
  count, a step added there would spill onto a page of one in front of the
  counted page. A count set also gives every automatic page between its page
  and a later counted page its present size, so the boundary it moves adds or
  drops no page in front of that one.

Changed by Zach, 2026-10-15 ("shift everything later";
`diagram-title-block.md`, "Zach's answers of 2026-10-15"): a count set no
longer moves the boundary with the next page alone. Every later page keeps
its own count and shifts, its start and count moving together; a page is
added at the end where the steps no longer fit, and one emptied is gone. A
page break stops the shift: the page in front of it takes up the
difference, ending at the break as before, or, where the page set is itself
in front of the break, the break's page does, as above (L4 unchanged). L3's
limit now guards that page. The title block's toggle moves page 1's count,
its own included, by the steps the block takes, and the later pages shift
the same way. In the review the same day: the toggle never moves a break
(the steps page 1 gives up in front of one refill a page there), and a page
a newer build's step starts by its own count stops the shift as a break
does, under Set Steps on Page too (`diagram-title-block.md`, "Review fixes
(round 2, 2026-10-15)").

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

As built (Phase 2, `diagramPageLayout.ts`, `flowLane.ts`):

- Every page is cut from its plan (`PageCut`): grid pages too, whose plan
  gives every row its columns, so grid output is #436's to the pixel
  (checked in the browser against :5291 with Sizes of 2 and 6). A full row's
  cells stand side by side exactly as before; only a shorter row uses the
  even shares. `pageCellMm` is gone; `DiagramPagesLayout.cellMm` is the
  first page's cell, and `pageGrid` stays for the tests that describe
  `flowShape`.
- The band's end on the diagram's last page is at the last step's cell
  edge: the lane runs on half a cell less half the band, so its round cap
  ends there. That run has no say in the handle at the last step (as a
  stub off the page has none), and its curve's handle there is held to its
  length, so it never pinches the bend before it or runs past its end.
- A bend into a shorter row: its apex stands past the longer row's end,
  and its half into the shorter row runs in for the difference with a
  handle longer by as much (`knotHandles`), so both halves are as round at
  the apex. One curve a half cannot keep that half clear of a band nearly
  as wide as the rows are apart (40 mm on A5 at 7 a page, 60 mm on A4 at
  10), which no single cubic can; the bend-radius test says so and checks
  such a half only for bands up to half as wide as the rows are apart.
  Inserting a knot at the bend's foot would hold any width, but it is the
  straight run this plan rules out.
- Footprints: `LayoutStep.footprints` is a thunk, cached per step and
  measure for a whole `layoutDiagram` call (`footprintCache`); cells no
  longer carry `inkPolygons`. `partPolygons` lays a step's footprints on its
  ink box as drawn, `placementClashes` asks only for a placed step's and for
  another step's whose box one of its parts meets, and the Pages view's
  previews check against the same through `PreparedDiagramPages.footprints`.

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

As built (Phase 3, part 1):

- The Pages view publishes the page in the middle of its view while it is
  laid out (`pageInView.ts`, as `printedFrames.ts` publishes the layout);
  `useCurrentDiagramPage` gives every pane the same current page from it, the
  selection (a turn's page is the step after it) and the shared pagination.
- The row is `DiagramPageStepsRow`, under Steps per page: "Steps on page N",
  N as the Pages view captions the page (its printed number, else its
  place). A page with its own count shows it and Use default; one without
  shows what it is laid out for (`layoutCount`) and a quiet "Default": its
  steps, but its capacity on the last page. Analytics: `page_steps` and
  `page_steps_reset` on the page setup event.
- Reset This Page resets the current page, and is disabled only where that
  page has no step placed by hand (U4). The clash notice offers a new page
  only for a `step` or `glyph` clash on a step that does not start a page
  (`startsPage`), and says the frames it moves return to automatic
  placement (U5).

As built (Phase 3, part 2):

- A press on a step focuses its option (`focusStep` in `usePagePlacement`),
  so Enter opens it; the press is kept from the browser only on a part's
  target or a grip, which lie outside the option. Delete and Backspace go to
  `edit.delete` and its confirm again: the no-op `placementDelete` claim is
  gone. The click model stays (Decision 7).
- A keyboard nudge in its 220 ms pause is committed, never dropped, before
  anything else happens to the diagram: the slice calls
  `flushPlacementNudge` (`placementGestures.ts`, store-free as
  `pendingEdits.ts`) at the top of `commit`, `sessionFor` and undo/redo; the
  save path's `flushPendingEdits` reaches it; a selection, part, view or
  detail change flushes it once that change has landed; so do any other
  Diagram key and the view unmounting. Escape and the Undo key still drop
  it. A sitting's nudges of one part are one undo entry (the store's
  `session`, ended by a selection or part change); a nudge that comes while
  its own last nudge is still laying out carries on from it (`committed` on
  the draft) instead of being eaten or sent to the steps.
- Lost pointer capture ends a gesture; a drag whose element went is let go
  by the next key; a key no draft can take (another edit's relayout) goes
  on to the steps; a committed preview goes when the layout fails, and none
  is held while it is failing. The dragged part is selected once, at the
  slop.
- Settings › Shortcuts names the placement keys and the "place on page"
  scope in all nine catalogues; the drag readout is a catalogue template
  with the language's decimals (U3).
- Clashes are said in four groups — overlap, off the paper, past the margin,
  the path (`ClashGroup`, `clashLabels.ts`) — in the export notice, one
  sentence a group, and in the tag on the page; "overlaps step 4" for one
  step (U6).
- A placement that leaves the part at home is counted as a reset, by how
  (`drag_home`, `keys` — new — or `pane`), decided from the store's
  normalised result; the three placement events have doc comments, and
  their rows are in the Tracked events table (U7).
- The Step pane keeps the step's last cell while a newer layout is under
  way; an unknown size is an empty field (`NumberField` takes `null`) (U8).
- Part home ghosts are taken after the frame's offset, the frame's ghost is
  the parts' box at home (F9); a placed step is checked against the enlarge
  arrows as the page prints them, lifted (F14); the type sizes live in
  `stepType.ts`, read by the layout and the hit boxes (F16). Homes and page
  goldens unchanged.
- Tidied: the Pages docstring, `openEnlargeArea` and the `enlarge_arrow` way
  into a step deleted, `pageImageUrl`, `placementState`, tokens and module
  classes in the placement styles (N3, N4).

As built (the second review's UI fixes, 2026-10-11):

- "This page" is the page the user last acted on (R2-U1). The Pages view
  publishes the page under its middle, the pages on screen and the page last
  pressed — its paper, or a step, turn or arrow on it — which stands while it
  is on screen and the selection is what the press left (`pageInView.ts`).
  `currentDiagramPage` takes the pressed page, else the selected step's page
  while that page is on screen, else the middle; with no Pages view, the
  selected step's page. So with two pages on screen, the Page pane's row and
  Reset This Page act on the page holding the step just clicked, never an
  off-screen step on the page under the middle. The pager still reads the
  middle.
- A press made while an edit is laying out — the nudge the press itself
  commits included — is held, not dropped (R2-U3, `HeldPress` in
  `usePagePlacement`): it selects the step and the part at once, and once the
  pages catch up becomes the draft it would have been, dragged as far as the
  pointer went and committed if it was let go after a drag. So "nudge, click
  the next step, nudge" nudges the next step's frame.

As built (12 Oct, Zach's asks after trying the placement UI):

- A press on a page's paper, or on the space round the pages, lets the
  selection go, step and part, so the next press on a step selects its whole
  frame and a drag moves the frame, never the part last resized. The pressed
  page is still "this page"; Escape's ladder is unchanged.
- The placement controls left the Step pane for the Layers pane, Pages view
  only (`DiagramPageLayers`, `usePageLayers`): the current page's steps in
  paint order, first at the top, as Annotate lists marks, badged Moved and with
  the page tag's clash words (`clashTag`, so a margin clash never reads as an
  overlap); a row press selects the frame, the selected step opens into
  Number, Picture and Text rows that select the part. Under the list, Size,
  X and Y of the part (the frame with none), Reset for it, Reset Layout and the
  clash notice; no Select buttons. The rows are `DiagramLayerList`, moved out
  of `DiagramLayers` with no change on screen. A step selected in Pages brings
  Layers, not Step, and letting it go gives back the tab Layers covered; a
  turn, or a step opened from the pages, brings Step.
- The clash notice is Pages-only, inset as its neighbours, and its sentences
  take `--text-primary` (6.1:1 dark, 9.0:1 light on the warning tint; the
  notice's own `--text-secondary` is 3.7:1 and 4.2:1).

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
- [x] Shared pagination function; `cellSlots` and the layout read it.
- [x] `retainPageCounts` in `commit`; `setDiagramPageSteps`; tests for every rule.

### Phase 2: the layout
- [x] Geometry helpers moved; packing, its cache and tests deleted.
- [x] Balanced rows, odd rows on spine pages, #436's step-down and lane.
- [x] Explicit flow cell rows; packed mode switches gone.
- [x] Fit each per cell; explicit Size held to its room; caption gap.
- [x] Lazy, cached footprints.
- [x] Timeouts reverted, assertions restored, new tests and goldens.
  Every suite runs at vitest's 5 s default; the slowest diagram test takes
  under 1.5 s with the whole web suite running. The assertions are #436's
  again, adapted only where the plan moves a step: a left page that hands
  over has odd rows (6 a page on its side is 3 rows of 2; four steps after
  a break are 2 · 1 · 1, no empty cells), and the band's last join on the
  diagram's last page is G1, not C1, its handle held to the run to its end.
  New: 7 and 12 a page from either side, per-page counts end to end, a
  caption that grows (no other cell, number or text x moves), a 50-step
  time budget (100 ms; 18–24 ms measured alone, 29–37 ms under the suite),
  the homes golden, and a grid's enlarged steps at a Size of 2 and of 6,
  #436's to the byte. Found while writing the caption test: a step's text
  starts below its picture as drawn, and #436's Fit each lets a caption
  that grows lower its run's scale (6 of 30 edits over the fixtures), so a
  neighbour in that run starts its text a little higher; its cell, number
  and text x never move.

### Phase 3: UI and review fixes
- [x] Page pane per-page count, on the current page; checked in the browser
  on the crane (page 2 set to 6: pages 9 · 6 · 9 · 4, page 1 keeping 9 as its
  own; Use default: 9 · 9 · 9 · 1).
- [x] The review fixes listed above.
  - [x] Reset This Page acts on the page in view (U4).
  - [x] The page-break offer only where a break helps, saying it sends the
    frame home (U5).
  - [x] Click focus and Delete with its confirm (M1, M2), checked in the
    browser on the crane.
  - [x] Nudges flushed, not dropped, and one undo entry a sitting (U1, N5).
  - [x] Lost capture, keys not swallowed in a relayout, a failed layout's
    preview let go, the part selected once (U2, N1); checked in the browser.
  - [x] Shortcut labels and scope, and the drag readout, in all nine
    catalogues (U3).
  - [x] Clash wording by group in the export notice and on the page (U6).
  - [x] Analytics `via` and reset-or-placed, doc comments and rows (U7).
  - [x] The Step pane through a relayout; an empty unknown size (U8).
  - [x] Part ghosts after the frame (F9), arrows as printed (F14), shared
    type sizes (F16).
  - [x] Docstring, dead code, helpers, tokens and module classes (N3, N4).
- [x] The second review's fixes, homes and page goldens unchanged; checked in
  the browser on the crane (:5320).
  - [x] Steps added after a counted last page start a page of their own (L1,
    part 1).
  - [x] A count held to what the page can hold; the row shows what every page
    is laid out for and offers only that (R2-U2, L1 parts 2–3 as far as the
    frozen layout allows); a break never emptied (L4); a counted next page
    kept within 30 (L3).
  - [x] Pages in front of a counted page keep their counts; Use default
    there says why instead (L2).
  - [x] "This page" is the page last acted on (R2-U1).
  - [x] A press during a relayout is held, not dropped (R2-U3).
  - [x] A newer build's steps per page carried (F-NEWER-SPP); page counts in
    the v1 fixture (F-V1FIX); the design record says the cells replaced
    packing (F-DOCS).
  - [x] What a count means on the last page: the last page is laid out for
    its capacity, counted or not (see "Keeping later pages still").
- [x] Zach's 12 Oct asks, checked in the browser on the crane (:5320): a press
  away lets the selection go; placement in the Pages view's Layers pane; the
  clash notice Pages-only, legible and inset.

### Phase 4: gate and land
- [ ] Lint, typecheck, i18n check, full web suite (Node 22), build and prerender.
- [ ] Browser: all four diagrams, Pages vs PDF and Print, per-page counts,
  drag/nudge/undo, reflow notice, phone emulation; Chromium and WebKit agree.
- [ ] Renders for Zach; plans and PR body updated; pushed to #443.
