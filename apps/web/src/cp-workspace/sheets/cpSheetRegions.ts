import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { SegmentBounds } from '../../lib/creasePatternSegmentation';
import type { Point } from '../../lib/geometry';

/**
 * A sheet of the {@link CpSheetIndex} as a region: what region references
 * (`regions/regionReference`) are matched against and made from, with the
 * lines it holds. Its rim is its outline, one ring — a border loop inside a
 * sheet is part of the sheet, not a hole in it (the index's definition) — and
 * its id is its position in the index, a hint like any segment id.
 *
 * No faces: a surface that needs them builds that one sheet's
 * (`ensureCpSheetArtifacts`).
 */
export interface CpSheetRegion {
  id: number;
  boundary: Point[][];
  bounds: SegmentBounds;
  /** Every line in the sheet, 1-based, ascending. */
  lineIds: readonly number[];
}

const regionsOf = new WeakMap<CpSheetIndex, readonly CpSheetRegion[]>();

/**
 * The index's sheets as regions, in its order. One array per index, so a
 * region's identity says which index it came from and caches can key on it.
 */
export function sheetRegions(index: CpSheetIndex): readonly CpSheetRegion[] {
  let regions = regionsOf.get(index);
  if (!regions) {
    regions = Array.from({ length: index.sheetCount }, (_, sheet) => ({
      id: sheet,
      boundary: [index.outline(sheet)],
      bounds: index.bounds(sheet),
      lineIds: index.lines(sheet),
    }));
    regionsOf.set(index, regions);
  }
  return regions;
}
