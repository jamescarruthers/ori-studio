import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CpSheetIndex, type CpSheetIndexTransport } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { Point } from '../../lib/geometry';
import { ringsMatch } from '../regions/regionReference';
import {
  type CpWasm,
  FIXTURES,
  corpus,
  loadCp,
  loadCpWasm,
  loadFile,
  regionsToday,
  square,
  wasmAvailable,
  wholeCanvasArtifacts,
  where,
} from './sheetsWasmTestSupport';

/**
 * The kernel's sheet index against the sheets every surface finds today: the
 * border-enclosed regions of face segmentation, with the creases containment
 * puts in them. Same outlines and same lines, except where the definitions were
 * decided to differ (implementation-plans/large-document-open-and-select.md,
 * "Definitions — decided 2026-10-18") — and each of those is named here, so a
 * difference nobody decided cannot pass as one.
 */
let wasm: CpWasm;

interface Sheet {
  outline: Point[];
  lines: readonly number[];
}

/** Every way the two answers disagree, in words. */
function differences(today: Sheet[], sheets: Sheet[]): string[] {
  const found: string[] = [];
  for (const region of today) {
    const sheet = sheets.find((candidate) => ringsMatch(candidate.outline, region.outline));
    if (!sheet) found.push(`region ${where(region.outline)} is not a sheet`);
    else if (sheet.lines.join() !== region.lines.join()) {
      found.push(
        `sheet ${where(sheet.outline)} holds ${sheet.lines.length} lines, the region ${region.lines.length}`
      );
    }
  }
  for (const sheet of sheets) {
    if (!today.some((region) => ringsMatch(region.outline, sheet.outline))) {
      found.push(`sheet ${where(sheet.outline)} is not a region`);
    }
  }
  return found;
}

function compare(handle: number): { today: Sheet[]; sheets: Sheet[]; differences: string[] } {
  const document = wasm.document_snapshot(handle) as OristudioCpDocumentSnapshot;
  const index = new CpSheetIndex(wasm.sheet_index(handle) as CpSheetIndexTransport);
  const today = regionsToday(document, wholeCanvasArtifacts(wasm, handle));
  const sheets = Array.from({ length: index.sheetCount }, (_, sheet) => ({
    outline: index.outline(sheet),
    lines: index.lines(sheet),
  }));
  return { today, sheets, differences: differences(today, sheets) };
}

function cp(...lines: string[]): number {
  return loadCp(wasm, ...lines);
}

function load(file: string): number {
  return loadFile(wasm, file);
}

describe.skipIf(!wasmAvailable)('the sheet index against border-enclosed regions', () => {
  beforeAll(async () => {
    wasm = await loadCpWasm();
  });

  it.each([
    [
      'two separate squares',
      () => cp(...square(0, 0, 4), '2 0 0 4 4', ...square(10, 0, 4), '3 10 0 14 4'),
    ],
    [
      'aux lines ending part-way along unsplit borders',
      () => cp(...square(0, 0, 4), '4 1 0 1 4', '4 0 2 4 2', '2 0 0 4 4'),
    ],
    [
      'a crease-only square',
      () => cp('2 0 0 4 0', '2 4 0 4 4', '3 4 4 0 4', '3 0 4 0 0', '2 0 0 4 4'),
    ],
  ])('%s: the same sheets, holding the same lines', (_, load) => {
    expect(compare(load()).differences).toEqual([]);
  });

  it.each([
    ['oriedita/solution_sample_1.cp'],
    ['oriedita/failing_global_flat_fold.ori'],
    ['oriedita/holed_sheet_spiral.ori'],
    ['oriedita/holed_frame_collinear.ori'],
    ['flat-folder/kabuto.fold'],
    ['fold-angle-3d/box_90.fold'],
    ['precrease/hex-14.fold'],
    ['precrease/iguana-c0.fold'],
  ])('fixture %s: the same sheets, holding the same lines', (file) => {
    expect(compare(load(resolve(FIXTURES, file))).differences).toEqual([]);
  });

  // The definitions this index was decided to answer differently: a border line
  // inside a sheet — a wall, a loop — is a member of it, never a boundary.
  it('a border wall across a sheet does not split it', () => {
    const result = compare(
      cp(
        '1 0 0 4 0',
        '1 4 0 8 0',
        '1 8 0 8 4',
        '1 8 4 4 4',
        '1 4 4 0 4',
        '1 0 4 0 0',
        '1 4 0 4 4',
        '2 0 0 4 4',
        '3 4 0 8 4'
      )
    );
    expect(result.differences).toEqual([
      'region [0,0..4,4] is not a sheet',
      'region [4,0..8,4] is not a sheet',
      'sheet [0,0..8,4] is not a region',
    ]);
  });

  it('a border loop inside a sheet is not a sheet', () => {
    // Today it is one whenever the kernel cannot certify the faces, as here.
    const empty = compare(cp(...square(0, 0, 10), ...square(3, 3, 4), '2 0 0 3 3'));
    expect(empty.differences).toEqual(['region [3,3..7,7] is not a sheet']);

    const creased = compare(cp(...square(0, 0, 10), ...square(3, 3, 4), '2 3 3 7 7', '2 0 0 3 3'));
    expect(creased.differences).toEqual([
      'sheet [0,0..10,10] holds 10 lines, the region 9',
      'region [3,3..7,7] is not a sheet',
    ]);
  });

  it.skipIf(corpus.length === 0).each(corpus)(
    'corpus %s: the same sheets, holding the same lines',
    (file) => {
      const result = compare(load(file));
      console.log(`${file}: ${result.sheets.length} sheets, ${result.today.length} regions`);
      expect(result.differences).toEqual([]);
    },
    600_000
  );
});
