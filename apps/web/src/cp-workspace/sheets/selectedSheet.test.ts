import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CpSheetIndex, decodeSheetIndexBytes } from '../../engine/oristudioCpSheetIndex';
import { explainSelectedSheet, resolveSelectedSheet } from './selectedSheet';

// The Rust-written golden index: two squares (lines 1-4 and 6-9), a crease in
// the first (line 5), and a line outside both (line 10).
// Copied out of Node's pooled buffer: `decodeSheetIndexBytes` reads from offset 0.
const index = new CpSheetIndex(
  decodeSheetIndexBytes(
    new Uint8Array(
      readFileSync(
        resolve(process.cwd(), '../../tests/fixtures/oristudio-cp/sheet-index-golden.bin')
      )
    ).slice().buffer
  )
);

describe('resolveSelectedSheet', () => {
  it('names the sheet a selection is, with its lines in order', () => {
    expect(resolveSelectedSheet(index, [5, 4, 3, 2, 1])).toEqual({
      sheet: 0,
      cpLineIds: [1, 2, 3, 4, 5],
    });
  });

  it('names none for part of a sheet, two sheets, or without an index', () => {
    expect(resolveSelectedSheet(index, [1, 2, 3, 4])).toBeNull();
    expect(resolveSelectedSheet(index, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
    expect(resolveSelectedSheet(null, [1, 2, 3, 4, 5])).toBeNull();
  });
});

describe('explainSelectedSheet', () => {
  it('ranks the sheets a selection touches by how close each came', () => {
    const diagnosis = explainSelectedSheet(index, [1, 2, 3, 6, 10]);
    expect(diagnosis.reason).toBe('no-sheet-matches');
    expect(diagnosis.outsideEverySheet).toBe(1);
    expect(diagnosis.touched).toEqual([
      { sheet: 0, lines: 5, selected: 3, missing: 2 },
      { sheet: 1, lines: 4, selected: 1, missing: 3 },
    ]);
  });

  it('says matched when the selection is a sheet', () => {
    expect(explainSelectedSheet(index, [6, 7, 8, 9]).reason).toBe('matched');
    expect(explainSelectedSheet(index, []).reason).toBe('empty-selection');
    expect(explainSelectedSheet(null, [1]).reason).toBe('no-index');
  });
});
