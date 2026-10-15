# Diagram: a title block on the first page

**Status: planned 2026-10-14, revised the same day after a critique (see
"What the critique changed" at the end of the Approach). Phase 1 is being
built.**

**Zach's answer, 2026-10-14:** "Please implement the diagram title-page plan
using your recommendations. Keep this work in a separate PR. I'll decide
whether to delay the release based on how implementation goes. Don't merge
the PR or publish a release." So every decision, T-1 to T-19, takes its
recommendation, and each is marked so below. T-18 is built as recommended
(A, with B as the fallback), but whether the release waits for it is Zach's
call once the build is done. The PR goes into #436's branch and no agent
merges it.

The decisions are numbered T-1 to T-19. T-20, raised in the review of 1a
and 1b, and T-21, raised in the review of 1c to 1e, were taken as
recommended (T-20 B, T-21 A) on 2026-10-14 under Zach's standing "go with
your recs"; they are not his answer, and he may still overrule either.
T-21 has a deadline. Page 1's capacity rule is frozen by the first file any
build saves with the block on, and every build of this branch since 1e has
the switch, whatever its default: so T-21 is settled before this branch
merges into #436 (whose PR preview into `main` then offers the switch), or
ships in a release. Reverting 1f (T-18 B) does not avoid the freeze; fewer
files would freeze the rule, not none. If Zach cannot answer in time and
might take C, the one safe fallback is to hide the switch, not to turn the
default off. Each decision gives its options and a recommendation. Four of
them were the real forks:

- **T-3**, how many steps page 1 holds. The recommendation re-paginates every
  later page when the block is turned on in an existing diagram.
- **T-9**, what the "special step" is. The recommendation ships a step you
  choose in the release, and a step of its own (Link, Show as, Pose) after
  it. The release half does not fully meet "a special step that can be
  linked and rendered".
- **T-5**, whether page 1 keeps the title tab.
- **T-18**, what ships in tomorrow's release.

One consequence of T-1 that Zach should see before he answers: "on by
default" reaches new diagrams only. His crane, and every diagram saved
before this lands, opens without the block, and he turns it on there. That
is his own rule (layout never moves without consent), not a limit of the
build.

It is built on `claude/diagram-title-block`, stacked on #436
(`claude/diagram-workspace-plan-ceb4f2`) at 952fc658e, which has #443 (page
layout) merged in. It goes into #436 by a PR of its own before #436 goes to
`main`. Paths are under `apps/web/src/` unless they say otherwise. Line
numbers are at 952fc658e.

**How the text reads.** Each part is written as it would be built under the
recommended options. Where the text depends on a
decision, it names it, as "(T-3 A)", and that decision says what another
option would change.

## Goal

Zach, 2026-10-14, quoted as written:

> Okay one last feature before the release - most origami diagrams have a
> title part of the first page that looks like this - I want to add that.
> Basically the title, the crease pattern, and then a special step that can
> be linked and rendered for the title (default to the last step) that
> overlaps. dont copy this design exactly but you get the idea. Can you
> please create an plan for this? We will need to change how the first page
> is laid out. It should be a toggle that is on by default. The CP shown
> should default to basically the last CP that is linked in a step, or empty
> if not cps are linked. You should be able to set it separately.

His picture ("looks like this") is the first page of a Korean origami book
(shared in chat, not in the repo). Across the top is a header band with the
series name. Under it, the model's title is set large, in Korean, with its
English name on a dark band below and "175 step" beside it. Three credit
lines follow: Creator, Diagram and Size (60cm x 60cm). On the right is the
whole crease pattern, about a third of the page wide. The finished model
stands in front of the pattern's lower left and covers part of it. Step 1
starts below all of this.

What this plan reads from it:

- **The title, the crease pattern and the finished model**, with the model
  overlapping the pattern. These are what Zach asked for.
- **A band across the top of page 1.** The steps start below it.
- **Not copied:** the series header, the dark bands, the two-language title.
  Credits and the step count are in the picture but not in his words, so
  they are decisions (T-7, T-8).

## Approach

### Common ground

What page 1 is today, and what the block can reuse.

- **Every page has the same header and footer.** `layoutDiagramPages`
  (`diagram/pages/diagramPageLayout.ts:1058`) reserves `HEADER_MM` (11 mm)
  when the title tab is shown (`titleShown`, `pages/pageSignature.ts:103`)
  and `FOOTER_MM` (8 mm) when page numbers are on (`:1069-1071`). The tab is
  one object for the whole diagram (`DiagramPagesLayout.title`, `:538-543`,
  built at `:1392-1405`). The composer draws it on every page
  (`pages/composeDiagramPage.ts:120-129`). Nothing in the layout is
  specific to page 1, except that its lane has no entry and its packing has
  no `kPrev`.
- **A flow page is packed into one rectangle.** `packingArea(paper, headH,
  footH)` (`pages/flowPacking.ts:204-209`) is the paper inside its margins,
  less the header and 3 mm (`AREA_INSET_MM.top`), less the footer and 2 mm.
  It is passed in at `diagramPageLayout.ts:1235`. `areaOf` (`:1626-1630`)
  narrows it at the sides for turns. The packer lays full-width bands that
  turn at the page's edges (`flowPacking.ts:94-145`, a port of Zach's
  prototype). It has no idea of an obstacle.
- **Every flow step's reference scale comes from one cell.** `pageGrid`
  (`diagramPageLayout.ts:562-565`) is cut from the printable area alone,
  never less the header or the title. So nothing on page 1 changes any
  step's reference scale. Each page's own scale `k` is the packer's.
- **A grid page is cut into equal cells.** `cutInto` (`:1082-1089`) gives
  every page cells `(H − 2m − headH − footH) / rows` tall. `cellAt`
  (`:1127-1134`) starts row 0 at `m + headH`.
- **Step 1 starts at the top left of the packing area**, and page 1's
  ribbon starts at step 1's centre with no stub (`pages/flowLane.ts`). With
  First page Left, page 1 hands over at the spine. With First page Right, it
  stands alone and leaves over a page turn (lined up since 952fc658e). Both
  stay valid when the area's top moves down.
- **Pagination.** A page holds `pageCapacity(setup)` steps
  (`pages/pagePlan.ts:73-75`): the flow's steps per page, or the grid's
  columns × rows. A page's own count (`pageSteps` on its first step) wins in
  the flow. `splitPages` and `paginate` (`:177-234`) cut the pages, and
  every surface goes through them: `diagramPageLayout.ts:1081`,
  `useCurrentDiagramPage.ts:44`, `pageCounts.ts:49` (always as the flow),
  `useDiagramPageSetup.ts:39`, `repackActions.ts:62`, `stepPlaces.ts:128`
  and `components/panels/DiagramPanel.tsx:141`. Only one caller reads
  `pageCapacity` itself: `useDiagramPageSetup.ts:38`, the grid's "per page"
  readout. So a rule for page 1 written inside `splitPages` and `paginate`
  reaches every surface at once, and they cannot disagree.
- **A flow page's rows from `paginate` size nothing in the flow.** The
  packer chooses its own bands from `layoutCount` and the page's area
  (`diagramPageLayout.ts:1693`); a flow step's cell is the reference cell
  (`:1127-1129`). So page 1's rows need no change for the block; only its
  area does.
- **Saved flow pages hold.** A page keeps its stored arrangement while its
  signature matches (`holdsArrangement`, `pageSignature.ts:157-163`). The
  signature (`:108-142`) covers the page's structure: index, side, spine,
  last page, capacity, steps per page, paper, margin, the tab shown, page
  numbers, the five packing settings and its steps. `SIGNATURE_VERSION` is
  frozen at `pack-3` (`:58`), and "each entry, and its place, is the
  format" (`:115`).
- **Steadiness** caps how much a freshly packed page may grow over the page
  before it: `k ≤ kPrev × (1 + 0.6 × (1 − s))`, ×1.09 at the default 0.85
  (`flowPacking.ts:290-293`).
- **Page settings** have one table with a default and a legacy value
  (`document/pageSettings.ts:53-80`). Every setting is always written
  (`writePageSetup`, `document/diagramFile.ts:483-490`) and read leniently
  (`normalizePageSetup`, `document/diagramDocument.ts:2544`). The v1 file
  is frozen (`implementation-plans/diagram-workspace.md:1712-1800`), and
  `document/diagramFileV1.test.ts:72-80` holds the frozen fixture to it.
- **The title already has a home.** `DiagramDocument.title`
  (`diagramDocument.ts:1288`) is the header's name, the tab's text and the
  export's file stem. The block prints it; there is no second title field.
- **Fonts load for the document's own texts.** `diagramFontTexts`
  (`pages/diagramPages.ts:405-413`) lists the title (bold) and each step's
  text, and only those faces are loaded and embedded. Any new text the block
  prints must be listed there, or a Korean or Japanese byline has no font.
- **The setter.** `TextSetter.line` (`diagramPageLayout.ts:247`) sets one
  line, bold or regular, cut with "…" at a width. `paragraph` (`:245`)
  wraps to a number of lines, in the regular weight only, and keeps the
  author's line breaks (`setText.ts:121`). A bold title on two lines would
  need a weight added to `paragraph` in both setters (`fontTextSetter.ts`,
  `estimateTextSetter.ts`).
- **One painter draws a pattern's lines in the style's pens.**
  `paperSceneSvgBody` (`lib/paper/paperSvg.ts:206`) paints a `PaperScene`
  into a page another writer owns, and `penForRole` (`:313-329`) maps a
  line's role to its pen: `mountain` and `valley` to the fold pens, `edge`
  to the edge pen, `aux` to the aux pen when the style shows it. The
  crease-pattern export already uses it this way (`lib/creaseExport.ts`).
- **A press on empty paper already opens the Page pane.** In the Pages view,
  a press on a page that is not on a step "brings the Page tab forward"
  (`components/diagram/DiagramPagesView.tsx:67-69`). A press on the block
  lands there too, with no new code.
- **Rows for the controls exist.** `components/ui/fieldRows` has
  `SelectRow`, `SegmentedRow` and `TextAreaRow`; the Step pane's
  instruction is a `TextAreaRow` (`DiagramStepPanel.tsx:201`).
- **Considered and not reused: the crease-pattern export's title.** Edit's
  export (`lib/creaseExport.ts`) already sets a title and subtitle beside a
  pattern and a folded figure. It measures text by estimate
  (`wrapEstimatedText`), not with the diagram's fonts, and draws from the
  open pattern. The diagram's page must set CJK text in its embedded fonts
  and draw with no pattern open, so the block uses the composer's setter
  and the stored thumbnail instead. Its painter (above) is reused.
- **Every printed surface composes its pages in one place.**
  `preparedPages().compose` calls `composeDiagramPage`
  (`pages/diagramPages.ts:445-492`) for the Pages view
  (`useDiagramPages.ts`, `composedPageUrl`), the PDF
  (`export/diagramPdf.ts`), the one-sheet SVG (`export/diagramSheet.ts`) and
  Print (`print/printDiagram.ts`). The prepared pages are made per document
  (`useDiagramPages.ts:23`, `:93`), so any edit composes page 1 again.
- **A step's picture can be drawn anywhere.** `cellPicture`
  (`pages/pagePictures.ts:533-540`) draws a step's picture into a box,
  fitted. Step files (`export/stepFiles.ts`) are per step.
- **Every linked step keeps its pattern as vectors.** `DiagramCpSource`
  carries a `thumbnail` (`diagramDocument.ts:476`): the linked region's
  strokes, each with a role (edge, mountain, valley, unassigned, aux). It is
  made on every capture by `creasesThumbnail`
  (`diagram/capture/captureThumbnail.ts:24-36`), snapped to a tenth of a
  100-unit box, and kept to 20,000 strokes (`MAX_STORED_STROKES`), the
  shortest creases dropped first. It is always in the file. Drawing it
  needs no open pattern and no capture.
- **The style has pens for a pattern's own lines.** `mountainFolds` and
  `valleyFolds` (`lib/paper/paperStyle.ts:55-68`) are solid. In the Diagram
  preset they are the one ink at 0.25 pt, under 0.5 pt edges
  (`lib/paper/paperPresets.ts:49-59`): the reference picture's look. In the
  Default preset they are red and blue. A crease-pattern step draws in the
  other pens, the dashed diagram creases (`capture/creasePatternScene.ts:24-36`).
- **Room on A4 portrait** (margin 12, tab and page numbers on). Page 1's
  packing area is 249 mm tall today. A block 27% of the printable height
  (74 mm) leaves 186 mm, 0.75 of it. A5, B5, Letter and every landscape
  size come out between 0.75 and 0.78 (A5 landscape, the shortest page).

A sketch of page 1 with the block (the proportions are judged on a render,
see Small calls):

```text
+----------------------------------------------------------------+
| TITLE, LARGE AND BOLD                    +-------------------+ |
| byline, up to four lines                 |                   | |
|                                          |  crease pattern,  | |
|                           +--------------+---+  behind       | |
|                           |  the model,      |               | |
|                           |  in front        |               | |
+---------------------------+------------------+---------------+-+  <- the block's foot
|  1 -------- 2 -------- 3        the ribbon starts here         |
```

