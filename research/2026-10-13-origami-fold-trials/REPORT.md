# Fold workspace: five Origami.me trials

2026-10-13. Research and flat-completion implementation in the copied Fold workspace branch.

## Implementation update — flat scope

Merged source worktree commit `aa736f95d` before implementation. Delivery is local
only, as requested: no remote push or pull request. The owner then
limited the work to flat/2D folds: box walls, opened crane wings and all spatial
state/UI work are deferred.

The swan now uses the existing Outside reverse engine for both neck and head.
The corrected neck crease and central-spine opening produce the outward wrap;
the old inside-neck prototype is preserved in the root research files. The
shared tool is now named **Reverse fold**, offers Automatic/Inside/Outside
intent before picking, and refuses an impossible explicit choice instead of
silently switching kinds. Its opening chooser indexes combinations lazily,
removing the old 16-combination cap and showing engine truncation.

The heart is complete. Squash and plain-fold attempts did not preserve both
side triangles. Tuck now accepts additional stationary target witnesses: its
bounded closure must leave all of them stationary, the reflected block must
land on every target, and all strict placement constraints pass the usual
completion/admission gate. In Fold, use the additional target switches below
**Tuck under**; every selected target is highlighted. The heart lowers the
central flap beneath both side triangles, then folds its sides, four corners
and top points before turning over. The two targets retain their original
uncut faces and positions at the tuck.

The original bird swivel probes still return `swivel_fold_wide` or
`fan_ray_blocked` on the merged source. They are preserved in regression tests;
they do not demonstrate a missing primitive required for the flat endpoints.
The crane uses its existing reverse-fold route. No swivel guard was relaxed.

