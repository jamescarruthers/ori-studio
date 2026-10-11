import type { Lane, LanePoint } from './flowLane';
import { curvePoint, curveStart } from './flowLane';
import { partPolygons, type PageBox } from './pagePlacement';
import { rectangle, separate } from './ribbonPacking';
import type { LayoutCell } from './diagramPageLayout';

/** Find clear room on the actual ribbon; hand placements may leave no clear point. */
export function glyphSpot(input: {
  preferred: LanePoint;
  before?: LayoutCell;
  after?: LayoutCell;
  cells: readonly LayoutCell[];
  lane: Lane | null;
  paper: { w: number; h: number };
  occupied: readonly PageBox[];
  sizeAt: (point: LanePoint) => { w: number; h: number };
}): LanePoint {
  const { preferred, before, after, paper } = input;
  const boxes = [
    ...input.occupied.map((b) => rectangle(b.x, b.y, b.w, b.h)),
    ...input.cells.flatMap((cell) =>
      (['number', 'picture', 'text'] as const).flatMap((part) => partPolygons(cell, part)),
    ),
  ];
  const candidates = input.lane && before && after ? [] : [preferred];
  if (input.lane && before && after) {
    const centre = (cell: LayoutCell) => ({
      x: cell.drawMm.x + cell.drawMm.w / 2,
      y: cell.drawMm.y + cell.drawMm.h / 2,
    });
    const a = centre(before),
      b = centre(after);
    const lane = input.lane;
    const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
    const nearest = (point: LanePoint) =>
      knots.reduce(
        (best, knot, i) =>
          Math.hypot(knot.x - point.x, knot.y - point.y) <
          Math.hypot(knots[best]!.x - point.x, knots[best]!.y - point.y)
            ? i
            : best,
        0,
      );
    const start = nearest(a),
      end = nearest(b);
    lane.curves.forEach((curve, index) => {
      if (index >= start && index < end)
        for (let n = 1; n < 40; n++) candidates.push(curvePoint(curveStart(lane, index), curve, n / 40));
    });
  }
  const score = (point: LanePoint) => {
    const size = input.sizeAt(point),
      x = point.x - size.w / 2,
      y = point.y - size.h / 2;
    if (
      point.x < Math.max(7, size.w / 2) ||
      point.x > paper.w - Math.max(7, size.w / 2) ||
      y < 0 ||
      y + size.h > paper.h
    )
      return Infinity;
    let overlap = 0;
    const glyph = rectangle(x - 1, y - 1, size.w + 2, size.h + 2);
    for (const polygon of boxes) {
      const push = separate(glyph, { x: 0, y: 0 }, polygon, { x: 0, y: 0 }, 0);
      if (push) overlap += Math.hypot(push.x, push.y);
    }
    return overlap * 10000 + Math.hypot(point.x - preferred.x, point.y - preferred.y);
  };
  let best = preferred,
    bestScore = Infinity;
  for (const point of candidates) {
    const value = score(point);
    if (value < bestScore) {
      best = point;
      bestScore = value;
    }
  }
  // A leading/trailing symbol has no connecting segment. Move along its edge
  // until a tall stack clears the number/caption while staying on the paper.
  if (!before || !after)
    for (let offset = 2; offset <= paper.h; offset += 2)
      for (const sign of [-1, 1]) {
        const point = { x: Math.max(7, Math.min(paper.w - 7, preferred.x)), y: preferred.y + sign * offset },
          value = score(point);
        if (value < bestScore) {
          best = point;
          bestScore = value;
        }
      }
  const size = input.sizeAt(best);
  return {
    x: Math.max(size.w / 2, Math.min(paper.w - size.w / 2, best.x)),
    y: Math.max(size.h / 2, Math.min(paper.h - size.h / 2, best.y)),
  };
}
