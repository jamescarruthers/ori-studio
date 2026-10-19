/** Material correspondence for Repeat. All coordinates are sheet/model units. */
import type { Point } from '../../lib/geometry';
import {
  applyIsometry,
  clipConvex,
  insideConvex,
  invertIsometry,
  lineThrough,
  polygonArea,
  polygonCentroid,
  toPair,
  toPoint,
  transformLine,
} from '../canvas/foldCanvasGeometry';
import type { FoldModelLine, SheetPoint } from '../document/foldSequenceDocument';
import type { FoldIsometry, FoldScene } from '../engine/foldEngineWire';

export const REPEAT_TOL = 1e-6;
export class RepeatFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface RepeatSymmetry {
  sheet: FoldModelLine;
  model: FoldModelLine;
  display: FoldModelLine;
}
export function compose(a: FoldIsometry, b: FoldIsometry): FoldIsometry {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}
export function reflection(line: FoldModelLine): FoldIsometry {
  const l = Math.hypot(...line.n);
  if (!Number.isFinite(l) || l < REPEAT_TOL || !Number.isFinite(line.d))
    throw new RepeatFailure('repeat_axis');
  const [x, y] = line.n.map((v) => v / l) as [number, number];
  const d = line.d / l;
  return [1 - 2 * x * x, -2 * x * y, 2 * d * x, -2 * x * y, 1 - 2 * y * y, 2 * d * y];
}
export const mappedPoint = (map: FoldIsometry, p: SheetPoint): SheetPoint =>
  toPair(applyIsometry(map, toPoint(p)));
export function sheetRing(scene: FoldScene, face: number): Point[] {
  return scene.faces[face]!.points.map((p) => scene.sheet_points[p]!);
}
export function modelMap(scene: FoldScene, face: number): FoldIsometry {
  return compose(invertIsometry(scene.view_transform), scene.face_transforms[face]!);
}
export function overlap(a: readonly Point[], b: readonly Point[]): Point[] {
  let result = [...a];
  const twice = b.reduce((sum, p, i) => {
    const q = b[(i + 1) % b.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  const sign = twice >= 0 ? 1 : -1;
  for (let k = 0; k < b.length && result.length; k++) {
    const line = lineThrough(b[k]!, b[(k + 1) % b.length]!);
    if (line) result = clipConvex(result, line, sign);
  }
  return result;
}
export function faceAt(scene: FoldScene, p: SheetPoint): number {
  const f = scene.faces.findIndex((_, i) => insideConvex(sheetRing(scene, i), toPoint(p), REPEAT_TOL));
  if (f < 0) throw new RepeatFailure('repeat_reference');
  return f;
}
export function correspondingFrame(
  source: FoldScene,
  target: FoldScene,
  map: FoldIsometry,
  at: SheetPoint,
): FoldIsometry {
  return compose(
    modelMap(target, faceAt(target, mappedPoint(map, at))),
    compose(map, invertIsometry(modelMap(source, faceAt(source, at)))),
  );
}
export function sameImages(a: FoldIsometry, b: FoldIsometry, points: readonly Point[]): boolean {
  return points.every((p) => {
    const x = applyIsometry(a, p),
      y = applyIsometry(b, p);
    return Math.hypot(x.x - y.x, x.y - y.y) < REPEAT_TOL;
  });
}
function reflectionLine(m: FoldIsometry): FoldModelLine | null {
  if (Math.abs(m[0] + m[4]) > REPEAT_TOL || Math.abs(m[1] - m[3]) > REPEAT_TOL) return null;
  let n: [number, number] = [1 - m[0], -m[1]];
  if (Math.hypot(...n) < REPEAT_TOL) n = [-m[3], 1 - m[4]];
  const l = Math.hypot(...n);
  n = [n[0] / l, n[1] / l];
  const line = { n, d: (n[0] * m[2] + n[1] * m[5]) / 2 };
  return sameImages(reflection(line), m, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ])
    ? line
    : null;
}
export function orderPairs(scene: FoldScene): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const cell of scene.subfaces)
    for (let i = 0; i < cell.faces_top_to_bottom.length; i++)
      for (let j = i + 1; j < cell.faces_top_to_bottom.length; j++) {
        const a = cell.faces_top_to_bottom[i]!,
          b = cell.faces_top_to_bottom[j]!;
        pairs.set(`${Math.min(a, b)}:${Math.max(a, b)}`, a < b ? 1 : -1);
      }
  return pairs;
}
/** Prove whole-region coverage and pose, allowing extra flat subdivisions. */
export function verifiedSymmetry(scene: FoldScene, sheet: FoldModelLine): RepeatSymmetry | null {
  if (scene.faces.length > 512) throw new RepeatFailure('repeat_limit');
  const map = reflection(sheet),
    first = toPair(polygonCentroid(sheetRing(scene, 0)));
  let model: FoldModelLine | null;
  try {
    model = reflectionLine(correspondingFrame(scene, scene, map, first));
  } catch {
    return null;
  }
  if (!model) return null;
  const h = reflection(model),
    owners: number[][] = [];
  for (let i = 0; i < scene.faces.length; i++) {
    const polygon = sheetRing(scene, i).map((p) => applyIsometry(map, p));
    const expected = compose(h, compose(modelMap(scene, i), map));
    let area = 0;
    const matches: number[] = [];
    for (let j = 0; j < scene.faces.length; j++) {
      const part = overlap(polygon, sheetRing(scene, j)),
        a = Math.abs(polygonArea(part));
      if (a < 1e-12) continue;
      if (!sameImages(expected, modelMap(scene, j), part)) return null;
      area += a;
      matches.push(j);
    }
    if (Math.abs(area - Math.abs(polygonArea(polygon))) > 1e-9) return null;
    owners.push(matches);
  }
  const pairs = orderPairs(scene);
  for (const [key, sign] of pairs) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    for (const x of owners[a]!)
      for (const y of owners[b]!) {
        const actual = pairs.get(`${Math.min(x, y)}:${Math.max(x, y)}`);
        if (actual !== undefined && actual !== sign * (x < y ? 1 : -1)) return null;
      }
  }
  return { sheet, model, display: transformLine(scene.view_transform, model) };
}
/** Every reflection of a convex polygon permutes its vertices. */
export function repeatSymmetries(scene: FoldScene, outline: readonly SheetPoint[]): RepeatSymmetry[] {
  const found: RepeatSymmetry[] = [];
  for (let i = 0; i < outline.length; i++)
    for (let j = i + 1; j < outline.length; j++) {
      const p = outline[i]!,
        q = outline[j]!,
        l = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (l < REPEAT_TOL) continue;
      const n: [number, number] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
      const axis = { n, d: (n[0] * (p[0] + q[0]) + n[1] * (p[1] + q[1])) / 2 };
      const m = reflection(axis);
      if (
        !outline.every((v) =>
          outline.some(
            (w) =>
              Math.hypot(...(mappedPoint(m, v).map((x, k) => x - w[k]!) as [number, number])) < REPEAT_TOL,
          ),
        )
      )
        continue;
      if (
        found.some((s) =>
          sameImages(reflection(s.sheet), m, [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ]),
        )
      )
        continue;
      const valid = verifiedSymmetry(scene, axis);
      if (valid) found.push(valid);
    }
  return found;
}