All five current files are under **models/**. The generator reproduces the
corrected swan and heart from historical prefixes, updates the combined native
project, and verifies every node. Tests and witness expectations are documented
in [the acceptance corpus](../../tests/fixtures/fold-design-completion/README.md).

Completed workspace captures: [heart](heart-completed-workspace.jpg) and
[swan](swan-completed-workspace.jpg).

The trial ledger below preserves the original experiments. Current results and
validation are reported separately so the earlier limitations are not mistaken
for the state of this implementation.

## Results and files

Cicada, swan and heart are complete flat models. Crane is complete in its flat pose, and the box contains its full flat preparation. These are editable native sequences, not authored diagrams.

**Original review correction (resolved for flat scope):** the user identified the wrong inside-reverse swan neck. Engine acceptance and native replay alone did not establish reference correctness. The current model corrects it; crane wing opening is deferred by the owner. The detailed plan is [Complete the five origami trials](../../implementation-plans/fold-five-designs-to-completion.md).

**For the Fold workspace, use File → Open and choose an individual `.osf` below. It opens directly in Fold with its editable step history.** The native projects contain fold operations and their choices, with no Edit crease-pattern document.

The `.fold` files are interchange exports: opening them produces an Edit crease pattern plus separate folded figures, as seen in the screenshot reported after the first handoff. They have been moved out of `models/` into `interchange-exports/` to prevent that confusion. They are not the native authoring sequences. Counts below exclude rotations and turnovers; the `.osf` files retain those too.

| Design / tutorial | Native sequence | Fold steps | Result |
| --- | --- | ---: | --- |
| [Cicada](https://origami.me/cicada/) | [cicada.osf](models/cicada.osf) | 10 | Complete flat model; all seven tutorial stages represented. |
| [Swan](https://origami.me/swan/) | [swan.osf](models/swan.osf) | 8 | Complete flat model with outside-reverse neck and head. |
| [Heart](https://origami.me/heart/) | [heart.osf](models/heart.osf) | 15 | Complete heart, including both pockets, side/corner folds and final turnover. |
| [Masu box](https://origami.me/box/) | [box.osf](models/box.osf) | 12 | Flat preparation through tutorial step 6. Upright walls need a nonflat state. |
| [Crane](https://origami.me/crane/) | [crane.osf](models/crane.osf) | 19 | Complete flat alternative with head and both wings folded down. Final three-dimensional opening excluded. |

[Combined native project](models/origami-trials.osf) contains all five sequences. Individual files are the simplest entry points: I did not find a sequence selector in the Fold surface I inspected. [Replay validation](validation.json) records every final-path state's canonical hash.

## Setup and scope

- Initial source worktree: `/Users/zacharymarion/Documents/code/tree-maker-rust/.claude/worktrees/fold-workspace-research-c52ced`, clean at `ad3b1265b1cb37d7d7bb708a04a7d76463b0c89d`.
- During the experiment the source advanced to `36e5adda7` with additional swivel-picking UI changes. The original trials stayed at `ad3b1265b`. The implementation subsequently merged `aa736f95d` and evaluated its changes; the source checkout remains clean and unchanged.
- New worktree: `/Users/zacharymarion/.codex/worktrees/fold-origami-trials/tree-maker-rust`, branch `codex/fold-origami-trials`.
- Bootstrapped with `scripts/setup-worktree.sh`. Copied the requested source's generated artifacts, installed this branch's dependencies, rebuilt the simulator and Fold WASM.
- Local server: `DEV_SERVER_PORT=5327 scripts/dev-server.sh start`.
- Selection came from [Origami.me's easy models](https://origami.me/easy-origami/). Tutorial stage numbers are recorded in native step notes. Adjustable angles and proportions are my approximations, so these are recreations rather than exact geometric transcriptions. Paper colors differ from the tutorials.

During the original trials, one initial diagonal fold was authored directly in the canvas with Axiom 2 and Enter. The multi-step models were then constructed with the then-current public Fold WASM API, saved as ordinary operation/choice sequences, and reopened in the workspace. This tests what the engine can express and the UI can replay; it is not an end-to-end mouse usability test of every tool. No fabricated final geometry or imported final state substitutes for the steps.

The embedded browser's native File System Access picker did not yield an automatable chooser. `viewer.html` is a development-only fixture loader using the ordinary `openProject` reader and app entry point. It can open `?model=cicada`, `swan`, `heart`, `box`, or `crane`; it does not change product source. After the handoff correction it follows `currentWorkspacePath()` from the loader's actual decision and fails if the native file does not land in Fold; it no longer forces `/fold`. The crane's square/petal-base construction also reuses operation inputs from the repository's existing petal-fold example, replayed from a blank sheet.

## Original trial ledger (historical)

### Cicada — completed

Plain valleys, one-layer wing folds, successive head-band folds, and mountain folds behind the sides all landed. Single-layer selection matters at the wings and first head fold. The final sequence has 11 nodes, including its initial rotation, and 44 faces. The small offsets and wing slopes are adjustable styling choices.

Native reopening, history selection, final rendering, and playback were checked. [Workspace capture](cicada-workspace.png).

### Swan — alternate prototype; intended neck remains incomplete

The tutorial-order attempt reached the double kite, folded-up neck, head tip, and body half-fold. Trying to raise the neck with the folded-edge swivel produced `swivel_fold_wide` on one hinge choice and `fan_ray_blocked` on another. Open/inside and valley/mountain variants were tested; exact inputs and responses are in [compound-probes.json](compound-probes.json).

A workable alternative starts from the double kite, folds the body in half, then inside-reverses the long point. The head's inside reverse returned `reverse_kind_infeasible` with an `other_kind: outside` suggestion. Applying that suggestion succeeded. The saved model has 11 nodes and 24 faces; its neck leans and its proportions differ from the reference. The original attempt remains in `swan.osf` at this report's root, and the alternate prototype has now been replaced by the corrected outside-reverse construction in **models/swan.osf**.

The UI reopened the alternate sequence and played its head fold to completion. [Workspace capture](swan-workspace.png).

### Heart — unresolved pocket operation

The center precreases, bottom strip, lower diagonals, turnovers, and upper diagonals landed, reaching tutorial step 7. A one-layer valley lowering the upper point was accepted by the engine but did not reproduce the reference's pocket release and subsequent shape. Acceptance alone is insufficient: that probe is omitted from the delivered path.

The original delivered sequence ended before that probe: 9 nodes and 16 faces. The current **models/heart.osf** now completes the heart (18 nodes). The longer `heart.sequence.json`, `heart.log.json`, and root `heart.osf` retain the accepted-but-wrong operation for investigation. This does **not** establish that the heart is impossible or that squash support is missing; squash is implemented and worked for the crane. I did not find the correct pocket decomposition during this trial. [Workspace capture](heart-workspace.png).

### Masu box — flat preparation completed

Center creases, four-corner blintz, opposing edge precreases, unfolding two blintz flaps, and the other wall precreases landed: 13 nodes and 32 faces. Unfolding needed the valley direction for these selected flaps; an earlier mountain-direction attempt returned `nothing_stays`.

The next tutorial stage raises walls out of the plane. The current engine represents flat folded states, and `FoldPlainOp` has no fold-angle field. A 90-degree wall pose therefore cannot be saved as an authored Fold state in this version. Playback through intermediate angles does not supply such a persistent pose. No false flat substitute for the finished box was added. See the [engine contract](../../crates/oristudio-fold/README.md) and [operation types](../../apps/web/src/fold/document/foldSequenceDocument.ts). [Workspace capture](box-workspace.png).

### Crane — completed flat alternative

A sequential square base using two squash folds replaces the tutorial's simultaneous collapse. Petal folds produce the bird base, then the four narrowing folds land. The tutorial-order book folds and point raises also landed through step 23, but the attempted outward tail swivel returned `fan_ray_blocked` in all four open/inside and valley/mountain combinations tested.

Starting instead from the narrowed bird base, inside reverses raise the neck and tail. The engine offered several openings; selecting the central spine opening made both succeed. Another inside reverse forms the head, followed by two flat wing folds. The saved alternative has 24 nodes and 80 faces. It represents the flat crane; opening the wings into the final pose has the same nonflat-state limitation as the box. The tutorial does not explicitly require separate body inflation; only body articulation needed for the wing opening is part of the completion target.

The root `crane.osf` retains the tutorial-order attempt. **models/crane.osf is the completed flat alternative.** [Workspace capture](crane-workspace.png).

## Functionality findings

| Capability | Evidence from these trials |
| --- | --- |
| Point-to-point and free-line folds | Worked throughout; stored axiom roots replayed deterministically. |
| Precrease and unfold | Worked for heart, box, swan, and crane preparation. Unfold direction requires care. |
| Selected layers | Useful for cicada wings/head and crane narrowing/wings. A depth seed is a starting selection; adjacency closure can bring more paper along. |
| Squash and petal folds | Both worked in the crane's base. |
| Reverse folds and opening choices | Worked for crane neck/tail/head and corrected outside-reverse swan neck/head. Multiple possible openings require an explicit choice. |
| Actionable refusal suggestions | The swan head's suggested outside reverse led directly to a successful fold. |
| Swivel on a folded edge | Present, but the tutorial-state constructions tested here hit geometric restrictions. These are reproducible refusals, not proof of a general tool failure. |
| Native replay and FOLD export | All five final paths reopened and reproduced the same canonical states; each export contains all states. |
| Persistent nonflat poses | Deferred by owner: box walls and opened crane wings. |
| Pocket-opening workflow | Resolved by the additional-target tuck; both side triangles stay uncreased. |

The swivel source explicitly documents its acute-angle and unobstructed-ray constraints in [swivel_on_edge.rs](../../crates/oristudio-fold/src/compound/swivel_on_edge.rs). The refusal codes should be investigated against the intended operation geometry before calling them bugs or relaxing validation.

Usability observations are narrower than engine coverage: the welcome page did not offer a direct Fold entry point; locating buried edge/hinge anchors in stacked paper was ambiguous; the inspector distinguished the chosen seed from the actual deepest stack; disabling layer spread helped compare silhouettes. These were observations from the original trial. The implementation update above records the subsequent product fixes.

## Implementation validation

- Synced source `aa736f95d` through merge `a0aa00a54`; source checkout remains clean.
- `cargo fmt --all --check`, workspace Clippy with warnings denied, and
  `cargo test --workspace` pass. The initial heavily concurrent run hit two
  unchanged CP compiler recovery tests; isolation and the subsequent full
  workspace run pass. No unrelated compiler changes were made.
- Rebuilt the Fold bridge and passed `wasm-pack test --node crates/oristudio-fold-wasm`.
  The native completion suite checks all five files, the heart's stationary
  material and target invariance, the corrected swan, and all 12 swivel refusals.
- Web lint and typecheck pass (one existing StepFilmstrip React Compiler warning).
  All 149 Fold test files pass: 1,115 tests. The actual heart target-picker flow
  and both swan reverse builders match their API-authored states; a separate
  analytics check verifies bucket-only target counts.
- Full web suite passes: **1,094 test files / 13,593 tests**, with 2 files /
  15 tests skipped by their existing availability gates. Node 26 requires
  `NODE_OPTIONS=--no-experimental-webstorage` for this suite's localStorage mocks;
  the confirmed run used four workers to avoid concurrent-load timeouts.
  The production bundle and landing prerender also pass.
- All five files were opened by the normal browser project reader and landed in
  Fold with 10, 8, 15, 12 and 19 fold steps. The cicada's two sides were visually
  inspected and a turnover appended from its final state. Native desktop heart
  open, Save As and reopen were exercised; all 18 nodes, target witnesses and
  choices survived unchanged. A subsequent native chooser automation issue
  prevented repeating that UI smoke test for the other four files; their shared
  reader/replay and browser opens are covered.
- Native unknown/malformed constraint tests preserve and lock unsupported steps;
  legacy single-target tucks retain their existing semantics.
- No ported TreeMaker/CP/BP/Flat-Folder algorithm changed. Their separate C++/Java
  oracle builds were not rerun. No desktop-shell source changed; the desktop
  debug build and native dialog smoke test cover the affected runtime path.
- No generated WASM artifacts are tracked. No spatial model/schema/UI was added.

## Replay and reproduction

- Rebuilt `oristudio-fold-wasm` before running these trials.
- All **77 native nodes / 64 fold operations** in the delivered paths replayed in fresh engines. Canonical hashes matched at every node; **82 FOLD frames**, including five blank sheets, were exported.
- Reopened all five delivered `.osf` files using the normal project loader and its own landing decision: each selected `/fold` automatically and showed its saved history (original counts: 10, 8, 7, 12, and 19; heart now has 15). No forced workspace selection was used in this follow-up check. Checked final folded silhouettes and history. Playback was exercised for the cicada and swan head.
- Original handoff focused tests: `foldSequenceFile.test.ts`, `foldSequence.wasm.test.ts`, and `foldEngineIo.wasm.test.ts`: **42 passed**.
- The original research-only handoff ran `git diff --check` and reader/replay/export checks. Product implementation validation is listed above.

Run from the new worktree root, with its generated Fold WASM available:

```sh
node research/2026-10-13-origami-fold-trials/run-trials.mjs
node research/2026-10-13-origami-fold-trials/probe-compound.mjs
node research/2026-10-13-origami-fold-trials/probe-reverse.mjs
node research/2026-10-13-origami-fold-trials/swan-alternative.mjs
node research/2026-10-13-origami-fold-trials/build-deliverables.mjs
```

The first four scripts preserve experiments and logs in this directory. Their root `origami-trials.osf` is a transient probe bundle. The final script writes native Fold projects under **models/** and FOLD exports under **interchange-exports/**, then verifies native-file replay plus FOLD frame counts. `validation.json` is the machine-readable result.

## Deferred investigations (original plan, now limited to 2D)

The detailed phase order, acceptance cases, state/operation changes, and tests are now in [the completion plan](../../implementation-plans/fold-five-designs-to-completion.md).

1. **Completed:** correct the swan neck to the intended outward construction; Outside reverse already exists, so determine whether preparation, opening selection, or engine coverage must change.
2. **Completed with multiple-target tuck:** work out the heart pocket-opening decomposition with explicit flap/opening selections; preserve the accepted-but-wrong valley as a negative shape example.
3. **Refusals retained; no required extension demonstrated:** reduce the crane and swan swivel cases to small regression fixtures and decide whether the intended paper motion fits the current primitive or needs a different compound operation.
4. **Deferred by owner:** add nonflat authored states as required by the completion plan: box-wall raising and opened crane wings are concrete acceptance cases; a visual playback frame alone will not satisfy them.
5. Run a separate mouse-only study of hidden-edge selection and opening choices. This experiment establishes representability much more strongly than authoring ergonomics.
