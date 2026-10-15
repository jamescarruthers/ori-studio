# Crow completed; Bird advanced through both wings

2026-10-14. Local authoring only. No engine/UI changes, PR, push, or schedule.

| Model | Source progress | Fold position | Native file |
| --- | --- | --- | --- |
| [Crow tutorial](https://origami.me/crow/) | Complete through 17 | 28, followed by presentation rotation; 34 nodes | [Crow](../../2026-10-13-origami-fold-trials/models/completed/crow.osf) |
| [Bird tutorial](https://origami.me/bird/) | Verified through 13 | 24, followed by turn over; 32 nodes | [Bird](../../2026-10-13-origami-fold-trials/models/in-progress/bird.osf) |

Crow is **ready for audit**, not user-approved. Bird remains unfinished. Both original 24-node bird bases are preserved as `models/archive/checkpoints/{bird,crow}-before-shaping.osf`. The other 57 native files were hash checked and unchanged, including Heart and Cicada.

## Crow

The two feet use the central original-sheet spine opening. The outer kite-edge openings are different operations and refuse the requested inside reversal. Choosing the central opening explicitly resolves the earlier choice request; it was not missing reverse-fold functionality. Each foot stays inside its own pocket, and the body and other foot remain in place. The head also uses its central opening.

The horizontal foot tops match the reference. The free head crease passes through view `(0, 0.80)` with slope `-0.75`; its proportion is an authoring choice permitted by the tutorial. The final 22.5-degree rotation matches the completed illustration's orientation. The source's numbered step 15 is visible in its diagram/video even though its prose heading is absent. The optional perch is not part of the saved model.

All new states were checked on the normal Fold canvas, including the reverse side and intermediate precreases. Final evidence: [Crow in Fold](../../../artifacts/bird-crow-investigation/crow-complete-fold.png).

## Bird

The paired book folds and wing lifts match the source through 13, including the triangular endpoint with inner flaps between the front and back wings. All eight added nodes were checked in Fold. [Saved endpoint](../../../artifacts/bird-crow-investigation/bird-source13-fold.png).

Source 14's outward pull still requires a correct flat construction. The tutorial videos for 14 and 15 were reviewed. Candidate swivels using the outer folded edge, central folded edge, and root triangle did not establish that construction; requests returned `swivel_fold_wide`, `swivel_not_an_edge`, or `swivel_not_a_fold`. Unfolding a buried flap along the base can also carry surrounding connected flaps. These are **unverified authoring probes**, not proof of a missing engine primitive, and none is appended to the native file. Exact requests/results: [outer edge](bird-source14-bird-swivel-probes.json), [root](bird-source14-bird-swivel-root-probes.json), [center](bird-source14-bird-center-probes.json), [unfold controls](bird-source14-bird-unfold-probes.json). F033 tracks the unresolved material correspondence.

## Verification

- **68 states** across both native sequences freshly replay with identical canonical fingerprints.
- Crow: **49 full stack witnesses** prove precreases preserve geometry, paper side, depth, and hidden order.
- Its three reverses check **96 original-sheet material witnesses**, including stationary covered material, plus **48 pocket-order witnesses**. The left/right foot tips land at the specified symmetric endpoints. Visible fronts remain colored.
- Saved operation choices, source notes, and original project metadata are retained. Generators refuse to overwrite changed native files.
- [Machine-readable results](bird-crow-shaping-2026-10-14.json), [reproduction script](../bird-crow-shaping.mjs).

Run `node research/origami-me-flat-catalog/bird-crow-shaping.mjs` for read-only native replay and artifact generation. `--publish` is guarded and only writes the two authoring deliverables. Full application suites were not rerun because this changes only research scripts, models, and records; real WASM replay and Fold browser checks validate that surface.

The running five-completion batch now has **three** completed designs: Penguin, Whale, and Crow. Bird does not count. Continue Dove's unresolved source-6 packet selection, then the remaining Easy queue; required cuts, multiple sheets, and non-flat completion remain excluded.
