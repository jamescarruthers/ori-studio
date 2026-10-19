import type { DiagramPagesLayout, LayoutCell } from './diagramPageLayout';
import { flowLane, handoverHeight } from './flowLane';
import { lanePicture, laneFollowsPlacement, markOutsideMargin, partBox, translateCell, type PagePart } from './pagePlacement';

/**
 * Local preview geometry. No font loading, layout, document writes, or
 * history entries. Whether a part is past the margin is said as the drag
 * goes (`markOutsideMargin`), as the page will say it on the drop; symbols
 * are placed again on the drop, once the final layout is ready.
 *
 * A caption being resized (`caption`, its lines re-set by the caller with the
 * pages' own setter) replaces the step's caption, and moves nothing else. The
 * lane follows the step where the drag moves or resizes its picture, and
 * otherwise as far as its placement already had it (`laneFollowsPlacement`).
 * Only the step's page draws its lane again, and the pages before and after
 * it, whose lanes meet it over the spine or a page turn: a page's lane is one
 * curve, solved anew on every move, so every other page keeps the lane it had.
 */
export function previewPlacement(
  base: DiagramPagesLayout,
  stepId: string,
  part: PagePart,
  dx: number,
  dy: number,
  factor = 1,
  caption?: LayoutCell['text'],
): DiagramPagesLayout {
  const layout: DiagramPagesLayout = {
    ...base,
    pages: base.pages.map((page) => ({ ...page, cells: page.cells.map((cell) => ({ ...cell })) })),
  };
  // Where the lane follows the step being placed, by its page.
  const follows = new Map<number, { index: number; follows: boolean }>();
  layout.pages.forEach((page, pageIndex) => {
    const index = page.cells.findIndex((cell) => cell.stepId === stepId);
    if (index < 0) return;
    const old = page.cells[index]!;
    let cell = translateCell(old, part, dx, dy);
    if (factor !== 1) cell = scaleCell(cell, factor);
    if (caption) cell = { ...cell, text: caption };
    cell.placed ??= {
      offsets: {},
      pin: null,
      auto: { mmPerUnit: old.mmPerUnit, frameMm: old.frameMm, drawMm: old.drawMm },
    };
    page.cells[index] = cell;
    // The lane runs through the picture: it follows the step where the drag moves or resizes it.
    follows.set(pageIndex, { index, follows: part === 'frame' || part === 'picture' || factor !== 1 || laneFollowsPlacement(old) });
    // Symbols are re-placed on drop, once the final layout is ready.
  });
  // The pages whose lane may move: the step's, and the ones before and after it, whose lane meets it.
  const redrawn = new Set<number>();
  for (const pageIndex of follows.keys()) {
    redrawn.add(pageIndex);
    const plan = layout.pages[pageIndex]!.flow?.plan;
    if (plan && plan.entry !== 'none') redrawn.add(pageIndex - 1);
    if (plan && plan.exit !== 'none') redrawn.add(pageIndex + 1);
  }
  // A page and the next share the height the lane hands over at, over the spine or a page turn.
  const stops = layout.pages.map((page, pageIndex) => {
    if (!redrawn.has(pageIndex)) return page.flow?.stops;
    return page.flow?.stops.map((stop, index) => {
      const cell = page.cells[index];
      if (!cell) return stop;
      const placed = follows.get(pageIndex);
      return {
        ...stop,
        x: cell.drawMm.x + cell.drawMm.w / 2,
        y: cell.drawMm.y + cell.drawMm.h / 2,
        picture: lanePicture(cell),
        placed: placed?.index === index ? placed.follows : laneFollowsPlacement(cell),
      };
    });
  });
  layout.pages.forEach((page, index) => {
    if (!page.flow || !stops[index] || !redrawn.has(index)) return;
    const { plan, halfWidth } = page.flow;
    const shared = (before: number) => {
      const [a, b] = [layout.pages[before]?.flow, layout.pages[before + 1]?.flow];
      const [aStops, bStops] = [stops[before], stops[before + 1]];
      return a && b && aStops && bStops ? handoverHeight({ plan: a.plan, stops: aStops }, { plan: b.plan, stops: bStops }, halfWidth) : null;
    };
    const flow = {
      ...page.flow,
      stops: stops[index]!,
      handoverIn: plan.entry === 'none' ? null : shared(index - 1),
      handoverOut: plan.exit === 'none' ? null : shared(index),
    };
    page.flow = flow;
    if (page.band) page.band = flowLane(flow)?.lane ?? null;
  });
  markOutsideMargin(layout);
  return layout;
}

export function scaleCell(cell: LayoutCell, factor: number): LayoutCell {
  const picture = partBox(cell, 'picture'),
    cx = picture.x + picture.w / 2,
    cy = picture.y;
  const scaleBox = (box: { x: number; y: number; w: number; h: number }) => ({
    x: cx + (box.x - cx) * factor,
    y: cy + (box.y - cy) * factor,
    w: box.w * factor,
    h: box.h * factor,
  });
  const dy = picture.h * (factor - 1);
  const next = translateCell(cell, 'text', 0, dy);
  return {
    ...next,
    drawMm: scaleBox(cell.drawMm),
    inkMm: cell.inkMm ? scaleBox(cell.inkMm) : undefined,
    pictureMm: {
      x: cx + (cell.pictureMm.x - cx) * factor,
      y: cy + (cell.pictureMm.y - cy) * factor,
      size: cell.pictureMm.size * factor,
    },
    mmPerUnit: cell.mmPerUnit === null ? null : cell.mmPerUnit * factor,
    frameMm: cell.frameMm === null ? null : cell.frameMm * factor,
  };
}
