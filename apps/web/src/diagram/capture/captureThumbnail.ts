/**
 * The thumbnail a linked step keeps of its pattern (D2): the corner of its
 * card, and what the picker shows for a step whose pattern is gone. Drawn the
 * way the pattern pickers draw a sheet, and kept small.
 *
 * Pure.
 */
import type { FoldArtifacts } from '../../engine/types';
import { segmentSheetThumbnail } from '../../cp-workspace/sheets/segmentSheet';
import { withinStoredBudget, type SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import type { StepCreases } from './captureCreases';

const EMPTY_THUMBNAIL: SheetThumbnail = { viewBox: '0 0 100 100', strokes: [] };

/**
 * The region's thumbnail, as the Simulate rail draws it, from the
 * segmentation its creases were chosen in — every capture has one, since a
 * region is found by its rim in it.
 */
export function creasesThumbnail(creases: StepCreases, segmentation: FoldArtifacts): SheetThumbnail {
  const thumbnail = segmentSheetThumbnail(segmentation.fold, creases.segment);
  if (!thumbnail) return EMPTY_THUMBNAIL;
  // To a tenth of the 100-unit box: plenty for a corner, and short in the file.
  const snap = (value: number) => Math.round(value * 10) / 10 + 0;
  const snapped = thumbnail.strokes.map((stroke) => ({
    x1: snap(stroke.x1),
    y1: snap(stroke.y1),
    x2: snap(stroke.x2),
    y2: snap(stroke.y2),
    role: stroke.role,
  }));
  // Within what a file takes back, so a dense pattern can still be linked.
  return { viewBox: thumbnail.viewBox, strokes: withinStoredBudget(snapped) };
}
