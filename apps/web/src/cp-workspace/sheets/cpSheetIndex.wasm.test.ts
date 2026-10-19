import { existsSync, readFileSync } from 'node:fs';
import { basename, delimiter, extname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CpSheetIndex, type CpSheetIndexTransport } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldDocument } from '../../engine/types';
import { segmentationFoldArtifactsFromFold } from '../../lib/creasePatternImport';
import { resolveCpSegments } from '../../lib/creasePatternSegmentation';
import {
  resolveSelectedSegment,
  segmentContainedLineIds,
} from '../../lib/creasePatternSelectionSegment';
import { emptyOristudioCpSelection } from '../../lib/creasePatternViewport';
import type { Point } from '../../lib/geometry';
import { outerRing, ringsMatch } from '../regions/regionReference';

/**
 * The kernel's sheet index against the sheets every surface finds today: the
 * border-enclosed regions of face segmentation, with the creases containment
 * puts in them. Same outlines and same lines, except where the definitions were
 * decided to differ (implementation-plans/large-document-open-and-select.md,
 * "Definitions — decided 2026-10-18") — and each of those is named here, so a
 * difference nobody decided cannot pass as one.
 *
 * Skipped when the bridge has not been built; CI builds it first.
 */
const ROOT = process.cwd();
const WASM = resolve(ROOT, 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
const FIXTURES = resolve(ROOT, '../../tests/fixtures');
const available = existsSync(WASM);

type Wasm = typeof import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');
let wasm: Wasm;

interface Region {
  outline: Point[];
  lines: number[];
}

/** Today's answer: segmented by faces, kept only where the rim is all border. */
function regionsToday(document: OristudioCpDocumentSnapshot, fold: FoldDocument): Region[] {
  const artifacts = segmentationFoldArtifactsFromFold(fold);
  return resolveCpSegments(artifacts).flatMap((segment) => {
    const lines = segmentContainedLineIds(document, artifacts, segment);
    const match = resolveSelectedSegment(
      document,
      { ...emptyOristudioCpSelection(), lines },
      artifacts
    );
    const outline = outerRing(segment.boundary);
    return match?.segmentId === segment.id && outline ? [{ outline, lines }] : [];
  });
}

function indexed(index: CpSheetIndex): Region[] {
  return Array.from({ length: index.sheetCount }, (_, sheet) => ({
    outline: index.outline(sheet),
    lines: [...index.lines(sheet)],
  }));
}

function where(region: Region): string {
  const xs = region.outline.map((p) => p.x);
  const ys = region.outline.map((p) => p.y);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `[${r(Math.min(...xs))},${r(Math.min(...ys))}..${r(Math.max(...xs))},${r(Math.max(...ys))}]`;
}

/** Every way the two answers disagree, in words. */
function differences(today: Region[], sheets: Region[]): string[] {
  const found: string[] = [];
  for (const region of today) {
    const sheet = sheets.find((candidate) => ringsMatch(candidate.outline, region.outline));
    if (!sheet) found.push(`region ${where(region)} is not a sheet`);
    else if (sheet.lines.join() !== region.lines.join()) {
      found.push(
        `sheet ${where(sheet)} holds ${sheet.lines.length} lines, the region ${region.lines.length}`
      );
    }
  }
  for (const sheet of sheets) {
    if (!today.some((region) => ringsMatch(region.outline, sheet.outline))) {
      found.push(`sheet ${where(sheet)} is not a region`);
    }
  }
  return found;
}

function compare(handle: number): {
  today: Region[];
  sheets: Region[];
  differences: string[];
} {
  const document = wasm.document_snapshot(handle) as OristudioCpDocumentSnapshot;
  const fold = JSON.parse(wasm.export_fold(handle)) as FoldDocument;
  const index = new CpSheetIndex(wasm.sheet_index(handle) as CpSheetIndexTransport);
  const today = regionsToday(document, fold);
  const sheets = indexed(index);
  return { today, sheets, differences: differences(today, sheets) };
}

/**
 * Real files outside the repository, for a broad check before claiming one
 * (tests/corpus/README.md): `CP_SHEET_INDEX_CORPUS=a.osf:b.cp`.
 */
const corpus = (process.env.CP_SHEET_INDEX_CORPUS ?? '').split(delimiter).filter(Boolean);

/** A crease-pattern file, by its extension; an `.osf` by the document it saved. */
function load(file: string): number {
  const text = readFileSync(file, 'utf8');
  switch (extname(file)) {
    case '.cp':
      return wasm.load_cp(text, basename(file));
    case '.ori':
      return wasm.load_ori(text, true);
    case '.fold':
      return wasm.load_fold_file(text);
    case '.osf':
      return wasm.load_document(
        (
          JSON.parse(text) as {
            workspace: {
              creasePattern: { creasePattern: { document: unknown } };
            };
          }
        ).workspace.creasePattern.creasePattern.document
      );
    default:
      throw new Error(`no loader for ${file}`);
  }
}

/** An ORIPA `.cp` body: 1 border, 2 mountain, 3 valley, 4 aux. */
function cp(...lines: string[]): number {
  return wasm.load_cp(lines.join('\n'), 'case');
}

function square(x: number, y: number, side: number): string[] {
  return [
    `1 ${x} ${y} ${x + side} ${y}`,
    `1 ${x + side} ${y} ${x + side} ${y + side}`,
    `1 ${x + side} ${y + side} ${x} ${y + side}`,
    `1 ${x} ${y + side} ${x} ${y}`,
  ];
}

describe.skipIf(!available)('the sheet index against border-enclosed regions', () => {
  beforeAll(async () => {
    wasm = await import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');
    wasm.initSync({ module: readFileSync(WASM) });
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
