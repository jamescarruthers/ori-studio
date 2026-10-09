import { describe, expect, it } from 'vitest';
import type { Rgba } from '../../cp-workspace/renderer/types';
import { bookScene } from './foldCanvas.fixtures';
import { foldPaneOverlay, type FoldOverlayInks } from './foldPaneOverlays';
import { foldPickIndex, resolveFoldPick, type FoldFreePick, type FoldPaneId } from './foldPicking';

const RADII = { point: 0.03, line: 0.03 };
const FREE = { snap: 'free', edges: false, free: false } as const;
const INKS: FoldOverlayInks = {
  accent: [1, 0, 0, 1] as Rgba,
  mark: [0, 1, 0, 1] as Rgba,
  outline: [0, 0, 0, 1] as Rgba,
};

/** A float32 channel's value, back to the decimals it was given in. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** The dots' centres an overlay draws. */
function dots(overlay: ReturnType<typeof foldPaneOverlay>): [number, number][] {
  const points = overlay.points;
  if (!points) return [];
  return Array.from({ length: points.count }, (_, k) => [round(points.center[k * 2]!), round(points.center[k * 2 + 1]!)]);
}

describe('a free line drawn on the crease-pattern pane', () => {
  const scene = bookScene();
  const index = foldPickIndex(scene, null, []);
  const click = (pane: FoldPaneId, x: number, y: number) => {
    const pick = resolveFoldPick(index, pane, { x, y }, RADII, FREE);
    if (pick?.kind !== 'free') throw new Error('no free pick');
    return pick;
  };
  const overlay = (pane: FoldPaneId, first: FoldFreePick, hovered: FoldFreePick | null) =>
    foldPaneOverlay({
      pane,
      scene,
      picks: [first],
      hovered: hovered && { pane: hovered.pane, at: { x: 0, y: 0 }, pick: hovered },
      freeFrom: first,
      marks: [],
      inks: INKS,
    });

  it('draws its first end where it was clicked, on both panes', () => {
    const first = click('crease-pattern', 0.75, 0.9);
    expect(first.sheet).toEqual([0.75, 0.9]);
    // On the sheet where it was clicked; folded, on the left half the right lies over.
    expect(dots(overlay('crease-pattern', first, null))).toEqual([[0.75, 0.9]]);
    const [[x, y]] = dots(overlay('folded', first, null)) as [[number, number]];
    expect(x).toBeCloseTo(0.25, 6);
    expect(y).toBeCloseTo(0.9, 6);
  });

  it('runs the live line on the crease pattern from it to where a click would end it', () => {
    const first = click('crease-pattern', 0.25, 0.1);
    const pointer = click('crease-pattern', 0.75, 0.9);
    const strokes = overlay('crease-pattern', first, pointer).strokes;
    expect(strokes?.count).toBe(1);
    expect(Array.from(strokes!.a).map(round)).toEqual([0.25, 0.1]);
    expect(Array.from(strokes!.b).map(round)).toEqual([0.75, 0.9]);
    // The other pane draws no line for a pointer that is not over it.
    expect(overlay('folded', first, pointer).strokes).toBeNull();
  });

  it('keeps a folded-pane free end on the sheet too, and none off the paper', () => {
    const onPaper = click('folded', 0.25, 0.5);
    expect(onPaper.sheet?.[0]).toBeCloseTo(0.75, 12);
    expect(click('folded', 0.9, 0.5).sheet).toBeNull();
    expect(dots(overlay('crease-pattern', click('folded', 0.9, 0.5), null))).toEqual([]);
  });
});
