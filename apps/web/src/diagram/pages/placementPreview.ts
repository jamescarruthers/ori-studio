import type { DiagramPagesLayout, LayoutCell, LayoutZoomArrow } from './diagramPageLayout';
import { flowLane } from './flowLane';
import {
  laneFollowsPlacement,
  partBox,
  placementClashes,
  translateCell,
  type FootprintsOf,
  type PagePart,
} from './pagePlacement';

/**
 * Local preview geometry. No font loading, layout, document writes, or
 * history entries. Clashes are checked against the pictures' footprints
 * where `footprintsOf` knows them (`PreparedDiagramPages.footprints`), else
 * against their boxes, and against the enlarge arrows where `arrowsOf` says
 * the page on screen prints them (`PreparedDiagramPages.zoomArrows`): symbols
 * are placed again on the drop, once the final layout is ready.
 *
 * A caption being resized (`caption`, its lines re-set by the caller with the
 * pages' own setter) replaces the step's caption, and moves nothing else: the
 * lane follows the step only as far as its placement already had it.
 */
export function previewPlacement(
  base: DiagramPagesLayout,
  stepId: string,
  part: PagePart,
  dx: number,
  dy: number,
  factor = 1,
  footprintsOf?: FootprintsOf,
  arrowsOf?: (pageIndex: number) => readonly LayoutZoomArrow[],
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
    follows.set(pageIndex, { index, follows: caption ? laneFollowsPlacement(old) : true });
    // Symbols are re-placed on drop, once the final layout is ready.
  });
  // Both sides of a printed spread share the moved spine height.
  const stops = layout.pages.map((page, pageIndex) =>
    page.flow?.stops.map((stop, index) => {
      const cell = page.cells[index];
      if (!cell) return stop;
      const placed = follows.get(pageIndex);
      return {
        ...stop,
        x: cell.drawMm.x + cell.drawMm.w / 2,
        y: cell.drawMm.y + cell.drawMm.h / 2,
        placed: placed?.index === index ? placed.follows : laneFollowsPlacement(cell),
      };
    }),
  );
  layout.pages.forEach((page, index) => {
    if (!page.flow || !stops[index]) return;
    const shared = (left: number) => {
      const a = stops[left]?.at(-1),
        b = stops[left + 1]?.[0];
      return a && b ? (a.y + b.y) / 2 : null;
    };
    const flow = { ...page.flow, stops: stops[index]!, spineIn: shared(index - 1), spineOut: shared(index) };
    const lane = flowLane(flow);
    page.flow = flow;
    if (page.band) page.band = lane?.lane ?? null;
    for (const cell of page.cells) cell.clashes = cell.clashes?.filter((clash) => clash.kind !== 'path');
    for (const n of lane?.warnings ?? []) if (page.cells[n]) page.cells[n]!.clashes = [{ kind: 'path' }];
  });
  placementClashes(layout, footprintsOf, arrowsOf);
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
