# Diagram documents across app changes: saved layout holds

**Status: parts 1 and 3 built, 2026-10-12, on `claude/diagram-launch-completion-59e60c`.
Part 2 decided by Zach and built, 2026-10-13.**

After launch people will have saved diagrams, and the app will keep changing.
Three things would have hurt saved documents (Zach, 2026-10-12: "yikes yeah
all those would burn us"). This plan records the policy he agreed and what
was built for it.

## Goal

The policy: **look tweaks apply to everyone; layout never moves without the
user's consent.**

- A change to the packer reaches only new pages and pages the user re-packs on
  purpose (Re-pack Page, Re-pack All Pages). A saved page holds as it was
  saved.
- A change to a default reaches only new diagrams. A saved diagram keeps every
  setting it was saved with.
- A change to a look — a pen's width, a label's size, a band's colour default —
  reaches every diagram. That is by design: it moves nothing.
- A setting is retired through an explicit list that says how a file that still
  carries it is read, never by leaving it to be carried as an unknown field.

## Approach

### 1. A page's signature is its structure, never its packer (built)

Every stored flow-page arrangement (`DiagramDocument.pageArrangements`, keyed
by the page's first step) carries a signature (`pages/pageSignature.ts`); the
page holds while its signature matches. The signature used to include the
packer's version (`PACKING_VERSION`), so bumping it re-packed every saved
flow page on open, silently — and hand-moved frames kept their offsets against
new homes (reproduced with `artifacts/layout-review/crane_final_oldpack.osf`,
`crane-final-version-probe.mjs`).

- `SIGNATURE_VERSION = 'pack-3'` — the signature's **format**, frozen at the
  literal in every signature saved so far, so every saved arrangement still
  matches: zero re-packs for existing files. It changes only if the
  signature's *inputs* change (what the structure covers, or how it is
  digested). **Rule:** a build that changes them must also accept the old
  format's signatures — a page saved under the old format whose structure is
  the same, as the old format read it, still holds. No second format exists
  yet. `pageSignature.test.ts` pins three digests so such a change cannot slip
  through unnoticed.
- `PACKER_VERSION` (`pages/flowArrangement.ts`; `pack-4` when this part was
  built, `pack-5` since 2026-10-13: a size pin packed at its pin; `pack-6` the
  same day: a caption 3 mm under its picture, so captioned boxes pack a
  millimetre taller, while held pages keep their boxes; `pack-7` since
  2026-10-15: a page's first band at its area's left edge, step 1 at the top
  left, and a first step whose picture prints past its box set in as far as
  that picture needs) — the packer's own
  version, stamped on each newly packed arrangement as `packer`
  (`DiagramPageArrangement.packer`): read leniently (any string kept as it
  came; anything else dropped alone, the page still held), written back,
  absent on arrangements saved before. It never decides whether a page holds
  (`holdsArrangement` never reads it). It exists so a later build can offer
  "Re-pack to get the improved packing" without forcing it; every arrangement
  without one that holds was packed by `pack-3`. It was stamped `pack-3` at
  first, then bumped to `pack-4` the same day for the enlarged-step change
  (c1bd3d0a2: a set Size is no longer cut to its room, in the reference cell a
  fresh pack uses too, so an enlarged step gets a bigger box), so pages packed
  before and after that change can be told apart. Bump it with every change to
  what a fresh pack produces.
- An arrangement must stay drawable as stored. A packer change that needs data
  an old arrangement lacks gives the old arrangement a legacy reading; it never
  re-packs it.

Found on the way and fixed (commit "Sign a flow page as the layout draws it"):
since turns before the first step and after the last stopped printing
(79f9419ba), the layout signed a diagram's first and last pages without them
while the store (`signedSteps` in `stepPlaces.ts`) still counted them. The
store then refused every arrangement the layout packed for those pages: they
were packed afresh on every open and never saved, so any packer change would
have moved them. The store now reads steps exactly as the layout lists them.
That change of inputs predates this rule and was not made old-format-tolerant:
a diagram saved before 79f9419ba with a turn at either end has those pages
re-packed once (they already were, on every open, since 79f9419ba).

Forward compatibility: a build from before this change reads a `packer`-stamped
arrangement as a newer build's — it re-packs that page for display and writes
the stored one back untouched. Only pre-launch builds are affected.

### 2. A hand-moved step keeps its offset across a re-pack while it stays in its band (decided and built)

**Zach's rule (2026-10-13): keep a moved step's frame offset across any
re-pack while the step stays on the same page and in the same band; send it
home — the frame offset cleared — only when its band or its page changes.**
Part offsets (number, picture, text), size pins (`scale`) and caption widths
(`textWidth`) are relative to the step's own frame and always stay. It holds
for every way a flow page is packed afresh: an edit of its structure, Re-pack
Page and Re-pack All Pages, and a page whose stored arrangement is stale or
missing when the file opens. Reset This Page stays the way to clear hand moves
on purpose. Grid pages keep their cell rule.

Before this, an edit of a page's structure and Re-pack Page sent every frame
on the page home in the edit (`settlePlaces`), and a page packed afresh on
open kept every offset against its new homes with no check at all.

**Definitions** (`pages/repackedFrames.ts`):

- **Same band**: the arrangement the step was last held in placed it in the
  band the new packing does (`DiagramArrangedStep.band`), and in a bend there
  or not as now (`bend`). A step moved into or out of a bend has its home in
  the page's edge column instead of its band, so that counts as a band change.
- **Same page**: the page whose arrangement — held, stale or let go — is
  stored under the step it starts with now. The store moves a stale
  arrangement with its page as each edit lands
  (`followPageArrangements`, which replaces `dropStalePageArrangements` in
  the store's `commit`): a page keeps the arrangement under its first step; a
  page that starts with another step now takes the arrangement of the page of
  its number before the edit, when no page starts with that page's old first
  step any more; any other arrangement goes. So, as for a grid page (which is
  the same page while it keeps its number or its first step): a step put in
  at the start of a page, or the page's first step deleted or moved away,
  leaves its other steps on the same page; a page break before a page
  renumbers it and it is still the same page; a step pushed onto the next
  page, or pulled back onto the one before, changes page. Where no
  arrangement ever placed a step, its page is the same page while it keeps
  its number or its first step, and the step keeps its offset: no band is
  known to have changed (Zach's default).
- **Where it was**: the arrangement the step was last held in. A page whose
  structure an edit changes keeps it, stale, until the page is packed and its
  packing adopted; Re-pack Page and Re-pack All Pages let a held arrangement
  go by re-signing it `LET_GO_SIGNATURE` (`"let-go"`, which matches no page)
  instead of dropping it; a file opened with a stale one brings its own. A
  file saved in between carries the stale or let-go arrangement (file
  contract updated in `diagram-workspace.md`); a reader packs that page
  afresh as for any stale one.

**Built** — the new bands are known only once the layout packs the page,
after the edit has committed, so the rule is applied in three places, each
against the document's own stored arrangements:

- **The edit** (`settlePlaces`, in `commit`): sends home, in its own undo
  step, only the frames of steps it took off their page
  (`staysOnFlowPage`), and a new step's. A flow step's `k` among its page's
  steps no longer matters.
- **The layout** (`layoutDiagramPages(…, arrangements, stored)`;
  `layoutDiagram` passes the document's arrangements as `stored` in every
  measuring pass): on a page it packs afresh — here, or in an earlier pass —
  a moved step whose band or page changed is drawn at home, its frame offset
  left out and the rest of its placement drawn, its cell's `placed.offsets`
  without it, exactly as the adopted diagram lays out. So a read-only diagram,
  an export, Print and step files are right without any adoption, and the
  adopted diagram takes the same pages (`PreparedDiagramPages.adoptedAs`).
- **Adoption** (`adoptPacking`, run by the store's
  `adoptDiagramPageArrangements`): clears exactly the frame offsets the
  layout drew at home (`framesSentHome`; a newer build's `placeNewer.frame`
  with them, as `settlePlaces` does) and replaces the stale arrangements. Not
  an edit: no undo entry, not dirty (`onlyPackedSince` holds: a file saved
  before it packs and draws the same when it opens). Undo of the edit that
  caused the re-pack restores the old frames and the old arrangement.
- **The notice**: `diagramPlacesSettled` gains `added` beside `count`. It
  counts only frames actually sent home: by the edit, then by the adoption,
  which adds to the edit's notice when it follows it (`count` the edit's
  total, one toast updated in place, its Undo the edit's), and which offers
  no Undo where there is no edit (a diagram opened with a stale arrangement,
  `entry: null`). `diagram placements reflowed` fires once each time with
  `added`, so an edit and the adoption after it are two events, each with its
  own frames (`docs/analytics.md`).

Tests: `repackedFrames.test.ts` (the predicate; a stale arrangement opened:
the layout draws the two band-changed steps of nine at home before any
adoption, the adoption clears exactly those two and the adopted diagram draws
cell for cell the same; Re-pack Page with the same split; never stored:
every offset kept), `pageArrangements.test.ts` (following: own key kept, a
step put in at a page's start, its first step deleted, a renumbered page;
Re-pack lets go; `adoptPacking`: band change, a step into a bend, after an
edit as the store lands it, a file whose pages changed outside the app, never
stored), `stepPlaces.test.ts` (the edit's rule on flow pages held and not:
a step put in at a page's start and one pushed onto the next page, one pulled
back, page settings, renumbering, turns, Re-pack), the store's
`diagramPageArrangements.test.ts` (Re-pack Page keeps the frames, adoption
sends home the two band-changed ones with no undo entry, Undo restores the
held diagram; an edit's and its adoption's frames as one notice; a stale
arrangement opened: one frame home, `entry: null`, not dirty),
`diagramPageCounts.test.ts`, `usePlacementReflowNotice.test.tsx`.
`savedPagesHold.test.ts` and both goldens are unchanged.

**Browser proof** (`artifacts/layout-review/repack-keeps-hand-moves-probe.mjs`
on :5320; screenshots, logs and `report.json` in
`artifacts/layout-review/out/repack-keeps-hand-moves/`: `baseline/` is the
build before this part, `after/` and `after-ef/` this one):

- `crane_final.osf` page 2 (steps 10–20, 9 frames moved: steps 11–19), Re-pack
  Page: k 0.93 → 0.98 and the same plan, so **every moved step keeps its band**
  (0, 0, 0 | 1, 1, 1 | 2, 2, 2) and all 9 offsets are kept, their homes
  moving by up to 12 mm (step 13's box x 152.67 → 140.67, step 18's 60.36 →
  49.18). Before, all 9 went home (count 9).
- Bands set to 4 on the same file (an edit that re-packs every page): on page
  2 four moved steps keep their bands and offsets (11, 12 in band 0, 14 in 1,
  17 in 2) and five go home (13: 0 → 1; 15, 16: 1 → 2; 18, 19: 2 → 3); the
  notice says 5; the diagram the edit left, laid out with nothing adopted,
  draws page 2 box for box as the adopted one; Undo brings back the page cell
  for cell, every frame with it.
- Page 2's first step deleted: the arrangement follows the page to its new
  first step (`step-0a37…`), the page is packed afresh, step 16 (was 17) goes
  from band 2 into the bend after band 1 and home (count 1); the other 8 keep
  their offsets; drawn the same before adoption.
- `crane_final_oldpack.osf` (every arrangement signed by an old format, so
  every page packed afresh on open): no step changes band on any page, so
  every offset is kept, as before this part.

**What it shows Zach (open).** On the crane the band rule keeps every offset
through Re-pack Page and through opening `crane_final_oldpack.osf`, because no
band changes there — the homes move inside their bands. The offsets were
fitted tightly against the old homes, so both leave the clashes the brief
reported for the old-format file: step 11's number on step 16's caption
(20.6 mm²), step 13's number on step 15's caption (18.5 mm²), step 12's
picture on step 13's caption (24.2 mm²) and steps 11 and 12's pictures
(8.7 mm²) — the same four on the re-packed page 2 and on the old file opened
(`after/A-page-2-repacked.png`, `after/D-oldpack-page-2.png`). Before this
part Re-pack Page sent all 9 home, which made two other clashes (step 10's
picture on step 16's caption, 81.9 mm²; step 12's number on step 15's
caption, 22.0 mm²) and lost every hand move. With the Bands-4 edit the kept
offsets sit against homes that moved across the page inside their bands
(step 14's box 145.5 → 31.5 mm from the left). Whether "same band" should
also ask the home to stay near where it was (or keep the frame where it was
on the page) is his call; nothing here decides it.

### 3. Every page setting is written; an unsaid one reads as its legacy value (built)

`writePageSetup` used to write `stepsPerPage`, `pathWidthMm`, `pathColor`,
`firstPageSide` and the five flow packing settings only when they differed from
their defaults, so changing a default would have silently changed every saved
diagram that never touched it — and, for the packing settings (part of the
signature), re-packed it.

- `writePageSetup` writes every page setting, always, in one order.
- `PAGE_SETTINGS` (`document/pageSettings.ts`) holds each setting's `default`
  (a new diagram's: `DEFAULT_PAGE_SETUP` is made from it) and `legacy` value
  (what a file that does not say it reads as: the value that draws the page as
  the build that wrote the file drew it). A future default change is a
  one-line change to `default` alone.
- `normalizePageSetup` falls back to the legacy value for a missing or damaged
  setting. Today every legacy value is what an unsaid setting already read as —
  the default, but for the layout (`grid`), the steps per page (the file's
  columns × rows) and the title block (off, where a new diagram's is on; added
  2026-10-14, `diagram-title-block.md`) — so no existing file opens
  differently.
- **Adding a setting:** give it a default and a legacy value in the table; its
  legacy value reproduces how pages were drawn before it existed and never
  changes once a build that knows it has shipped.
- **Retiring a setting:** put its key on `RETIRED_PAGE_KEYS` in
  `diagramFile.ts`, which reads it on purpose — migrated into what replaced it,
  or let go — and never writes it. It is never carried as a newer build's
  unknown field. `scale` (One scale / Fit each, retired 2026-10-06) is the
  first entry.
- The rule is in the file contract at the top of `diagramFile.ts`.

### Audit: other fields written only when not default

Classified by what a change to their default would do: (a) moves pagination,
packing or a signature — write explicitly, like the page settings; (b) look
only — leave, look tweaks apply to everyone; (c) absence is itself a value —
leave.

| Field | Where | Class |
| --- | --- | --- |
| Page: `stepsPerPage`, `pathWidthMm`, `pathColor`, `firstPageSide`, `flowBands`, `flowPreferBands`, `flowBendSteps`, `flowNesting`, `flowSteadiness` | `writePageSetup` | (a) — now always written (band width and colour are look, but are page settings and go with them) |
| Step `pageSteps` | `writeStep` | (c) no own count: the page fills with the default |
| Step `zoom` | `writeStep` | (c) not enlarged |
| Zoom `scale` | `writeStepZoom` | (c) Fill |
| Zoom `edge`, `frame`, `imprint`, `areaWas` and their `anchor`/`scale`/`edge`; outline `radius`/`size`/`angle` | `writeStepZoom` | (c) the shape's own edge, no frame set, no capture record; `edge` absent is also a look rule (b) |
| Step `place` and each offset, `scale` pin, `textWidth` | `writeStepPlace` | (c) where the layout puts it |
| Arrangement step `bend`, `zoomScale`; arrangement `packer` | `writePageArrangements` | (c) not in a bend; packed at Fill; packed before packers were recorded |
| Annotation `width`, `tail`, `color`, `bold`, `halo`, `sizePt`, `offsetPt`, `radiusMm`, `edge`, a star's or eye's `scale` | `writeAnnotation` | (b) look: a pen, a size, a colour. A held page never moves for them; a mark that reaches further prints past its box until Re-pack |
| Annotation `anchor` | `writeAnnotation` | (b) "the default rule" picks where an enlarged step's frame lands: picture content, never a page's layout |
| Annotation `bend`/`path`/`back`, `fill`, `rotate`, `axis`, `other`, `ticks`, `kinks`, `hidden`, `mirrored`, `numbered`, `shortDividers`, `behind`, `angle`, an area's `scale`, `radius`/`size`, `parts`/`offset`/`depth` (always written for their kinds), `imported` | `writeAnnotation` | (c) absence has a fixed meaning: an exact arc, a white fill, one tick, one Z, to the right, in front, no turn, Fill, drawn by hand |
| Path node `in`, `out`, `type` | `writePathNode` | (c) a straight node |
| Crease-pattern render `side`, `flipCreases`; flat-fold `spread` | the source as read (`readCpRender`) | (c) the front, not flipped, no spread |
| Picture `styleKey`, step-diagram `mirrored` | the picture as read | (c) |
| `titleBlockContent` and its `model`, `pattern`, `subtitle`, `credits` and `note` (added 2026-10-14 and 2026-10-15, `diagram-title-block.md`) | `writeTitleBlockContent` | (c) an unsaid source means Auto, and an unsaid subtitle, credits or note none, for good; a new diagram writes its subtitle and credits at creation |
| The title block's `modelSize` and `patternSize` (added 2026-10-15, `diagram-title-block.md`, Phase 1c) | `writeTitleBlockContent` | (b) look: unsaid is the build's default (0.59 and 0.79), which may change for every file; the block's height is the page setting, so no step moves |
| What Auto finds for the title block: the last step with a picture, the last linked pattern | `resolveTitleBlock` (`pages/titleBlockContent.ts`) | (b) a look, as an annotation's `anchor` rule is: the content is in no signature, so no step moves when it changes. Unlike a pen or a gap, a change to it changes content on old files (which model or pattern their block pictures), so it is Zach's call |

Only (a) changed. A (c) field's absence is a value in its own right, so it is
never redefined: to give new marks another default, write the new value on new
marks, explicitly, and leave what absence means alone — it is that field's
legacy value.

## Affected Areas

- `apps/web/src/diagram/pages/pageSignature.ts` — `SIGNATURE_VERSION`, the
  format rule; `holdsArrangement` never reads the packer.
- `apps/web/src/diagram/pages/flowArrangement.ts` — `PACKER_VERSION`, stamped
  by `packedArrangement`.
- `apps/web/src/diagram/document/diagramDocument.ts` —
  `DiagramPageArrangement.packer`; page setup docs; `normalizePageSetup` reads
  legacy values; defaults re-exported from the table.
- `apps/web/src/diagram/document/pageArrangements.ts` — `packer` rounded,
  compared, read leniently, written back.
- `apps/web/src/diagram/document/pageSettings.ts` (new) — `PAGE_SETTINGS`,
  `DEFAULT_PAGE_SETUP`, `DEFAULT_FLOW_PACKING`, `legacyStepsPerPage`.
- `apps/web/src/diagram/document/diagramFile.ts` — file contract; every page
  setting written; `RETIRED_PAGE_KEYS`.
- `apps/web/src/diagram/pages/stepPlaces.ts` — `signedSteps` reads steps as
  the layout lists them. Part 2: `staysOnFlowPage`, `framesSentHome`;
  `settlePlaces` sends a flow frame home only off its page; `sameCell` is the
  grid's alone.
- Part 2: `pages/repackedFrames.ts` (new: `keepsMovedFrame`, `placedIn`);
  `pages/pageArrangements.ts` (`followPageArrangements` replaces
  `dropStalePageArrangements`, `LET_GO_SIGNATURE`, `repackPages` lets go,
  `adoptPacking`); `pages/diagramPageLayout.ts` (`stored`, a frame drawn at
  home on a page packed afresh); `pages/diagramPages.ts`; the store's
  `commit` and `adoptDiagramPageArrangements`, `diagramPlacesSettled.added`;
  `pages/usePlacementReflowNotice.ts` (one toast per edit, no Undo without
  an edit); `docs/analytics.md`; the file contract in `diagram-workspace.md`.
- Tests: `pageSignature.test.ts` (frozen digests, packer never asked),
  `savedPagesHold.test.ts` with the frozen fixture
  `document/__fixtures__/diagram-held-pages.json` (a file saved before this
  change holds, writes back with its settings said, and keeps holding in a
  build whose packer version is bumped), `diagramFile.test.ts`,
  `diagramFileV1.test.ts`, `diagramDocument.test.ts`,
  `document/pageArrangements.test.ts`, `stepPlaces.test.ts`,
  `turnsBetweenSteps.test.ts`.
- Not edited here: `implementation-plans/diagram-flow-packing.md` still names
  `PACKING_VERSION`; read it as `SIGNATURE_VERSION` (format) and
  `PACKER_VERSION` (packer) as above.

## Checklist

- [x] Signature covers the page's structure only; `SIGNATURE_VERSION` frozen at `pack-3`, the format rule written down
- [x] `PACKER_VERSION` stamped on newly packed arrangements as `packer`, read leniently, written back, never asked
- [x] `PACKER_VERSION` bumped to `pack-4` for the enlarged-step packing change (c1bd3d0a2)
- [x] `PACKER_VERSION` bumped to `pack-7` for step 1 at the top left (`diagram-title-block.md`, 2026-10-15; missed by 3789b31b3, bumped in its review)
- [x] Store and layout sign a diagram's first and last pages alike (turns at the ends)
- [x] Frozen fixture: a file saved before the change opens with every page held, nothing adopted, every step in its box
- [x] A bumped packer version holds every saved page and packs only a re-packed one, stamped with it
- [x] Part 2 (Zach, 2026-10-13): a moved frame keeps its offset across any re-pack while its step stays on its page and in its band — the edit, the layout and adoption each apply it; stale and let-go arrangements kept for their bands; one notice per edit
- [x] Part 2 browser proof in `artifacts/layout-review/out/repack-keeps-hand-moves/`
- [ ] Part 2, for Zach: on the crane no band changes through Re-pack Page or the old-format open, so tight offsets clash against homes moved inside their bands
- [x] Every page setting written; `PAGE_SETTINGS` with default and legacy values; `normalizePageSetup` reads legacy values
- [x] File contract: settings said, adding (legacy value) and retiring (`RETIRED_PAGE_KEYS`) a setting
- [x] Audit of the other fields written only when not default (table above); only page settings changed
- [x] Browser proof in `artifacts/layout-review/out/document-evolution/`
