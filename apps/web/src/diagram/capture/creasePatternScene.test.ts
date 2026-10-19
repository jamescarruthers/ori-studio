import { describe, expect, it } from 'vitest';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { sheetRegions } from '../../cp-workspace/sheets/cpSheetRegions';
import type { PaperLineItem, PaperScene } from '../../lib/paper/paperScene';
import { sceneOf, face, line, SQUARE } from '../../lib/paper/paperScene.fixtures';
import { cpDocument, twoSquaresIndex } from './capture.fixtures';
import { chooseStepCreases, type StepCreases } from './captureCreases';
import { CAPTURE_PX_PER_UNIT, storableScene } from './captureGeometry';
import { creasePatternScene } from './creasePatternScene';

const sheets = twoSquaresIndex();
const [left, right] = sheetRegions(sheets);

function regionCreases(segment: typeof left): StepCreases {
  const choice = chooseStepCreases(
    cpDocument(),
    { kind: 'segment', region: regionReferenceFor(segment!) },
    sheets
  );
  if (choice.status !== 'found') throw new Error('the region should be found');
  return choice.creases;
}

const leftCreases = () => regionCreases(left);

const lines = (scene: PaperScene) => scene.items.filter((item): item is PaperLineItem => item.kind === 'line');

describe('creasePatternScene', () => {
  it('fills the region with paper and draws its lines over it, each in its role', () => {
    const scene = creasePatternScene(cpDocument(), leftCreases(), 0);
    expect(scene.items[0]).toMatchObject({ kind: 'face', side: 'front', shade: 1, hidden: false });
    expect(lines(scene).map((item) => item.role)).toEqual(['aux', 'diagram-mountain', 'edge', 'edge', 'edge', 'edge']);
    // At Edit's 100%: the 100-unit square is that many px across.
    expect(scene.sheet).toBeCloseTo(100 * CAPTURE_PX_PER_UNIT);
    expect(scene.bounds.maxX - scene.bounds.minX).toBeCloseTo(100 * CAPTURE_PX_PER_UNIT);
  });

  it('draws its folds as the diagram creases to make: a valley in the valley pen', () => {
    const scene = creasePatternScene(cpDocument(), regionCreases(right), 0);
    expect(lines(scene).map((item) => item.role)).toEqual(['diagram-valley', 'edge', 'edge', 'edge', 'edge']);
  });

  it('pulls an aux line back where it meets the paper’s edge or a fold, and nowhere else', () => {
    const [aux] = lines(creasePatternScene(cpDocument(), leftCreases(), 0));
    // From the left edge to the diagonal.
    expect(aux!.onBoundary).toEqual([true, true]);
    const short = cpDocument(undefined, (cp, id) => (id === 10 ? { ...cp, b: { x: 30, y: 50 } } : cp));
    const [open] = lines(creasePatternScene(short, leftCreases(), 0));
    expect(open!.onBoundary).toEqual([true, false]);
    // A fold runs to the edge.
    expect(lines(creasePatternScene(cpDocument(), leftCreases(), 0))[1]!.onBoundary).toEqual([false, false]);
  });

  it('joins lines where they meet, so a corner closes rather than caps', () => {
    const edges = lines(creasePatternScene(cpDocument(), leftCreases(), 0)).filter((item) => item.role === 'edge');
    for (const edge of edges) expect(edge.joined).toEqual([true, true]);
  });

  it('turns the picture clockwise about the paper, keeping the sheet’s size', () => {
    const upright = creasePatternScene(cpDocument(), leftCreases(), 0);
    const turned = creasePatternScene(cpDocument(), leftCreases(), 45);
    expect(turned.sheet).toBeCloseTo(upright.sheet);
    // A square turned an eighth is √2 across.
    expect(turned.bounds.maxX - turned.bounds.minX).toBeCloseTo(upright.sheet * Math.SQRT2);
    // Clockwise on a y-down page: the mountain diagonal, top-left to bottom-right, turns upright.
    const diagonal = lines(turned).find((item) => item.role === 'diagram-mountain')!;
    expect(diagonal.a[0]).toBeCloseTo(diagonal.b[0]);
  });

  // Zach, 2026-10-06: "I wanted to just change the color of the face and not flip the creases."
  describe('on the paper’s back colour', () => {
    const front = (rotationDeg = 0) => creasePatternScene(cpDocument(), leftCreases(), rotationDeg);
    const back = (rotationDeg = 0) => creasePatternScene(cpDocument(), leftCreases(), rotationDeg, { side: 'back' });

    it('fills the paper with its back colour and changes nothing else: every line, the outline, the frame', () => {
      for (const rotationDeg of [0, 30, 315]) {
        const [seen, recoloured] = [front(rotationDeg), back(rotationDeg)];
        expect(recoloured.items[0]).toMatchObject({ kind: 'face', side: 'back', shade: 1, hidden: false });
        expect(seen.items[0]).toMatchObject({ kind: 'face', side: 'front' });
        // Not mirrored, not turned the other way, its mountains and valleys as they are.
        expect({ ...recoloured.items[0], side: 'front' }).toEqual(seen.items[0]);
        expect(recoloured.items.slice(1)).toEqual(seen.items.slice(1));
        expect(recoloured.bounds).toEqual(seen.bounds);
        expect(recoloured.sheet).toBe(seen.sheet);
      }
      expect(lines(back()).map((item) => item.role)).toEqual(['aux', 'diagram-mountain', 'edge', 'edge', 'edge', 'edge']);
      const valley = creasePatternScene(cpDocument(), regionCreases(right), 0, { side: 'back' });
      expect(lines(valley).map((item) => item.role)).toEqual(['diagram-valley', 'edge', 'edge', 'edge', 'edge']);
    });
  });

  // Zach, 2026-10-12: "the lines should also mirror... basically it's like flipping the paper over for real."
  describe('turned over (Flip creases)', () => {
    const SWAP: Partial<Record<string, string>> = { 'diagram-mountain': 'diagram-valley', 'diagram-valley': 'diagram-mountain' };
    const back = (segment: typeof left, rotationDeg: number) =>
      creasePatternScene(cpDocument(), regionCreases(segment), rotationDeg, { side: 'back' });
    /** Turned over as Flip creases leaves it: its turn run the other way (`linkedPose`). */
    const turnedOver = (segment: typeof left, rotationDeg: number) =>
      creasePatternScene(cpDocument(), regionCreases(segment), (360 - rotationDeg) % 360, { side: 'back', flipped: true });
    /** A point of `seen` mirrored about its picture's vertical centre line, as `into`'s frame places it. */
    const mirroredInto = (seen: PaperScene, into: PaperScene, [x, y]: readonly [number, number]) => [
      into.bounds.minX + (seen.bounds.maxX - x),
      into.bounds.minY + (y - seen.bounds.minY),
    ];
    const expectNear = (point: readonly number[], expected: readonly number[]) => {
      expect(point[0]).toBeCloseTo(expected[0]!, 9);
      expect(point[1]).toBeCloseTo(expected[1]!, 9);
    };

    it('is the picture mirrored side to side as it is shown, at every turn: every line, the paper and the frame', () => {
      // The crane's step 4 lies at 315°.
      for (const rotationDeg of [0, 30, 315]) {
        for (const segment of [left, right]) {
          const [seen, over] = [back(segment, rotationDeg), turnedOver(segment, rotationDeg)];
          expect(over.items).toHaveLength(seen.items.length);
          expect(over.sheet).toBe(seen.sheet);
          // The same frame, mirrored about the paper's centre: as wide and as tall.
          expect(over.bounds.minX).toBeCloseTo(-seen.bounds.maxX, 9);
          expect(over.bounds.maxX).toBeCloseTo(-seen.bounds.minX, 9);
          expect(over.bounds.minY).toBeCloseTo(seen.bounds.minY, 9);
          expect(over.bounds.maxY).toBeCloseTo(seen.bounds.maxY, 9);
          over.items.forEach((item, index) => {
            const was = seen.items[index]!;
            if (item.kind === 'face' && was.kind === 'face') {
              // The paper on the back's colour, every corner mirrored, in its order.
              expect({ ...item, rings: [] }).toEqual({ ...was, rings: [] });
              item.rings.forEach((ring, r) =>
                ring.forEach((corner, c) => expectNear(corner, mirroredInto(seen, over, was.rings[r]![c]!)))
              );
              return;
            }
            if (item.kind !== 'line' || was.kind !== 'line') throw new Error('a line for a line');
            expectNear(item.a, mirroredInto(seen, over, was.a));
            expectNear(item.b, mirroredInto(seen, over, was.b));
            // Mountains and valleys swapped; aux lines and the edge as they are, and joined and ended alike.
            expect(item.role).toBe(SWAP[was.role] ?? was.role);
            expect({ ...item, role: was.role, a: was.a, b: was.b }).toEqual(was);
          });
        }
      }
      const roles = (scene: PaperScene) => lines(scene).map((item) => item.role);
      expect(roles(turnedOver(left, 315))).toEqual(['aux', 'diagram-valley', 'edge', 'edge', 'edge', 'edge']);
      expect(roles(turnedOver(right, 315))).toEqual(['diagram-mountain', 'edge', 'edge', 'edge', 'edge']);
    });

    it('mirrors the pattern on the paper before it turns it: upright, the front’s lines mirrored about the paper’s middle', () => {
      const [seen, over] = [back(left, 0), turnedOver(left, 0)];
      // The mountain diagonal, top-left to bottom-right, now runs top-right to bottom-left.
      const [was, now] = [lines(seen)[1]!, lines(over)[1]!];
      expectNear(now.a, [-was.a[0], was.a[1]]);
      expectNear(now.b, [-was.b[0], was.b[1]]);
      expect(Math.sign(was.a[0])).toBe(-1);
      expect(Math.sign(now.a[0])).toBe(1);
      // Turned by a quarter, it turns about the paper as any picture does.
      const quarter = creasePatternScene(cpDocument(), leftCreases(), 90, { side: 'back', flipped: true });
      const [qa, oa] = [lines(quarter)[1]!.a, now.a];
      expectNear(qa, [-oa[1], oa[0]]);
    });
  });
});

