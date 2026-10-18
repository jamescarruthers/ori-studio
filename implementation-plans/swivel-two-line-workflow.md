# Swivel from two constructed fold lines

## Goal

Replace the misleading three-point “By creases” input with two explicit line
constructions. Existing crease selects a crease; any normal Locate line mode
can construct a missing line. Derive the intersection and remaining crease.

## Approach

Use the normal line-mode input, snapping, axiom roots and hover feedback twice.
Confirm the first line before constructing the second, preserving its saved
references and root. The operation stores both constructions and re-resolves
them on replay. Reuse the validated flat swivel compiler and near-miss guards.
Keep legacy three-point operations replayable; stop authoring them in the UI.

## Affected Areas

- Fold engine line-to-swivel construction and WASM wire format.
- Fold document reader/writer and line-construction tool state.
- Swivel instructions, previews, keyboard commit and normal Locate line rail.
- Synthetic tests and ignored private verification checkpoint.

## Checklist

- [x] Agree with the user on two lines using normal Locate line tools.
- [x] Confirm the same private geometry follows from two line directions.
- [x] Resolve and replay two saved line constructions through the public engine.
- [x] Replace three-point authoring with staged normal line construction.
- [x] Verify existing-crease and constructed-line input, roots and order choices.
- [x] Rebuild WASM, validate and audit the private step through the UI path.

## Validation

- Both line constructions store their own references and axiom root. Missing
  roots and mixed/unknown saved fields refuse or lock instead of being guessed.
- Synthetic engine and bridge cases cover constructed lines, existing
  precreases, exact subdivisions of the folded run, and parallel/off-edge
  intersections. Numerical guards remain in place.
- The canvas flow uses Axiom 1 twice, confirms the first without adding a step,
  selects Inside, commits, and freshly replays. Changing the second line mode
  retains the first; Escape clears the construction.
- An ignored private checkpoint was rebuilt using this interaction and compared
  with the earlier result: geometry, exposed sides and layer order agree within
  1e-8; fresh replay is exact. The original working file is unchanged.
- Browser check: first line → Use first line → second line → Inside → commit.
  The saved step displays “Two fold lines” in its construction row.

This supersedes the three-point authoring UI in `fold-swivel-crease-input.md`;
its generalized swivel geometry and participating-paper guard fixes remain.

Final checks: 454 Rust tests passed (11 pre-existing ignored), 1,162 Fold web
and component tests passed, plus the private UI replay. WASM build, scoped
Clippy, web lint, typecheck, i18n checks, formatting and diff checks pass.
Lint retains the existing StepFilmstrip virtualizer warning; Clippy retains the
existing workspace unknown-lint warning. Unrelated engine/oracle and desktop
suites were not rerun because this changes original Fold behavior and shared web UI.
