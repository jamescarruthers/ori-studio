import { existsSync, readFileSync } from 'node:fs';
import { basename, delimiter, extname, resolve } from 'node:path';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldArtifacts, FoldDocument } from '../../engine/types';
import { segmentationFoldArtifactsFromFold } from '../../lib/creasePatternImport';
import { type CpSegment, resolveCpSegments } from '../../lib/creasePatternSegmentation';
import {
  resolveSelectedSegment,
  segmentContainedLineIds,
} from '../../lib/creasePatternSelectionSegment';
import { emptyOristudioCpSelection } from '../../lib/creasePatternViewport';
import type { Point } from '../../lib/geometry';
import { outerRing } from '../regions/regionReference';

/**
 * The real CP kernel in Node, for the tests that hold the sheet index and
 * per-sheet faces to what whole-canvas segmentation finds. Those tests skip
 * when the bridge has not been built; CI builds it first.
 *
 * Paths resolve from the vitest root (apps/web): Vite rewrites `import.meta.url`.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm');
export const FIXTURES = resolve(process.cwd(), '../../tests/fixtures');
export const wasmAvailable = existsSync(WASM);

export type CpWasm = typeof import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');

export async function loadCpWasm(): Promise<CpWasm> {
  const wasm = await import('../../generated/oristudio-cp-wasm/oristudio_cp_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  return wasm;
}

/**
 * Real files outside the repository, for a broad check before claiming one
 * (tests/corpus/README.md): `CP_SHEET_INDEX_CORPUS=a.osf:b.cp`.
 */
export const corpus = (process.env.CP_SHEET_INDEX_CORPUS ?? '').split(delimiter).filter(Boolean);

/** A crease-pattern file, by its extension; an `.osf` by the document it saved. */
export function loadFile(wasm: CpWasm, file: string): number {
  const text = readFileSync(file, 'utf8');
  switch (extname(file)) {
    case '.cp':
      return wasm.load_cp(text, basename(file));
    case '.ori':
      return wasm.load_ori(text, true);
    case '.fold':
      return wasm.load_fold_file(text);
    case '.osf':
      return wasm.load_document(
        (
          JSON.parse(text) as {
            workspace: { creasePattern: { creasePattern: { document: unknown } } };
          }
        ).workspace.creasePattern.creasePattern.document
      );
    default:
      throw new Error(`no loader for ${file}`);
  }
}

/** An ORIPA `.cp` body: 1 border, 2 mountain, 3 valley, 4 aux. */
export function loadCp(wasm: CpWasm, ...lines: string[]): number {
  return wasm.load_cp(lines.join('\n'), 'case');
}

export function square(x: number, y: number, side: number): string[] {
  return [
    `1 ${x} ${y} ${x + side} ${y}`,
    `1 ${x + side} ${y} ${x + side} ${y + side}`,
    `1 ${x + side} ${y + side} ${x} ${y + side}`,
    `1 ${x} ${y + side} ${x} ${y}`,
  ];
}

/** Whole-canvas segmentation's artifacts, from the same export the app reads. */
export function wholeCanvasArtifacts(wasm: CpWasm, handle: number): FoldArtifacts {
  return segmentationFoldArtifactsFromFold(
    JSON.parse(wasm.export_fold_file(handle, new Uint32Array())) as FoldDocument
  );
}

export interface Region {
  segment: CpSegment;
  outline: Point[];
  lines: number[];
}

/** Today's sheets: segmented by faces, kept only where the rim is all border. */
export function regionsToday(
  document: OristudioCpDocumentSnapshot,
  artifacts: FoldArtifacts
): Region[] {
  return resolveCpSegments(artifacts).flatMap((segment) => {
    const lines = segmentContainedLineIds(document, artifacts, segment);
    const match = resolveSelectedSegment(
      document,
      { ...emptyOristudioCpSelection(), lines },
      artifacts
    );
    const outline = outerRing(segment.boundary);
    return match?.segmentId === segment.id && outline ? [{ segment, outline, lines }] : [];
  });
}

/** `[minX,minY..maxX,maxY]` of an outline, to name a region in a message. */
export function where(outline: readonly Point[]): string {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `[${r(Math.min(...xs))},${r(Math.min(...ys))}..${r(Math.max(...xs))},${r(Math.max(...ys))}]`;
}
