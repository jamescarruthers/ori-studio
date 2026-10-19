/** Compare material effects, including flat precreases and internal layer order. */
import type { Point } from '../../lib/geometry';
import { applyIsometry, polygonArea, polygonCentroid, toPair } from '../canvas/foldCanvasGeometry';
import type { FoldIsometry, FoldScene } from '../engine/foldEngineWire';
import {
  compose,
  correspondingFrame,
  faceAt,
  mappedPoint,
  modelMap,
  orderPairs,
  overlap,
  RepeatFailure,
  sameImages,
  sheetRing,
} from './repeatGeometry';

const AREA = 1e-12;
/** The native operations refine faces; import/history operations need their own adapter. */
export function changedFaces(before: FoldScene, after: FoldScene): number[] {
  return after.faces.flatMap((_, i) => {
    const ring = sheetRing(after, i);
    return before.faces.some((__, j) => {
      const part = overlap(ring, sheetRing(before, j));
      return polygonArea(part) > AREA && !sameImages(modelMap(after, i), modelMap(before, j), part);
    })
      ? [i]
      : [];
  });
}

export function verifyMaterial(
  before: FoldScene,
  after: FoldScene,
  tb: FoldScene,
  ta: FoldScene,
  map: FoldIsometry,
): void {
  const changed = new Set(changedFaces(before, after));
  for (const i of changed) {
    const ring = sheetRing(after, i);
    for (let old = 0; old < before.faces.length; old++) {
      const sourcePart = overlap(ring, sheetRing(before, old));
      if (polygonArea(sourcePart) < AREA) continue;
      const mapped = sourcePart.map((p) => applyIsometry(map, p));
      for (let t = 0; t < tb.faces.length; t++) {
        const targetPart = overlap(mapped, sheetRing(tb, t));
        if (polygonArea(targetPart) < AREA) continue;
        const at = mappedPoint(map, toPair(polygonCentroid(targetPart)));
        const expected = compose(correspondingFrame(before, tb, map, at), compose(modelMap(after, i), map));
        for (let j = 0; j < ta.faces.length; j++) {
          const part = overlap(targetPart, sheetRing(ta, j));
          if (polygonArea(part) > AREA && !sameImages(expected, modelMap(ta, j), part))
            throw new RepeatFailure('repeat_material');
        }
      }
    }
  }
  for (const j of changedFaces(tb, ta)) {
    const inverse = sheetRing(ta, j).map((p) => applyIsometry(map, p));
    for (let i = 0; i < after.faces.length; i++) {
      if (!changed.has(i) && polygonArea(overlap(inverse, sheetRing(after, i))) > AREA)
        throw new RepeatFailure('repeat_extra_material');
    }
  }
  // Compare ordered material patches, not face numbers or silhouette.
  const pairs = orderPairs(ta);
  const owners = after.faces.map((_, i) => {
    const polygon = sheetRing(after, i).map((p) => applyIsometry(map, p));
    return ta.faces.flatMap((__, j) => (polygonArea(overlap(polygon, sheetRing(ta, j))) > AREA ? [j] : []));
  });
  const flip = after.view.flipped === ta.view.flipped ? 1 : -1;
  for (const [key, sign] of orderPairs(after)) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    if (!changed.has(a) && !changed.has(b)) continue;
    for (const x of owners[a]!)
      for (const y of owners[b]!) {
        const actual = pairs.get(`${Math.min(x, y)}:${Math.max(x, y)}`);
        if (actual !== undefined && actual !== sign * flip * (x < y ? 1 : -1))
          throw new RepeatFailure('repeat_order');
      }
  }
  verifyCreases(before, after, tb, ta, map);
}

interface Segment {
  a: Point;
  b: Point;
  value: string;
}
function segments(s: FoldScene): Segment[] {
  return [
    ...s.creases.map((c) => ({ a: c.from, b: c.to, value: `${c.kind}:${c.letter}` })),
    ...(s.crease_marks ?? []).map((c) => ({ a: c.from, b: c.to, value: `flat:${c.letter}` })),
  ];
}
function parameter(s: Segment, p: Point): number | null {
  const x = s.b.x - s.a.x,
    y = s.b.y - s.a.y,
    length = Math.hypot(x, y);
  if (length < 1e-10 || Math.abs(x * (p.y - s.a.y) - y * (p.x - s.a.x)) > 1e-7 * length) return null;
  return ((p.x - s.a.x) * x + (p.y - s.a.y) * y) / (length * length);
}
function valueAt(all: Segment[], p: Point): string {
  return [
    ...new Set(
      all
        .filter((s) => {
          const t = parameter(s, p);
          return t !== null && t > -1e-7 && t < 1 + 1e-7;
        })
        .map((s) => s.value),
    ),
  ]
    .sort()
    .join('|');
}
function verifyCreases(before: FoldScene, after: FoldScene, tb: FoldScene, ta: FoldScene, map: FoldIsometry) {
  const mapped = (scene: FoldScene) =>
    segments(scene).map((s) => ({ ...s, a: applyIsometry(map, s.a), b: applyIsometry(map, s.b) }));
  const sb = mapped(before),
    sa = mapped(after),
    b = segments(tb),
    a = segments(ta);
  const all = [...sb, ...sa, ...b, ...a];
  if (all.length > 2400) throw new RepeatFailure('repeat_limit');
  // Refine each supporting line once. Rechecking every overlapping segment
  // independently makes a dense precrease history cubic in its subdivisions.
  const groups: { basis: Segment; sets: Segment[][] }[] = [];
  for (const [setIndex, set] of [sb, sa, b, a].entries())
    for (const segment of set) {
      let group = groups.find(
        (g) => parameter(g.basis, segment.a) !== null && parameter(g.basis, segment.b) !== null,
      );
      if (!group) {
        group = { basis: segment, sets: [[], [], [], []] };
        groups.push(group);
      }
      group.sets[setIndex]!.push(segment);
    }
  for (const { basis, sets } of groups) {
    const ts = sets
      .flatMap((set) => set.flatMap((s) => [parameter(basis, s.a)!, parameter(basis, s.b)!]))
      .sort((x, y) => x - y);
    for (let i = 1; i < ts.length; i++) {
      if (ts[i]! - ts[i - 1]! < 1e-7) continue;
      const t = (ts[i]! + ts[i - 1]!) / 2;
      const p = { x: basis.a.x + t * (basis.b.x - basis.a.x), y: basis.a.y + t * (basis.b.y - basis.a.y) };
      const [old, next, was, now] = sets.map((set) => valueAt(set, p));
      if (old !== next ? was !== old || now !== next : was !== now) throw new RepeatFailure('repeat_creases');
    }
  }
}

/** Interior witnesses of material that moved, for compounds whose API has no plain analysis. */
export function movingWitnesses(before: FoldScene, after: FoldScene) {
  return changedFaces(before, after).map((i) => {
    const point = toPair(polygonCentroid(sheetRing(after, i)));
    faceAt(before, point);
    return point;
  });
}
