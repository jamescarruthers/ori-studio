import { useState } from 'react';
import type { FoldScene } from '../engine/foldEngineWire';

export function orderStackRegions(scene: FoldScene, baseline: FoldScene | null) {
  const previous = new Map(baseline?.subfaces.map((cell) => [JSON.stringify(cell.polygon), cell.faces_top_to_bottom.join(',')]));
  return scene.subfaces.filter((cell) => cell.faces_top_to_bottom.length > 1).map((cell, index) => ({
    ...cell, index,
    changed: baseline !== null && previous.get(JSON.stringify(cell.polygon)) !== cell.faces_top_to_bottom.join(','),
  }));
}

export type FoldOrderInspection = ReturnType<typeof useFoldOrderInspection>;

/**
 * The stacks the canvas tints while orders are reviewed: the region picked in
 * the inspector; else the part being chosen in — the stacks where two of its
 * faces lie, which are what its orders change — given as its faces, or as an
 * import component's pairs; else the stacks that differ from the first preview.
 */
export function orderTintRows(
  inspection: Pick<FoldOrderInspection, 'rows' | 'selected'>,
  part: { faces?: readonly number[]; pairs?: readonly (readonly [number, number])[] }
): FoldOrderInspection['rows'] {
  const { rows, selected } = inspection;
  if (selected !== null) return rows.filter((row) => row.index === selected);
  if (part.faces?.length) {
    const faces = new Set(part.faces);
    return rows.filter((row) => row.faces_top_to_bottom.filter((f) => faces.has(f)).length >= 2);
  }
  const pairs = part.pairs ?? [];
  return rows.filter((row) => row.changed || pairs.some(([a, b]) => row.faces_top_to_bottom.includes(a) && row.faces_top_to_bottom.includes(b)));
}

/** Compare local overlap stacks, never infer a global stack from a silhouette. */
export function useFoldOrderInspection(key: string | null, scene: FoldScene | null) {
  const [baseline, setBaseline] = useState<{ key: string; scene: FoldScene } | null>(null);
  const [selected, setSelected] = useState<{ key: string | null; index: number | null }>({ key: null, index: null });
  if (key && scene && baseline?.key !== key) setBaseline({ key, scene });
  const rows = scene ? orderStackRegions(scene, baseline?.key === key ? baseline.scene : null) : [];
  return { rows, selected: selected.key === key ? selected.index : null, select: (index: number | null) => setSelected({ key, index }) };
}
