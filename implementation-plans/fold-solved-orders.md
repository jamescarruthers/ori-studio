# Fold: a plain fold's layer orders, solved

## Goal

A valley or mountain fold lists every layer order its moving paper can land
in, per independent part, so every combination is reachable — the envelope's
book order (both sides between their flaps) included, which the recipe search
never lists. A chosen order is saved as the order itself, a `solved` landing
pinned by `choices.completion`, and replays to exactly that order or breaks.
Old `outer` and `against` steps keep replaying through their own paths,
byte-identical.

## Approach

### What is listed: the moving paper only

- **One geometry.** Every order the chooser lists moves the same paper: the
  seed's material-connected flaps (`State::placement_scope`'s moving set,
  already what the recipe search filters every candidate to). That block,
  reflected across the line, is one folded geometry; only the order differs.
  A landing that moves other paper — a closure that adds flaps, an old tuck's
  target-bounded closure — is a fold of more flaps, reached by naming them
  in the seed, never a layer-order choice. Where the seed's flaps have no
  order of their own, the chooser refuses and its "include flaps" fix names
  them in one click (christmas-tree, cicada and santa in the corpora). Where
  they do have orders, nothing is refused and the folder names the extra
  flaps in the layer chips: Heart step 10 needs flaps 0 and 1 picked, then
  its second order. The chooser could offer that as an option of its own
  ("Also move flaps 0 and 1"), the outer recipe's closure beside the
  listing; not built.
- **The parent's order is never re-asked.** Every pair of faces where
  neither face moves keeps the parent's order, fixed (the compound pipeline's
  carry). Pairs inside the moving block keep their order, reversed by the
  reflection. The hinges keep the fold's direction (valley: the block's face
  above the face it is hinged to). Only pairs between moving paper and paper
  it can lie against are open.
- **Parts.** The completion's independent components are the parts. A part
  made only of faces that do not move is never shown: it is pinned to the
  parent's order before listing (the carry already fixes such pairs; a
  defensive pin and a corpus probe prove there are none).
- **When to ask.** The chooser opens only when the moving paper has more
  than one valid order.

### Engine (`crates/oristudio-fold`)

- `fold/solved.rs`: `State::fold_orders(op, limits)` prepares the block
  through the compound pipeline (the tuck's preparation, no targets), places
  the hinges and completes. Its `FoldOrders` lists parts (component, size,
  faces) and `pick(choice)` lands one, with the `WitnessOrder` the step
  stores: every pair of every component, the search's own included (the
  full assignment of the open pairs, so replay never searches again).
- Every listing of up to 64 combinations is landed before it is offered:
  none landing is no order (refused as the outer recipe refuses, with its
  fix); some landing makes the listing those, as one flat part.
- `State::fold_solved(op, stored, limits)`: replay — prepare, fix the stored
  pairs, complete; exactly one order or `Broken`.
- A stored choice records each witness face's orientation (`up`); replay
  breaks when one face of a stored pair now turns the other way from the
  other (an earlier step shifted), rather than read the sign as the other
  stacking. Tucks and every compound completion store it too; Import CP's
  whole order does not (no earlier step can turn its faces).
- `FoldLanding::Solved` beside `Outer` and `Against`.
- Fallback: the recipe search (`FoldPlacementSearch`) runs only when the
  enumeration cannot finish: the completion hits its node budget or its
  2 s, or truncates a part, or the preparation refuses a fold the outer
  recipe lands. Its count is exact once it has nothing left to try. An
  enumeration that proves no order refuses as the outer fold does.

### Bridge (`crates/oristudio-fold-wasm`)

- `resolve`: a `solved` landing resolves to `Resolved::Solved`, landed and
  held as a plain fold (`Held::Fold`, a `FoldReport`), so summaries,
  pictures and sentences read it as the valley or mountain it is.
