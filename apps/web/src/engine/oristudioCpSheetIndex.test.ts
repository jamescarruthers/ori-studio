import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CpSheetIndex, decodeSheetIndexBytes } from './oristudioCpSheetIndex';

// The cross-language pin for the sheet index's binary form, as the native
// bridge sends it. The bytes are written by the Rust encoder
// (`sheet_index_golden_fixture_is_current` in crates/oristudio-cp/src/sheets.rs)
// from two squares, a crease in the first and a line outside both — so a
// layout change there fails here until this decoder follows.
//
// Resolved from the vitest root (apps/web): Vite rewrites `import.meta.url`.
const GOLDEN_BYTES = new Uint8Array(
  readFileSync(resolve(process.cwd(), '../../tests/fixtures/oristudio-cp/sheet-index-golden.bin'))
);

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  // A standalone ArrayBuffer copy (offset 0), matching what invoke returns.
  return bytes.slice().buffer;
}

const index = new CpSheetIndex(decodeSheetIndexBytes(bufferOf(GOLDEN_BYTES)));

describe('decodeSheetIndexBytes', () => {
  it('decodes the Rust-encoded golden index', () => {
    expect(index.sheetCount).toBe(2);
    expect(index.bounds(0)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 4 });
    expect(index.bounds(1)).toEqual({ minX: 10, minY: 0, maxX: 14, maxY: 4 });
    expect(index.outline(0)).toHaveLength(4);
    expect(index.outline(1)).toHaveLength(4);
    expect(Array.from(index.transport.lineSheet)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, -1]);
    expect(index.transport.bounds).toBeInstanceOf(Float64Array);
    expect(index.transport.lineSheet).toBeInstanceOf(Int32Array);
  });

  it('refuses a buffer of another layout', () => {
    const bytes = GOLDEN_BYTES.slice();
    bytes[0] ^= 0xff;
    expect(() => decodeSheetIndexBytes(bufferOf(bytes))).toThrow(
      expect.objectContaining({ code: 'sheet_index_decode' })
    );
  });

  it('refuses a truncated buffer', () => {
    expect(() => decodeSheetIndexBytes(bufferOf(GOLDEN_BYTES.slice(0, -1)))).toThrow(
      expect.objectContaining({ code: 'sheet_index_decode' })
    );
    expect(() => decodeSheetIndexBytes(new ArrayBuffer(4))).toThrow(
      expect.objectContaining({ code: 'sheet_index_decode' })
    );
  });
});

describe('CpSheetIndex', () => {
  it('reads lines by their 1-based ids', () => {
    expect(index.sheetOfLine(1)).toBe(0);
    expect(index.sheetOfLine(6)).toBe(1);
    expect(index.sheetOfLine(10)).toBe(-1);
    expect(index.sheetOfLine(11)).toBe(-1);
    expect(index.lineCount(0)).toBe(5);
    expect(index.lines(0)).toEqual([1, 2, 3, 4, 5]);
    expect(index.lines(1)).toEqual([6, 7, 8, 9]);
  });

  it('names the sheet a selection makes up exactly, in any order', () => {
    expect(index.sheetMadeBy([1, 2, 3, 4, 5])).toBe(0);
    expect(index.sheetMadeBy([5, 3, 1, 4, 2, 2])).toBe(0);
    expect(index.sheetMadeBy([9, 8, 7, 6])).toBe(1);
  });

  it('names no sheet for part of one, more than one, or lines outside every sheet', () => {
    expect(index.sheetMadeBy([1, 2, 3, 4])).toBeNull();
    expect(index.sheetMadeBy([1, 2, 3, 4, 5, 6])).toBeNull();
    expect(index.sheetMadeBy([10])).toBeNull();
    expect(index.sheetMadeBy([])).toBeNull();
  });
});
