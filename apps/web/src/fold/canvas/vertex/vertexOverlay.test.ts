import { describe, expect, it } from 'vitest';
import type { Rgba } from '../../../cp-workspace/renderer/types';
import type { FoldVertexAnalysis } from '../../engine/foldEngineSquashWire';
import { flatSquareLandmarks, flatSquareScene } from '../foldCanvas.fixtures';
import { foldPickIndex } from '../foldPicking';
import { rayOnPaper, vertexOverlayMarks } from './vertexOverlay';

const index = foldPickIndex(flatSquareScene(), flatSquareLandmarks(), []);
const accent: Rgba = [0.2, 0.4, 1, 1];
const outline: Rgba = [1, 1, 1, 1];
const inks = { accent, outline };

const squash: FoldVertexAnalysis = {
  kind: 'squash',
  vertex: [0.5, 0.5],
  hinge: { n: [0.7071, -0.7071], d: 0 },
  spine: { n: [0.7071, 0.7071], d: 0.7071 },
  hinge_direction: [-Math.SQRT1_2, -Math.SQRT1_2],
  spine_direction: [-Math.SQRT1_2, Math.SQRT1_2],
  upper: [1],
  lower: [2],
  upper_crease: { n: [0, 1], d: 0.5 },
  lower_crease: { n: [0, 1], d: 0.5 },
  wedge: -Math.PI / 2,
  share: 0,
};

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('a vertex tool’s marks over the folded pane', () => {
  it('runs each ray from its vertex to where it leaves the paper', () => {
    close(rayOnPaper(index, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }), { x: 1, y: 0.5 });
    close(rayOnPaper(index, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.4 }), { x: 0, y: 0 });
  });

  it('draws a squash’s spine faint, each layer’s crease, and where the spine lands bold', () => {
    const marks = vertexOverlayMarks(index, { analysis: squash, emergent: null, emergents: [] }, inks);
    expect(marks.dots).toHaveLength(1);
    close(marks.dots[0]!.at, { x: 0.5, y: 0.5 });
    expect(marks.strokes).toHaveLength(4);
    // The spine as it lies, faint; the landing on the hinge, bold, to the paper's corner.
    expect(marks.strokes[0]!.color[3]).toBeLessThan(1);
    const landing = marks.strokes[3]!;
    expect(landing.widthMul).toBeGreaterThan(marks.strokes[1]!.widthMul);
    close(landing.b, { x: 0, y: 0 });
    // Aimed where it cannot land: drawn too, faint.
    const aimed = vertexOverlayMarks(
      index,
      { analysis: squash, emergent: null, emergents: [], aimed: [0, 1] },
      inks
    );
    expect(aimed.strokes).toHaveLength(5);
    close(aimed.strokes[4]!.b, { x: 0.5, y: 1 });
    expect(aimed.strokes[4]!.color[3]).toBeLessThan(1);
  });

  it('draws a petal fold’s H, its kite creases and their meeting points', () => {
    const petal: FoldVertexAnalysis = {
      kind: 'petal',
      line: { n: [0, 1], d: 0.5 },
      ends: [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
      corner: [0.5, 0],
      kites: [
        { n: [0.86, 0.51], d: 0.43 },
        { n: [-0.86, 0.51], d: -0.43 },
      ],
      top: [1],
      second: [2],
    };
    const marks = vertexOverlayMarks(index, { analysis: petal, emergent: null, emergents: [] }, inks);
    expect(marks.dots).toHaveLength(3);
    expect(marks.strokes).toHaveLength(3);
    close(marks.strokes[0]!.a, { x: 0.2, y: 0.5 });
    close(marks.strokes[0]!.b, { x: 0.8, y: 0.5 });
  });

  it('draws a fan’s rays, the fourth taken bold among the others, and one that does not fit fainter', () => {
    const fan: FoldVertexAnalysis = {
      kind: 'rabbit-ear',
      center: [0.5, 0.5],
      given: [
        [1, 0],
        [0, 1],
        [-1, 0],
      ],
      candidates: [
        [0, -1],
        [0.6, -0.8],
      ],
      emergent: 0,
      layers: [0],
    };
    const marks = vertexOverlayMarks(index, { analysis: fan, emergent: 1, emergents: [false, true] }, inks);
    // Three given rays, two candidates: no halo, since the fourth taken is the ridge.
    expect(marks.strokes).toHaveLength(5);
    const [given, , , unfit, taken] = marks.strokes;
    expect(taken!.widthMul).toBeGreaterThan(given!.widthMul);
    close(given!.b, { x: 1, y: 0.5 });
    expect(taken!.color).toEqual(accent);
    expect(unfit!.color[3]).toBeLessThan(0.3);
    expect(marks.dots).toHaveLength(1);
  });
});
