import { describe, expect, it } from 'vitest';
import type { FoldAnalysis, FoldCrossSection, FoldEngineRefused } from '../engine/foldEngineWire';
import { FOLD_TOOL_INITIAL, type FoldToolState } from '../tools/foldToolState';
import type { FoldPick } from './foldPicking';
import { bookScene } from './foldCanvas.fixtures';
import { foldWindowPreview, refusedFaceInks, sceneLayers } from './foldCanvasModel';
import { foldMovingTint } from './foldPaneOverlays';
import { foldPickIndex } from './foldPicking';
import type { FoldToolPreview } from './useFoldToolPreview';

const free = (x: number, y: number): FoldPick => ({ kind: 'free', pane: 'folded', scene: { x, y }, sheet: null });

const flaps = [
  { faces: [2], witness: [0.75, 0.5] as [number, number] },
  { faces: [1], witness: [0.25, 0.5] as [number, number] },
];

const section: FoldCrossSection = {
  line: { n: [0, 1], d: 0.5 },
  side: 'positive',
  from: { x: 0, y: 0.5 },
  to: { x: 0.5, y: 0.5 },
  intervals: [{ start: 0, end: 0.5, faces: [1, 0], rows: [0, 1] }],
  rows: [
    { faces: [2], spans: [[0, 0.5]], flap: 0 },
    { faces: [1], spans: [[0, 0.5]], flap: 1 },
  ],
  order: { kind: 'layered', unordered: [] },
  flaps,
  layers: 2,
  joins: [],
};

const analysis: FoldAnalysis = {
  line: { n: [0, 1], d: 0.5 },
  side: 'positive',
  snap: { clusters: 0, angle: 0, max_shift: 0 },
  direction: 'valley',
  // The engine's own order, which the section's need not share.
  flaps: [flaps[1]!, flaps[0]!],
  picked: [1],
  added: [0],
  moving: [1, 2],
};

function preview(extra: Partial<FoldToolPreview> = {}): FoldToolPreview {
  return {
    candidates: null,
    build: { status: 'unlocated' },
    step: null,
    analysis,
    section,
    action: null,
    landed: null,
    refused: null,
    landing: false,
    reverse: null,
    ...extra,
  } as FoldToolPreview;
}

const located: FoldToolState = { ...FOLD_TOOL_INITIAL, lineMode: 'free', picks: [free(0, 0.5), free(1, 0.5)] };

describe('the Fold canvas model', () => {
  it('names what the seed asks for and what the closure adds by the section’s flaps', () => {
    expect(foldWindowPreview({ ...located, picks: located.picks.slice(0, 1) }, preview())).toBeNull();
    expect(foldWindowPreview(located, preview())).toMatchObject({ seed: 'all', added: [1] });
    const picked = foldWindowPreview({ ...located, seed: { scope: 'flaps', flaps: [flaps[1]!] } }, preview({
      step: {
        op: { kind: 'valley', line: { via: 'free', through: [[0, 0.5], [0.5, 0.5]] }, seed: { scope: 'flaps', at: [[0.25, 0.5]] } },
        key: 'k',
      },
    }));
    expect(picked?.seed).toEqual([1]);
  });

  it('hands the window the woven stack the pointer is over, the first while it has been over none', () => {
    expect(foldWindowPreview(located, preview())?.interval).toBeNull();
    expect(foldWindowPreview(located, preview(), 1)?.interval).toBe(1);
  });

  it('tints the faces a refusal names, by their index in the scene, not their id', () => {
    const refused: FoldEngineRefused = {
      status: 'refused',
      refusal: { code: 'layer_order' },
      fixes: [],
      faces: [2],
      vertices: [],
    };
    const inks = refusedFaceInks(bookScene(), preview({ refused }), [1, 0, 0, 1]);
    expect([...(inks?.keys() ?? [])]).toEqual([1]);
    expect(refusedFaceInks(bookScene(), preview(), [1, 0, 0, 1])).toBeUndefined();
  });

  it('lights the moving set cut to the moving side of the line', () => {
    const index = foldPickIndex(bookScene(), null, []);
    const tint = foldMovingTint(index, { line: analysis.line, sign: 1, faces: [2], hovered: [] }, [0, 0, 1, 1]);
    if (!tint) throw new Error('no tint');
    // Two triangles: the cell above y = 0.5, no lower than it.
    expect(tint.count).toBe(6);
    const ys = Array.from(tint.position).filter((_, k) => k % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0.5, 12);
    expect(foldMovingTint(index, null, [0, 0, 1, 1])).toBeNull();
  });

  it('counts a state’s layers as its deepest stack', () => {
    expect(sceneLayers(bookScene())).toBe(2);
    expect(sceneLayers(null)).toBe(1);
  });
});
