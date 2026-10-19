import { describe, expect, it } from 'vitest';
import {
  cpLinesByIds,
  foldedSourceFingerprint,
} from '../../cp-workspace/folded/foldedFigureStaleness';
import { relativeCreaseFingerprint } from '../../cp-workspace/regions/regionIdentity';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { sheetRegions } from '../../cp-workspace/sheets/cpSheetRegions';
import type { DiagramCpScope } from '../document/diagramDocument';
import {
  cpDocument,
  LEFT_FOLD_LINE_IDS,
  LEFT_LINE_IDS,
  movedLines,
  TWO_SQUARES,
  twoSquaresIndex,
} from './capture.fixtures';
import { chooseStepCreases, creasesMatch, followedScope, type KnownCreases } from './captureCreases';

const sheets = twoSquaresIndex();
const [left, right] = sheetRegions(sheets);
const leftScope: DiagramCpScope = { kind: 'segment', region: regionReferenceFor(left!) };

describe('chooseStepCreases, a sheet', () => {
  it('finds the sheet by its rim, and is made of every line in it', () => {
    const document = cpDocument();
    const choice = chooseStepCreases(document, leftScope, sheets);
    expect(choice.status).toBe('found');
    if (choice.status !== 'found') return;
    expect(choice.creases.scopedLineIds).toEqual(LEFT_LINE_IDS);
    // The aux line is drawn, never folded, and not fingerprinted.
    expect(choice.creases.foldLineIds).toEqual(LEFT_FOLD_LINE_IDS);
    // Relative, so a move is not a change; the absolute one is kept for a step that has one from before.
    expect(choice.creases.fingerprint).toBe(relativeCreaseFingerprint(cpLinesByIds(document, LEFT_FOLD_LINE_IDS)));
    expect(choice.creases.absolute.fingerprint).toBe(
      foldedSourceFingerprint(cpLinesByIds(document, LEFT_FOLD_LINE_IDS))
    );
    expect(choice.creases.found).toBe('in-place');
    expect(choice.creases.paper).toEqual(left!.boundary);
    expect(choice.creases.sheet).toBe(left);
  });

  it('keeps its fingerprint through an edit to the other region, and changes it for its own', () => {
    const before = chooseStepCreases(cpDocument(), leftScope, sheets);
    // The right diagonal turns mountain: the left region is untouched.
    const otherEdited = cpDocument(TWO_SQUARES.map((line, i) => (i === 8 ? [...line.slice(0, 4), 'Red1'] as typeof line : line)));
    const after = chooseStepCreases(otherEdited, leftScope, sheets);
    const ownEdited = cpDocument(TWO_SQUARES.map((line, i) => (i === 7 ? [...line.slice(0, 4), 'Blue2'] as typeof line : line)));
    const own = chooseStepCreases(ownEdited, leftScope, sheets);
    if (before.status !== 'found' || after.status !== 'found' || own.status !== 'found') {
      throw new Error('every choice should find the region');
    }
    expect(after.creases.fingerprint).toBe(before.creases.fingerprint);
    expect(own.creases.fingerprint).not.toBe(before.creases.fingerprint);
  });

  it('is missing when the sheet is gone, and unknown before the index is ready', () => {
    // The left square is no longer closed by its border: it is no sheet.
    expect(chooseStepCreases(cpDocument(), leftScope, twoSquaresIndex({ left: false }))).toEqual({
      status: 'missing',
    });
    expect(chooseStepCreases(cpDocument(), leftScope, null)).toEqual({ status: 'unknown' });
  });

  it('never takes another region for this one, even under its id', () => {
    const lying: DiagramCpScope = {
      kind: 'segment',
      region: { ...regionReferenceFor(left!), segmentIdHint: right!.id },
    };
    const choice = chooseStepCreases(cpDocument(), lying, sheets);
    expect(choice.status === 'found' && choice.creases.sheet.id).toBe(left!.id);
  });
});

describe('chooseStepCreases, after the pattern moved', () => {
  // Deltas that do not add exactly, as a drag's do not.
  const dx = 1234.1;
  const dy = -0.30000000000000004;
  const original = chooseStepCreases(cpDocument(), leftScope, sheets);
  if (original.status !== 'found') throw new Error('the left square should be found');
  const remembered = (drawn: boolean): KnownCreases => ({
    fingerprint: drawn ? original.creases.drawnFingerprint : original.creases.fingerprint,
    drawn,
  });
  const movedSheets = twoSquaresIndex({ dx, dy });
  const [movedLeft] = sheetRegions(movedSheets);

  it('finds its sheet where it is now, its creases unchanged, by either fingerprint', () => {
    for (const drawn of [false, true]) {
      const choice = chooseStepCreases(cpDocument(movedLines(TWO_SQUARES, dx, dy)), leftScope, movedSheets, remembered(drawn));
      if (choice.status !== 'found') throw new Error('the moved square should be found');
      expect(choice.creases.sheet).toBe(movedLeft);
      expect(choice.creases.found).toBe('unchanged');
      expect(creasesMatch(choice.creases, remembered(drawn))).toBe(true);
      expect(choice.creases.scopedLineIds).toEqual(LEFT_LINE_IDS);
    }
  });

  it('is not found where it was without what it remembers: the link being made now is to a sheet in place', () => {
    expect(chooseStepCreases(cpDocument(movedLines(TWO_SQUARES, dx, dy)), leftScope, movedSheets).status).toBe('missing');
  });

  it('finds it changed in place, and says so', () => {
    const recoloured = cpDocument(TWO_SQUARES.map((line, i) => (i === 7 ? ([...line.slice(0, 4), 'Blue2'] as typeof line) : line)));
    const choice = chooseStepCreases(recoloured, leftScope, sheets, remembered(false));
    if (choice.status !== 'found') throw new Error('the edited square should be found');
    expect(choice.creases.found).toBe('in-place');
    expect(creasesMatch(choice.creases, remembered(false))).toBe(false);
  });

  it('is missing when it moved and changed beside another square: it cannot be told which', () => {
    const lines = movedLines(TWO_SQUARES, dx, dy).map((line, i) => (i === 7 ? ([...line.slice(0, 4), 'Blue2'] as typeof line) : line));
    expect(chooseStepCreases(cpDocument(lines), leftScope, movedSheets, remembered(false)).status).toBe('missing');
  });

  it('compares a fingerprint from before the change the old way: found in place, never recognised moved', () => {
    const absolute: KnownCreases = { fingerprint: original.creases.absolute.fingerprint, drawn: false };
    const inPlace = chooseStepCreases(cpDocument(), leftScope, sheets, absolute);
    if (inPlace.status !== 'found') throw new Error('found in place');
    expect(creasesMatch(inPlace.creases, absolute)).toBe(true);
    expect(chooseStepCreases(cpDocument(movedLines(TWO_SQUARES, dx, dy)), leftScope, movedSheets, absolute).status).toBe(
      'missing'
    );
  });

  it('follows its sheet: a capture keeps the scope while it is in place, and takes the moved sheet’s otherwise', () => {
    expect(followedScope(leftScope, original.creases)).toBe(leftScope);
    const choice = chooseStepCreases(cpDocument(movedLines(TWO_SQUARES, dx, dy)), leftScope, movedSheets, remembered(false));
    if (choice.status !== 'found') throw new Error('found');
    const followed = followedScope(leftScope, choice.creases);
    expect(followed).not.toBe(leftScope);
    expect(followed.region).toEqual(regionReferenceFor(movedLeft!));
  });
});
