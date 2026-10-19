import { describe, expect, it } from 'vitest';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { sheetRegions } from '../../cp-workspace/sheets/cpSheetRegions';
import { linesSheetThumbnail } from '../../cp-workspace/sheets/linesSheetThumbnail';
import { cpStep } from '../document/diagramSteps.fixtures';
import { cpDocument, movedLines, TWO_SQUARES, twoSquaresIndex } from './capture.fixtures';
import { chooseStepCreases, creasesFingerprint } from './captureCreases';
import { linkedSheet } from './useDiagramPatternSheets';

const index = twoSquaresIndex();
const sheets = sheetRegions(index).map((sheet) => ({
  sheet,
  thumbnail: linesSheetThumbnail(cpDocument(), sheet.lineIds),
}));

describe('linkedSheet', () => {
  it('finds the pattern a step shows by its rim, whatever its id says', () => {
    const [, right] = sheets;
    const step = {
      ...cpStep('step-1'),
      source: {
        ...cpStep('step-1').source!,
        scope: { kind: 'segment' as const, region: { ...regionReferenceFor(right!.sheet), segmentIdHint: 99 } },
      },
    };
    expect(linkedSheet(step, sheets, cpDocument(), index)).toBe(right);
  });

  it('finds none for a step whose pattern is gone', () => {
    // The fixture step's rim is a unit square, which is no sheet of this pattern.
    expect(linkedSheet(cpStep('step-1'), sheets, cpDocument(), index)).toBeNull();
  });

  it('marks the pattern where it moved to, its creases unchanged', () => {
    const [, right] = sheets;
    const scope = { kind: 'segment' as const, region: regionReferenceFor(right!.sheet) };
    const choice = chooseStepCreases(cpDocument(), scope, index);
    if (choice.status !== 'found') throw new Error('found');
    const render = { mode: 'crease-pattern' as const, rotationDeg: 0 };
    const step = {
      ...cpStep('step-1'),
      source: { ...cpStep('step-1').source!, scope, render, fingerprint: creasesFingerprint(choice.creases, render) },
    };
    const moved = twoSquaresIndex({ dx: 300, dy: 40 });
    const movedSheets = sheetRegions(moved).map((sheet) => ({ sheet, thumbnail: null }));
    expect(linkedSheet(step, movedSheets, cpDocument(movedLines(TWO_SQUARES, 300, 40)), moved)).toBe(movedSheets[1]);
  });

  it('draws each sheet from its own lines', () => {
    expect(sheets.map(({ thumbnail }) => thumbnail?.strokes.length)).toEqual([6, 5]);
  });
});
