# Diagram: an empty step's ways in

## Goal

Make giving an empty step its picture take fewer clicks, and make the ways to
import look the same wherever they appear:

1. **Standing pattern picker.** When the selected step is empty, the Step
   pane's Picture section always shows *Choose a pattern*, in the place Link
   Pattern… opens it today (under the ways in, above Instruction). The Link
   Pattern… verb goes away for an empty step (Zach, 2026-10-26).
2. **Larger thumbnails.** The pattern picker shows two patterns to a row
   instead of three or more, everywhere it appears.
3. **Import menu on the empty diagram.** *Import…* becomes a menu button with
   three choices: **From File (CP, Defox)…**, **From References…** and
   **From Fold…**. Each one opens its own dialog: the step import dialog, the
   References browser or the Fold browser. The standalone *From References…*
   button goes away.
4. **The same menu on an empty step card.** It replaces the card's
   *References…* button, and each choice fills that step.

## Approach

### 1. Standing picker (Step pane)

- `diagram/capture/useStepLink.ts`: work out `standing = step is empty
  (source === null && picture === null) && !readOnly && !locked`.
  The picker is wanted when `pickerOpen || standing`. That flag gates
  `useDiagramPatternSheets(...)`, the hook that draws the thumbnails. Return
  `picker.standing`.
- Placement is unchanged: the picker renders at the end of the Picture
  section, where Link Pattern… opens it today, for a standing picker and an
  opened one (Relink on a linked step) alike.
