import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CpSheetIndex, type CpSheetIndexTransport } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldDocument } from '../../engine/types';
import {
  type CpSegment,
  buildSegmentFold,
  flatPlaneReader,
  resolveCpSegments,
} from '../../lib/creasePatternSegmentation';
import type { Point } from '../../lib/geometry';
import { outerRing, ringsMatch } from '../regions/regionReference';
import { sheetArtifactsFromFold } from './cpSheetArtifacts';
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
 * One sheet's faces, built from its own lines, against the faces whole-canvas
 * segmentation gives the same region: the same faces, and the same lines when
 * the region is cut out for export. Where they differ, the per-sheet export
 * withheld faces the kernel had certified — named in each case below.
 */
let wasm: CpWasm;

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * A face as a shape, whatever the vertex numbering: corners only (a vertex
 * splitting a straight side is not a corner), counter-clockwise, from its
 * lowest corner.
 */
function shape(points: Point[]): string {
  const count = points.length;
  let corners = points.filter((point, index) => {
    const before = points[(index + count - 1) % count]!;
    const after = points[(index + 1) % count]!;
    const turn =
      (point.x - before.x) * (after.y - before.y) - (point.y - before.y) * (after.x - before.x);
    return Math.abs(turn) > 1e-9 * Math.hypot(after.x - before.x, after.y - before.y);
  });
  const area = corners.reduce((sum, point, index) => {
    const next = corners[(index + 1) % corners.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (area < 0) corners = corners.reverse();
  const key = (point: Point) => `${round(point.x)},${round(point.y)}`;
  const lowest = corners.reduce(
    (best, point, index) => (key(point) < key(corners[best]!) ? index : best),
    0
  );
  return [...corners.slice(lowest), ...corners.slice(0, lowest)].map(key).join(' ');
}

function faceShapes(fold: FoldDocument, segment: CpSegment): string[] {
  const read = flatPlaneReader(fold);
  const coords = fold.vertices_coords ?? [];
  return segment.faceIndices
    .map((face) => shape((fold.faces_vertices?.[face] ?? []).map((v) => read(coords[v]))))
    .sort();
}

/** The lines an export of the region writes, as drawn: unsplit, by assignment. */
function exportedLines(fold: FoldDocument, segment: CpSegment): string[] {
  const part = buildSegmentFold(fold, segment);
  const read = flatPlaneReader(part);
  const coords = part.vertices_coords ?? [];
  return (part.edges_vertices ?? [])
    .map(([a, b], edge) => {
      const ends = [read(coords[a]), read(coords[b])]
        .map((point) => `${round(point.x)},${round(point.y)}`)
        .sort();
      return `${ends.join(' ')} ${part.edges_assignment?.[edge] ?? 'U'}`;
    })
    .sort();
}

interface Comparison {
  sheets: number;
  /** Sheets whose own export carried the kernel's faces. */
  kernelFaces: number;
  differences: string[];
}

function compare(handle: number): Comparison {
  const document = wasm.document_snapshot(handle) as OristudioCpDocumentSnapshot;
  const whole = wholeCanvasArtifacts(wasm, handle);
  const regions = regionsToday(document, whole);
  const index = new CpSheetIndex(wasm.sheet_index(handle) as CpSheetIndexTransport);
  const result: Comparison = { sheets: index.sheetCount, kernelFaces: 0, differences: [] };
  for (let sheet = 0; sheet < index.sheetCount; sheet += 1) {
    const region = regions.find((candidate) => ringsMatch(candidate.outline, index.outline(sheet)));
    if (!region) continue;
    const exported = JSON.parse(
      wasm.export_fold_lines(handle, [...index.lines(sheet)])
    ) as FoldDocument;
    if (exported.faces_vertices?.length) result.kernelFaces += 1;
    const artifacts = sheetArtifactsFromFold(exported, sheet);
    const [segment] = resolveCpSegments(artifacts);
    const name = where(region.outline);
    if (!segment || segment.id !== sheet) {
      result.differences.push(`sheet ${name} has no whole-sheet segment`);
      continue;
    }
    if (!ringsMatch(outerRing(segment.boundary) ?? [], region.outline)) {
      result.differences.push(`sheet ${name}: its faces' rim is not the region's`);
    }
    const ours = faceShapes(artifacts.fold, segment);
    const theirs = faceShapes(whole.fold, region.segment);
    if (ours.join('|') !== theirs.join('|')) {
      result.differences.push(`sheet ${name}: ${ours.length} faces, the region ${theirs.length}`);
    }
    const ourLines = exportedLines(artifacts.fold, segment);
    const theirLines = exportedLines(whole.fold, region.segment);
    if (ourLines.join('|') !== theirLines.join('|')) {
      result.differences.push(
        `sheet ${name}: exports ${ourLines.length} lines, the region ${theirLines.length}`
      );
    }
  }
  return result;
}

describe.skipIf(!wasmAvailable)('faces for one sheet against whole-canvas segmentation', () => {
  beforeAll(async () => {
    wasm = await loadCpWasm();
  });

  it("two separate squares: each sheet has its region's faces and lines", () => {
    const result = compare(
      loadCp(wasm, ...square(0, 0, 4), '2 0 0 4 4', ...square(10, 0, 4), '3 10 0 14 4')
    );
    expect(result).toEqual({ sheets: 2, kernelFaces: 2, differences: [] });
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
  ])("fixture %s: the region's faces and lines", (file) => {
    const result = compare(loadFile(wasm, resolve(FIXTURES, file)));
    expect(result).toEqual({ sheets: 1, kernelFaces: 1, differences: [] });
  });

  it('lines ending part-way along unsplit lines get faces inferred, not certified', () => {
    // The kernel certifies the bare square here, the two aux lines crossing it
    // bounding nothing, so today's export of the region drops them. Built for
    // the sheet alone, the faces are inferred from every line, split where they
    // meet, and the export keeps the aux lines, cut at their crossing.
    const result = compare(loadCp(wasm, ...square(0, 0, 4), '4 1 0 1 4', '4 0 2 4 2'));
    expect(result).toEqual({
      sheets: 1,
      kernelFaces: 0,
      differences: [
        'sheet [0,0..4,4]: 4 faces, the region 1',
        'sheet [0,0..4,4]: exports 12 lines, the region 4',
      ],
    });
  });

  it.skipIf(corpus.length === 0).each(corpus)(
    'corpus %s',
    (file) => {
      const result = compare(loadFile(wasm, file));
      console.log(
        `${file}: ${result.sheets} sheets, ${result.kernelFaces} with the kernel's faces`
      );
      expect(result.differences.slice(0, 20)).toEqual([]);
    },
    900_000
  );
});
