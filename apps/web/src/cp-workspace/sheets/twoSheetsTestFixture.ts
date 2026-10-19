import { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type {
  OristudioCpDocumentSnapshot,
  OristudioCpLineSegment,
} from '../../engine/oristudioCpTypes';
import type { FoldDocument } from '../../engine/types';

/**
 * Two separate unit squares, each a sheet with one diagonal: the left one
 * (lines 1–5, a mountain) and the right one (lines 6–10, a valley). Shared by
 * the tests of everything that resolves a selection to a sheet, so the
 * toolbar's render gate and the simulation resolver demonstrably answer the
 * same question.
 */
export const LEFT_SHEET = [1, 2, 3, 4, 5];
export const RIGHT_SHEET = [6, 7, 8, 9, 10];

const LINES: Array<[number, number, number, number, string]> = [
  [0, 0, 1, 0, 'Black0'],
  [1, 0, 1, 1, 'Black0'],
  [1, 1, 0, 1, 'Black0'],
  [0, 1, 0, 0, 'Black0'],
  [0, 0, 1, 1, 'Red1'],
  [2, 0, 3, 0, 'Black0'],
  [3, 0, 3, 1, 'Black0'],
  [3, 1, 2, 1, 'Black0'],
  [2, 1, 2, 0, 'Black0'],
  [2, 0, 3, 1, 'Blue2'],
];

function line(ax: number, ay: number, bx: number, by: number, color: string): OristudioCpLineSegment {
  return {
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    active: '',
    color,
    selected: 0,
    customized: 0,
    customized_color: { red: 0, green: 0, blue: 0 },
  } as unknown as OristudioCpLineSegment;
}

export function twoSheetDocument(): OristudioCpDocumentSnapshot {
  return {
    crease_pattern: {
      line_segments: LINES.map((entry) => line(...entry)),
      circles: [],
      points: [],
      aux_line_segments: [],
      texts: [],
      grid: {},
    },
    metadata: {},
  } as unknown as OristudioCpDocumentSnapshot;
}

/** The index the kernel builds for {@link twoSheetDocument}. */
export function twoSheetIndex(): CpSheetIndex {
  return new CpSheetIndex({
    bounds: new Float64Array([0, 0, 1, 1, 2, 0, 3, 1]),
    outlineOffsets: new Uint32Array([0, 4, 8]),
    outlineCoords: new Float64Array([0, 0, 1, 0, 1, 1, 0, 1, 2, 0, 3, 0, 3, 1, 2, 1]),
    lineCounts: new Uint32Array([5, 5]),
    lineSheet: new Int32Array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]),
  });
}

/** One sheet's lines as the kernel exports them, with its two faces. */
export function twoSheetFold(sheet: number): FoldDocument {
  const x = sheet * 2;
  return {
    vertices_coords: [
      [x, 0],
      [x + 1, 0],
      [x + 1, 1],
      [x, 1],
    ],
    edges_vertices: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 2],
    ],
    edges_assignment: ['B', 'B', 'B', 'B', sheet === 0 ? 'M' : 'V'],
    faces_vertices: [
      [0, 1, 2],
      [0, 2, 3],
    ],
  };
}