- `DiagramPatternPicker`: `onCancel` becomes optional. The standing picker has
  no Cancel, because there is nothing to cancel back to. With no crease
  pattern open it still shows, with its existing note ("Open a crease pattern
  in Edit to link one.") and without the Show as row, which has nothing to
  apply to.
- Show as starts on **Folded** (`lastLinkedAs` in `stepCaptureActions.ts`;
  Zach, 2026-10-26). It still follows the nearest linked step before the
  step, and then the way the picker last linked this session.
- `DiagramStepPicture`: `link-pattern` leaves `WAYS_IN`, so an empty step's
  ways in are Upload Picture…, From References…, From Fold… and From File
  (CP, Defox)…. Relink Pattern… on a linked step is untouched.
- The picture lands a moment before the capture record clears, and Relink
  Pattern… is disabled until it does. So a link made from the standing picker
  keeps the picker (busy) until the capture ends (`linking` in
  `useStepLink`); the existing `useReturnFocusOnClose` then finds Relink
  Pattern… enabled and puts the focus there. Without that, the focus fell to
  Adjust Pose (found in the browser).
- The card's **Link…** is unchanged: it opens the picker state and reveals the
  Step pane, where the standing picker already is, so there is still one copy.
- Cost: `useCpPatternSheets` is now worked out whenever an empty step is
  selected, not only when a picker has been opened. Measured in the browser on
  38 of the largest cpoogle designs imported as steps (38 sheets, 106,068
  lines), selecting an empty step after a linked one:
  - before (picker only on Link): 38–71 ms;
  - standing picker, uncached: 86–142 ms;
  - standing picker, sheets drawn once per document (`drawSheets` in
    `useCpPatternSheets`): 61–102 ms. What is left is painting 106k strokes
    into 38 canvases.
  - Empty step to empty step reuses the mounted picker: 16–34 ms.

  On a normal diagram (one crease pattern of a few thousand lines) the
  difference is a millisecond or two.

### 2. Two per row

- `DiagramPatternPicker.module.css`: `.grid` becomes
  `grid-template-columns: repeat(2, minmax(0, 1fr))`. Drop the column rule in
  the `pointer: coarse` block and keep its gap. The file is already a module,
  so nothing needs to migrate.
- A canvas with many patterns makes a long list, which pushes Instruction
  down the pane (the placement Zach chose). No nested scroller.

### 3 + 4. One import menu, two places

- **Choices catalog**: a React-free `diagramImportWays({ patternOpen,
  foldSteps }, t)` in `diagram/actions/` returns the three choices as plain
  descriptors (`id`, `label`, `disabled`, `hint`). The existing step and
  header catalogs live there too. Icons come from `DIAGRAM_ACTION_ICONS`
  (Compass for References, the From Fold icon, lucide `Import` for File) so
  each concept keeps its one icon.
- **`components/ui/MenuButton.tsx`** (design system, Zach 2026-10-26): a
  labelled button with a caret opening a list of `MenuAction`s, for verbs with
  no default (`SplitButton` when one is the default, `MenuIconButton` when an
  icon names the set). Its menu half, `ActionMenuContent` in
  `components/ui/ActionMenu.tsx`, is shared with `SplitButton` and owns the
  `opensDialog` focus rule. `pointerOnly` makes it a surface's pointer
  shortcut: out of the tab order, hidden, and handing the focus to the
  surface (the nearest focusable ancestor) as it closes, or back to what had
  it when there is none.
- **`components/diagram/DiagramImportMenu.tsx`**: a `MenuButton` fed by
  `diagramImportWays`, with each verb's icon and the analytics. A disabled
  choice shows its reason as the hint, worded as the header's split menu words
  it: "Open a crease pattern in Edit to plan its folds" and "Fold a step in
  Fold to take it from there".
- **Empty diagram** (`DiagramEmptyState`): the button order becomes **Add
  step** · **Import ▾** · **Link a pattern…** (when a pattern is open) · **Go
  to Edit** (when none is open). The three choices:
  - From File → `handleMenuAction('file.importDiagramSteps')`, which is already
    counted at the menu-action chokepoint.
  - From References → `openReferencesBrowser`.
  - From Fold → `openFoldBrowser`.

  The panel passes `foldSteps`, which it already reads.
- **Empty step card** (`DiagramStepCard`): **Import ▾** replaces
  *References…*. The other buttons stay: Upload…, Link… or Go to Edit, and "or
  a turn". Like the card's other pointer shortcuts, the trigger is
  `tabIndex={-1}`, `aria-hidden` and `onMouseDown={keepFocus}`
  (`MenuButton`'s `pointerOnly`). A press selects the card, as its other
  shortcuts do, and when the menu closes the focus goes to the card; never to
  the hidden trigger. Choices:
  - From File → the import dialog, anchored to *fill* this step (see below).
  - From References → `fillStepFromReferences(stepId)`.
  - From Fold → `fillStepFromFold(stepId)`.

  The card gets `foldSteps` and `onImport(stepId)` through `DiagramStepsGrid`.
- **Keyboard parity**: a card's pointer shortcuts must also be in the card's
  menu and the Step pane. So the step action catalog gains an `import-steps`
  verb for an empty step, labelled as the menu row is ("From File (CP,
  Defox)…"). It joins `WAYS_IN` in the Step pane and appears in the card's
  context menu.

### Import fills an empty step

Today the import dialog always inserts after the selected step
(`insertionIndex`), so importing from an empty step would leave that step
blank. References and Fold already follow the insertion rule (D2): an empty
anchor takes the first card and the rest follow it. Import should do the same.

- `useImportDialogStore.open` takes an optional anchor step id. Without one it
  still uses the selection.
- In `diagramBatchImport.ts`, `placeImportedSteps` (in `diagramDocument.ts`):
  when `anchorTakesCard(base, { kind: 'fill', stepId: anchor })` holds and the
  first imported step has a picture, it merges into the anchor and the rest go
  after it. The merge keeps the anchor's id, its own marks (as an upload into
  the step keeps them) and its text if any — the text rule (`filledText`) is
  now shared with the References/Fold pull — and applies `startsWhole`. The
  pull's card-mark swapping is References-only, so only the text rule is
  shared. It stays one undo entry.
- The rule applies however the dialog was opened (header, File menu, empty
  diagram, card) whenever the anchor is empty. That matches what From
  References… and From Fold… already do from the header.

### Analytics

- One new event, `diagram import way chosen`, with `way: file | references |
  fold` and `from: empty_state | card`. This measures whether the menu gets
  used. Opening the dialogs and browsers is already tracked.
- No `standing_picker` value after all: with Link Pattern… gone from an empty
  step, every first link comes from the standing picker, so the existing
  `diagram picture captured` (`via: link`) count already measures it.

### Copy (i18n)

New keys: the menu trigger ("Import") and "From File (CP, Defox)…", shared by
the menu row and the `import-steps` verb. Removed: the empty diagram's
`import` and `fromReferences`, and the card's `fromReferences`. Extracted,
translated for the 8 locales, stamped and checked.

## Affected Areas

- `apps/web/src/diagram/capture/useStepLink.ts`
- `apps/web/src/cp-workspace/sheets/useCpPatternSheets.ts` (sheets drawn once
  per document)
- `apps/web/src/components/diagram/DiagramPatternPicker.tsx` + `.module.css`
- `apps/web/src/components/diagram/DiagramStepPicture.tsx`
- `apps/web/src/components/diagram/DiagramEmptyState.tsx`
- `apps/web/src/components/diagram/DiagramStepCard.tsx`, `DiagramStepsGrid.tsx`
- `apps/web/src/components/diagram/DiagramImportMenu.tsx` (new)
- `apps/web/src/components/ui/MenuButton.tsx`, `ActionMenu.tsx` (new),
  `SplitButton.tsx` (its menu half now `ActionMenuContent`)
- `apps/web/src/diagram/actions/diagramImportWays.ts` (new),
  `diagramActions.ts`, `diagramActionIcons.tsx`, `diagram/useDiagramActions.ts`
- `apps/web/src/diagram/import/stepImportActions.ts` (new),
  `importDialogStore.ts`, `store/workspaceStore/diagramBatchImport.ts`,
  `diagram/document/diagramDocument.ts` (`placeImportedSteps`, `filledText`)
- `apps/web/src/components/panels/DiagramPanel.tsx` (passes `foldSteps` and
  the import ways through)
- `apps/web/src/analytics/` (`events.ts`, `trackDiagram.ts`, `index.ts`),
  `docs/analytics.md`
- `apps/web/public/locales/*/panels.json`

## Checklist

- [x] Standing picker: it shows in the Picture section for every empty step,
      it has no Cancel, and Link Pattern… leaves an empty step's ways in
- [x] Card Link… still reveals the Step pane, where the one picker stands
- [x] Focus returns to Relink Pattern… once the picture lands
- [x] Measure selection latency on a heavy canvas before and after; cache the
      drawn sheets per document
- [x] Picker grid: two per row, fine and coarse pointers
- [x] `diagramImportWays` catalog + `DiagramImportMenu`
- [x] Empty diagram: the Import menu replaces Import… and From References…
- [x] Empty card: the Import menu replaces References…, focus returns to what
      had it or the card
- [x] `import-steps` verb in the Step pane's ways in and in the card's context
      menu
- [x] Import fills an empty anchor, its text rule shared with References/Fold
- [x] Analytics: `diagram import way chosen`
- [x] i18n: extract, 8 locales, stamp, check
- [x] Tests: Step pane standing picker, empty-state menu, card menu, import
      menu focus, `placeImportedSteps`, a `diagramBatchImport` fill test,
      catalog tests, the sheets cache
- [x] `npm run lint:web`, typecheck, the touched tests; browser check of each
      surface in dark and light
