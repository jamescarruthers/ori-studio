import { useMemo } from 'react';
import { segmentSheetThumbnail } from './segmentSheet';
import type { SheetThumbnail } from './sheetThumbnail';
import type { FoldArtifacts } from '../../engine/types';
import { resolveCpSegments, type CpSegment } from '../../lib/creasePatternSegmentation';
import { useCpSegmentationState } from '../regions/useCpSegmentation';

/** One pattern a step can be linked to: a region of the open crease pattern. */
export interface CpPatternSheet {
  segment: CpSegment;
  thumbnail: SheetThumbnail | null;
}

export type CpPatternSheets =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | {
      status: 'ready';
      sheets: readonly CpPatternSheet[];
      /** The segmentation the sheets are of: what a linked step's own sheet is found in. */
      artifacts: FoldArtifacts;
    };

/**
 * The patterns of the open crease pattern, for the pattern picker: its
 * regions in the kernel-space segmentation every link is made in (D3), each
 * drawn as the pattern rails draw one. Asked for only while `wanted`.
 */
export function useCpPatternSheets(wanted: boolean): CpPatternSheets {
  const segmentation = useCpSegmentationState(wanted);
  return useMemo(() => {
    if (segmentation.status !== 'ready') return segmentation;
    const { fold } = segmentation.artifacts;
    return {
      status: 'ready',
      sheets: resolveCpSegments(segmentation.artifacts).map((segment) => ({
        segment,
        thumbnail: segmentSheetThumbnail(fold, segment),
      })),
      artifacts: segmentation.artifacts,
    };
  }, [segmentation]);
}