### 1. The setting, and what old files read

The block is one page setting, `titleBlock: { enabled, heightShare }`
(T-1 A). It joins `PAGE_SETTINGS` with:

- **default** `{ enabled: true, heightShare: 0.27 }`: a new diagram has the
  block. This is Zach's "on by default".
- **legacy** `{ enabled: false, heightShare: 0.27 }`: a file that does not
  say it was written before the block existed, and its page 1 is drawn as it
  was. So "on by default" reaches new diagrams only. An old diagram gets the
  block when its author turns it on. This is the document-evolution rule
  (`diagram-document-evolution.md`, part 3): layout never moves without
  consent.

It is written always, read leniently, compared in `pageSetupEquals`
(`diagramDocument.ts:2592`) and named in the v1 contract.

The block's height is stored, as a share of the printable height (T-2 A).
It is never a code constant: a constant changed later would move every
saved page 1, held or not. What is inside the block (where the title, the
pattern and the model sit) is a look, not a layout. Those proportions are
code constants and may change for every file, since no step moves when they
do.

What the block shows (the model, the pattern, the byline) is a separate
document field, `titleBlockContent` (section 8). Changing it never moves a
step, so it stays out of the page setup and out of every signature.

#### Decisions: the setting

**T-1. Where the toggle and the content live, and what old files read.
Taken as recommended (Zach, 2026-10-14).**
- A. The toggle and height as a page setting (`titleBlock`, default on,
  legacy off, written always). The content as a new document field.
- B. Everything in one new document field, outside the page settings.
- C. As A, but on for every file, old ones included. Every saved diagram's
  page 1 moves the first time it is opened.
- **Recommended: A.** It works like Title and Page numbers, and the page
  settings' rules already cover it. B puts a layout setting where the
  evolution rules do not reach. C breaks "layout never moves without
  consent". A one-time "Add a title block?" offer for old diagrams could
  come later (Not in the first cut).

**T-2. How tall the block is, and whether it can be changed. Taken as recommended
(Zach, 2026-10-14).**
- A. 27% of the printable height, written to the file. No control for it in
  the first cut.
- B. A, plus a Height slider in the Title block section.
- C. A code constant, not written to the file.
- **Recommended: A now, B after the release.** 27% is close to the
  reference picture: 74 mm on A4 portrait, 50 mm on A4 landscape. C would
  move every saved page 1 the day the constant changes.

### 2. Page 1's layout

With the block on, page 1 is laid out like this.

- **Flow.** Page 1's packing area starts below the block: its top is the
  margin, plus the block's height, plus the 3 mm the header keeps today. It
  has no header (T-5 A), so its area does not depend on the title's text.
  The packer is unchanged: it gets a shorter rectangle. `areaOf`
  (`diagramPageLayout.ts:1626-1630`) takes the page's index, and what reads
  its result (`arrangementFits`, `grownToHold`) follows. Step 1 and the
  ribbon's start move down with the area's top. Later pages are as before.
- **Grid** (T-4 B). The block takes the whole rows nearest its share: the
  rounded `heightShare × rows`, at least one and never every row. Every page
  keeps the same cells, so `DiagramPagesLayout.cellMm`, read from the first
  page's cut (`diagramPageLayout.ts:1409`), still holds. The header's room
  stays on every grid page, so on page 1 the block takes the header's room
  and its rows. A grid of one row has no room for the block. The block is
  not drawn there, and the toggle row says it needs two rows.
- **Page 1's capacity** (T-3 A). Page 1 holds fewer steps by default: in
  the flow, `max(1, round(stepsPerPage × (1 − heightShare)))`, so 9 becomes
  7 at 27%. In the grid, `columns × (rows − blockRows)`. A half rounds up,
  and each product is taken as written; the contract says so, since another
  rounding would re-cut saved first pages. A count set on page 1 itself
  still wins (T-20). It is read from the page setup alone, through one
  function, `firstPageCapacity(setup)` in `pagePlan.ts`, called inside
  `splitPages` and `paginate` for the first page only. No caller changes:
  each already paginates through those two. The grid's "per page" readout
  (`useDiagramPageSetup.ts:38`) stays the default; page 1's own number shows
  in "Steps on page 1" (`DiagramPageStepsRow`, `layoutCount`), marked
  Default.
- **Page 1's scale against page 2's** (T-3 A). Steadiness lets a freshly
  packed page grow at most ×1.09 over the page before it. If page 1, with
  fewer steps in less room, packs more than 9% smaller than page 2 would,
  page 2 is held down and later pages ramp back up. The rule above is meant
  to keep the two alike; 1c checks it on the crane and on new diagrams of 9,
  12 and 16 steps a page, on A4, Letter and A4 landscape, and the rule is
  tuned before shipping if they are not.
- **The tab** (T-5 A). Page 1 prints no tab: the block carries the title.
  The other pages keep it. `LayoutPage` gains whether it shows the tab.
- **First page Left and Right** both keep working. Page 1 is shorter from
  the top, and its bottom, where it hands over, is where it was.

