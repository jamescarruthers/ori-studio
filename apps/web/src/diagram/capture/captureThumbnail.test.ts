import { describe, expect, it } from 'vitest';
import { readSheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { resolveCpSegments } from '../../lib/creasePatternSegmentation';
import { storedCpSource } from '../document/diagramFile';
import { cpDocument, twoSquaresSegmentation } from './capture.fixtures';
import { chooseStepCreases } from './captureCreases';
import { creasesThumbnail } from './captureThumbnail';

describe('creasesThumbnail', () => {
  it('draws the region from the segmentation it was found in, snapped, and the file reads it back', () => {
    const segmentation = twoSquaresSegmentation();
    const [left] = resolveCpSegments(segmentation);
    const scope = { kind: 'segment' as const, region: regionReferenceFor(left!) };
    const choice = chooseStepCreases(cpDocument(), scope, segmentation);
    if (choice.status !== 'found') throw new Error('the left square is a region');
    const thumbnail = creasesThumbnail(choice.creases, segmentation);
    expect(thumbnail.strokes.length).toBeGreaterThan(0);
    // To a tenth of the box, so the file stays short.
    for (const entry of thumbnail.strokes) {
      for (const value of [entry.x1, entry.y1, entry.x2, entry.y2]) {
        expect(Math.round(value * 10) / 10).toBe(value);
      }
    }
    expect(readSheetThumbnail(thumbnail)).not.toBeNull();
    expect(
      storedCpSource({
        kind: 'cp',
        scope,
        fingerprint: choice.creases.fingerprint,
        thumbnail,
        render: { mode: 'crease-pattern', rotationDeg: 0 },
      })
    ).not.toBeNull();
  });
});
