# Delete Extra Vertices on auxiliary lines

## Goal

Delete Extra Vertices should also remove the extra vertices on auxiliary
(cyan) lines. Today an aux line left in pieces, for example a diagonal split at
three points where nothing else meets it, survives the command unchanged.

## Approach

Upstream (`FoldLineSet.del_V_all` / `del_V_all_cc`) cannot do this: its
`PointLineMap` skips `CYAN_3`, so no cyan pair is ever offered for a merge. Our
port reproduces that exactly, so the change is a stated divergence, not a fix.

- Keep upstream's walk as the first pass, untouched, so parity holds for every
  non-cyan line and the oracle cases still apply.
- Add a second pass over what the first leaves, only when the document has a
  cyan line. It indexes every line, and merges a degree-2 vertex only when both
  lines are cyan and collinear. Counting every line makes it the rule Delete
  Vertex already applies at one point: a crease ending on an aux line keeps the
  aux line split there.
- Apply it to both variants, so Ignore Type is never weaker than the plain
  command.
- The scoped sweep (`del_v_among_lines`) runs the same two passes. Its only
  callers, the solve and import cleanups, already keep cyan lines out of the
  set (`cpGraphCleanup.ts`), so their behaviour does not change.

## Affected Areas

- `crates/oristudio-cp/src/operations/arrangement.rs`: the sweep split into
  `SweepPass::Creases` and `SweepPass::Auxiliary`; `vertex_index` takes a
  predicate; the scope mask is compacted between passes.
- `crates/oristudio-cp/tests/operations.rs`: tests for the new pass.
- `PORTING.md`: the divergence.
- `apps/web/src/lib/cpGraphCleanup.ts`,
  `apps/web/src/store/workspaceStore/oristudioCpRuntime.ts`: comments that
  described the old behaviour.

## Checklist

- [x] Two-pass sweep in the kernel
- [x] Tests: aux chain, Ignore Type, crease ending on aux, aux corner, aux
      beside a crease, crease crossing aux, scope across passes
- [x] New tests fail on the old kernel
- [x] PORTING.md divergence entry
- [x] cargo fmt / clippy / `cargo test -p oristudio-cp`, and the `del_v`
      cases of the Oriedita operations oracle
- [x] CP wasm rebuilt; checked in the browser with the reported file
- [x] Draft PR
