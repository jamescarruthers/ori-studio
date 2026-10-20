import { describe, expect, it } from 'vitest';
import type { FoldOp, FoldPointRef, FoldRef } from '../../fold/document/foldSequenceDocument';
import type { FoldActionGeometry } from '../../fold/engine/foldEngineWire';
import { diagonalHalfScene, squareScene } from '../../fold/sequence/foldScene.fixtures';
import { foldStepAction, stepFoldedCreases } from './foldStepMarkPlan';

const all = { scope: 'all' } as const;
const pt = (x: number, y: number): FoldPointRef => ({ kind: 'point', at: [x, y] });
const edge = (a: [number, number], b: [number, number]): FoldRef => ({ kind: 'edge', a, b });

/** The engine's picture of a precrease of the flat unit square along the line `from`–`to`, its grip at `at` on the moving side. */
function engineAction(from: [number, number], to: [number, number], at: [number, number], image: [number, number]): FoldActionGeometry {
  const [a, b] = [{ x: from[0], y: from[1] }, { x: to[0], y: to[1] }];
  return {
    kind: 'precrease',
    direction: 'valley',
    line: [a, b],
    spans: [{ from: a, to: b, hidden: false }],
    moving: [0],
    grip: { at: { x: at[0], y: at[1] }, image: { x: image[0], y: image[1] }, hidden_at: 0, hidden_image: null },
  };
}

const precrease = (axiom: 1 | 2 | 3, inputs: FoldRef[], extent?: Extract<FoldOp, { kind: 'precrease' }>['extent']): FoldOp => ({
  kind: 'precrease',
  direction: 'valley',
  line: { via: 'axiom', axiom, inputs },
  seed: all,
  ...(extent ? { extent } : {}),
});

const close = (point: { x: number; y: number }, x: number, y: number) => {
  expect(point.x).toBeCloseTo(x, 6);
  expect(point.y).toBeCloseTo(y, 6);
};

