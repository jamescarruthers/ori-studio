/**
 * The kernel's sheet index, as the frontend receives it: the separate crease
 * patterns a canvas holds, and which one each line is in
 * (`crates/oristudio-cp/src/sheets.rs`). Built from the border lines alone, so
 * it costs tens of milliseconds where segmenting by faces cost seconds.
 *
 * This module owns the transport's layout — the typed arrays both bridges hand
 * over, and the binary form the native one sends them in — and
 * {@link CpSheetIndex}, which reads it without copying.
 */
import type { Point } from '../lib/geometry';

/** Flat arrays, as `sheet_index` returns them (mirrors `CompactSheetIndex`). */
export interface CpSheetIndexTransport {
  /** `[minX, minY, maxX, maxY]` per sheet. */
  bounds: Float64Array;
  /** Sheet `i`'s outline is vertices `outlineOffsets[i]..outlineOffsets[i + 1]`. */
  outlineOffsets: Uint32Array;
  /** `[x, y]` per outline vertex. */
  outlineCoords: Float64Array;
  /** Lines per sheet. */
  lineCounts: Uint32Array;
  /** Per line, in `line_segments` order: its sheet, or `-1`. */
  lineSheet: Int32Array;
}

/** Mirrors `COMPACT_SHEET_INDEX_MAGIC`; a stale decoder fails rather than misreads. */
const COMPACT_SHEET_INDEX_MAGIC = 0x4f534931;
const HEADER_BYTES = 24;

/** The native bridge's binary form (see `CompactSheetIndex::to_bytes`). */
export function decodeSheetIndexBytes(buffer: ArrayBuffer): CpSheetIndexTransport {
  const fail = (message: string): never => {
    throw { code: 'sheet_index_decode', message };
  };
  if (buffer.byteLength < HEADER_BYTES) fail('sheet index buffer too small for header');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== COMPACT_SHEET_INDEX_MAGIC) fail('sheet index: bad magic/version');
  const [bounds, outlineCoords, outlineOffsets, lineCounts, lineSheet] = [4, 8, 12, 16, 20].map(
    (at) => view.getUint32(at, true)
  ) as [number, number, number, number, number];
  const expected =
    HEADER_BYTES + (bounds + outlineCoords) * 8 + (outlineOffsets + lineCounts + lineSheet) * 4;
  if (buffer.byteLength !== expected) {
    fail(`sheet index: length mismatch (expected ${expected}, got ${buffer.byteLength})`);
  }
  let offset = HEADER_BYTES;
  // `slice` gives each array its own 0-aligned buffer, so the views are valid.
  const take = <T>(count: number, bytes: number, make: (slice: ArrayBuffer) => T): T => {
    const array = make(buffer.slice(offset, offset + count * bytes));
    offset += count * bytes;
    return array;
  };
  return {
    bounds: take(bounds, 8, (slice) => new Float64Array(slice)),
    outlineCoords: take(outlineCoords, 8, (slice) => new Float64Array(slice)),
    outlineOffsets: take(outlineOffsets, 4, (slice) => new Uint32Array(slice)),
    lineCounts: take(lineCounts, 4, (slice) => new Uint32Array(slice)),
    lineSheet: take(lineSheet, 4, (slice) => new Int32Array(slice)),
  };
}

/** Every buffer of a transport, for handing it across a worker boundary. */
export function sheetIndexTransferables(index: CpSheetIndexTransport): Transferable[] {
  return [
    index.bounds.buffer,
    index.outlineOffsets.buffer,
    index.outlineCoords.buffer,
    index.lineCounts.buffer,
    index.lineSheet.buffer,
  ] as Transferable[];
}

/** Reads a transport: sheets by position, lines by their 1-based ids. */
export class CpSheetIndex {
  private members: number[][] | null = null;

  constructor(readonly transport: CpSheetIndexTransport) {}

  get sheetCount(): number {
    return this.transport.lineCounts.length;
  }

  /** The sheet line `id` (1-based, as selections hold them) is in, or `-1`. */
  sheetOfLine(id: number): number {
    return this.transport.lineSheet[id - 1] ?? -1;
  }

  lineCount(sheet: number): number {
    return this.transport.lineCounts[sheet] ?? 0;
  }

  bounds(sheet: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const { bounds } = this.transport;
    return {
      minX: bounds[sheet * 4]!,
      minY: bounds[sheet * 4 + 1]!,
      maxX: bounds[sheet * 4 + 2]!,
      maxY: bounds[sheet * 4 + 3]!,
    };
  }

  /** The sheet's outline: its corners, wound with positive signed area. */
  outline(sheet: number): Point[] {
    const { outlineOffsets, outlineCoords } = this.transport;
    const outline: Point[] = [];
    for (let vertex = outlineOffsets[sheet]!; vertex < outlineOffsets[sheet + 1]!; vertex += 1) {
      outline.push({
        x: outlineCoords[vertex * 2]!,
        y: outlineCoords[vertex * 2 + 1]!,
      });
    }
    return outline;
  }

  /** The 1-based ids of the lines in `sheet`, ascending. Built once, for every sheet. */
  lines(sheet: number): readonly number[] {
    if (!this.members) {
      const members: number[][] = Array.from({ length: this.sheetCount }, () => []);
      this.transport.lineSheet.forEach((at, index) => {
        if (at >= 0) members[at]!.push(index + 1);
      });
      this.members = members;
    }
    return this.members[sheet] ?? [];
  }

  /**
   * The sheet these lines make up exactly — every line of it and nothing else —
   * or `null`. One pass over the selection: it is one sheet when every id is in
   * the same sheet and there are as many distinct ids as that sheet has lines.
   */
  sheetMadeBy(lineIds: readonly number[]): number | null {
    if (lineIds.length === 0) return null;
    const sheet = this.sheetOfLine(lineIds[0]!);
    if (sheet < 0) return null;
    const seen = new Set<number>();
    for (const id of lineIds) {
      if (this.sheetOfLine(id) !== sheet) return null;
      seen.add(id);
    }
    return seen.size === this.lineCount(sheet) ? sheet : null;
  }
}
