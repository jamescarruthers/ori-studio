# Linked CP Collapse — 2026-10-14

The requested workflow is implemented locally. Witch Hat has advanced through
source step 10, but its tutorial is **not complete**. The source 11 collapse
and source 14 pocket order still need authoring investigation.

## Audit links

- [Witch Hat native project](../../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf): 16 nodes, 13 numbered Fold steps. Source 8 is **Fold step 11, Collapse**. Source 10 is **Fold step 13**.
- [Original tutorial](https://origami.me/witch-hat/), Francesco Mancini; diagrams by Nick Robinson.
- [Original user-edited checkpoint](../../2026-10-13-origami-fold-trials/models/archive/checkpoints/witch-hat-before-linked-collapse.osf).
- [Unverified source-13 candidate](../../2026-10-13-origami-fold-trials/models/archive/checkpoints/witch-hat-unverified-source-13.osf): diagnostic only, excluded from completion counts.
- [Verified-prefix manifest](witch-hat.validation.json), [operations](witch-hat.operations.json), and [exact investigation](witch-hat-linked-collapse-investigation.json).

## Using Collapse

In Fold, choose **Import CP… → Collapse from CP…**. The project's Edit CP is
captured at that revision and resolved by the existing flat-fold importer. If
several layer orders are available, choose one using the existing previews.
Following the user's screen audit, the new step always shows the folded result
in the canvas and timeline, with the **Collapse** label. There is no separate
CP-only screen or view toggle. Creases remain available in the ordinary CP
side pane and Steps grid. **Open source CP** navigates to Edit.

Editing the source does not alter the snapshot. **Update from CP** explicitly
captures and resolves the edited CP, then replaces that node in one undoable
transaction. Notes, identities, branches and descendant expectations remain.
Replay marks changed/broken descendants. Cancellation, solver refusal and
outlived project/sequence captures do not replace the node. Reopening uses the
embedded CP and selected order even when the source is unavailable. An
unchanged update succeeds without creating a spurious history entry.

The current project format has one Edit CP document. Multiple collapse nodes
can retain different snapshots of it; an older one remains on its saved
revision until explicitly updated. Auxiliary guide lines remain in Edit;
the importer-supported crease/border snapshot drives the resolved flat state.
This operation resolves a flat state; it does not prove a continuous collapse
motion from the preceding state.

## Witch Hat audit

The user's complete original project is checkpointed, including all 36 CP
segments and the 13-node prefix. To use that CP as a front-relative import,
its mountain/valley assignments were reversed using Edit's public
`CreaseToggleMv` command. No coordinates or guides were changed. This is an
authoring correction, not a change to import conventions. The checkpoint's
SHA-256 is `393e372da04d78201012f0dec2d436b61505c2f390ce608c682fe8d803fecce9`.

Source 8 resolves to one layer order with nine faces. The colored hat/band and
white lower triangle match the next reference diagram. Source 9 and 10 add the
two lower-edge bisectors and leave exposed material unchanged. All 17 states
(sheet plus 16 nodes) replay identically in a fresh engine, with source-step
notes and new-node expectations saved. The new prefix was opened in Fold and
is ready for user audit, not user-approved.

The source-11 rabbit-ear attempt required a preparatory crease along the color
boundary. It lands and can be continued through the small corner folds and
source 13. The outline and visible sides resemble the diagrams, but the tested middle-ear
tuck fails `tuck_infeasible`; some other targets give `tuck_target_moves`.
The exact material picks, target alternatives, refusal details and last valid
candidate state are retained. A further diagnostic imported that candidate's
lower folds with unassigned letters and tried all four offered layer orders;
none admitted the tested final tuck. This does **not** establish a missing
tuck primitive: the source-11 construction and intended pocket need to be
verified first. Do not promote the candidate based on its silhouette. A further 76 layer/direction probes also tested deeper picks: some body-layer folds land, but they move different original-sheet material from the middle ear, so they are not accepted as this tutorial step.

The full tutorial was reviewed, including the source-14 video. No cuts,
assembly or non-flat completion were added. No other campaign model was
regenerated.

## Validation

- 1,140 focused Fold/UI/landing tests passed across 152 files. After the user requested folded results at all times, the affected presentation/document subset passed again (38 tests across six files).
- Added real-WASM offline reopening, explicit source refresh, a changed descendant and a broken sibling branch after removal of its referenced crease. The targeted five-test real-WASM suite passed.
- Fold WASM build and `cargo test -p oristudio-fold-wasm` passed; Rust formatting passed.
- Browser: normal file open lands in Fold; Collapse shows its folded result directly in the canvas and timeline; source navigation works; a source M/V edit shows Update available without changing the snapshot; explicit update marks later steps Changed; one Undo restores the previous snapshot and later states. Test edits were discarded; the saved file is intact.
- Browser verification used the normal file-input fallback in an ignored development harness because the embedded browser's native picker was not exposed to automation. No store or engine mutations were injected into the page.
- Typecheck passed. Full web lint passed with zero errors and the existing TanStack Virtual/React Compiler warning in `StepFilmstrip.tsx`.
- i18n check passed after translating the new/changed strings in all eight target locales.
- Full `npm run build:web` passed, including the changed Fold WASM rebuild and the landing prerender. The untouched ReferenceFinder prebuild reused its existing artifact because `em++` is not installed; its algorithm was not changed or revalidated here.
- `git diff --check` passed. The file-picker harness is kept only under ignored `artifacts/linked-cp-collapse/`, outside app source.
- Full unrelated web tests, Rust workspace/oracle tests and desktop checks were not rerun: this change adds a Fold source-origin wire enum and shared web/document behavior, with no new fold geometry, ported algorithm or native-shell code. Relevant Fold engine/WASM tests and the production WASM build cover the changed boundary.

## Next work

Resolve **F032**, the Witch Hat source-11 construction and source-14 pocket,
before declaring another engine feature necessary. F031 (linked Collapse) is
resolved locally. F006 (show authored source-step notes in Fold) remains a
separate audit-UI limitation.

## Reproducing the authoring evidence

From the worktree root, `node research/origami-me-flat-catalog/witch-linked-collapse.mjs` regenerates scratch evidence and fresh-replays the verified prefix. `--publish` also saves it, only if the current model still matches its last recorded hash. The original checkpoint is hash-guarded.

`witch-tuck-probe.mjs`, `witch-order-probe.mjs` and `witch-layer-probe.mjs` in the same directory reproduce the unverified later attempts. They write only under ignored `artifacts/linked-cp-collapse/` and never replace a campaign model. The tracked investigation JSON retains the exact operations, refusals and successful-but-wrong-layer probes.
