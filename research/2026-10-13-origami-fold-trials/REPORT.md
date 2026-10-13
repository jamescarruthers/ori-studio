# Fold workspace: five Origami.me trials

2026-10-13. Research against the copied Fold workspace branch; no product code changes.

## Results and files

The cicada is complete as a flat model. The swan and crane are saved as recognizable flat prototypes using alternate routes; the heart and masu box are saved at verified stopping points. These are editable native sequences, not authored diagrams.

**Review correction (2026-10-13):** the user identified that the swan needs an outward neck construction; the current inside-reverse neck does not meet that target. Engine acceptance and native replay did not establish reference correctness. The crane also still needs its wings opened. The detailed follow-up is [Complete the five origami trials](../../implementation-plans/fold-five-designs-to-completion.md).

**For the Fold workspace, use File → Open and choose an individual `.osf` below. It opens directly in Fold with its editable step history.** The native projects contain fold operations and their choices, with no Edit crease-pattern document.

The `.fold` files are interchange exports: opening them produces an Edit crease pattern plus separate folded figures, as seen in the screenshot reported after the first handoff. They have been moved out of `models/` into `interchange-exports/` to prevent that confusion. They are not the native authoring sequences. Counts below exclude rotations and turnovers; the `.osf` files retain those too.

| Design / tutorial | Native sequence | Fold steps | Result |
| --- | --- | ---: | --- |
| [Cicada](https://origami.me/cicada/) | [cicada.osf](models/cicada.osf) | 10 | Complete flat model; all seven tutorial stages represented. |
| [Swan](https://origami.me/swan/) | [swan.osf](models/swan.osf) | 8 | Alternate prototype; inside-reverse neck differs from the requested outward construction. Outside-reverse head is implemented. |
| [Heart](https://origami.me/heart/) | [heart.osf](models/heart.osf) | 7 | Partial, through tutorial step 7. Pocket opening remains unresolved. |
| [Masu box](https://origami.me/box/) | [box.osf](models/box.osf) | 12 | Flat preparation through tutorial step 6. Upright walls need a nonflat state. |
| [Crane](https://origami.me/crane/) | [crane.osf](models/crane.osf) | 19 | Complete flat alternative with head and both wings folded down. Final three-dimensional opening excluded. |

[Combined native project](models/origami-trials.osf) contains all five sequences. Individual files are the simplest entry points: I did not find a sequence selector in the Fold surface I inspected. [Replay validation](validation.json) records every final-path state's canonical hash.

## Setup and scope

- Source worktree: `/Users/zacharymarion/Documents/code/tree-maker-rust/.claude/worktrees/fold-workspace-research-c52ced`, clean at `ad3b1265b1cb37d7d7bb708a04a7d76463b0c89d`.
- During the experiment the source advanced to `36e5adda7` with additional swivel-picking UI changes. This copy deliberately remains based on the initial `ad3b1265b` snapshot; those later UI changes were not evaluated.
- New worktree: `/Users/zacharymarion/.codex/worktrees/fold-origami-trials/tree-maker-rust`, branch `codex/fold-origami-trials`.
- Bootstrapped with `scripts/setup-worktree.sh`. Copied the requested source's generated artifacts, installed this branch's dependencies, rebuilt the simulator and Fold WASM.
- Local server: `DEV_SERVER_PORT=5327 scripts/dev-server.sh start`.
- Selection came from [Origami.me's easy models](https://origami.me/easy-origami/). Tutorial stage numbers are recorded in native step notes. Adjustable angles and proportions are my approximations, so these are recreations rather than exact geometric transcriptions. Paper colors differ from the tutorials.

One initial diagonal fold was authored directly in the canvas with Axiom 2 and Enter. The multi-step models were then constructed with the unchanged public Fold WASM API, saved as ordinary operation/choice sequences, and reopened in the workspace. This tests what the engine can express and the UI can replay; it is not an end-to-end mouse usability test of every tool. No fabricated final geometry or imported final state substitutes for the steps.

The embedded browser's native File System Access picker did not yield an automatable chooser. `viewer.html` is a development-only fixture loader using the ordinary `openProject` reader and app entry point. It can open `?model=cicada`, `swan`, `heart`, `box`, or `crane`; it does not change product source. After the handoff correction it follows `currentWorkspacePath()` from the loader's actual decision and fails if the native file does not land in Fold; it no longer forces `/fold`. The crane's square/petal-base construction also reuses operation inputs from the repository's existing petal-fold example, replayed from a blank sheet.

## Trial ledger

### Cicada — completed

Plain valleys, one-layer wing folds, successive head-band folds, and mountain folds behind the sides all landed. Single-layer selection matters at the wings and first head fold. The final sequence has 11 nodes, including its initial rotation, and 44 faces. The small offsets and wing slopes are adjustable styling choices.

Native reopening, history selection, final rendering, and playback were checked. [Workspace capture](cicada-workspace.png).

### Swan — alternate prototype; intended neck remains incomplete

The tutorial-order attempt reached the double kite, folded-up neck, head tip, and body half-fold. Trying to raise the neck with the folded-edge swivel produced `swivel_fold_wide` on one hinge choice and `fan_ray_blocked` on another. Open/inside and valley/mountain variants were tested; exact inputs and responses are in [compound-probes.json](compound-probes.json).

A workable alternative starts from the double kite, folds the body in half, then inside-reverses the long point. The head's inside reverse returned `reverse_kind_infeasible` with an `other_kind: outside` suggestion. Applying that suggestion succeeded. The saved model has 11 nodes and 24 faces; its neck leans and its proportions differ from the reference. The original attempt remains in `swan.osf` at this report's root, while **models/swan.osf is the alternate prototype**.

The UI reopened the alternate sequence and played its head fold to completion. [Workspace capture](swan-workspace.png).

### Heart — unresolved pocket operation

The center precreases, bottom strip, lower diagonals, turnovers, and upper diagonals landed, reaching tutorial step 7. A one-layer valley lowering the upper point was accepted by the engine but did not reproduce the reference's pocket release and subsequent shape. Acceptance alone is insufficient: that probe is omitted from the delivered path.

The delivered sequence ends before that probe: 9 nodes and 16 faces. The longer `heart.sequence.json`, `heart.log.json`, and root `heart.osf` retain the accepted-but-wrong operation for investigation. This does **not** establish that the heart is impossible or that squash support is missing; squash is implemented and worked for the crane. I did not find the correct pocket decomposition during this trial. [Workspace capture](heart-workspace.png).

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
| Reverse folds and opening choices | Worked for crane neck/tail/head and alternate swan neck/head. Multiple possible openings require an explicit choice. |
| Actionable refusal suggestions | The swan head's suggested outside reverse led directly to a successful fold. |
| Swivel on a folded edge | Present, but the tutorial-state constructions tested here hit geometric restrictions. These are reproducible refusals, not proof of a general tool failure. |
| Native replay and FOLD export | All five final paths reopened and reproduced the same canonical states; each export contains all states. |
| Persistent nonflat poses | Missing for these tasks: box walls and opened/inflated crane body. |
| Pocket-opening workflow | Heart remains unresolved; needs a targeted squash/opening investigation. |

The swivel source explicitly documents its acute-angle and unobstructed-ray constraints in [swivel_on_edge.rs](../../crates/oristudio-fold/src/compound/swivel_on_edge.rs). The refusal codes should be investigated against the intended operation geometry before calling them bugs or relaxing validation.

Usability observations are narrower than engine coverage: the welcome page did not offer a direct Fold entry point; locating buried edge/hinge anchors in stacked paper was ambiguous; the inspector distinguished the chosen seed from the actual deepest stack; disabling layer spread helped compare silhouettes. No product fixes were made.

## Validation and reproduction

- Rebuilt `oristudio-fold-wasm` before running these trials.
- All **68 native nodes / 56 fold operations** in the delivered paths replayed in fresh engines. Canonical hashes matched at every node; **73 FOLD frames**, including five blank sheets, were exported.
- Reopened all five delivered `.osf` files using the normal project loader and its own landing decision: each selected `/fold` automatically and showed its saved history (10, 8, 7, 12, and 19 folds respectively). No forced workspace selection was used in this follow-up check. Checked final folded silhouettes and history. Playback was exercised for the cicada and swan head.
- Existing focused tests: `foldSequenceFile.test.ts`, `foldSequence.wasm.test.ts`, and `foldEngineIo.wasm.test.ts`: **42 passed**.
- `git diff --check` run on research changes. Full lint/typecheck/Rust workspace tests were not run: no product code changed; validation targeted native document reading, engine replay, and export.

Run from the new worktree root, with its generated Fold WASM available:

```sh
node research/2026-10-13-origami-fold-trials/run-trials.mjs
node research/2026-10-13-origami-fold-trials/probe-compound.mjs
node research/2026-10-13-origami-fold-trials/probe-reverse.mjs
node research/2026-10-13-origami-fold-trials/swan-alternative.mjs
node research/2026-10-13-origami-fold-trials/build-deliverables.mjs
```

The first four scripts preserve experiments and logs in this directory. Their root `origami-trials.osf` is a transient probe bundle. The final script writes native Fold projects under **models/** and FOLD exports under **interchange-exports/**, then verifies native-file replay plus FOLD frame counts. `validation.json` is the machine-readable result.

## Next investigations

The detailed phase order, acceptance cases, state/operation changes, and tests are now in [the completion plan](../../implementation-plans/fold-five-designs-to-completion.md).

1. Correct the swan neck to the intended outward construction; Outside reverse already exists, so determine whether preparation, opening selection, or engine coverage must change.
2. Work out the heart pocket-opening decomposition with explicit flap/opening selections; preserve the accepted-but-wrong valley as a negative shape example.
3. Reduce the crane and swan swivel cases to small regression fixtures and decide whether the intended paper motion fits the current primitive or needs a different compound operation.
4. Add nonflat authored states as required by the completion plan: box-wall raising and opened crane wings are concrete acceptance cases; a visual playback frame alone will not satisfy them.
5. Run a separate mouse-only study of hidden-edge selection and opening choices. This experiment establishes representability much more strongly than authoring ergonomics.