**The signature.** Page 1's structure gains one entry, `['title-block',
heightShare]`, appended only when the block is on. So:

- A file with the block off (every saved file) keeps its exact `pack-3`
  digests. `SIGNATURE_VERSION` stays `pack-3`. Nothing re-packs on open.
  `pageSignature.test.ts` already pins three digests (`FROZEN_SIGNATURES`,
  `:47`), built from `createDiagram()`. Once the default is on, that test
  must build its diagram with the block at its legacy value (off), which is
  what every saved file reads as, and its three digests stay as they are. A
  new test pins one digest with the block on.
- This bends the format rule written at `pageSignature.ts:115` ("one added
  … is a new one"), so that comment and the `SIGNATURE_VERSION` doc change
  with it, to say: an entry appended only under a setting that no saved page
  has had keeps the format, since every digest without it is unchanged and
  no structure with it can equal one without. It is safe here because no
  page has ever been saved with the block on.
- With the block on, page 1's tab entry is written as a constant, since the
  tab no longer prints there. So typing a title never re-packs page 1. This
  is free: no page has been saved with the block yet.
- The store's signatures (`stepPlaces.ts:128`) read the same function, so
  they follow.

**Turning the block on, or off,** is a page-setup change through
`setDiagramPage` (`store/workspaceStore/slices/diagramSlice.ts:557`), as
Title and Page numbers are. It is the author's own act, so it may move
layout:

- Page 1 re-packs. Its hand-moved frames keep their offsets while they stay
  in their bands (`repackedFrames.ts`).
- Page 1's count changes (T-3 A), so the steps after it shift and every
  later flow page re-packs. Frames on steps that change page go home, with
  the existing toast and Undo (`usePlacementReflowNotice.ts`). This is the
  same kind of change as editing Steps per page. A page 1 with its own
  count keeps it, and only page 1 re-packs (T-20).
- On a grid, every cell on page 1 moves under the block, so every frame
  there goes home, as Decision 1A says of a cell that moves
  (`stepPlaces.ts`, `pageShape`).
- One Undo restores the document exactly.

#### Decisions: page 1's layout

**T-3. How many steps page 1 holds with the block on. Taken as recommended
(Zach, 2026-10-14).**
- A. Fewer by default, by the block's share: 9 becomes 7 at 27%. A count
  set on page 1 still wins. Turning the block on in an existing diagram
  moves steps from page to page, so every later page re-packs.
- B. The same steps per page. Only page 1 re-packs, and its pictures come
  out about a quarter smaller. On a fresh pack, steadiness then holds page
  2 to ×1.09 of page 1, page 3 to ×1.09 of page 2, and so on: the pictures
  grow back over about four pages.
- C. The toggle writes page 1's own count (A's number) into the file. The
  later pages shift as in A, and the count stays if the block goes off
  again.
- **Recommended: A.** Page 1's pictures match the rest, in new diagrams and
  old. B is lighter on an existing 100-step diagram, but every new diagram
  would open with a small page 1 and a ramp. C leaves a count behind that
  the author did not set.

**T-4. The block in a grid. Taken as recommended
(Zach, 2026-10-14).**
- A. One whole row, whatever the rows. With 6 rows it is 17% of the page.
- B. The whole rows nearest the block's share: one row for 2 to 5 rows, two
  for 6. At least one, never all.
- C. No block in a grid: the toggle is flow only.
- **Recommended: B.** It keeps the block near its share whatever the rows,
  with one rule. Cells keep one size in A and B. With one row, there is no
  room, and the toggle says so (offer only valid choices). C looks like the
  cheap cut but sets a trap: a new diagram is saved with the block on, so a
  grid diagram from the release build would say `enabled: true` and draw
  none. The build that later adds the grid's block would then move every
  such page 1 without consent. If the grid must be cut for time, the
  setting has to be defined as the flow's alone, in the contract, and the
  grid's block would need a setting of its own later.

**T-5. The title tab on page 1, and the Title toggle. Taken as recommended
(Zach, 2026-10-14).**
- A. Page 1 prints no tab. The block always prints the title. The Title
  toggle governs the tab on the other pages, and its help says so.
- B. As A, but Title off also leaves the block's title out.
- C. The tab on every page, page 1 too, above the block.
- **Recommended: A.** The block is the title, set large. A tab above it
  says the title twice. B gives one switch two jobs.

**T-20. A count on page 1 when the block comes or goes. Raised in the
review of 1a and 1b; built as B. B taken as recommended, 2026-10-14, under
Zach's standing "go with your recs": not his answer, and he may still
overrule it.** A count on page 1 wins (T-3 A), and the app writes one
itself. Setting a later page's count holds every page in front of it at its
present size (`heldCounts`, `pages/pageCounts.ts`), so page 1 gets a count
its author never set, and the toggle no longer changes what page 1 holds.
Zach's crane has a count on every page (9, 11, 9).
- A. When the block is turned on or off, or its share changes, a page-1
  count equal to the old first-page default is taken as automatic. It moves
  to the new default through Set Steps on Page, which keeps every later
  page's last step, so page 2 takes up the difference. The crane becomes 7,
  13, 8, and page 2's scale falls from 0.891 to 0.654 (measured on the
  crane through the real reader and layout, before 1c).
- B. As built: a count on page 1 wins, whoever wrote it. The crane keeps 9,
  11, 8; only page 1 re-packs, its nine steps in the block's shorter room.
  "Steps on page 1" in the Page pane shows the count, and setting it to 7
  there is A by hand. After 1f, the reverse holds too: a new diagram whose
  page 1 was held at 7 under the block keeps 7 when the block goes off.
- **Recommended: B for the first cut.** A does not remove the crowding; it
  moves it from page 1 to page 2. It also guesses that a count equal to the
  default was the app's. Neither option is in the file's format; each is
  only what the toggle does. So A can follow the release without moving any
  saved page. `pageCounts.test.ts` pins B, and 1c's steadiness check
  includes the crane under it.
- **What B costs, measured in 1c** (real reader, layout and fonts): the
  crane's page 1 keeps its nine steps at a page scale of 0.864 instead of
  1.251 as saved, 31% smaller, and its pages 2 and 3 are held as saved.
  Under A its page 1 would hold 7 and page 2 fall from 0.891 to 0.654.
  Either way the block costs the crane's first two pages about a quarter to
  a third of their size; Zach chooses which page pays.

**T-21. What the block costs a landscape diagram. Raised in the review of
1c to 1e. A taken as recommended, 2026-10-14, under Zach's standing "go
with your recs": not his answer, and he may still overrule it — before this branch
merges into #436 or ships, since C changes a rule frozen once any build
with the switch saves a file with the block on (the header).** On
a landscape page with First page Left, page 1 under the block is a left
page that hands over at the spine, so its packing takes an odd number of
bands (`flowPacking.ts`): one or three, in 123 mm on A4 and 77 mm on A5.
With the block on, a new diagram's first two pages come out much smaller
than without it. Page scales `k`, page 1 / page 2, block off → on (new
diagrams of the crane's 29 steps, First page Left;
`artifacts/title-block/landscape.txt`, every paper 4 to 16 steps a page,
both first-page sides):

| case | block off | block on | on ÷ off |
| --- | --- | --- | --- |
| A4 landscape, 8 a page | 0.79 / 0.85 | 0.50 / 0.51 | 0.64 / 0.60 |
| A4 landscape, 9 a page | 0.78 / 0.82 | 0.67 / 0.65 | 0.87 / 0.80 |
| A4 landscape, 12 a page | 0.92 / 1.00 | 0.67 / 0.73 | 0.73 / 0.73 |
| A4 landscape, 16 a page | 1.03 / 1.03 | 0.73 / 0.77 | 0.71 / 0.75 |
| Letter landscape, 8 a page | 1.05 / 0.96 | 0.60 / 0.66 | 0.57 / 0.69 |
| Letter landscape, 12 a page | 0.97 / 1.06 | 0.69 / 0.76 | 0.72 / 0.72 |
| A5 landscape, 8 a page | 0.55 / 0.60 | 0.26 / 0.29 | 0.48 / 0.48 |
| A5 landscape, 9 a page | 0.62 / 0.63 | 0.37 / 0.40 | 0.60 / 0.64 |
| A4 landscape, 4 a page | 0.91 / 0.95 | 1.38 / 0.93 | 1.52 / 0.97 |

The pages after page 2 hold other steps with the block on, so their
ratios are rough; they mostly climb back (A4 landscape 8 a page, pages 3–4:
0.86). With First page Right page 1 stands alone and takes any number of
bands; it comes out larger in most landscape cases (A4 landscape 9, 12 and
16 a page: ×1.06, ×1.23, ×1.26) but not all (A4 landscape 8: ×0.86; A5
landscape 8 and 9: ×0.73, ×0.75). Portrait pages lose less, and not
always (A4 9 a page: 1.25 / 1.16 → 1.00 / 1.05; Letter 9: 1.18 / 1.29 →
0.86 / 0.87). At 4 a page in landscape, page 1 comes out about half as
large again as page 2 on the same spread.
- A. As built: the block's share (27%) and page 1's count (T-3 A) on every
  paper. A landscape diagram that minds can take First page Right, or set
  Steps on page 1.
- B. A smaller share by default on a landscape page (say 20%). The share is
  written to the file, so this is only what a new diagram starts with; a
  diagram turned to landscape later keeps its share.
- C. Page 1's count from the bands its area holds, not from the block's
  share: the count a left page that hands over packs into one or three full
  bands. It is new layout, and page 1's rule is frozen with the release
  (section 2), so it must be settled before any file is saved with the
  block on.
- **Recommended: A for the first cut, with these numbers in front of Zach.**
  B moves the cost rather than removing it (a shorter block, the same
  parity), and C is a new rule in the format the day before the release.
  If A is not acceptable for landscape, T-18 B (default off) leaves the
  rule unfrozen only until the first author turns the block on, so C would
  still have to come first; hiding the switch is the only fallback that
  keeps the rule unfrozen.

### 3. Inside the block

(T-6 A) The block is a band from margin to margin.

- **The crease pattern** is a square as tall as the block, at its right.
- **The model** stands in front of the pattern's lower left. Its box is
  about three quarters of the block's height and up to one and a quarter
  wide. Its bottom is the block's foot, and its right edge is about 60% of
  the way across the pattern. Its picture is fitted inside, set to the box's
  bottom right.
- **The title column** runs from the left margin to the pattern, with 4 mm
  to spare — to the model's box instead where a short block brings that up
  beside the title (revised in the review of 1c to 1e). The title is the diagram's own (`DiagramDocument.title`), set
  bold on one line with `setter.line`, at the largest size up to 10 mm that
  fits, and no smaller than 5 mm; past that, cut with an ellipsis. Two
  lines would need a bold `paragraph` in both setters, so it waits for the
  first render to show whether long titles need it.
- **The byline** (T-7 B) follows the title, in the regular weight at the
  step text's size (`STEP_TEXT_SIZE_MM`, 3.2 mm, `pages/stepType.ts:9`). It
  runs to the model's box, on up to four lines.
- **Text** is set by the layout's own setter, as the tab is, so CJK titles,
  the Han style and font embedding work as they do for captions. The
  byline joins `diagramFontTexts` (regular weight), so its faces load.
- **When something is missing.** With no pattern, the model stands in the
  pattern's square, clear of the title's column. With no model, the pattern
  stands alone. With neither, the area is empty. With no title, nothing
  prints. The block keeps its room in every case, so nothing re-packs. The
  Pages view marks what is missing in its overlay, which is never printed.
- **The same on every side.** It is not mirrored on a left or right page.

These proportions are a first guess, tuned on the first render (1d). They
are look, not layout: no step moves when they change.

#### Decisions: inside the block

**T-6. How the block is arranged. Taken as recommended
(Zach, 2026-10-14).**
- A. The title at the left, the pattern at the right, and the model in
  front of the pattern's lower left. The same on every page side.
- B. As A, mirrored on a left page: the art at the outer edge, the title at
  the right.
- C. The pattern and the model side by side, not overlapping.
- **Recommended: A.** It reads title first and art after, like the
  reference picture, without copying its bands. B puts the title after the
  art on a left page. C drops the overlap Zach asked for.

**T-7. Credit lines. Taken as recommended
(Zach, 2026-10-14).**
- A. The title only.
- B. The title and one free-text byline, up to four lines, written as the
  author likes ("Design: …", "Paper: 60 cm square"). The app prints no
  label of its own.
- C. Separate Designer, Diagrams and Paper fields, labelled on the page.
- **Recommended: B in the first cut.** The left side looks empty under a
  title alone, and credits are what the reference picture puts there. C
  needs printed labels. Today the page prints no words of its own, only the
  author's and numbers (`composeDiagramPage.ts` has no `t()`). Printing
  labels would first need a language for the printed page.

**T-8. A step count ("175 step"). Taken as recommended
(Zach, 2026-10-14).**
- A. Not printed in the first cut. An author can type it in the byline,
  where it will not update.
- B. "N steps", counted, in a printed language chosen for the diagram.
- C. The count alone, with no word.
- **Recommended: A.** B has the same language question as T-7 C. C reads
  as a stray number.

### 4. The model: the "special step"

The block's model comes from `titleBlockContent.model`:

- **unsaid: Auto**, the last step that has a picture. Turns, empty steps and
  a newer build's locked steps (`isLockedStep`) are skipped, so a diagram
  ending in a turn still finds its model.
- **`{ kind: 'step', stepId }`**: a chosen step. If that step is gone (deleted,
  or now a turn or a locked step), the block shows Auto in its place. The
  stale id is left in the document rather than cleared by every verb that
  can delete a step; it is harmless, and choosing again replaces it. (Undo
  needs nothing from it: it restores the whole document.) A chosen step
  that has lost its picture draws no model, and the Pages view's overlay
  says so.
- **`{ kind: 'none' }`**: no model.
- **`{ kind: 'own', step }`** (T-9 C, after the release, and not in the
  release's format; T-17 B): a step record of its own.

It is drawn (T-10 A) with `cellPicture` (`pages/pagePictures.ts:533`), given
a copy of the step with `annotations: []` and no `zoom`, and no measure, so
it is fitted. `cellPicture` centres a picture in its room, so the model's
room is first shrunk to the picture's own extent (`pictureExtent`, as the
layout measures cells) and set to the box's bottom right. It has no number
and no caption. It is not on the ribbon,
it is not numbered, and the Steps view does not show it.

In the first cut, the special step is a step you choose (T-9 A). Its pose is
that step's. To change how the model looks, you pose that step (Pose, Show
as, Refresh), which also changes it in the sequence. This does not yet meet
"a special step that can be linked and rendered". That is the after-release
half of T-9 C: the model becomes its own copy the first time it is posed,
relinked or shown another way from the block.

What the after-release half touches, so the size is clear:

- `stepById`, `updateStep` and `setLinkedPicture`
  (`diagramDocument.ts:1490`, `:2518`, `:1722-1752`) find the block's own
  record too. About 35 files call `stepById`.
- The capture's begin and commit (`store/workspaceStore/diagramCapture.ts:150-233`)
  run for it, guarded by its own revision.
- Pose opens only on a selection (`store/workspaceStore/types.ts:1938-1944`).
  The block's model needs a selection of its own on the Pages view.
- The Step pane says "Select a step" for anything that is not a numbered
  step (`components/panels/DiagramStepPanel.tsx:114-126`). It needs a
  "Title picture" variant: the Picture section without number, caption or
  Annotate.
- Link status, Refresh all and the out-of-date counts walk the steps only,
  so they must also ask about the block's record.

#### Decisions: the model

**T-9. What the "special step" is. Taken as recommended (Zach,
2026-10-14).**
- A. A step you choose. Auto (the last step with a picture), a chosen step,
  or none. Its pose is that step's.
- B. A record of its own, seeded from the last step, with Link and Relink,
  Upload, Show as, Pose and Refresh. Not numbered, not on the ribbon.
- C. Both, in order. It follows a step (A) until the author poses,
  relinks, uploads or shows it another way from the block. Then it becomes
  its own copy of that step's source and picture (no marks, no window, no
  place, its own revision). Auto stays the default.
- D. A step in `steps` flagged as the title's.
- **Recommended: C, built A first.** The first cut is A: no capture code is
  touched the day before the release. B's half follows the release (2a).
  Zach's words, "a special step that can be linked and rendered", read as B
  or C. A alone does not meet them: in the release, to change how the model
  looks you change the step it follows, in the sequence too. If that is not
  good enough to ship, the choice is T-18 C (hold the feature) rather than
  building B overnight. D is not recommended: every walk of `steps`
  (numbering, pagination, the ribbon, the Steps view, duplicate, delete,
  Refresh all) would have to learn to skip it.

**T-10. How the model is drawn. Taken as recommended
(Zach, 2026-10-14).**
- A. The picture alone: no marks (arrows, labels), no number, no caption.
  An enlarged step shows its whole picture, not its window. Fitted to its
  box.
- B. Exactly as its cell prints it, marks included.
- **Recommended: A.** The block shows the finished model, not an
  instruction. The arrows on the last step would point at nothing in the
  block.

### 5. The crease pattern

The block's pattern comes from `titleBlockContent.pattern`:

- **unsaid: Auto**, the pattern of the last step linked to a crease pattern,
  whatever it is shown as (T-12 A). Shown folded or in 3D, its link still
  names a region of the crease pattern. With no linked step, the pattern is
  empty, as Zach asked.
- **`{ kind: 'step', stepId }`**: a chosen step's pattern. This is "set it
  separately" in the first cut (T-13 A). The Page pane lists each distinct
  pattern the steps link once, named by the last step that links it.
  Distinct means a different thumbnail (the same content the file's
  thumbnail table already writes once, `ThumbnailWriter.keyOf`), so fifty
  steps linking one sheet are one entry. A step that is gone reads as Auto,
  as for the model. Locked steps are skipped, in Auto and in the list.
- **`{ kind: 'none' }`**: no pattern.
- **`{ kind: 'own', scope, fingerprint, thumbnail }`** (after the release,
  and not in the release's format; T-17 B): a region of the open pattern,
  picked in the pattern picker (`components/diagram/DiagramPatternPicker.tsx`,
  with Show as hidden), with its own link status and Refresh. It is a
  `DiagramCpSource` without a render, so `linkStatus`
  (`capture/linkStatus.ts:76-91`) checks it as is.

It is drawn from the link's stored thumbnail (T-11 A), as vectors fitted
into the square, through the shared painter: the strokes become the lines
of a `PaperScene` and go through `paperSceneSvgBody`, so the pens, their pt
widths and dashes are `penForRole`'s and nothing is drawn by new pen code
(T-14 A). The roles map as:

- `mountain` and `valley` to the same roles: `mountainFolds` and
  `valleyFolds`;
- `edge` to `edge`: the edge pen;
- `unassigned` to `aux`: the aux pen, when the style shows aux lines;
- `aux` strokes left out.

The paper is not filled, so the pattern sits on the page. The model, in
front, covers it with its own paper. The thumbnail is in the pattern's own
orientation, as in Edit. A pattern that is not square is centred in its
square.

What the thumbnail is, honestly:

- It is snapped to a tenth of its 100-unit box. On a 74 mm square that is
  0.07 mm, under the 0.25 pt (0.09 mm) line.
- It holds at most 20,000 strokes. Past that, the shortest creases go
  first.
- It shows the linked region only, not the whole sheet when the link is a
  part of it.
- It is as current as that step's last capture. If the pattern was edited
  and the step not refreshed, the block is as stale as the step, and
  Refresh on the step brings both up to date.

#### Decisions: the crease pattern

**T-11. Where the pattern's lines come from. Taken as recommended
(Zach, 2026-10-14).**
- A. The link's stored thumbnail: in the file already, no capture, no open
  pattern.
- B. A crease-pattern capture of its own, stored as a picture. It draws
  exactly as a crease-pattern step, but needs the pattern open, new storage
  and its own refresh.
- C. Only when the step is itself shown as a crease pattern: its picture.
- **Recommended: A.** It is there for every linked step, and is fine at
  print size (above). B is a second capture path the day before the
  release. C leaves the pattern empty for most diagrams, whose last steps
  are folded.

**T-12. What counts as "the last CP linked". Taken as recommended
(Zach, 2026-10-14).**
- A. The last step whose source is a link to a crease pattern, whatever it
  is shown as.
- B. A, and a References step's sheet too.
- C. The whole pattern open in Edit.
- **Recommended: A.** B can pick a precrease sheet. C can include sheets
  that have nothing to do with the model, and an Edit document need not be
  open.

**T-13. Setting the pattern separately. Taken as recommended
(Zach, 2026-10-14).**
- A. In the first cut: Auto, a step's pattern, or None. After the release:
  any region of the open pattern, through the pattern picker, with its own
  status and Refresh.
- B. The picker in the first cut.
- **Recommended: A.** Every pattern a diagram uses is linked by some step,
  so A covers nearly everything. The picker needs the pattern open and a
  way to make a fingerprint and thumbnail outside a step's capture. That is
  new code the day before the release.

**T-14. The pattern's pens. Taken as recommended
(Zach, 2026-10-14).**
- A. The style's fold pens: solid, the Diagram preset's one ink at 0.25 pt
  under 0.5 pt edges (the reference picture's look), red and blue in the
  Default preset. Aux lines left out.
- B. The diagram-crease pens a crease-pattern step uses: dashed valleys,
  dash-dot mountains.
- C. Every line in the edge pen.
- **Recommended: A.** It is the pattern, not an instruction. B reads as a
  sheet of folds to make, and dashes mean valley folds. C loses mountain and
  valley in the Default preset, where colour tells them apart.

### 6. Every surface

The block is drawn in `composeDiagramPage`, after the flow band and before
the cells, where the tab is drawn today (`composeDiagramPage.ts:120-129`):
the pattern, then the model, then the title and byline. So it is on every
surface that prints pages:

- the Pages view;
- the PDF, home and print-shop presets;
- Print;
- the one-sheet SVG.

Step files are per step and have no block.

- **Inputs.** The geometry and the set title and byline are on
  `LayoutPage.titleBlock`, page 1's only: `layoutDiagram`
  (`pages/diagramPages.ts:289`) hands the byline to `layoutDiagramPages`
  beside the title. The model step and the pattern's thumbnail are resolved
  once per prepared document by a pure `resolveTitleBlock(document)` in
  `preparedPages` (`diagramPages.ts:445`) and passed to the composer.
- **Partial compositions.** An `only` composition (one part, lifted while it
  is dragged) skips the block, as it skips the tab. An `omit` composition
  (the page without that part) draws it, as it draws the tab
  (`composeDiagramPage.ts:120` tests `only` alone). Skipping it there would
  make the block vanish while a step on page 1 is dragged.
- **Fonts.** Text goes through `textElement` and `use()`, so its characters
  are subset and embedded, and the byline is in `diagramFontTexts`, so its
  faces are loaded first.
- **No new invalidation.** The prepared pages are made per document, so an
  edit to the last step's picture composes page 1 again. A test pins it.
- **The Pages view overlay** (`components/diagram/DiagramPagesView.tsx`,
  never printed) shows placeholders in the block for what is missing:
  "Add a title" where the title would be, and a dashed box where a missing
  pattern or model would be. Zach keeps dashed placeholders and drop zones
  (memory, "dashes mean valley folds").

### 7. Controls

(T-15 A, T-19 A) A new **Title block** section in the Page pane, after
Layout. It holds:

- **Title block**, the toggle. Its help: "The title, the crease pattern and
  the finished model, at the top of the first page." In a one-row grid it is
  disabled, with "Needs two rows or more". With it off, the rows below are
  hidden.
- **Model**: one `SelectRow`. "Auto (step 42)", naming the step Auto finds
  now, then each step that has a picture ("Step 12"), then None. One row
  says what Auto resolves to and offers only valid choices; a segmented
  Auto/Step/None with a second list would take two rows for the same
  choice.
- **Crease pattern**: one `SelectRow` the same way: "Auto (step 40)", then
  each distinct linked pattern, by the last step that links it, then None.
  With no linked step, Auto reads "Auto (none linked)".
- **Byline**: a `TextAreaRow` (as the Step pane's instruction), up to four
  lines, committed when it loses focus.

The rows come from `components/ui/fieldRows`. The section is
`components/diagram/DiagramTitleBlockSection.tsx`, bound by a hook beside
the page modules, `diagram/pages/useDiagramTitleBlock.ts`, which holds the
store bindings and the lists. `DiagramPagePanel.tsx` (252 lines) only mounts
it, after Layout. The section gets a CSS module only if it needs a style of
its own.

- **Store.** Content changes go through one new slice action,
  `setDiagramTitleBlockContent(patch)`, one undo step each. The toggle goes
  through `setPage`, as Title does.
- **Title help.** The Header & footer section's Title help changes to say
  the tab prints on every page after the block (T-5 A).

Nothing on the Pages view is selectable in the first cut. A press on the
block does what a press on empty paper does today: it lets the selection go
and brings the Page tab forward (`DiagramPagesView.tsx:67-69`), where the
section is. Scrolling that section into view on such a press, and selecting
the model to pose it, come after the release with T-9's own half.

#### Decisions: controls

**T-15. Where the block is edited. Taken as recommended
(Zach, 2026-10-14).**
- A. The Title block section in the Page pane, and nowhere else in the first
  cut.
- B. A, plus a press on the block in the Pages view opening that section
  and scrolling it into view (the Page tab already comes forward).
- C. A, plus a step-card verb, "Use in Title Block", in the card menu's
  submenus (814a8ef60).
- **Recommended: A in the first cut, then B and C.** B needs the Pages view
  to tell a press on the block from one on empty paper, and the pane to be
  told which section to open. Selecting the block itself would be a new kind
  of selection, which nothing has today (`diagramPagesPart` is a step's
  part). C is cheap but adds a verb to a menu just regrouped.

**T-16. A step frame placed over the block. Taken as recommended
(Zach, 2026-10-14).**
- A. Say nothing. A step placed over the block by hand is the author's call.
- B. The "Outside margin" notice counts the block as margin on page 1.
- **Recommended: A.** `markOutsideMargin` (`pages/pagePlacement.ts:145-156`)
  checks the margins only. Zach has said "Outside margin" is the only
  placement notice. Calling the block a margin would be untrue. A frame kept
  at its offset by a re-pack could land on the block, but only when it was
  moved up toward the top by hand.

**T-19. Where the toggle sits. Taken as recommended
(Zach, 2026-10-14).**
- A. In its own Title block section, after Layout, with the block's content
  under it.
- B. In Header & footer, under Title, as "Title block on page 1", with the
  content in a Title block section shown only while it is on.
- **Recommended: A.** The toggle and what it governs stay together, and a
  section that appears and disappears moves everything under it. B puts it
  beside the tab it replaces on page 1, which is also a fair reading; it is
  a coin toss, so Zach's eye decides.

### 8. The file

A deliberate change to the frozen v1 format, made the way
`diagram-document-evolution.md` says.

**`page.titleBlock`**: `{ enabled: boolean, heightShare: number }`.

- It is written always, as the whole object (as `pageNumbers` is).
- When unsaid, or not an object, it reads as the legacy `{ enabled: false,
  heightShare: 0.27 }`. A field of it that does not read takes that
  field's legacy value alone, as a field of `pageNumbers` does: `{ enabled:
  true }` reads as on at 0.27.
- `heightShare` runs from 0.15 to 0.5. Past that range it is a newer
  build's (rule 2), and so is a field of `titleBlock` this build has no name
  for: `readNewerPage` (`diagramFile.ts:343-357`) gains a key set for it, as
  `pageNumbers` has (`PAGE_NUMBERS_KEYS`, `:303`). Either way the newer
  object is written back as it came, and read as `pageNumbers` and the
  margin are: `enabled` as written, the share held to its range. So the
  block stays where the newer build drew one, and at the same share page 1
  holds the same steps and every later page holds.
- *Revised in the review of 1a and 1b.* The first draft read any damage
  as the legacy value whole, and a newer build's block as no block. The
  second re-cut every flow page of such a file in this build, moving layout
  without consent, against the contract's rule 2 ("shown as this build's
  default or nearest").
- `PAGE_SETTINGS` (`document/pageSettings.ts:53-80`) gains the row,
  `normalizePageSetup` (`diagramDocument.ts:2544`) reads it,
  `pageSetupEquals` (`:2592`) compares it, and `writePageSetup`
  (`diagramFile.ts:483-490`) writes it whole, as it writes `pageNumbers`.

**`titleBlockContent`**, a new optional field on the diagram. In the
release's format (T-17 B):

```text
titleBlockContent?: {
  model?:   { kind: 'step', stepId } | { kind: 'none' }
  pattern?: { kind: 'step', stepId } | { kind: 'none' }
  byline?:  string
}
```

- An unsaid part is Auto, or for the byline, empty. The field is written
  only when something in it is set: its absence is itself a value (Auto
  everywhere), class (c) in the evolution plan's audit, so an unsaid part
  means Auto for good. What Auto finds (the last step with a picture, the
  last linked pattern) is class (b), a look: changing it later moves no
  step, so it may change for every file. Unlike a pen or a gap, it changes
  content on old files (which model or pattern their block pictures), so a
  change to it is Zach's call. (Split in the review of 1a and 1b: the
  audit had both in one (c) row.)
- The byline goes through `xmlText`, as the title does.
- A part that does not read is dropped alone and reads as Auto.
- A kind or field this build has no name for is a newer build's (rule 2).
  That part is carried verbatim in a slot of its own,
  `DiagramNewerFields.titleBlockContent` (`diagramDocument.ts:1367-1393`),
  by part, and written back until the author sets that part here. The block
  shows this build's own fallback, Auto, in its place, as
  `DiagramNewerFields` says of every newer value.
- `carriedJson` (`diagramDocument.ts:2261`) includes that slot, so an asset
  or a thumbnail a newer build's model or pattern names is kept by
  `withReferencedAssets` (`:2292-2309`) and by the thumbnail writer
  (`diagramFile.ts:425-456`), as for every other carried part.
- `DOCUMENT_KEYS` (`diagramFile.ts:257-268`) gains the field, so it is no
  longer carried as an unknown one.

The after-release build adds `{ kind: 'own', … }` for the model and the
pattern (sections 4 and 5). The release build carries such a part and shows
Auto for it.

**The contract** (`implementation-plans/diagram-workspace.md`, The v1 file)
names both, and the rule for an unsaid or newer part. The frozen fixture
(`document/__fixtures__/diagram-v1.json`) does not change.
`diagramFileV1.test.ts:72-80` expects it written back with `titleBlock`
added at its legacy value, as the packing settings were, and its pagination
test (`:60-70`) is unchanged, since the block reads as off. A new fixture,
`__fixtures__/diagram-title-block.json`, holds the block on, every kind of
model and pattern this build makes, a byline in Korean, and one part of a
kind it does not know (an `own` model naming an asset). It is read, written
back exactly, the asset is kept across an edit, and the unknown part shows
Auto.

#### Decisions: the file

**T-17. How much of the later format the release reads. Taken as recommended
(Zach, 2026-10-14).**
- A. All of it. The release reads and draws an own model and an own
  pattern, though it cannot make one. Anything else is carried.
- B. Only what the release makes: Auto, a step, or none. An own model or
  pattern from a later build is carried, and the block shows Auto for it.
- **Recommended: B.** A reads, writes, prunes and draws a step record that
  lives outside `steps`, the day before the release, with no control that
  makes one, so only a fixture would ever exercise it. It would also fix the
  `own` shapes in the format before 2a and 2b are designed: the own pattern
  may want a turn, the own model a revision of its own. With B, a file from
  the later build shows Auto in the release build, which is how every newer
  value already behaves. B's carry is a few lines; A's reading is a phase.

### 9. The release

The first cut (Phase 1) is the smallest thing that does what Zach asked
for the release: the toggle, the title, the pattern and the model
overlapping, each settable, on every printed surface, in the flow and the
grid. My estimate, not a measurement: about 2,000 changed lines with tests
and nine catalogs, 1.5 to 2 days for one builder with every gate, or one
long day split across three builders after 1a and 1b land (layout and
drawing, Page pane and overlay, the default flip and its tests). The
riskiest part is 1b, which touches pagination and the signatures the day
before the release; its pinned digests are the guard.

**The default goes on last.** Every phase is built with
`PAGE_SETTINGS.titleBlock.default` off. Turning it on is the last commit,
1f, on its own. About 39 test files lay out pages from `createDiagram()`
(the pagination, layout, placement, signature, export and store tests among
them), and a new diagram's page 1 changes under many of them. In that commit,
a test about something else pins the block off, at its legacy value, and
says so; a test about new diagrams is updated to the block. So T-18 B (ship
with the default off) is a revert of one commit, not a decision made in a
hurry.

**If time runs short**, cut in this order. None of these leaves a format
trap, since each is either absent from the file or optional in it:

1. The byline (an optional part; added later, its absence is empty).
2. The overlay's placeholders, keeping one outline of the block.
3. The `diagram exported` property.

Never cut for time: the grid (T-4, a format trap), the pinned digests, the
default-off-for-old-files rule, or the Step choices for the model and the
pattern ("can be linked", "set it separately").

#### Decision: the release

**T-18. What ships in tomorrow's release. Built as recommended (A, B the
fallback); whether the release waits for it is Zach's call once the build
is done (Zach, 2026-10-14).**
- A. The first cut ships, on for new diagrams.
- B. The first cut ships with its default off, so new diagrams opt in. It
  is the fallback if the gate is not green on every surface in time. Only
  `PAGE_SETTINGS.titleBlock.default` changes. Turning it on later reaches
  new diagrams only.
- C. Nothing ships in the release. It lands after, in a PR of its own to
  `main`.
- **Recommended: A, with B as the fallback.** In A and B the format change
  is part of the release, so files saved by the release build already say
  whether they have a block. In C, files from the release say nothing and
  read as off, which is also safe.
- **B, as built.** The default is f24ee7f57 (`pageSettings.ts` and the tests
  it broke) and 979199073 (the evolution plan's sentence on legacy values).
  B reverts those two for their code and docs, and keeps this plan as it
  is, its 1f items unticked: f24ee7f57 also wrote this plan's notes on
  pages with the block (1f, and the final review under 1g), and those
  pages exist with the default off as soon as an author turns the block on
  (`git revert --no-commit f24ee7f57 979199073`, then
  `git checkout HEAD -- implementation-plans/diagram-title-block.md`). B
  settles nothing about T-21: the switch stays.

### 10. i18n, analytics and tests

- **i18n.** The section's strings under `panels:diagram.pagePane.titleBlock.*`
  (about a dozen: the section, the toggle and its help, the one-row hint,
  Model, Crease pattern, "Auto (step {{number}})", "Auto (none linked)",
  "Step {{number}}", None, Byline and its help), and the overlay's
  placeholders under `panels:diagram.pages.*`. Inline English,
  `i18n:extract`, the eight locales translated, `i18n:stamp`, `i18n:check`.
  The printed page gains no word of its own (T-7, T-8).
- **Analytics** (enums only).
  - `DiagramPageSetting` (`analytics/events.ts:431`) gains `title_block`,
    `title_block_model`, `title_block_pattern` and `title_block_byline`.
  - `trackDiagramPageSetupChanged` (`analytics/trackDiagram.ts:328`) gains
    an optional `title_block_choice` property (`auto`, `step`, `none`) for
    the model and the pattern, beside its `style`. Never which step, never
    the text.
  - `diagram exported` gains `title_block` (`shown`, `hidden`), so we can
    see whether the block leaves the app.
  - The byline counts once per commit.
  - `docs/analytics.md` says all of this.
- **Tests.** Listed in the checklist. Every one that guards "nothing moves"
  is written to fail before its change.

### Small calls made here

Each can be overturned. None was decided quietly; each is here so Zach can
see it.

- **Names.** The page setting `titleBlock`, the document field
  `titleBlockContent`, the section "Title block", the row "Byline".
- **Page 1 keeps its page number.**
- **The block stays inside the margins.** It runs into no bleed.
- **The title's sizes**: one bold line, up to 10 mm, down to 5 mm, then an
  ellipsis. Two lines wait for the first render (they need a bold
  `paragraph` in both setters). **The byline's**: the step text's size, four
  lines, then cut.
- **No rule or band** under the title in the first render. Whether the
  block wants a rule like the tab's (`RULE_WIDTH_MM`) is judged on that
  render.
- **One select per part** (Model, Crease pattern): "Auto (step N)", the
  choices, None. Not a segmented control plus a list.
- **A tie rounds up** (added in the review of 1a and 1b). Page 1's count
  and a grid's block rows round a half up (`Math.round`), and the contract
  says so, since the rule freezes with the release. So at a share of 0.5 a
  three-row grid gives the block two rows, two thirds of the page. Nothing
  ties at 0.27, the only share the first cut writes; ties come with the
  Height slider (2d). But this build will read that build's files, so the
  rule is decided now. Rounding a half down instead is a small change
  before the release, and never one after it.
- **A chosen step that is gone reads as Auto.** Its stale id is left in the
  document, not cleared by every delete verb. **A chosen step with no
  picture draws no model**, and the overlay says so.
- **A newer build's part shows Auto**, this build's fallback, as every other
  newer value does, and is written back until the author sets that part.
- **Branch and PR.** `claude/diagram-title-block`, stacked on #436 at
  952fc658e, with a PR into #436's branch.
- **The contract text is corrected in passing.** It still says several page
  settings are "written only when not" their default
  (`diagram-workspace.md:1745-1757`), but every setting has been written
  since 2026-10-12 (`writePageSetup`). 1a fixes the text while it is open.

### Not in the first cut

After the release, each in a PR of its own to `main`:

- The model as its own record (T-9 C's second half): Link, Relink, Upload,
  Show as, Pose and Refresh from the block, a "Title picture" Step pane, and
  its link status and Refresh all. Its `own` kind enters the format then.
- Any region of the open pattern as the block's pattern, through the picker,
  with status and Refresh (T-13 A's second half). A turn for the pattern.
- Pressing the block to open its section (T-15 B). The step-card verb (T-15
  C). A Layers pane row for the block.
- A Height slider (T-2 B).
- A two-line title, if the first render asks for it.
- A printed step count and labelled credits, after a printed language for
  the page is decided (T-7 C, T-8 B).
- A one-time "Add a title block?" offer when an old diagram is opened.
- Marks on the model (a star, say), if Zach wants them.

### Found while planning (not this plan's)

- **Typing a title re-packs the flow.** Typing a diagram's first title
  character, or clearing it, re-packs every flow page. The tab's room is in
  every page's signature (`titleShown`, `pageSignature.ts:103-105`, `:128`),
  and a new diagram can start untitled (`diagramDocument.ts:1432`).
  `pagePlan.ts:23-24` says typing never re-cuts a page. The rows indeed do
  not change, but the packing does, because the tab's room moves the
  packing area. Fixing it is a layout and signature-format change (keep the
  tab's room whenever Title is on), so it is not done here. The block avoids
  it on page 1 (section 2); in a new diagram, pages 2 on still re-pack when
  the first character of the title is typed.

### What the critique changed (2026-10-14)

- An `omit` composition draws the block; only `only` skips it. The first
  draft skipped both, which would have hidden the block while a step on
  page 1 was dragged.
- Page 1's rule lives inside `splitPages` and `paginate`, which every
  surface already shares; the first draft added a function for "seven
  places" to call.
- The byline joins `diagramFontTexts`, or its CJK faces would not load.
- The pattern is drawn by the shared `paperSceneSvgBody` and `penForRole`,
  not a new stroke painter.
- The title is one bold line: the setter has no bold paragraph.
- T-17 now recommends B: the release does not read or write an `own` model
  or pattern, and a later build's shows Auto, as every newer value does.
- The default goes on last, in its own commit: about 39 test files lay out
  pages from a new diagram, and the frozen signatures test must pin the
  block off.
- The signature's format comment changes with the conditional entry.
- T-4 C is shown to be a format trap, not a cheap cut.
- A check that page 1's scale does not hold page 2 down (steadiness).
- Distinct patterns are defined (by thumbnail content); locked steps are
  skipped; a stale chosen id is explained without an Undo argument.
- The estimate is 1.5 to 2 days for one builder, with a cut order, not
  "about a day".
- T-19 (where the toggle sits) is a decision, not a silent call.

## Affected Areas

**The setting and the file.** `diagram/document/pageSettings.ts`
(`titleBlock`), `diagram/document/diagramDocument.ts` (`DiagramPageSetup`,
`DiagramDocument.titleBlockContent`, `DiagramNewerFields.titleBlockContent`,
`normalizePageSetup`, `pageSetupEquals`, `carriedJson`, a
`setTitleBlockContent` edit), `diagram/document/diagramFile.ts`
(`DOCUMENT_KEYS`, `readNewerPage` and a key set for `titleBlock`,
`readDiagram`, `writeDiagram`, `writePageSetup`),
`diagram/document/pageRanges.ts` (the share's range); `diagramFileV1.test.ts`,
`diagramFile.test.ts`, new `__fixtures__/diagram-title-block.json`;
`implementation-plans/diagram-workspace.md` (the v1 contract).

**Pagination and signatures.** `diagram/pages/pagePlan.ts`
(`firstPageCapacity`, inside `splitPages` and `paginate`; the callers do not
change), `pageSignature.ts` (the entry and its format comment);
`pageSignature.test.ts` (`FROZEN_SIGNATURES` pinned with the block off),
`pagePlan.test.ts`, `savedPagesHold.test.ts`, `heldPages.test.ts`,
`pageCounts.test.ts`, `stepPlaces.test.ts`.

**Layout.** `diagram/pages/diagramPageLayout.ts` (`LayoutPage.titleBlock`,
the tab per page, page 1's area through `areaOf`, the grid's page-1 rows in
`cellAt`), `diagram/pages/diagramPages.ts` (`layoutDiagram` passes the
byline), a new `diagram/pages/titleBlockGeometry.ts` with its tests;
`diagramPageLayout.test.ts`, `flowLane.test.ts`.

**Drawing.** A new `diagram/pages/titleBlockContent.ts`
(`resolveTitleBlock`, and the thumbnail as a `PaperScene`) with its tests;
`diagram/pages/composeDiagramPage.ts`, `diagram/pages/diagramPages.ts`
(`preparedPages`, `diagramFontTexts`); `lib/paper/paperSvg.ts` is used, not
changed; `composeDiagramPage.test.ts`, `useDiagramPages.test.tsx`, export
tests.

**Controls.** New `components/diagram/DiagramTitleBlockSection.tsx` (and a
module only if styled), new `diagram/pages/useDiagramTitleBlock.ts`;
`components/panels/DiagramPagePanel.tsx` (mounts it; the Title help);
`components/diagram/DiagramPagesView.tsx` (the overlay's placeholders);
`store/workspaceStore/slices/diagramSlice.ts`
(`setDiagramTitleBlockContent`).

**All.** `analytics/events.ts`, `analytics/trackDiagram.ts`,
`docs/analytics.md`, the export's analytics call; `public/locales/*` (nine
catalogs). In 1f, the tests that lay out a new diagram's pages.

**The final review.** `diagram/pages/pagePictures.ts` (`fittedScene` by its
ink, `wholePictureRoom`), `stepPlaces.ts` and `pagePlan.ts`
(`PlannedPage.titleBlockRows`), `diagramPageLayout.ts` (a grid's enlarged
step's `placed.auto`), `components/ui/fieldRows/` (`SelectRow.note`, a
reason note that wraps), `implementation-plans/diagram-document-evolution.md`
(part 3).

## Checklist

**Every phase.**

- Tests that fail before their change. Nearby tests, lint and typecheck on
  each commit.
- Lint, typecheck and the i18n check, and the vitest directories near the
  change (Node 22, run in the web workspace). CI runs the whole suite on
  the PR into #436's branch (stacked PRs get CI since #443); Zach asked for
  relevant tests locally, not the full run.
- In the browser, before and after on Zach's crane and on a new diagram:
  the Pages view, the PDF at print size, Print, and the one-sheet SVG. Light
  and dark for the pane. Desktop Chromium and iPad-sized WebKit.
- Each fix shown on its own, with its confidence and evidence. The builder
  owns every gate, the browser's included, and shares the proof with Zach.
- What was built is written under each phase.

### Before building: Zach's answers

- [x] T-3, T-5, T-9 and T-18 answered: the recommendations (2026-10-14).
- [x] The rest: "using your recommendations" (2026-10-14).
- [x] T-20 and T-21, raised during the build: taken as recommended
  (T-20 B, T-21 A), 2026-10-14, under his standing "go with your recs".
  Not his answer: Zach may still overrule either, T-21 before this branch
  merges into #436 or ships (the header).

### Phase 1: the first cut (for the release)

The toggle, the title and byline, the pattern and the model overlapping, on
every surface, in the flow and the grid. Section 9 has the estimate and the
cut order. T-18 says what happens if it is not ready. The default stays off
until 1f.

**1a. The setting and the file**
- [x] `titleBlock` in `PAGE_SETTINGS` (default off until 1f, legacy off,
  share 0.27), the type, `normalizePageSetup`, `pageSetupEquals`,
  `writePageSetup` (whole), `readNewerPage` (the share's range and a key
  set: past either is a newer build's).
- [x] `titleBlockContent` (T-17 B): the type, the reader and the writer,
  `DOCUMENT_KEYS`. Lenient parts. `DiagramNewerFields.titleBlockContent` for
  a newer build's part, by part, shown as Auto and written back.
- [x] `carriedJson` reads that slot, so an asset or thumbnail it names
  survives an edit and a save. A test that fails before.
- [x] The v1 contract names both fields, and its stale "written only when"
  text is corrected. `diagramFileV1.test.ts` expects `titleBlock` at its
  legacy value, and the frozen fixture is unchanged.
- [x] The new fixture, round-tripped exactly; its unknown part carried, its
  asset kept, shown as Auto.
- [x] A file without `titleBlock` reads off. A damaged one reads off,
  field by field.

*As built (1a).* As planned, with these calls:
- `titleBlock` is the last row of `PAGE_SETTINGS`, so it is written after
  the packing. Its share's range, `TITLE_BLOCK_SHARE_RANGE`, is in
  `pageRanges.ts` beside the other ranges the pagination reads.
- A field of `titleBlock` that does not read takes that field's legacy
  value (`{ enabled: true }` reads as on at 0.27); no object at all reads
  as no block. A newer build's `titleBlock` (a share past 0.15–0.5, or a
  field this build has no name for) is carried in `newer.page`, and its
  known fields read as they read in any file (`normalizePageSetup`): on as
  written, the share clamped, as a newer margin is. (The first build showed
  it as no block; the review changed that, see section 8.)
- `setTitleBlockContent(document, patch)` is the one edit: a part set to a
  source, `'auto'` to take it away, a byline of blanks taken away. Setting
  a part lets go of a newer build's value for that part only.
- The new fixture holds three diagrams, as one diagram cannot hold both a
  chosen model and a newer build's model: a flow (model a step, pattern
  none, a Korean byline), a grid at a share of 0.33 (pattern a step, an
  `own` model naming an asset nothing else names), and a flow of eight
  steps (model none, pattern unsaid; added in the review). Its test is
  `diagramFileTitleBlock.test.ts`; it failed before `carriedJson` read the
  slot (the asset was dropped).
- The contract's page bullet is rewritten to say every setting is written,
  and the evolution plan's audit table gains `titleBlockContent` as class
  (c).

**1b. Pagination and signatures**
- [x] `firstPageCapacity(setup)` inside `splitPages` and `paginate`, in the
  flow and the grid (T-3 A, T-4 B). A page-1 count set by hand still wins.
  Tests through `paginate`, `cellSlots` and `pageCounts` that page 1 holds
  the same steps in each.
- [x] Page 1's signature gains the block's entry only when it is on. With
  the block on, its tab entry is a constant. The format comment at
  `pageSignature.ts:115` and the `SIGNATURE_VERSION` doc say why `pack-3`
  stands.
- [x] A pinned test that with the block off every digest is today's.
  `savedPagesHold.test.ts` and `heldPages.test.ts` green. The crane opens
  with no page re-packed.
- [x] Turning the block on: page 1 re-packs, and later pages re-paginate.
  Hand moves are kept by band, and frames on steps that change page go
  home, with the toast. One Undo restores the document exactly. Off again
  re-packs, with consent.

*As built (1b).* As planned, with these calls:
- `pagePlan.ts` has the rule's four pieces: `blockRows(setup)` (a grid's
  rows under the block: nearest its share, at least one, never all, none
  in a one-row grid), `titleBlockFits(setup)` (room for it, asked whether
  or not it is on: the Page pane's predicate for disabling the toggle),
  `hasTitleBlock(setup)` (on, and room) and `firstPageCapacity(setup)`.
  `splitPages` and `paginate` read each page's default through
  `defaultPageCapacity(setup, pageIndex)`; no caller changed. The one place
  outside them that compared a count with "the default", Set Steps on Page
  leaving an automatic last page automatic (`pageCounts.ts`), now asks it
  too: a lone first page under the block is laid out for 7, not 9.
- A grid's first page keeps `rows` as the setup's (the cut, so every page
  keeps one cell size) and its `rowCounts` lists only the rows under the
  block, so they sum to its capacity. The layout (1c) offsets them by
  `blockRows`.
- Page 1's tab entry is `false` while the block is on, and its structure
  ends with `['title-block', heightShare]`. `FROZEN_SIGNATURES` are
  unchanged and now built with the block pinned off;
  `FROZEN_BLOCK_SIGNATURES` pins the three digests with it on. Each new
  signature test failed with the entry and the constant taken out.
- The tests this phase touched that lay out a new diagram (`pagePlan`,
  `pageSignature`, `pageCounts`, the store's arrangements test) pin the
  block off now, so 1f's flip leaves them as they are.
- The crane, through the real reader and layout (a check kept out of the
  repo, under `artifacts/`, since the file is not committed): its three
  pages held, their signatures the stored ones, every cell where it was
  before this phase. Every crane page has its own count (9, 11, 9), so
  turning the block on keeps nine steps on page 1 and re-packs page 1
  alone. 1c's steadiness check should include that case: nine pictures in
  a page 27% shorter. Whether it should is T-20, raised in the review.

*Review of 1a and 1b (2026-10-14).* What it changed:
- A newer build's `titleBlock` reads as the nearest block, not as none
  (section 8), so such a file no longer has every page re-cut.
- An edit holds a title block source to what the file reads: one rule,
  `titleBlockSource`, for both. A step source with an empty id was stored
  by the edit and dropped by the reader.
- A grid's first page under the block is another cell shape (`pageShape`
  counts the block's rows), so turning the block on or off sends every
  frame on page 1 home, as Decision 1A says of a cell that moves. Before,
  the steps that stayed on page 1 kept their offsets, over the block.
- The fixture gained its third diagram (model none, pattern unsaid).
- The contract says how ties round (a half up, products as written), that
  a last page without a count is laid out for its default capacity, and
  that a page setting falls back to its legacy value. The evolution audit
  splits Auto: unsaid means Auto for good (c); what Auto finds is a look
  (b).
- T-20 (a held count on page 1) is raised for Zach, built as B and pinned.
- Not done here: fast-forwarding `claude/diagram-title-block`. The review
  ran in an agent isolated in another worktree; the branch is moved by
  whoever runs the lanes.

**1c. Layout**
- [x] `titleBlockGeometry(setup)`: the block, the title column, the
  pattern's square, the model's box and the grid's rows. Tested on every
  size and orientation.
- [x] Page 1's packing area below the block, through `areaOf`. The grid's
  page-1 rows. `LayoutPage.titleBlock`. No tab on page 1.
- [x] The title (one bold line, 10 to 5 mm, then "…") and the byline (four
  lines) set by the layout's setter. A CJK title and byline. An empty title
  keeps the room.
- [x] The ribbon with First page Left (spine) and Right (page turn): page 1
  to page 2 lines up as before (952fc658e).
- [x] Steadiness: on the crane and on new diagrams of 9, 12 and 16 steps a
  page (A4, Letter, A4 landscape), page 1's scale is within ×1.09 of page
  2's, so page 2 is not held down. If not, the page-1 capacity rule is tuned
  and the numbers shown to Zach. The crane is measured under T-20 B, its
  page 1 holding its own count of nine. **Measured, not tuned.** Page 2 is
  held down in 3 of the 9 new cases with the block (4 without), and no
  page-1 count clears it (As built below). Widened in the review to 4–16
  steps a page on A4, Letter and A5 either way up: the cost is landscape
  with First page Left, put to Zach as T-21; the crane's is in T-20. The
  rule stands as built under T-20 B and T-21 A, taken as recommended
  (2026-10-14); this reopens if Zach overrules either.
- [x] With the block on, typing or clearing the title leaves page 1's
  packing area, and its held arrangement, unchanged: the signature already
  reads no tab there (1b). On a grid, page 1's rows start at
  `blockRows(setup)` (`pageShape` already counts them).
- [x] Once the page-1 rule is settled, the fixture's third diagram gains a
  page-1 arrangement packed under the block by 1c's layout, and a test
  opens it with every page held (`packing.packed === false`) and its
  signatures the stored ones: the whole chain from read to hold, as
  `savedPagesHold.test.ts` checks it for files without the block. (Done
  under the rule as built, which T-20 B and T-21 A, taken as recommended,
  keep; the fixture's pages are packed again if Zach's answer to either
  changes it.)

*As built (1c).* As planned, with these calls:
- `titleBlockGeometry(setup, headMm, footMm)` takes the header and footer
  the layout keeps, which a grid's rows are cut under (the block there is
  the header's room and its rows); the flow's block is read from the setup
  alone. It returns the block, `rows`, and boxes for the title, the byline,
  the pattern and the model. (A first build also returned the `art`, the
  two together, as the model's room with no pattern; the review put the
  model in the pattern's square instead, see below.) Two looks the
  plan did not fix: the pattern's square is held to 45% of the block's
  width (a two-row grid gives the block half the page), and the pattern and
  the model stand on the block's foot, so where the square is held the art
  sits low, next to the steps. The byline's box ends at the block's foot,
  and the byline takes as many of its four lines as the block has room for
  (one at a share of 0.15 on A5 landscape).
- `setTitleBlock` sets the text: the title's size is read off its width at
  10 mm (a width is proportional to the size), to a hundredth of a mm down,
  then held to 5 mm and cut there; its tallest letter's top stands at the
  block's top (a capital's in the first build; see the review below).
- `layoutDiagramPages` takes the title and the byline together
  (`DiagramTitles`) where it took the title; `layoutDiagram` hands it the
  byline. `LayoutPage.titleBlock` is the only new field: a page with it
  prints no tab, so no second flag says so.
- The first flow page's area is `packingArea(paper, block.h, footH)`:
  `arrangeFlowPages` takes it as `firstArea`, and `areaOf` reads it by the
  page's index. A grid's first page offsets its rows by `geometry.rows`.
- The check (`artifacts/title-block/steadiness.test.ts`, kept out of the
  repo with the crane) ran the real reader, layout and fonts. Page scales
  `k`, page 1 / page 2 / page 3, and whether page 2 was held to ×1.09 of
  page 1 (HELD):

  | case | block off | block on |
  | --- | --- | --- |
  | crane as saved (9/11/8, T-20 B) | 1.251 / 0.891 / 0.972 | 0.864 / 0.891 / 0.972 |
  | 9 a page, A4 | 1.248 / 1.165 / 1.132 | 0.999 / 1.051 / 1.054 |
  | 9 a page, Letter | 1.184 / 1.291 / 1.095 HELD | 0.861 / 0.865 / 0.943 |
  | 9 a page, A4 landscape | 0.779 / 0.818 / 0.767 | 0.675 / 0.654 / 0.713 |
  | 12 a page, A4 | 0.841 / 0.917 / 0.962 HELD | 0.981 / 1.069 / 0.960 HELD |
  | 12 a page, Letter | 0.975 / 1.063 / 0.871 | 0.970 / 1.057 / 0.882 HELD |
  | 12 a page, A4 landscape | 0.915 / 0.997 / 0.920 HELD | 0.667 / 0.727 / 0.793 HELD |
  | 16 a page, A4 | 0.960 / 1.003 | 1.303 / 1.073 |
  | 16 a page, Letter | 0.798 / 0.870 HELD | 1.234 / 1.035 |
  | 16 a page, A4 landscape | 1.032 / 1.025 | 0.733 / 0.768 |

  The new diagrams are the crane's 29 steps with no counts, no placements
  and nothing packed, First page Left. With the block, page 2 is held down
  in 3 of the 9 new cases; without it, in 4. Page 1 packing smaller than
  page 2 wants is the packer's own habit, block or not, so the rule is not
  tuned. A sweep of page 1's own count (5 to the default, both first-page
  sides, `sweep.test.ts`) found no rule that clears it: at 12 a page on A4
  only a count of 6 does, and on A4 landscape page 1 is held by its height
  (a left page that hands over takes three bands in 123 mm), whatever it
  holds. At 9 a page on A4 landscape page 2 is not held (0.675 / 0.654):
  it is smaller than without the block because it holds other steps, not
  because of steadiness. That one row was all this table had of landscape;
  the review's wider sweep (T-21) shows the cost there is larger and comes
  from page 1's band parity under the block. The crane under T-20 B keeps
  its nine on page 1 at 0.864, 31% smaller than as saved, and page 2 is
  held as saved.
- The fixture's flow of eight holds its two pages as this layout packed
  them, written through the real writer; the test opens it with both held.

**1d. Drawing**
- [x] `resolveTitleBlock(document)`. Auto skips turns, empty and locked
  steps. A stale id reads as Auto. None. No linked step gives no pattern. A
  newer build's part reads as Auto.
- [x] The pattern as a `PaperScene` through `paperSceneSvgBody` (T-14 A),
  then the model through `cellPicture` with no marks and no window, set to
  its box's bottom right (T-10 A), then the text. Skipped for `only`, drawn
  for `omit`.
- [x] The byline in `diagramFontTexts`. Composer tests. The title's and
  byline's characters are embedded. The PDF, the SVG sheet and Print each
  carry the block.
- [x] Page 1's image changes when the last step's picture changes.
- [ ] **First look:** page 1 of the crane as a PDF, with the block, sent to
  Zach. 1e goes on while he looks. The block's proportions are tuned on his
  word. (Made: the crane's page 1 as a PDF at print size and a PNG, and a
  new diagram's page 1 in the flow and on a 3 × 3 grid, under
  `artifacts/title-block/first-look/`; his word is still to come. Made
  again in the review from the app's own PDF export in Chromium, the same
  pixels as the first; with them, for his calls: a long title cut at 5 mm
  with half the block empty under it (a two-line title waits on his word),
  an untitled diagram with nothing linked, a model with no pattern, and A4
  landscape (T-21). Also his to judge there: the block's empty stretches —
  a two-row grid's block is half the page, its art standing on its foot;
  the crane, with no byline, leaves most of the block's left blank — and
  the ribbon's band reaching up to 6 mm into the block's foot on dense or
  short first pages, pinned by a test in `flowLane.test.ts`.)

*As built (1d, the resolution only; the drawing is its own lane).*
`diagram/pages/titleBlockContent.ts`: `resolveTitleBlock(document)` gives
each part's `from` (`auto`, `step` or `none`) and `step`, and the
pattern's lines (its `scene` since the drawing below; the `thumbnail` the
first build also gave went in the final review, no reader left). Auto is the last step `givesModel` (this build's,
with a picture) or `givesPattern` (this build's, linked to a crease
pattern, whatever it is shown as); `autoModelStep` and `autoPatternStep`
name what Auto finds whatever is chosen, for the Page pane's "Auto (step
N)". A chosen id that is no step of this build's (gone, a turn's, or a
newer build's step) reads as Auto. A chosen step that is there but cannot
give its part stays `from: 'step'` with nothing to draw (its `picture`
null, or a null `scene`), so the overlay can name it.

*As built (1d, the drawing).* As planned, with these calls:
- `resolveTitleBlock` also gives the pattern as the painter draws it,
  `pattern.scene` (`patternScene`: the thumbnail's lines in their roles, an
  `unassigned` line as `aux`, an `aux` line left out, its viewBox its
  bounds, no face; null where nothing would draw), so the composer and the
  overlay read one answer to "is there a pattern".
- Two picture functions join `pagePictures.ts`: `wholePicture`, the model
  (a copy of the step with no annotations and no `zoom`, measured by
  `layoutPicture`, fitted by `pictureFit`, its room cut to `pictureExtent`
  at the box's bottom right, then `cellPicture`), and `fittedScene`, the
  pattern (the module's own `placedScene` at the scale that fits the
  square). `modelRoom` is the one rule for where the model stands: in
  front of the pattern, or in the pattern's square where no pattern is
  drawn (the whole art in the first build, which ran it into the title).
- The composer draws the block in the tab's place, `titleBlockElements`;
  `ComposeDiagramPageInput.titleBlock` is required, so the PDF's and the
  sheet's compositions (`composeEveryPage`) cannot leave the art out.
  `PreparedDiagramPages.titleBlock` carries the resolution for the overlay,
  and is null where the first page has no block (`hasTitleBlock`), as the
  input's is: the block is resolved, and the byline's faces listed in
  `diagramFontTexts`, only where it prints.
- The pattern is drawn in `diagramSurfaceStyle` (the style through the
  Diagram's policy), whose aux switch decides whether an `unassigned` line
  shows.

**1e. The Page pane and the overlay**
- [x] **Order:** 1c is merged into `claude/diagram-title-block` before the
  toggle is. Page 1's signature already assumes 1c's layout (the block's
  entry, no tab), so a page 1 packed and saved with the block on before 1c,
  in a PR preview say, would be held after it with steps under the block.
  Until 1c is in, the toggle stays hidden, and nobody saves a block-on file
  from an intermediate build. (Done in the review of the pane: the pane's
  lane carries 1c and 1d, merged in at 07f2596c6, so it cannot land without
  them.)
- [x] `useDiagramTitleBlock` and `DiagramTitleBlockSection`, mounted by the
  Page pane after Layout (T-19 A). `setDiagramTitleBlockContent`, one undo
  step each.
- [x] Only valid choices offered: steps with pictures, distinct linked
  patterns, each select naming what Auto finds. The toggle disabled in a
  one-row grid, with its hint. Read-only diagrams disable the section.
- [x] The overlay's placeholders. The Title help updated.
- [x] With the block on and page 1 holding its own count, "Steps on page
  1" says the block does not change it (T-20 B).
- [x] Analytics and `docs/analytics.md`.
- [x] i18n: extract, eight locales, stamp, check.

*As built (1e, the overlay's placeholders; the pane is its own lane).*
`DiagramTitleBlockOverlay` is mounted by the Pages view over the first
page: the block's outline, and a dashed box in each room of the block
where what would print there prints nothing, from `missingTitleBlockParts`:
"Add a title" in the title's column; in the pattern's square, the pattern
where Auto finds no linked step ("No step is linked to a crease pattern")
or the step it comes from has none ("Step N has no crease pattern"), and
the model likewise where no pattern is drawn in front of which it would
stand ("No step has a picture yet", "Step N has no picture yet"); in the
model's box, the model where a pattern is drawn. Each reason is a line of
its own, the step named by its number as the pages print it (the
resolution's `number`, from `stepNumbers`). A part set to none is the
author's and is not marked. No two boxes overlap, on any paper, share or
grid (a test sweeps them). The words stand at the top of the square, which
a model standing in it leaves free, and at the foot of the model's box.

The outline and the boxes are the Pages view's own two marks, shared:
`PageGuide` (the margin guide's dashed accent outline) and
`PagePlaceholder` (an empty step's dashed box, `kind="picture"`, or a
part's, `kind="part"`, untinted, its words at an end). Each has its own
module; the margin guide's and the empty step's rules moved there out of
`DiagramPagesView.module.css` in a commit of their own, their computed
styles the same in the browser before and after
(`artifacts/title-block/browser/computed-styles.txt`). (The first build
copied their inks into an overlay module of its own.)

Strings are inline English only, five keys under
`panels:diagram.pages.titleBlock.*`, so `i18n:check` fails on this lane
until the one i18n step (1e's last item) extracts, translates and stamps
them with the pane's. That step runs before the PR into #436 is opened.
(Done at the integration, below.)

*Review of 1c to 1e, the layout lane (2026-10-14).* What it changed, each
in a commit of its own with a test that failed before it:
- **A model with no pattern** stands in the pattern's square. It stood over
  the whole art, which began at the model's box, 21 mm under the title's
  column: a long title beside a wide model collided.
- **The overlay's boxes never cross.** For an untitled diagram with nothing
  linked, the model's box held the pattern's and crossed the title's, a
  dashed edge through the words. It now draws rooms (above), and a test
  sweeps every paper, share, grid and missing part for overlaps. It wears
  `PageGuide` and `PagePlaceholder` (a CSS move proven in the browser) and
  numbers steps through `stepNumbers`.
- **The title stays in its row.** Its baseline stood a Latin capital under
  the block's top, so ideographs and accented capitals rose into the top
  margin (1.3 and 2.1 mm at 10 mm). The fonts now give each glyph's ink
  from its outline (`FontMetrics.ink`, read from `glyf`), the setter a
  line's (`TextSetter.ink`): the tallest letter stands on the block's top,
  and the title is as large as its ink fits its 10 mm row, so a descender
  under an accent keeps off the byline. And where a short block brings the
  model's box up beside the title (A5 landscape, any page at 0.15), the
  title's column ends 4 mm short of it.
- **Only where it prints.** The block is resolved, and the byline's faces
  listed for loading, only where the first page has the block: a Korean
  byline in a diagram with the block off no longer loads its face, nor
  holds back adoption when that face cannot be had.
- **The ribbon** may reach into the block's foot by up to half its band
  (5.9 mm on A5 landscape), as it reaches into the header's room on other
  pages: kept as a look for Zach, since each way to clear it costs
  something (a deeper gap shrinks page 1, which T-21 already finds costly;
  a paper panel under the block cuts the band flat; a ceiling in the lane
  changes the curve he chose). A test pins that the lane's line stays under
  the block.
- **Landscape** (T-21) and the crane under T-20 B are put to Zach; the 1c
  steadiness item is unticked, as measured and not tuned.

Checked in the browser, on a production build of this lane served to
Playwright with no server (`artifacts/title-block/browser/`, before and
after side by side under `artifacts/title-block/before-after/`): the
crane and new diagrams with the block on, in the flow (First page Left and
Right), a 3 × 3 grid, a one-row grid (no block, the tab on page 1), A4 and
A5 landscape, untitled and unlinked, a model with no pattern, long,
accented and Korean titles; the Pages view in light and dark in Chromium,
and the crane, a new flow, a 3 × 3 grid and the untitled case in WebKit at
iPad size (1024 × 1366); the PDF (home) and the one-sheet SVG exported from
the app for each. No page error in any. The Korean title's PDF did not
export here, before or after the review (`no glyph for U+C885`), because
this worktree had no CJK font files: `apps/web/public/fonts/diagram/` is
gitignored build output (`scripts/diagram-fonts/build_fonts.py`), which
`scripts/setup-worktree.sh` does not copy, so the dev server answered its
manifest with the app's page. Not a regression: 952fc658e refuses a Korean
caption the same way without them. (The final review copied them in and
checked Korean and Japanese titles and bylines on every surface, under
1g.)

Not done here: `claude/diagram-title-block` is still to be fast-forwarded
to this lane's head. The review's agent was isolated in its own worktree,
so whoever runs the lanes moves the branch, then checks the Pages view on
the branch's dev server (5332) once more. (Done: merged at befff256c, and
checked on 5332 at the integration, below.)

*As built (1e, the store only; the pane is its own lane).* The slice
action `setDiagramTitleBlockContent(patch)` commits `setTitleBlockContent`
as one undo step labelled "Change title block"; a patch that changes
nothing records nothing, and a read-only diagram takes nothing. Its tests
(in `diagramPageArrangements.test.ts`, beside the block's toggle) also pin
that what the block shows moves no step: every page held as packed, no
frame sent home. The toggle stays `setDiagramPage({ titleBlock })`, and
the pane disables it where `titleBlockFits(page)` is false.

*As built (1e, the pane; the overlay's placeholders are the other lane's).*
As planned, with these calls:
- What the selects offer is a pure module beside the resolution,
  `diagram/pages/titleBlockChoices.ts`: the steps with a picture for the
  model; for the pattern one step per distinct pattern, told apart by
  `thumbnailJson` (now exported from `diagramFile.ts`, the table's own key),
  named by the step chosen where that one links it, else the last. A step
  chosen that can no longer give its part stays in the list, since the
  select must show what the part is set to; nothing else that cannot be
  shown is offered. (This build marked it in the list, "Step 12 (no
  picture)" or "(not linked)"; the pane's review dropped "(not linked)",
  and since the final review the list names the step alone and the row's
  note says why, in the Pages view's words.) Auto with
  nothing to find reads "Auto (none linked)" for the pattern, as planned,
  and "Auto (no pictures)" for the model. On the crane: the model offers
  steps 1–28, the pattern 19 distinct patterns.
- The toggle shows what the first page has (`hasTitleBlock`): in a grid of
  one row it reads off, disabled, with "Needs two rows or more" under its
  label, and the setting is kept, so a second row brings the block back.
  The hint is the field row's note line (a `note` prop on `FieldRow` and
  `ToggleRow`, where "Overridden" goes), so the section needs no CSS module.
- The byline is a `TextAreaRow` of four rows, which commits at each pause in
  typing as well as on blur. So the slice action takes the field's
  `{ loadId, session }`, as an instruction's edit does: a sitting is one
  undo step, and a draft typed into a diagram since replaced is dropped. Its
  analytics counts once per sitting. Its placeholder is an example
  ("Design: …", "Paper: 60 cm square"). (This build had no help mark for
  it, `TextAreaRow` having none; the pane's review below gave it one.)
- T-20 B: "Steps on page 1" gets a help mark (`NumberRow` gained `help`)
  while page 1 holds its own count under the block: the block leaves it,
  and it would hold 7 by default (`CurrentDiagramPage.titleBlockDefault`).
- The Title toggle's help has a second text while the first page has the
  block: the tab is on every page after the first.
- Analytics: no view event, so no `use*Event` hook; each event is a change,
  fired by `useDiagramTitleBlock` beside its store call, as
  `useDiagramPageSetup` does. `trackDiagramPageSetupChanged` takes
  `{ style?, titleBlockChoice? }` as its second argument. `diagram exported`
  sends `title_block` for a PDF or the SVG (`hasTitleBlock(document.page)`),
  none for step files.
- Strings are inline English only, not extracted; the i18n step does every
  catalog at once.
- Order: the toggle is live in this lane, so it merges after 1c.
- Checked in the browser (crane and a new diagram; Chromium at desktop width
  and WebKit at iPad width, light and dark; the one-row grid; read-only).

*Review of the Page pane (2026-10-14).* What it changed:
- The pane's lane carries 1c and 1d (the layout and drawing lane, merged in
  at 07f2596c6), so the toggle cannot reach `claude/diagram-title-block`
  without page 1's layout, and the lane shows the block when previewed on
  its own. On the crane, turning the block on now draws it on page 1.
- One answer to "is there a pattern": `givesPattern` asks `drawsPattern`,
  the test `patternScene` is drawn by. A link whose thumbnail has no line
  to draw (a capture that found none, or aux lines only) is not offered,
  Auto passes over it, and one chosen is marked "(no crease pattern)", as
  the overlay names it. "(not linked)" is gone.
- "Needs two rows or more" is not dimmed with its disabled row: the note
  says which it is (`data-field-note="reason"`), and a reason keeps the
  label's ink. 1.46:1 became 4.59:1 in light, 1.57:1 became 4.38:1 in dark
  (the enabled labels' own figures). "Overridden" still dims.
- The switch is "Show on first page", as Layout's is "Show path", so the
  pane no longer reads "Title block" twice (section 7 called both "Title
  block").
- Model and Crease pattern each have help saying what Auto uses. Previews
  in the lists belong with the Phase 2 picker.
- The byline has help, through a `help` prop on `TextAreaRow` (the field
  row's own mark, `FieldRowHelp`, set beside the label so it stays out of
  the field's name). It says up to `TITLE_BLOCK_BYLINE_LINES` lines print,
  the drawing's own limit, so the two cannot disagree.
- "Steps on page 1" has help whenever page 1 is under the block: why it
  holds 7 by default, or that its own count stays and it would hold 7
  without one. The Title help reads "…every page. On the first page the
  title block carries it instead."
- `setPageSetting` is the Page pane's one commit-and-count for a page
  setting, used by `useDiagramPageSetup` and the title block's toggle.
- The choices are worked out only while the first page has the block.
- Not changed: the section stays after Layout (T-19 A). Moving it after On
  the page, just above Header & footer, keeps Layout's own sections
  together and sits beside the Title toggle; both orders are captured for
  Zach (`artifacts/title-block/out/order/`, copied into this worktree in
  the final review), and 1g puts it to him. The i18n step waits for both
  lanes' review fixes, so the nine catalogs are done once.

*As built (the integration of 1a to 1e, 2026-10-14).* The lanes were
merged at befff256c without a combined check; the check, on
`claude/diagram-title-block`:
- Nothing the merge broke. `tsc`, ESLint on every file changed since
  952fc658e, and vitest over `src/diagram`, `src/components/diagram`,
  `src/components/panels`, `src/store/workspaceStore`, `src/analytics` and
  `src/keyboard` (321 files, 5047 tests), and over `src/styles`,
  `src/components/ui/fieldRows` and `src/i18n`, all passed as merged. The
  merge had already taken one viewBox reader (`thumbnailBox`) and one
  answer to "is there a pattern" (`drawsPattern`) for both lanes.
- What the two lanes each wrote for the same job: the resolution's, the
  choices' and the section's tests each built their own turn, empty,
  locked, upload and linked-pattern steps and their own diagram (and the
  same "pattern with no line" step three times). They share
  `pages/titleBlock.fixtures.ts`. `resolveTitleBlock` numbered the whole
  diagram once per part; it numbers it once.
- i18n, once for both lanes: 26 keys in `panels` (the section, the Steps on
  page 1 and Title help it changes, and the Pages view's five marks),
  translated into the eight locales in each catalog's own terms for crease
  pattern, step, picture, link and tab; the block is タイトル欄, 标题栏,
  bloque de título, bloc titre, Titelblock, bloco de título, титульный блок
  and 제목 영역. Stamped; `i18n:check` passes. In the browser the switch's
  label ran to two lines in German, Spanish, French, Portuguese and Russian
  at the pane's default width, so those five say it shorter.
- Checked on the branch's dev server (5332) with the crane: it opens with
  no block, its title in page 1's tab; turning the block on draws the
  title, the pattern (Auto, step 27) and the model (Auto, step 28) on page
  1, which keeps its nine steps (T-20 B); the section, its helps and the
  byline's placeholder read in Japanese, and in German the overlay names a
  chosen step with no pattern ("Schritt 1 hat kein Faltmuster") in the
  pattern's square, the model standing in it. Screenshots under
  `artifacts/title-block/integration/`.
- T-20 B and T-21 A are recorded as taken as recommended, not as Zach's
  answer; the 1c items they closed are ticked, to reopen if he overrules
  either.

**1f. The default goes on**
- [x] `PAGE_SETTINGS.titleBlock.default` on, in a commit of its own. A new
  diagram has the block; a file without it still reads off.
- [x] Each test that breaks: one about something else pins the block off
  (its legacy value) and says so; one about a new diagram's pages is
  updated to the block. `FROZEN_SIGNATURES` unchanged.
- [ ] If this commit is not green in time, it is reverted and the release
  ships with the default off (T-18 B). (Green locally; CI on the PR
  decides.)

*As built (1f).* One commit, "Diagram title block: on by default for new
diagrams", the default and its tests together, so it reverts whole:
- `PAGE_SETTINGS.titleBlock.default` is `{ enabled: true, heightShare:
  0.27 }`; its legacy value stays off. The title block is now the third
  setting whose legacy value is not its default. A test that failed before:
  a new diagram has the block, a page that does not say it has none
  (`diagramDocument.test.ts`).
- The flip broke 88 tests in 25 files. Two were about a new diagram or
  about reading: a new diagram writes the block on (`diagramFile.test.ts`),
  and a page with nothing said reads as every legacy value, the block's
  now unlike its default (`diagramDocument.test.ts`). Each of the rest was
  about something else and pins the block off at its legacy value, with a
  line saying why: in the shared fixtures (`pageLayouts.fixtures.ts`, so
  the page goldens and the held-page sweeps read their pages as before;
  `pageOverflow.fixtures.ts`, whose six steps share a page), in a file's own
  diagram helper, or in the one case. No golden, snapshot or digest
  changed; `FROZEN_SIGNATURES` and `FROZEN_BLOCK_SIGNATURES` as they were.
- In the browser (5332): a new diagram's first page has the block, the
  overlay's marks in its rooms and Steps on page 1 at 7, Default; the crane
  opens as before, its title in page 1's tab, the switch off, nine steps
  on page 1, no unsaved change. Screenshots under
  `artifacts/title-block/default-on/`.
- Found by the flip, not changed in it; corrected and settled in the final
  review (under 1g):
  - The flow lane bends a turn tighter than the band is half wide on page 1
    of A4 landscape at 12 a page with the block (steps 6→7, 7.3 mm where
    `flowLane.test.ts` asks 9.6): the one case the block causes. The later
    pages first listed here (A4 at 9 a page, page 3, 5.8 mm; A4 landscape
    at 6, page 4, 8.1 mm; no margin, page 3, 6.8 mm) are #436's lane at
    other step counts, which the block's pagination puts there: with the
    block off, 22 steps at 9 a page bend page 3's last turn 8.7 mm round.
    The test's claim now says it covers its 23 steps without the block
    (2fcb867d8); whether the rule must hold under the block is Zach's (1g).
  - A References card pulled into steps prints within 4.7–4.8% of the
    baked card's scale on a flow with the block, against the 2% the test
    allows without it (`referencesCardMarks.pages.test.ts`). Cause not
    looked into; still open.
  - Two held-page cases failed with the block on, and with it off too: the
    sweep sampled three steps a page, and only the block's pagination put
    these there. Neither is the block's. A photo on an enlarged step waiting
    for its picture drops its window (`startsWhole`), an edit of its page's
    structure, so its page packs again, as a structure edit does: the sweep
    called it a picture edit. Resizing an enlarged step's caption on a grid
    moved its own picture: #436's bug, fixed in the final review
    (2ef450643), which also sweeps every step with the block on and off.

**1g. Gate and handoff**
- [ ] The full gate. The browser checks above, with First page Left and
  Right, a 3 × 3 grid, a one-row grid and A4 landscape.
- [x] A review of the phase, its findings fixed (the final review,
  2026-10-14, below). What needs a new decision is put to Zach here.
- [ ] T-21 settled by Zach before this branch merges into #436 or ships
  (the header); if he cannot answer in time and might take C, the switch
  is hidden.
- [ ] Zach: step 1 on page 1 under the block stands 20 mm in on A4 at 9 a
  page (22.5 mm on Letter, 51 mm on A4 landscape, First page Left), where
  his rule puts it at the top left. The packer shares a band's spare width
  half a share before its first step (`flowPacking.ts`, `cursor = space /
  2`); under the block page 1's first band holds two steps, not three, so
  the share is large. #436 already does it without the block (12 mm at 7
  a page, 19 mm on A4 landscape). Recommended: the first step of a page's
  first band at the packing area's left on a page the lane does not come
  into, the spare shared between the steps and after the last. It reaches
  only pages packed from then on (arrangements are stored), and changes
  fresh block-off packs at 6 and 7 a page and in landscape too, so before
  and after renders go with it. Or keep the packer's look and record the
  exception. Renders: `artifacts/title-block/review-final/step1-*.png`.
- [ ] Zach: whether "no turn tighter than half the band" must hold under
  the block (page 1 of A4 landscape at 12 a page bends 7.3 mm, 1f). If
  yes, a block-on case in `flowLane.test.ts` and the lane's bend on short
  first pages; if not, the test's claim already says what it covers.
- [ ] Zach: the room between the title and the byline. A title's ink can
  reach its 10 mm row's foot, so a title with a descender or of ideographs
  keeps about 2 mm over the byline ("Frog" 1.96, 折り鶴 2.08, 종이학
  2.17), a capital-only title 4.2 mm ("Crane"); `fixes/titleGap.txt`.
  Recommended: the byline at least 3 mm under the title's ink, so a
  title without a descender keeps its look. Or a larger fixed gap
  (`BYLINE_GAP_MM`), or as built. A look: it may change for every file.
- [ ] Zach: "Auto (step 28)" is cut to "Auto (ste…" in a pane of 214 px
  rows (every language), as the pane's other selects are at that width
  ("Ve…" for Portrait). Recommended: leave it with them, the pane's width
  being his; or a shorter form ("Auto · 28") in every catalog; or a wider
  value column for these rows.
- [ ] Zach: the section's order, after Layout (as built, T-19 A) or just
  above Header & footer (`artifacts/title-block/out/order/`).
- [ ] As built, written here. The PR into #436.

*The final review (2026-10-14).* Each fix a commit of its own with a test
that failed before it. Before and after under
`artifacts/title-block/fixes/`, captured from the dev server (5332) with
the files before each fix put back from git for the "before" run
(`capture.mjs`):
- **The byline stands on its box by its ink** (44ab8e1eb), as the title
  does: a CJK or accented first line rose 0.36 mm into the gap under the
  title. `CAP_SHARE`, a copy of the estimate setter's number, is gone.
  `byline-ja-before-after.png`, `title-ko-before-after.png`.
- **The pattern is fitted by its ink** (644a29c1b): its edge reached half
  its pen past the square, and so past the top and right margins (0.09 mm
  in the Diagram preset, 2.1 mm at a 12 pt edge).
  `pattern-ink-before-after.png`, at 12 pt.
- **The square's mark keeps clear of a model in it** (8004b9b84): with no
  pattern, a portrait model fills the square's height and the words sat on
  it. The mark is the strip the model leaves above or beside itself, else
  the title's column under the byline's lines; only the least block (A5
  landscape at 15%, 18.6 mm) has room for neither and keeps the square.
  The prepared pages carry where the composer draws the model
  (`titleBlockModel`, through `wholePictureRoom`).
  `tall-model-before-after.png`.
- **One answer to the rows the block takes** (c17f7f095):
  `PlannedPage.titleBlockRows`, read by the layout's cells and by
  `pageShape`, which inferred it from how many rows a page listed. The
  `rowCounts` doc says every row under the block is listed.
- **The resolved pattern is its scene** (552d6b95c): `thumbnail` had no
  reader.
- **The Page pane** (5ea4b6bd5, 017524600, 1b4ff611f, d7cc79ed0): a reason
  note wraps rather than lose its end; a select set to a step that shows
  nothing names the step alone, and the row's note says why in the Pages
  view's words, read with the select (`SelectRow` takes a `note`); the
  pattern's help names a pattern as its list does; German says "Auf Seite
  1 zeigen", Sie, and "Keine" for None; Russian calls the byline "Авторы",
  "Подпись" being the Label tool's. In en, de and es at 214 px rows (the
  sash dragged to the review's width) and the default 280, no reason and
  no chosen step is cut: `pane-*-before-after.png`, `paneFacts.py`.
- **Held pages** (2ef450643): both sweeps edit every step, on every page
  fixture as saved and with the block on. Fixed: a grid's enlarged step at
  a Size moved its own picture when its caption was resized (#436's:
  `placed.auto` had no scale for an enlarged step, so the layout's second
  pass measured it unmeasured). Written down in the sweep: a photo filling
  an enlarged step that waits for its picture is a structure edit that
  packs its own page; an area's new capture changes its enlargements'
  read-out, not where they stand.
- **CJK on every surface**: `apps/web/public/fonts/diagram/` copied from the
  base worktree; a Japanese and a Korean title and byline in the Pages
  view, the PDF (exported, nothing missing), Print and the one-sheet SVG
  (its JP faces embedded): `cjk-pdf-print-check.png`, `after/byline-ja*`,
  `after/title-ko*`.
- **This plan and its neighbours**: T-21's deadline is this branch's merge
  into #436 or a release, not 1f; T-18 B says what its revert keeps; the
  decisions read as taken; superseded As built lines say so; the evolution
  plan names the block's legacy value (979199073); the flow lane test says
  what its claim covers (2fcb867d8).

### Phase 2: after the release

- [ ] 2a. The model as its own record (T-9 C): the `own` kind in the
  format, the lookup, the capture, the selection, the Step pane's Title
  picture, status and Refresh all.
- [ ] 2b. The block's own pattern through the picker (T-13 A), with status
  and Refresh.
- [ ] 2c. Pressing the block opens its section (T-15 B). The step-card verb
  (T-15 C). A Layers pane row.
- [ ] 2d. The Height slider (T-2 B).
- [ ] 2e. The rest of "Not in the first cut", as Zach asks.