- `order_selection` for valley and mountain: the enumeration, with
  `choice` (per part) beside the flat `index` (mixed radix, last part
  fastest, which the pleat and Repeat keep using), and per part its size, its
  pick and its landed faces for the canvas tint. A pick that is the outer
  recipe's own landing writes `outer`, however many orders there are: it
  replays where an earlier step shifts and stored pairs would not.

### Web

- `FoldLanding` gains `{ kind: 'solved' }` (reader, writer, history op).
- `useFoldOrderResolution` holds a per-part choice and an active part;
  `FoldOrderChooser` shows one stepper row per part (the existing chooser,
  extended), the active part tinted on the canvas. Left/Right step the
  active part's options, Up/Down change the part, through the shortcut
  registry. Find more orders shows only for the fallback.
- Repeat carries the per-part choice: the mirrored completion pins each part.
- Analytics: how the order was chosen (enum) and bucketed part counts.

## Affected Areas

- `crates/oristudio-fold/src/fold/{solved,placements}.rs`,
  `compound/tuck.rs`, `lib.rs`
- `crates/oristudio-fold-wasm/src/{resolve,bridge,order_selection,wire}.rs`
- `apps/web/src/fold/{document,engine,orders,repeat}`,
  `components/fold/orders`, `fold/canvas`, `analytics/trackFold.ts`, locales
- `PORTING.md`, `docs/analytics.md`

## Checklist

- [x] Engine: `fold_orders`, `fold_solved`, `FoldLanding::Solved`, parts never
      of non-moving faces (doc + pin)
- [x] Engine tests: two seeded multi-part folds (2 × 5, 2 × 2) reach every
      combination, replay pinned, broken without its pairs or with one part's
- [x] Bridge: resolve, apply, analysis, order selection per part; a fold with
      no order refused as the outer recipe refuses it; fallback otherwise
- [x] Bridge tests
- [x] Web: document reader/writer, resolution per part, chooser rows, canvas
      tint, keys, Repeat, analytics, i18n (8 locales)
- [x] Web tests
- [x] Proof: reachability of every saved outer/against step (fixtures, owner
      folder, research corpora, Repeat-nested), superset of the recipe search,
      randomized breadth, envelope 9/9, fingerprints of old files, timings
- [x] Corpus probe: at every chooser step, new ask vs old ask, parts with no
      moving face (must be 0), across fixtures, owner folder and research
      corpora
- [x] Browser: envelope book order through the tool, screenshots, saved copy
- [x] PORTING.md, docs/analytics.md, the landing format
      (`unified-mountain-valley-placement.md`)
- [x] cargo test/clippy/fmt, vitest, tsc, eslint, i18n:check

## Review fixes (2026-10-21)

- [x] A listing the gate refuses whole is no order: refused with the outer
      recipe's fix (`a_listing_the_gate_refuses_whole_is_no_order`)
- [x] A pick equal to the outer landing saves `outer`; a witness whose face
      turned apart from its pair's breaks replay (`BrokenWitness::Turned`)
- [x] The listing's one call is capped at 2 s; an exhausted recipe search is
      exact again; a single-order `solved` step stores its pairs
- [x] A refused pick keeps the part rows; Repeat's fallback listing applies
      each order's landing
- [x] Regression fixture: two independent sides, every combination listed
      (`tests/fixtures/fold-regressions/independent-sides-orders.osf`, built
      from scratch; the old chooser listed 6 of its 9, never both sides
      between; `independentSidesOrders.wasm.test.ts`)

## Known limits

- The completion searches around the moving faces; the gate checks the whole
  state, and on rare folds refuses some of the orders the completion allows.
  A listing of up to 64 combinations is landed whole before it is offered; a
  larger one lands its first only, and a later pick the gate refuses shows
  as a failed preview.
- A tuck names its placement, not its hinge: of 375 seeded tuck states, 268
  land by folding the other way (that direction's listing has them) and 10
  fold some hinges each way, which no valley or mountain lists and the recipe
  search refuses too.
