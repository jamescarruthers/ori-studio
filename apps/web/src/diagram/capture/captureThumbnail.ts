/**
 * The thumbnail a linked step keeps of its pattern (D2): the corner of its
 * card, and what the picker shows for a step whose pattern is gone. Drawn the
 * way the pattern pickers draw a sheet, and kept small.
 *
 * Pure.
 */
import type { FoldArtifacts } from '../../engine/types';
import { segmentSheetThumbnail } from '../../cp-workspace/sheets/segmentSheet';
import { storedSheetThumbnail, type SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import type { StepCreases } from './captureCreases';

/**
 * The region's thumbnail, as the Simulate rail draws it, from the
 * segmentation its creases were chosen in — every capture has one, since a
 * region is found by its rim in it — kept as every step keeps one
 * (`storedSheetThumbnail`).
 */
export function creasesThumbnail(creases: StepCreases, segmentation: FoldArtifacts): SheetThumbnail {
  return storedSheetThumbnail(segmentSheetThumbnail(segmentation.fold, creases.segment));
}