describe('storableScene', () => {
  it('keeps nothing hidden and no markup, to a hundredth of a px', () => {
    const scene = sceneOf(
      [
        face([SQUARE.map(([x, y]) => [x + 0.123456, y - 0.0049] as [number, number])]),
        face([SQUARE], { hidden: true }),
        line('mountain', [0.004, -0.004], [50.0051, 50], { hidden: true }),
        line('valley', [0.004, -0.004], [50.0051, 50]),
        { kind: 'markup', svg: '<g/>', bounds: { minX: -500, minY: -500, maxX: 0, maxY: 0 }, hidden: false },
      ],
      400
    );
    const stored = storableScene(scene);
    expect(stored.items.map((item) => item.kind)).toEqual(['face', 'line']);
    const [paper, valley] = stored.items as [{ rings: [number, number][][] }, PaperLineItem];
    expect(paper.rings[0]![0]).toEqual([0.12, 0]);
    expect(valley.a).toEqual([0, 0]);
    expect(Object.is(valley.a[1], -0)).toBe(false);
    expect(valley.b).toEqual([50.01, 50]);
    // The crop is what is kept, not the markup that went.
    expect(stored.bounds.minX).toBeCloseTo(0);
  });

  it('keeps a small sheet’s shape, with a finer step', () => {
    const tiny = sceneOf([line('edge', [0, 0], [0.0123, 0.0456])], 1);
    const [edge] = storableScene(tiny).items as PaperLineItem[];
    expect(edge!.b[0]).toBeCloseTo(0.0123, 4);
  });
});
