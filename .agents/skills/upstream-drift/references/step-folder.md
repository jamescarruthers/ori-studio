# Step-Folder (DEFOX)

Kei Morisue's DEFOX / Step-Folder: an origami diagramming app whose saved
`.defox` projects the Diagram importer reads.

| | |
| --- | --- |
| Repo | `https://github.com/kei-morisue/step-folder` |
| Branch | `main` |
| Our code | none ported — `apps/web/src/diagram/import/defoxRenderer.js` runs the vendored modules unchanged in a worker |
| Vendored at | `third_party/step-folder/` |
| Manifest key | `step-folder` |
| Oracle | `apps/web/src/diagram/import/defoxOracle.test.js` (see `tools/step-folder-oracle/README.md`) |

## Watch paths

```
src/defox/
src/distortionfolder/
src/flatfolder/
src/linefolder/
resources/defs.xml
```

These are the whole import closure of what the adapter loads (`page.js`,
`draw.js`, `symbol.js`, `project.js`, `y.js`, `distortion.js`) plus the symbol
definitions it inlines. The GUI apps beside them (`src/axanael/`,
`src/cyborg/`, `src/gekko/`, `index.html`, the CSS) are never run here; a
commit touching only those is `SKIP`.

## Port map

Nothing is ported. A change reaches Ori Studio by re-vendoring the pinned
commit and re-running the oracle; the vendored copy is never edited. The
adapter is the only code to re-read on a change, for the boundary it adapts:

| Upstream | Ours |
| --- | --- |
| `src/defox/` drawing, symbols, saved-state shape | `defoxRenderer.js` (inert SVG DOM, validation, colour tables) |
| `src/flatfolder/io.js`, `src/defox/io.js`, `src/defox/y.js` CP conversion | `defoxRenderer.js` (the CP text appended to Edit) |
| `src/distortionfolder/` | `defoxRenderer.js` (distortion parameters) |

## Highest risk for this upstream: the CP mountain/valley convention

DEFOX labels a standard `.cp`'s mountains `V` internally when it reads one
(`IO3.EL_L_2_EA` swaps after `IO.CP_2_L`), draws internal `V` red, and writes
`V` back as code 2 (`Y.segs_EA_2_CP`), so its CP export already uses standard
codes and the adapter passes it through. An upstream change to any of those
three without the others silently inverts or keeps every crease the importer
appends to Edit. Treat any change to them as `PORT`, and run the oracle's
"keeps a standard CP's mountain and valley codes" case after re-vendoring.

## Also `PORT`

- The saved-state schema (fields of a step, `fold`/`fold_cp`, `lin`, `cell`,
  `params`, `symbols`): the adapter validates it before running anything.
- Any DOM call the drawing code starts making: the inert DOM implements only
  what the reachable paths call, and an unknown element throws.
- Tolerance and epsilon changes in `src/flatfolder/math.js` or the solvers, as
  everywhere.
