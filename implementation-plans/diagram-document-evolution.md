# Diagram documents across app changes: saved layout holds

**Status: parts 1 and 3 built, 2026-10-12, on `claude/diagram-launch-completion-59e60c`.
Part 2 pending Zach's decision on hand moves across a re-pack.**

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
- `PACKER_VERSION = 'pack-4'` (`pages/flowArrangement.ts`) — the packer's own
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

### 2. A page packed afresh on open sends its hand-moved frames home (pending)

**Pending Zach's decision on hand moves across a re-pack.** Zach expects a
moved step's offset to be kept across a re-pack, and is deciding the exact
rule (likely: keep the offset while the step stays in the same band, send it
home only when its band or page changes). Nothing is built for it. Today the
in-app paths (an edit that changes a page's structure, Re-pack Page) run
`settlePlaces` and send that page's frames home; the open/adopt path and the
layout's first draw keep stale offsets against new homes. With part 1, that
path is reached only by a page whose structure changed outside the app (a
hand-edited file) or an arrangement that does not read.

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
  the default, but for the layout (`grid`) and the steps per page (the file's
  columns × rows) — so no existing file opens differently.
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
  the layout lists them.
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
- [x] Store and layout sign a diagram's first and last pages alike (turns at the ends)
- [x] Frozen fixture: a file saved before the change opens with every page held, nothing adopted, every step in its box
- [x] A bumped packer version holds every saved page and packs only a re-packed one, stamped with it
- [ ] Part 2: frames of a page packed afresh on open — pending Zach's decision on hand moves across a re-pack
- [x] Every page setting written; `PAGE_SETTINGS` with default and legacy values; `normalizePageSetup` reads legacy values
- [x] File contract: settings said, adding (legacy value) and retiring (`RETIRED_PAGE_KEYS`) a setting
- [x] Audit of the other fields written only when not default (table above); only page settings changed
- [x] Browser proof in `artifacts/layout-review/out/document-evolution/`
