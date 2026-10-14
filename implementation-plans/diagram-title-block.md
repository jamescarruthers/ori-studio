# Diagram: a title block on the first page

**Status: planned 2026-10-14, revised the same day after a critique (see
"What the critique changed" at the end of the Approach). Phase 1 is being
built.**

**Zach's answer, 2026-10-14:** "Please implement the diagram title-page plan
using your recommendations. Keep this work in a separate PR. I'll decide
whether to delay the release based on how implementation goes. Don't merge
the PR or publish a release." So every decision, T-1 to T-19, takes its
recommendation; the ones still marked PENDING below are decided as
recommended. T-18 is built as recommended (A, with B as the fallback), but
whether the release waits for it is Zach's call once the build is done. The
PR goes into #436's branch and no agent merges it.

The decisions are numbered T-1 to T-19. Each gives its options and a
recommendation. Four of them were the real forks:

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
PENDING.**
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

**T-2. How tall the block is, and whether it can be changed. PENDING.**
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
  7 at 27%. In the grid, `columns × (rows − blockRows)`. A count set on page
  1 itself still wins. It is read from the page setup alone, through one
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
  same kind of change as editing Steps per page.
- One Undo restores the document exactly.

#### Decisions: page 1's layout

**T-3. How many steps page 1 holds with the block on. PENDING. Needs
Zach's answer.**
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

**T-4. The block in a grid. PENDING.**
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

**T-5. The title tab on page 1, and the Title toggle. PENDING. Needs
Zach's answer.**
- A. Page 1 prints no tab. The block always prints the title. The Title
  toggle governs the tab on the other pages, and its help says so.
- B. As A, but Title off also leaves the block's title out.
- C. The tab on every page, page 1 too, above the block.
- **Recommended: A.** The block is the title, set large. A tab above it
  says the title twice. B gives one switch two jobs.

### 3. Inside the block

(T-6 A) The block is a band from margin to margin.

- **The crease pattern** is a square as tall as the block, at its right.
- **The model** stands in front of the pattern's lower left. Its box is
  about three quarters of the block's height and up to one and a quarter
  wide. Its bottom is the block's foot, and its right edge is about 60% of
  the way across the pattern. Its picture is fitted inside, set to the box's
  bottom right.
- **The title column** runs from the left margin to the pattern, with 4 mm
  to spare. The title is the diagram's own (`DiagramDocument.title`), set
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
- **When something is missing.** With no pattern, the model takes the
  pattern's square, sized to the whole art area. With no model, the pattern
  stands alone. With neither, the area is empty. With no title, nothing
  prints. The block keeps its room in every case, so nothing re-packs. The
  Pages view marks what is missing in its overlay, which is never printed.
- **The same on every side.** It is not mirrored on a left or right page.

These proportions are a first guess, tuned on the first render (1d). They
are look, not layout: no step moves when they change.

#### Decisions: inside the block

**T-6. How the block is arranged. PENDING.**
- A. The title at the left, the pattern at the right, and the model in
  front of the pattern's lower left. The same on every page side.
- B. As A, mirrored on a left page: the art at the outer edge, the title at
  the right.
- C. The pattern and the model side by side, not overlapping.
- **Recommended: A.** It reads title first and art after, like the
  reference picture, without copying its bands. B puts the title after the
  art on a left page. C drops the overlap Zach asked for.

**T-7. Credit lines. PENDING.**
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

**T-8. A step count ("175 step"). PENDING.**
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

**T-9. What the "special step" is. PENDING. Needs Zach's answer.**
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

**T-10. How the model is drawn. PENDING.**
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

**T-11. Where the pattern's lines come from. PENDING.**
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

**T-12. What counts as "the last CP linked". PENDING.**
- A. The last step whose source is a link to a crease pattern, whatever it
  is shown as.
- B. A, and a References step's sheet too.
- C. The whole pattern open in Edit.
- **Recommended: A.** B can pick a precrease sheet. C can include sheets
  that have nothing to do with the model, and an Edit document need not be
  open.

**T-13. Setting the pattern separately. PENDING.**
- A. In the first cut: Auto, a step's pattern, or None. After the release:
  any region of the open pattern, through the pattern picker, with its own
  status and Refresh.
- B. The picker in the first cut.
- **Recommended: A.** Every pattern a diagram uses is linked by some step,
  so A covers nearly everything. The picker needs the pattern open and a
  way to make a fingerprint and thumbnail outside a step's capture. That is
  new code the day before the release.

**T-14. The pattern's pens. PENDING.**
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

**T-15. Where the block is edited. PENDING.**
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

**T-16. A step frame placed over the block. PENDING.**
- A. Say nothing. A step placed over the block by hand is the author's call.
- B. The "Outside margin" notice counts the block as margin on page 1.
- **Recommended: A.** `markOutsideMargin` (`pages/pagePlacement.ts:145-156`)
  checks the margins only. Zach has said "Outside margin" is the only
  placement notice. Calling the block a margin would be untrue. A frame kept
  at its offset by a re-pack could land on the block, but only when it was
  moved up toward the top by hand.

