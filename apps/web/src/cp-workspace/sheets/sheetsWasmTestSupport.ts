import { existsSync, readFileSync } from 'node:fs';
import { basename, delimiter, extname, resolve } from 'node:path';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldArtifacts, FoldDocument } from '../../engine/types';
import { segmentationFoldArtifactsFromFold } from '../../lib/creasePatternImport';
import {
  assignmentByKeyOf,
  type CpSegment,
  pointInSegment,
  resolveCpSegments,
} from '../../lib/creasePatternSegmentation';
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

/**
 * The sheets every surface found before the sheet index, kept here as the
 * differential tests' reference now that none does: the canvas segmented by
 * faces, each region given the lines whose midpoint lies inside it or on its
 * rim, and kept where its rim is all border and no earlier such region holds
 * the same lines — what a selection of exactly those lines matched.
 */
export function regionsToday(
  document: OristudioCpDocumentSnapshot,
  artifacts: FoldArtifacts
): Region[] {
  const fold = artifacts.fold;
  const assignments = assignmentByKeyOf(fold);
  const held = new Set<string>();
  const regions: Region[] = [];
  for (const segment of resolveCpSegments(artifacts)) {
    if (!rimIsAllBorder(fold, segment, assignments)) continue;
    const lines = linesInside(document, segment);
    const key = lines.join();
    if (lines.length === 0 || held.has(key)) continue;
    held.add(key);
    const outline = outerRing(segment.boundary);
    if (outline) regions.push({ segment, outline, lines });
  }
  return regions;
}

/** Whether every edge used by just one of the region's faces — its rim — is a border. */
function rimIsAllBorder(
  fold: FoldDocument,
  segment: CpSegment,
  assignments: ReadonlyMap<string, string>
): boolean {
  const uses = new Map<string, number>();
  for (const faceIndex of segment.faceIndices) {
    const face = fold.faces_vertices[faceIndex] ?? [];
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!;
      if (a === b) return;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    });
  }
  for (const [key, count] of uses) {
    if (count === 1 && assignments.get(key) !== 'B') return false;
  }
  return true;
}

/** 1-based ids of the lines whose midpoint lies inside the region or within 1e-6 of its rim. */
function linesInside(document: OristudioCpDocumentSnapshot, segment: CpSegment): number[] {
  const near = 1e-6;
  const { minX, minY, maxX, maxY } = segment.bounds;
  const ids: number[] = [];
  document.crease_pattern.line_segments.forEach((line, index) => {
    const midpoint = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
    if (
      midpoint.x < minX - near ||
      midpoint.x > maxX + near ||
      midpoint.y < minY - near ||
      midpoint.y > maxY + near
    ) {
      return;
    }
    const onRim = segment.boundary.some((ring) =>
      ring.some((a, i) => distanceToSegment(midpoint, a, ring[(i + 1) % ring.length]!) < near)
    );
    if (onRim || pointInSegment(segment, midpoint)) ids.push(index + 1);
  });
  return ids;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** `[minX,minY..maxX,maxY]` of an outline, to name a region in a message. */
export function where(outline: readonly Point[]): string {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `[${r(Math.min(...xs))},${r(Math.min(...ys))}..${r(Math.max(...xs))},${r(Math.max(...ys))}]`;
}
