/**
 * The Layer order dialog's two boundaries
 * (`implementation-plans/layer-order-dialog.md`, approach 5 and "Risks").
 *
 * 1. **The dialog knows no host.** Edit's figures, an Edit selection, a
 *    Diagram step and Pose each hand it a `LayerOrderRequest` and take back a
 *    `LayerOrderApplied` (`lib/layerOrder/`); it reads no store and no host's
 *    document. A module under `layer-order/` that imports Edit's workspace
 *    store, the Diagram or the Fold workspace makes the dialog depend on how
 *    one host keeps its state, and a change there breaks every other host.
 * 2. **The Fold engine never loads with the page.** Its wasm (about 1 MB
 *    gzipped) is fetched only when a worker that needs it starts, so it is
 *    imported only inside `workers/`. A module anywhere else that imports the
 *    glue, even for a type, pulls it into a chunk the page loads.
 *
 * Tests and fixtures may reach anything: they never ship.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest's root is `apps/web`, as the stylesheet ratchet reads it.
const SRC = resolve(process.cwd(), 'src');

const posix = (path: string) => path.split(sep).join('/');

/** Shipped sources under `dir`: no tests, no fixtures. */
function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' || name === 'test' ? [] : sourcesUnder(path);
    return /\.tsx?$/.test(name) && !/\.(test|fixtures)\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Every relative module `text` (the source of `file`) names, resolved under
 * `src/`: static imports and exports (types included), side-effect and
 * dynamic imports, and `new URL(…)` assets.
 */
function targetsIn(text: string, file: string): string[] {
  const specifiers = [
    ...text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bnew\s+URL\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g),
  ].map((match) => match[1]!);
  return specifiers.map((specifier) => posix(relative(SRC, resolve(dirname(file), specifier))));
}

function importsOf(file: string): string[] {
  return targetsIn(readFileSync(file, 'utf8'), file);
}

/** The hosts' own state and documents: what the dialog never reaches into. */
const HOSTS: readonly RegExp[] = [
  // Edit's workspace store, which also holds the Fold workspace's slices.
  /^store\/workspaceStore(\/|$)/,
  /^store\/diagram\w*$/,
  /^store\/selectionUiStore$/,
  /^components\/panels\//,
  /^diagram\//,
  /^components\/diagram\//,
  /^fold\//,
  /^components\/fold\//,
  /^workspaces\//,
];

const FOLD_WASM = /^generated\/oristudio-fold-wasm(\/|$)/;

describe('the Layer order dialog’s boundaries', () => {
  it('finds the sources to check', () => {
    expect(sourcesUnder(resolve(SRC, 'layer-order')).length).toBeGreaterThan(2);
    expect(sourcesUnder(SRC).length).toBeGreaterThan(500);
  });

  it('nothing under layer-order/ imports a host', () => {
    const reaches = sourcesUnder(resolve(SRC, 'layer-order')).flatMap((file) =>
      importsOf(file)
        .filter((target) => HOSTS.some((host) => host.test(target)))
        .map((target) => `${posix(relative(SRC, file))} → ${target}`)
    );
    expect(reaches).toEqual([]);
  });

  it('no shipped module outside workers/ imports the Fold wasm glue', () => {
    const reaches = sourcesUnder(SRC)
      .filter((file) => !posix(relative(SRC, file)).startsWith('workers/'))
      .flatMap((file) =>
        importsOf(file)
          .filter((target) => FOLD_WASM.test(target))
          .map((target) => `${posix(relative(SRC, file))} → ${target}`)
      );
    expect(reaches).toEqual([]);
  });

  it('sees every shape of import it must catch', () => {
    const file = resolve(SRC, 'layer-order/engine/example.ts');
    expect(
      targetsIn(
        `
        import type { FoldEngine } from '../../generated/oristudio-fold-wasm/oristudio_fold_wasm';
        const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
        import '../../store/workspaceStore';
        export { x } from '../../diagram/document/diagramDocument';
        new URL('../../generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm', import.meta.url);
        `,
        file
      )
    ).toEqual([
      'generated/oristudio-fold-wasm/oristudio_fold_wasm',
      'generated/oristudio-fold-wasm/oristudio_fold_wasm',
      'store/workspaceStore',
      'diagram/document/diagramDocument',
      'generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm',
    ]);
  });
});
