import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  OristudioCpDocumentSnapshot,
  OristudioCpDocumentSummary,
  OristudioCpFoldedFigureEntry,
  OristudioCpFoldedFigureResult,
  OristudioCpFoldedRenderSnapshot,
} from './oristudioCpTypes';
import {
  createNativeCreasePatternProjectFile,
  serializeNativeProjectFile,
} from '../lib/nativeProjectFile';
import {
  DEFAULT_ORISTUDIO_CP_VIEWPORT_OPTIONS,
  emptyOristudioCpSelection,
} from '../lib/creasePatternViewport';
import { importedCpLineage } from '../lib/oristudioCpLineage';

/**
 * The CP kernel's layer-order entry points (`implementation-plans/layer-order-dialog.md`,
 * row E2) through the built CP bridge, in Node.
 *
 * With no order given, an `.osf` holding a flat folded figure is the bytes it
 * was before the entry points existed: the file stores the kernel's snapshot
 * and picture verbatim, so this is the bridge half of the kernel's own bytes
 * gate (`crates/oristudio-cp/tests/fold_with_order.rs`), over the same file
 * fixtures. The recording, `tests/fixtures/oristudio-cp/flat-figure-osf.json`,
 * was written by the bridge built before the change.
 *
 * Skipped when the bridge has not been built; CI builds it first. Regenerate
 * only after an intentional change to what an unseeded fold answers:
 *
 * ```sh
 * ORISTUDIO_UPDATE_GOLDEN=1 npm --workspace @treemaker/web exec -- vitest run src/engine/oristudioCpFoldWithOrder.wasm.test.ts
 * ```
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
const wasmAvailable = existsSync(WASM);
type CpWasm = typeof import('../generated/oristudio-cp-wasm/oristudio_cp_wasm');

const FIXTURES = resolve(process.cwd(), '../../tests/fixtures');
const OSF_GOLDEN = resolve(FIXTURES, 'oristudio-cp/flat-figure-osf.json');

/** The kernel test's `FILE_FIXTURES`, in its order. */
const FILE_FIXTURES: [string, string][] = [
  ['solution_sample_1', 'oriedita/solution_sample_1.cp'],
  ['failing_global_flat_fold', 'oriedita/failing_global_flat_fold.ori'],
  ['holed_sheet_spiral', 'oriedita/holed_sheet_spiral.ori'],
  ['holed_frame_collinear', 'oriedita/holed_frame_collinear.ori'],
  ['kabuto', 'flat-folder/kabuto.fold'],
  ['bad_twist', 'flat-folder/bad_twist.fold'],
  ['r069-s07', 'flat-folder/r069-s07.fold'],
  ['r271-s03', 'flat-folder/r271-s03.fold'],
  ['pleat-in-eighths', 'fold-samples/pleat-in-eighths.fold'],
  ['preliminary-base', 'fold-samples/preliminary-base.fold'],
  ['waterbomb-base', 'fold-samples/waterbomb-base.fold'],
];

/** Open a fixture as the worker opens a file: a new document handle. */
function open(wasm: CpWasm, relative: string): number {
  const text = readFileSync(resolve(FIXTURES, relative), 'utf8');
  switch (extname(relative)) {
    case '.cp':
      return wasm.load_cp(text, '');
    case '.ori':
      return wasm.load_ori(text, false);
    case '.fold':
      return wasm.load_fold(text, '');
    default:
      throw new Error(`no loader for ${relative}`);
  }
}

/** Every line, as Edit's whole-sheet fold names them. */
function everyLine(wasm: CpWasm, document: number): number[] {
  const summary = wasm.document_summary(document) as OristudioCpDocumentSummary;
  return Array.from({ length: summary.line_segments }, (_, index) => index + 1);
}

/** Edit's figure entry for a fold, as the store keeps it before a save. */
function figureEntry(
  result: OristudioCpFoldedFigureResult,
  renderSnapshot: OristudioCpFoldedRenderSnapshot | null,
  lineIds: number[]
): OristudioCpFoldedFigureEntry {
  return {
    id: 'generated-1',
    title: 'Folded model 1',
    handle: result.handle,
    sourceKind: 'generated-from-current-cp',
    sourceCpRevision: 1,
    startingFaceId: 1,
    displayStyle: result.snapshot.display_style,
    status: 'ready',
    placement: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
    sourceBounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    sourceFingerprint: 'fingerprint',
    sourceLineIds: lineIds,
    sourceScopedLineIds: lineIds,
    snapshot: result.snapshot,
    renderSnapshot,
    error: null,
  };
}

/** The `.osf` Edit saves for the fixture folded whole, unseeded. */
function savedOsf(wasm: CpWasm, relative: string): string {
  const document = open(wasm, relative);
  const lineIds = everyLine(wasm, document);
  const result = wasm.folded_figure_fold_selected(
    document,
    lineIds,
    1,
    'Order5',
    null,
    0
  ) as OristudioCpFoldedFigureResult;
  const renderSnapshot = wasm.folded_figure_render_snapshot(
    result.handle,
    result.snapshot.display_style,
    null
  ) as OristudioCpFoldedRenderSnapshot | null;
  const file = createNativeCreasePatternProjectFile({
    title: 'Fixture',
    filename: 'fixture.cp',
    path: null,
    document: wasm.document_snapshot(document) as OristudioCpDocumentSnapshot,
    source: null,
    foldProjection: null,
    sourceFold: null,
    foldArtifacts: null,
    creaseColorMode: 'mvf',
    selection: emptyOristudioCpSelection(),
    viewport: DEFAULT_ORISTUDIO_CP_VIEWPORT_OPTIONS,
    foldedFigures: [figureEntry(result, renderSnapshot, lineIds)],
    activeFoldedFigureId: 'generated-1',
    lineage: importedCpLineage(),
    appVersion: '0.6.2',
    now: new Date('2026-10-23T12:00:00.000Z'),
  });
  wasm.free_folded_figure(result.handle);
  wasm.free_document(document);
  return serializeNativeProjectFile(file);
}

interface OsfBytes {
  fixture: string;
  outcome: string;
  bytes: number;
  sha256: string;
}

describe.skipIf(!wasmAvailable)('the CP bridge, with no order given', () => {
  let wasm: CpWasm;

  beforeAll(async () => {
    wasm = await import('../generated/oristudio-cp-wasm/oristudio_cp_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
  });

  it('saves an .osf of each fixture folded flat as the recorded bytes', () => {
    const actual: OsfBytes[] = FILE_FIXTURES.map(([fixture, relative]) => {
      const text = savedOsf(wasm, relative);
      const outcome = String(
        (JSON.parse(text) as {
          workspace: {
            creasePattern: {
              viewState: { foldedFigures: { snapshot: { outcome?: string } }[] };
            };
          };
        }).workspace.creasePattern.viewState.foldedFigures[0].snapshot.outcome
      );
      return {
        fixture,
        outcome,
        bytes: Buffer.byteLength(text, 'utf8'),
        sha256: createHash('sha256').update(text).digest('hex'),
      };
    });
    expect(actual.some((entry) => entry.outcome === 'Solved')).toBe(true);

    if (process.env.ORISTUDIO_UPDATE_GOLDEN) {
      writeFileSync(OSF_GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    const expected = JSON.parse(readFileSync(OSF_GOLDEN, 'utf8')) as OsfBytes[];
    expect(actual).toEqual(expected);
  });
});