describe('where a Fold step’s marks go in the Diagram', () => {
  it('circles both points of a point-onto-point fold and runs the arrow from the one that moves to the other', () => {
    // O2, the top-left corner onto the bottom-right: the diagonal y = x, the engine's grip partway along.
    const action = engineAction([0, 0], [1, 1], [0.3, 0.7], [0.7, 0.3]);
    for (const inputs of [[pt(0, 1), pt(1, 0)], [pt(1, 0), pt(0, 1)]]) {
      const placed = foldStepAction(action, { op: precrease(2, inputs), parent: squareScene() });
      close(placed.grip!.at, 0, 1);
      close(placed.grip!.image, 1, 0);
      expect(placed.rings!.map((ring) => [ring.at.x, ring.at.y]).sort()).toEqual([[0, 1], [1, 0]]);
      expect(placed.rings!.every((ring) => ring.behind === 0)).toBe(true);
    }
  });

  it('draws a segment through two points as its circled ends and the line between them, with no arrow', () => {
    const action = { ...engineAction([0.2, 0.2], [0.8, 0.8], [0.4, 0.6], [0.6, 0.4]) };
    const op = precrease(1, [pt(0.2, 0.2), pt(0.8, 0.8)], { kind: 'segment', from: pt(0.2, 0.2), to: pt(0.8, 0.8) });
    const placed = foldStepAction(action, { op, parent: squareScene() });
    expect(placed.grip).toBeNull();
    expect(placed.rings!.map((ring) => ring.at)).toEqual([{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }]);
    // A whole line through two points keeps its arrow.
    expect(foldStepAction(action, { op: precrease(1, [pt(0.2, 0.2), pt(0.8, 0.8)]), parent: squareScene() }).grip).toEqual(action.grip);
  });

  it('leaves the ends of a segment or a pinch uncircled, circling only the points its axiom names', () => {
    // O2, the bottom-left corner onto the top-right, creased from the middle to the bottom-right corner only.
    const action = engineAction([0.5, 0.5], [1, 0], [0.6, 0.2], [0.8, 0.4]);
    const segment = foldStepAction(action, {
      op: precrease(2, [pt(0, 0), pt(1, 1)], { kind: 'segment', from: pt(0.5, 0.5), to: pt(1, 0) }),
      parent: squareScene(),
    });
    // The corners it brings together; the segment's own ends are not circled.
    expect(segment.rings!.map((ring) => [ring.at.x, ring.at.y])).toEqual([[0, 0], [1, 1]]);
    const pinch = foldStepAction(engineAction([0.48, 0.52], [0.52, 0.48], [0.45, 0.45], [0.55, 0.55]), {
      op: precrease(2, [pt(0, 0), pt(1, 1)], { kind: 'pinch', at: pt(0.5, 0.5), length: 0.0625 }),
      parent: squareScene(),
    });
    expect(pinch.rings!.map((ring) => [ring.at.x, ring.at.y])).toEqual([[0, 0], [1, 1]]);
  });

  it('puts a bisector’s arrow halfway along the shorter of the two edges it brings together', () => {
    // O3, the bottom edge onto the diagonal from the bottom-left corner: the bisector of the corner's 45°.
    const tan = Math.tan(Math.PI / 8);
    const action = engineAction([0, 0], [1, tan], [0.9, 0.05], [0.85, 0.25]);
    for (const inputs of [[edge([0, 0], [1, 0]), edge([0, 0], [1, 1])], [edge([1, 1], [0, 0]), edge([1, 0], [0, 0])]]) {
      const placed = foldStepAction(action, { op: precrease(3, inputs), parent: squareScene() });
      // The edge is 1 long and the diagonal √2: halfway along the edge, onto the diagonal as far out.
      close(placed.grip!.at, 0.5, 0);
      close(placed.grip!.image, 0.5 * Math.SQRT1_2, 0.5 * Math.SQRT1_2);
      expect(placed.rings).toBeUndefined();
    }
    // The other side moving: the diagonal swung down onto the edge.
    const other = foldStepAction(engineAction([0, 0], [1, tan], [0.6, 0.5], [0.77, 0.08]), {
      op: precrease(3, [edge([0, 0], [1, 0]), edge([0, 0], [1, 1])]),
      parent: squareScene(),
    });
    close(other.grip!.at, 0.5 * Math.SQRT1_2, 0.5 * Math.SQRT1_2);
    close(other.grip!.image, 0.5, 0);
  });

  it('runs a line-onto-parallel-line arrow from one line to the other, as long as it can be', () => {
    // O3, the bottom edge onto the top: the middle line y = 0.5, the engine's grip a short way either side.
    const action = engineAction([0, 0.5], [1, 0.5], [0.5, 0.15], [0.5, 0.85]);
    const placed = foldStepAction(action, { op: precrease(3, [edge([0, 0], [1, 0]), edge([0, 1], [1, 1])]), parent: squareScene() });
    close(placed.grip!.at, 0.5, 0);
    close(placed.grip!.image, 0.5, 1);
    // Larger than the engine's: the whole distance between the lines.
    const length = (grip: NonNullable<FoldActionGeometry['grip']>) => Math.hypot(grip.image.x - grip.at.x, grip.image.y - grip.at.y);
    expect(length(placed.grip!)).toBeCloseTo(1, 6);
    expect(length(placed.grip!)).toBeGreaterThan(length(action.grip!));
  });

  it('takes a segment’s line-onto-line arrow across the part of the line it creases', () => {
    // O3, the left edge onto the right: x = 0.5, creased from the bottom edge to the middle only.
    const action = engineAction([0.5, 0], [0.5, 0.5], [0.2, 0.25], [0.8, 0.25]);
    const op = precrease(3, [edge([0, 0], [0, 1]), edge([1, 0], [1, 1])], { kind: 'segment', from: pt(0.5, 0), to: pt(0.5, 0.5) });
    const placed = foldStepAction(action, { op, parent: squareScene() });
    close(placed.grip!.at, 0, 0.25);
    close(placed.grip!.image, 1, 0.25);
    // Its ends are not circled: line onto line names no point.
    expect(placed.rings).toBeUndefined();
  });

  it('keeps the engine’s picture of a line it cannot place by: a free line, a newer build’s step', () => {
    const action = engineAction([0, 0.5], [1, 0.5], [0.5, 0.15], [0.5, 0.85]);
    const free: FoldOp = { kind: 'precrease', direction: 'valley', line: { via: 'free', through: [[0, 0.5], [1, 0.5]] }, seed: all };
    expect(foldStepAction(action, { op: free, parent: squareScene() })).toEqual(action);
    expect(foldStepAction(action, { op: null, parent: squareScene() })).toEqual(action);
  });
});

describe('the creases a step folds, as the state before it shows them', () => {
  it('reads each crease folded since the state before, where that state puts it, in the letter the viewer sees', () => {
    expect(stepFoldedCreases(squareScene(), diagonalHalfScene())).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, direction: 'valley', hidden: false },
    ]);
    // Paper showing its back shows a crease's other letter.
    const back = squareScene();
    back.faces[0] = { ...back.faces[0]!, front_up: false };
    expect(stepFoldedCreases(back, diagonalHalfScene())[0]!.direction).toBe('mountain');
  });

  it('leaves out a crease that was folded the same way already', () => {
    expect(stepFoldedCreases(diagonalHalfScene(), diagonalHalfScene())).toEqual([]);
  });
});
