import { describe, expect, it } from 'vitest';
import type { Rgba } from '../../../cp-workspace/renderer/types';
import type { FoldVertexAnalysis } from '../../engine/foldEngineSquashWire';
import { flatSquareLandmarks, flatSquareScene } from '../foldCanvas.fixtures';
import type { FoldPaneCreaseLine } from '../foldPaneScenes';
import { foldPickIndex } from '../foldPicking';
import { rayOnPaper, vertexCreaseLines, vertexOverlayMarks } from './vertexOverlay';

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

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe('a vertex tool’s marks over the folded pane', () => {
  it('runs each ray from its vertex to where it leaves the paper', () => {
    close(rayOnPaper(index, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }), { x: 1, y: 0.5 });
    close(rayOnPaper(index, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.4 }), { x: 0, y: 0 });
  });

  it('marks a squash’s vertex, its spine faint and where the spine lands bold — none of them a crease', () => {
    const marks = vertexOverlayMarks(index, { analysis: squash, emergent: null, emergents: [] }, inks);
    expect(marks.dots).toHaveLength(1);
    close(marks.dots[0]!.at, { x: 0.5, y: 0.5 });
    expect(marks.strokes).toHaveLength(2);
    // The spine as it lies, faint; the landing on the hinge, bold, to the paper's corner.
    const [spine, landing] = marks.strokes;
    expect(spine!.color[3]).toBeLessThan(1);
    close(spine!.b, { x: 0, y: 1 });
    expect(landing!.widthMul).toBeGreaterThan(spine!.widthMul);
    expect(landing!.color).toEqual(accent);
    close(landing!.b, { x: 0, y: 0 });
    // Aimed where it cannot land: drawn too, faint.
    const aimed = vertexOverlayMarks(
      index,
      { analysis: squash, emergent: null, emergents: [], aimed: [0, 1] },
      inks
    );
    expect(aimed.strokes).toHaveLength(3);
    close(aimed.strokes[2]!.b, { x: 0.5, y: 1 });
    expect(aimed.strokes[2]!.color[3]).toBeLessThan(1);
  });

  it('marks a petal fold’s ends and open corner, and draws none of its creases over the paper', () => {
    const marks = vertexOverlayMarks(index, { analysis: petal, emergent: null, emergents: [] }, inks);
    expect(marks.dots).toHaveLength(3);
    expect(marks.strokes).toHaveLength(0);
  });

  it('marks a fan’s center and the fourth creases not taken, one that does not fit fainter', () => {
    const marks = vertexOverlayMarks(index, { analysis: fan, emergent: 1, emergents: [false, true] }, inks);
    // The given rays and the fourth taken are creases, drawn as paper: only the other candidate is left.
    expect(marks.strokes).toHaveLength(1);
    const [unfit] = marks.strokes;
    close(unfit!.b, { x: 0.5, y: 0 });
    expect(unfit!.color[3]).toBeLessThan(0.3);
    expect(marks.dots).toHaveLength(1);
    // Nothing taken yet: every candidate is a choice.
    expect(vertexOverlayMarks(index, { analysis: fan, emergent: null, emergents: [] }, inks).strokes).toHaveLength(2);
  });
});

describe('a vertex fold’s creases on the folded pane, by the letter each shows the viewer', () => {
  const letters = (creases: readonly FoldPaneCreaseLine[]) => creases.map((crease) => crease.letter);

  it('letters a rabbit ear’s three bisectors the direction’s way and its fourth crease the other', () => {
    const valley = vertexCreaseLines(index, { analysis: fan, emergent: 1 }, 'valley');
    expect(letters(valley)).toEqual(['valley', 'valley', 'valley', 'mountain']);
    close(valley[0]!.line[0], { x: 0.5, y: 0.5 });
    close(valley[0]!.line[1], { x: 1, y: 0.5 });
    // The fourth taken, (0.6, −0.8) from the center, to the paper's edge.
    close(valley[3]!.line[1], { x: 0.875, y: 0 });
    expect(letters(vertexCreaseLines(index, { analysis: fan, emergent: 1 }, 'mountain'))).toEqual([
      'mountain',
      'mountain',
      'mountain',
      'valley',
    ]);
    // No fourth crease taken yet: the three given.
    expect(letters(vertexCreaseLines(index, { analysis: fan, emergent: null }, 'valley'))).toEqual([
      'valley',
      'valley',
      'valley',
    ]);
  });

  it('letters a swivel as a rabbit ear: the three given the direction’s way, the fourth the other', () => {
    const swivel: FoldVertexAnalysis = { ...fan, kind: 'swivel' };
    expect(letters(vertexCreaseLines(index, { analysis: swivel, emergent: 0 }, 'valley'))).toEqual([
      'valley',
      'valley',
      'valley',
      'mountain',
    ]);
  });

  it('letters a petal fold’s H the direction’s way and the top layer’s kite creases the other', () => {
    const creases = vertexCreaseLines(index, { analysis: petal, emergent: null }, 'valley');
    expect(letters(creases)).toEqual(['valley', 'mountain', 'mountain']);
    close(creases[0]!.line[0], { x: 0.2, y: 0.5 });
    close(creases[0]!.line[1], { x: 0.8, y: 0.5 });
    close(creases[1]!.line[1], { x: 0.5, y: 0 });
    expect(letters(vertexCreaseLines(index, { analysis: petal, emergent: null }, 'mountain'))).toEqual([
      'mountain',
      'valley',
      'valley',
    ]);
  });

  it('letters a squash’s lower crease the direction’s way and the upper one the other, one line where they meet', () => {
    // The spine landing on the hinge: both layers crease on the bisector, drawn once, as the step's picture draws it.
    const symmetric = vertexCreaseLines(index, { analysis: squash, emergent: null }, 'valley');
    expect(letters(symmetric)).toEqual(['valley']);
    close(symmetric[0]!.line[1], { x: 0, y: 0.5 });
    // Landing off the hinge, the two creases part.
    const aimed = vertexCreaseLines(index, { analysis: { ...squash, share: 0.5 }, emergent: null }, 'valley');
    expect(letters(aimed)).toEqual(['valley', 'mountain']);
    expect(aimed[0]!.line[1].y).toBeGreaterThan(aimed[1]!.line[1].y);
  });
});