**T-19. Where the toggle sits. PENDING.**
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
  everywhere), class (c) in the evolution plan's audit. Auto's rule (the
  last step with a picture, the last linked pattern) is a look: changing it
  later moves no step, so it may change for every file.
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

**T-17. How much of the later format the release reads. PENDING.**
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

**T-18. What ships in tomorrow's release. PENDING. Needs Zach's answer.**
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
- [x] A file without `titleBlock` reads off. A damaged one reads off.

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
- The new fixture holds two diagrams, as one diagram cannot hold both a
  chosen model and a newer build's model: a flow (model a step, pattern
  none, a Korean byline) and a grid at a share of 0.33 (pattern a step, an
  `own` model naming an asset nothing else names). Its test is
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
  a page 27% shorter.

**1c. Layout**
- [ ] `titleBlockGeometry(setup)`: the block, the title column, the
  pattern's square, the model's box and the grid's rows. Tested on every
  size and orientation.
- [ ] Page 1's packing area below the block, through `areaOf`. The grid's
  page-1 rows. `LayoutPage.titleBlock`. No tab on page 1.
- [ ] The title (one bold line, 10 to 5 mm, then "…") and the byline (four
  lines) set by the layout's setter. A CJK title and byline. An empty title
  keeps the room.
- [ ] The ribbon with First page Left (spine) and Right (page turn): page 1
  to page 2 lines up as before (952fc658e).
- [ ] Steadiness: on the crane and on new diagrams of 9, 12 and 16 steps a
  page (A4, Letter, A4 landscape), page 1's scale is within ×1.09 of page
  2's, so page 2 is not held down. If not, the page-1 capacity rule is tuned
  and the numbers shown to Zach.

**1d. Drawing**
- [x] `resolveTitleBlock(document)`. Auto skips turns, empty and locked
  steps. A stale id reads as Auto. None. No linked step gives no pattern. A
  newer build's part reads as Auto.
- [ ] The pattern as a `PaperScene` through `paperSceneSvgBody` (T-14 A),
  then the model through `cellPicture` with no marks and no window, set to
  its box's bottom right (T-10 A), then the text. Skipped for `only`, drawn
  for `omit`.
- [ ] The byline in `diagramFontTexts`. Composer tests. The title's and
  byline's characters are embedded. The PDF, the SVG sheet and Print each
  carry the block.
- [ ] Page 1's image changes when the last step's picture changes.
- [ ] **First look:** page 1 of the crane as a PDF, with the block, sent to
  Zach. 1e goes on while he looks. The block's proportions are tuned on his
  word.

*As built (1d, the resolution only; the drawing is its own lane).*
`diagram/pages/titleBlockContent.ts`: `resolveTitleBlock(document)` gives
each part's `from` (`auto`, `step` or `none`) and `step`, and the
pattern's `thumbnail`. Auto is the last step `givesModel` (this build's,
with a picture) or `givesPattern` (this build's, linked to a crease
pattern, whatever it is shown as); `autoModelStep` and `autoPatternStep`
name what Auto finds whatever is chosen, for the Page pane's "Auto (step
N)". A chosen id that is no step of this build's (gone, a turn's, or a
newer build's step) reads as Auto. A chosen step that is there but cannot
give its part stays `from: 'step'` with nothing to draw (its `picture`
null, or a null `thumbnail`), so the overlay can name it.

**1e. The Page pane and the overlay**
- [ ] `useDiagramTitleBlock` and `DiagramTitleBlockSection`, mounted by the
  Page pane after Layout (T-19 A). `setDiagramTitleBlockContent`, one undo
  step each.
- [ ] Only valid choices offered: steps with pictures, distinct linked
  patterns, each select naming what Auto finds. The toggle disabled in a
  one-row grid, with its hint. Read-only diagrams disable the section.
- [ ] The overlay's placeholders. The Title help updated.
- [ ] Analytics and `docs/analytics.md`.
- [ ] i18n: extract, eight locales, stamp, check.

*As built (1e, the store only; the pane is its own lane).* The slice
action `setDiagramTitleBlockContent(patch)` commits `setTitleBlockContent`
as one undo step labelled "Change title block"; a patch that changes
nothing records nothing, and a read-only diagram takes nothing. Its tests
(in `diagramPageArrangements.test.ts`, beside the block's toggle) also pin
that what the block shows moves no step: every page held as packed, no
frame sent home. The toggle stays `setDiagramPage({ titleBlock })`, and
the pane disables it where `titleBlockFits(page)` is false.

**1f. The default goes on**
- [ ] `PAGE_SETTINGS.titleBlock.default` on, in a commit of its own. A new
  diagram has the block; a file without it still reads off.
- [ ] Each test that breaks: one about something else pins the block off
  (its legacy value) and says so; one about a new diagram's pages is
  updated to the block. `FROZEN_SIGNATURES` unchanged.
- [ ] If this commit is not green in time, it is reverted and the release
  ships with the default off (T-18 B).

**1g. Gate and handoff**
- [ ] The full gate. The browser checks above, with First page Left and
  Right, a 3 × 3 grid, a one-row grid and A4 landscape.
- [ ] A review of the phase, its findings fixed.
- [ ] As built, written here. The PR into #436.

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
