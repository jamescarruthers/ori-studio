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
  in the seed (the closure refusal's fix does), never a layer-order choice.
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
  stores: every pair of every part (the full assignment of the open pairs,
  more than the minimum, so replay is pinned robustly).
- `State::fold_solved(op, stored, limits)`: replay — prepare, fix the stored
  pairs, complete; exactly one order or `Broken`.
- `FoldLanding::Solved` beside `Outer` and `Against`.
- Fallback: the recipe search (`FoldPlacementSearch`) runs only when the
  enumeration cannot finish: the preparation refuses (face cap, stacking
  cap, a gate the compound pipeline enforces), or the completion hits its
  node budget or deadline, or truncates a part. Its count is then never
  exact. An enumeration that proves no order refuses as the outer fold does.

### Bridge (`crates/oristudio-fold-wasm`)

- `resolve`: a `solved` landing resolves to `Resolved::Solved`, landed and
  held as a plain fold (`Held::Fold`, a `FoldReport`), so summaries,
  pictures and sentences read it as the valley or mountain it is.
- `order_selection` for valley and mountain: the enumeration, with
  `choice` (per part) beside the flat `index` (mixed radix, last part
  fastest, which the pleat and Repeat keep using), and per part its size, its
  pick and its landed faces for the canvas tint. Forced folds whose outer
  recipe lands keep writing `outer`.

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

- [ ] Engine: `fold_orders`, `fold_solved`, `FoldLanding::Solved`, parts never
      of non-moving faces (doc + pin)
- [ ] Engine tests: envelope-like 3×3 case, replay pinned, broken on
      ambiguity, fallback rule
- [ ] Bridge: resolve, apply, analysis, order selection per part
- [ ] Bridge tests
- [ ] Web: document reader/writer, resolution per part, chooser rows, canvas
      tint, keys, Repeat, analytics, i18n (8 locales)
- [ ] Web tests
- [ ] Proof: reachability of every saved outer/against step (fixtures, owner
      folder, Repeat-nested), superset of the recipe search, randomized
      breadth, envelope 9/9, fingerprints of old files, timings
- [ ] Corpus probe: at every chooser step, new ask vs old ask, parts with no
      moving face (must be 0), across fixtures, owner folder and research
      corpora
- [ ] Browser: envelope book order through the tool, screenshots, saved copy
- [ ] PORTING.md, docs/analytics.md
- [ ] cargo test/clippy/fmt, vitest, tsc, eslint, i18n:check
